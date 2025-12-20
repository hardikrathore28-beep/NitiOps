import axios from 'axios';
import { LLMProvider, ChatMessage, ChatOptions, LLMResponse } from './base';

export class GeminiProvider implements LLMProvider {
    private apiKey: string;
    private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta/models';
    private defaultModel: string = 'gemini-pro';

    constructor(config: { apiKey: string }) {
        this.apiKey = config.apiKey;
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResponse> {
        const model = options?.model || this.defaultModel;

        // Transform messages to Gemini 'contents' format
        // Gemini uses 'user' (user) and 'model' (assistant). System instructions are separate.
        // Assuming simplistic mapping for MVP.
        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        const systemMsg = messages.find(m => m.role === 'system');

        const body: any = {
            contents: contents,
            generationConfig: {
                temperature: options?.temperature || 0.7,
                maxOutputTokens: options?.max_tokens,
                responseMimeType: options?.json_mode ? 'application/json' : 'text/plain'
            }
        };

        // System instruction only supported in newer Gemini models via API
        if (systemMsg) {
            body.systemInstruction = {
                parts: [{ text: systemMsg.content }]
            };
        }

        try {
            const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;
            const res = await axios.post(url, body, {
                headers: { 'Content-Type': 'application/json' }
            });

            const candidate = res.data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text || '';

            return {
                text: text,
                model: model,
                usage: {
                    // Gemini usage metadata varies
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                },
                raw: res.data
            };
        } catch (err: any) {
            console.error(`Gemini Call Failed:`, err.response?.data || err.message);
            throw new Error(`Gemini Provider Error: ${err.message}`);
        }
    }
}
