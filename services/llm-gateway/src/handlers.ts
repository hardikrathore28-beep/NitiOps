import { Request, Response } from 'express';
import { getLLMProvider } from './providers';
import { loadPrompt, fillTemplate } from './prompts';
import { retrieveContext, formatContext } from './rag/ragPipeline';
import { v4 as uuidv4 } from 'uuid';
import { audit } from '@nitiops/service-template';
import { SafetyGuard } from './safety/safetyHooks';

export const handleChat = async (req: Request, res: Response) => {
    try {
        const provider = getLLMProvider();
        const safety = new SafetyGuard();
        const { messages, mode, top_k, filters, conversation_id } = req.body;

        // 0. Safety Check (Input)
        const lastUserMsg = messages[messages.length - 1]; // user
        if (safety.detectInjection(lastUserMsg.content)) {
            // Audit and Block
            await audit({
                tenant_id: req.headers['x-tenant-id'] as string,
                event_type: 'SECURITY_ALERT',
                actor: { id: 'system', type: 'guard' },
                purpose: 'safety',
                context: { reason: 'prompt_injection_detected', input_snippet: lastUserMsg.content.substring(0, 50) },
                timestamp: new Date().toISOString()
            });
            return res.status(400).json({ error: "Safety Alert: Potential prompt injection detected." });
        }

        const tenant_id = req.headers['x-tenant-id'] as string;
        const authToken = req.headers['authorization'] as string;

        // Get actor from middleware
        const actor = (req as any).actor;

        // 1. Determine System Prompt
        let systemPromptFile = 'system/base_system_prompt.md';
        let contextText = '';
        let usedChunks: string[] = [];
        let citations: any[] = []; // In real RAG, we'd enable extracting this from model or just returning what we sent

        // 2. RAG Logic
        if (mode === 'rag') {
            systemPromptFile = 'system/rag_system_prompt.md';
            const userMsg = messages[messages.length - 1]; // Assume last is user

            // Retrieve
            const chunks = await retrieveContext(userMsg.content, tenant_id, authToken, top_k, filters);

            contextText = formatContext(chunks);
            usedChunks = chunks.map(c => c.id);
            citations = chunks.map(c => c.citation || ({ doc_id: c.documentId, chunk_id: c.id, location: 'unknown' }));

            // Audit Retrieve
            if (chunks.length > 0) {
                /* retrieve audit handled by rag-service? 
                   Actually, rag-service audits the *search*. 
                   But llm-gateway should audit that it *used* these chunks.
                */
            }
        }

        // 3. Load System Prompt
        const { content: sysContent, version: sysVersion } = loadPrompt(systemPromptFile);

        // 4. Construct Messages
        const finalMessages = [];

        finalMessages.push({ role: 'system', content: sysContent });

        // Inject context into last user message if RAG
        // Or inject as a separate system/user context message
        // Let's use the template approach for the USER message
        const { content: chatTemplate, version: templateVersion } = loadPrompt('templates/chat_prompt.md');

        // Transform history... 
        // For MVP, simplistic: Just keep history as is, but wrap the LAST message with template
        const lastMsg = messages[messages.length - 1];
        const prevMsgs = messages.slice(0, -1);

        finalMessages.push(...prevMsgs);

        const templatedLast = fillTemplate(chatTemplate, {
            context: contextText || 'No context provided.',
            user_message: lastMsg.content
        });

        finalMessages.push({ role: 'user', content: templatedLast });

        // 5. Audit Prompt
        const promptAuditId = uuidv4();
        await audit({
            tenant_id,
            event_type: 'LLM_PROMPT',
            actor: { id: actor?.id || 'unknown', type: actor?.type || 'user' },
            purpose: 'chat',
            context: {
                prompt_version: `${sysVersion}+${templateVersion}`,
                model: 'mock',
                mode,
                prompt_id: promptAuditId
            },
            timestamp: new Date().toISOString()
        });

        // 6. Call Provider
        const llmRes = await provider.chat(finalMessages as any, { model: 'mock' });

        // 7. Audit Response
        // Note: we audit BEFORE redaction? Or after? Usually we audit exactly what model said (for forensic), 
        // but return redacted to user. Let's do that.
        await audit({
            tenant_id,
            event_type: 'LLM_RESPONSE',
            actor: { id: actor?.id || 'unknown', type: actor?.type || 'user' },
            purpose: 'chat',
            context: {
                prompt_id: promptAuditId,
                response_hash: 'stub-hash', // compute hash
                used_chunks: usedChunks,
                model: llmRes.model
            },
            timestamp: new Date().toISOString()
        });

        const safeOutput = safety.redactPii(llmRes.text);

        // 8. Send Response
        res.json({
            message: { role: 'assistant', content: safeOutput },
            citations: citations,
            used_chunks: usedChunks,
            model: { name: llmRes.model, version: '1.0' },
            prompt_version: `${sysVersion}+${templateVersion}`,
            response_hash: 'stub-hash'
        });

    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

import { validateJson } from './generation/validator';

// ... imports

export const handleGenerate = async (req: Request, res: Response) => {
    try {
        const provider = getLLMProvider();
        const { instruction, input, output_schema, mode } = req.body;
        const tenant_id = req.headers['x-tenant-id'] as string;
        const actor = (req as any).actor;

        if (!output_schema) return res.status(400).json({ error: 'output_schema is required for generate' });

        // 1. Load Prompts
        const { content: sysContent, version: sysVersion } = loadPrompt('system/base_system_prompt.md');
        const { content: genTemplate, version: templateVersion } = loadPrompt('templates/generate_prompt.md');

        // 2. Construct Prompt
        const promptText = fillTemplate(genTemplate, {
            instruction,
            input_json: JSON.stringify(input, null, 2),
            output_schema: JSON.stringify(output_schema, null, 2)
        });

        const messages = [
            { role: 'system', content: sysContent },
            // For Generic generation, usually just user message with instruction
            { role: 'user', content: promptText }
        ];

        // 3. Audit Prompt
        const promptAuditId = uuidv4();
        await audit({
            tenant_id,
            event_type: 'LLM_GENERATE_PROMPT',
            actor: { id: actor?.id || 'unknown', type: actor?.type || 'user' },
            purpose: 'generate',
            context: { prompt_version: `${sysVersion}+${templateVersion}`, prompt_id: promptAuditId },
            timestamp: new Date().toISOString()
        });

        // 4. Loop for Retry (Simple 1-retry for MVP)
        let attempts = 0;
        const maxAttempts = 2;
        let lastError = '';
        let validResult = null;
        let modelMetadata = { name: 'unknown', hash: '' };

        while (attempts < maxAttempts) {
            attempts++;

            // Call LLM
            // Pass json_mode hint if provider supports it
            const llmRes = await provider.chat(messages as any, { model: 'mock', json_mode: true });
            modelMetadata = { name: llmRes.model, hash: 'stub' };

            // Validate
            const validation = validateJson(llmRes.text, output_schema);

            if (validation.valid) {
                validResult = validation.data;
                break;
            } else {
                lastError = validation.errors?.join(', ') || 'Unknown validation error';
                console.warn(`Attempt ${attempts} failed: ${lastError}`);
                // In a real loop, we'd append the error to messages and ask LLM to fix
                messages.push({ role: 'assistant', content: llmRes.text });
                messages.push({ role: 'user', content: `Your output was invalid: ${lastError}. Please fix it.` });
            }
        }

        // 5. Audit Response
        await audit({
            tenant_id,
            event_type: 'LLM_GENERATE_RESULT',
            actor: { id: actor?.id || 'unknown', type: actor?.type || 'user' },
            purpose: 'generate',
            context: {
                prompt_id: promptAuditId,
                valid: !!validResult,
                attempts,
                errors: validResult ? undefined : lastError
            },
            timestamp: new Date().toISOString()
        });

        if (!validResult) {
            return res.status(422).json({
                valid: false,
                error: 'Failed to generate valid JSON after retries',
                details: lastError,
                attempts
            });
        }

        res.json({
            valid: true,
            output: validResult,
            attempts,
            model_metadata: modelMetadata
        });

    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
