import { Request, Response } from 'express';
import { db, tools, toolInvocations, eq, and } from '@nitiops/database';
import { v4 as uuidv4 } from 'uuid';
import { getAdapter } from '../adapters';
import { validateSchema, redactSensitiveData } from '../validation';
import { PolicyClient, AuditClient, GovernedRequest } from '@nitiops/governed-http';

export const handleCreateTool = async (req: Request, res: Response) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] as string;
        if (!tenant_id) {
            return res.status(400).json({ error: 'Missing x-tenant-id header' });
        }

        const tool_id = uuidv4();
        const now = new Date();

        await db.insert(tools).values({
            tool_id,
            tenant_id,
            name: req.body.name,
            description: req.body.description,
            adapter_type: req.body.adapter_type,
            sensitivity: req.body.sensitivity,
            allowed_purposes: req.body.allowed_purposes,
            labels: req.body.labels || {},
            input_schema: req.body.input_schema,
            output_schema: req.body.output_schema,
            config: req.body.config,
            enabled: req.body.enabled ?? true,
            created_at: now,
            updated_at: now,
        });

        res.status(201).json({ tool_id });
    } catch (error: any) {
        console.error('Error creating tool:', error);
        res.status(500).json({ error: error.message });
    }
};

export const handleListTools = async (req: Request, res: Response) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] as string;
        if (!tenant_id) {
            return res.status(400).json({ error: 'Missing x-tenant-id header' });
        }

        const results = await db.select().from(tools).where(eq(tools.tenant_id, tenant_id));
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const handleGetTool = async (req: Request, res: Response) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] as string;
        const { tool_id } = req.params;

        if (!tenant_id) {
            return res.status(400).json({ error: 'Missing x-tenant-id header' });
        }

        const [tool] = await db.select().from(tools).where(
            and(
                eq(tools.tenant_id, tenant_id),
                eq(tools.tool_id, tool_id)
            )
        );

        if (!tool) {
            return res.status(404).json({ error: 'Tool not found' });
        }

        res.json(tool);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const handleInvokeTool = async (req: Request, res: Response) => {
    const govReq = req as GovernedRequest;
    const tenant_id = govReq.tenant_id || req.headers['x-tenant-id'] as string;
    const { tool_id } = req.params;
    const purpose = govReq.purpose || req.headers['x-purpose'] as string;
    const actor = govReq.actor;

    if (!tenant_id || !purpose || !actor) {
        return res.status(400).json({ error: 'Missing required tenant, purpose, or actor context' });
    }

    const invocation_id = uuidv4();
    const started_at = new Date();

    try {
        // 1. Fetch tool definition
        const [tool] = await db.select().from(tools).where(
            and(
                eq(tools.tenant_id, tenant_id),
                eq(tools.tool_id, tool_id)
            )
        );

        if (!tool) {
            return res.status(404).json({ error: 'Tool not found' });
        }

        if (!tool.enabled) {
            return res.status(403).json({ error: 'Tool is disabled' });
        }

        // 2. Check purpose is allowed for tool
        const allowedPurposes = tool.allowed_purposes as string[];
        if (!allowedPurposes.includes(purpose) && !allowedPurposes.includes('*')) {
            return res.status(403).json({ error: `Purpose '${purpose}' not allowed for this tool` });
        }

        // 3. Call policy-service authorize
        const decision = await PolicyClient.authorize({
            tenant_id,
            action: 'tool.invoke',
            actor,
            resource: {
                type: 'tool',
                id: tool_id,
                labels: tool.labels as any,
                sensitivity: tool.sensitivity,
            },
            purpose,
            context: {
                time: started_at.toISOString(),
                tool_name: tool.name,
                workflow_id: req.headers['x-workflow-id'] as string,
                agent_invocation_id: req.headers['x-agent-invocation-id'] as string,
            }
        });

        if (!decision.allow) {
            await db.insert(toolInvocations).values({
                invocation_id,
                tool_id,
                tenant_id,
                actor,
                purpose,
                input: redactSensitiveData(req.body, tool.sensitivity),
                status: 'denied',
                started_at,
                completed_at: new Date(),
                error_message: 'Policy denial',
            });

            return res.status(403).json({
                error: 'Unauthorized by policy',
                decision_id: decision.decision_id,
                reasons: decision.reasons
            });
        }

        // Emit TOOL_INVOKE_START
        await AuditClient.emit({
            tenant_id,
            event_type: 'TOOL_INVOKE_START',
            actor,
            purpose,
            context: { tool_id, tool_name: tool.name, invocation_id },
        });

        // 4. Validate input against tool.input_schema (Ajv)
        const inputValidation = validateSchema(tool.input_schema, req.body);
        if (!inputValidation.valid) {
            await AuditClient.emit({
                tenant_id,
                event_type: 'TOOL_INVOKE_FAILED',
                actor,
                purpose,
                context: { tool_id, invocation_id, error: 'Input validation failed', details: inputValidation.errors },
            });
            return res.status(422).json({ error: 'Input validation failed', details: inputValidation.errors });
        }

        // 5. Execute using adapter
        const adapter = getAdapter(tool.adapter_type);
        if (!adapter) {
            throw new Error(`Adapter for type '${tool.adapter_type}' not found`);
        }

        const result = await adapter.invoke(tool, req.body, {
            tenant_id,
            actor: { user_id: actor.actor_id, role: actor.roles?.[0] || 'user' },
            purpose,
            invocation_id,
        });

        // 6. Validate output against tool.output_schema
        const outputValidation = validateSchema(tool.output_schema, result.output);
        if (!outputValidation.valid) {
            await AuditClient.emit({
                tenant_id,
                event_type: 'TOOL_INVOKE_FAILED',
                actor,
                purpose,
                context: { tool_id, invocation_id, error: 'Output validation failed', details: outputValidation.errors },
            });
            return res.status(422).json({ error: 'Output validation failed', details: outputValidation.errors });
        }

        // 7. Success - persist and audit
        await db.insert(toolInvocations).values({
            invocation_id,
            tool_id,
            tenant_id,
            actor,
            purpose,
            input: redactSensitiveData(req.body, tool.sensitivity),
            output: redactSensitiveData(result.output, tool.sensitivity),
            status: 'success',
            started_at,
            completed_at: new Date(),
        });

        await AuditClient.emit({
            tenant_id,
            event_type: 'TOOL_INVOKE_RESULT',
            actor,
            purpose,
            context: { tool_id, invocation_id, status: 'success' },
        });

        res.json(result);

    } catch (error: any) {
        console.error('Error invoking tool:', error);

        await db.insert(toolInvocations).values({
            invocation_id,
            tool_id,
            tenant_id,
            actor,
            purpose,
            input: redactSensitiveData(req.body, 'low'),
            status: 'failed',
            started_at,
            completed_at: new Date(),
            error_message: error.message,
        });

        await AuditClient.emit({
            tenant_id,
            event_type: 'TOOL_INVOKE_FAILED',
            actor,
            purpose,
            context: { tool_id, invocation_id, error: error.message },
        });

        const statusCode = error.message.includes('Policy Service Unreachable') || error.message.includes('Audit Service Unreachable') ? 500 : 400;
        res.status(statusCode).json({ error: error.message });
    }
};

export const handleGenerateFromOpenAPI = async (req: Request, res: Response) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] as string;
        const { openapi_json, prefix = '', labels = {} } = req.body;

        if (!tenant_id || !openapi_json) {
            return res.status(400).json({ error: 'Missing tenant_id or openapi_json' });
        }

        const spec = typeof openapi_json === 'string' ? JSON.parse(openapi_json) : openapi_json;
        const baseUrl = spec.servers?.[0]?.url || '';
        const createdTools = [];

        for (const [path, methods] of Object.entries(spec.paths || {})) {
            for (const [method, operation] of Object.entries(methods as any)) {
                if (method === 'parameters') continue;

                const op = operation as any;
                const tool_id = uuidv4();
                const now = new Date();
                const name = `${prefix}${op.operationId || (method + path.replace(/\//g, '_'))}`;

                const toolData = {
                    tool_id,
                    tenant_id,
                    name,
                    description: op.description || op.summary || `Tool for ${method.toUpperCase()} ${path}`,
                    adapter_type: 'rest',
                    sensitivity: 'low', // Default
                    allowed_purposes: ['*'], // Default to all purposes, admin can restrict
                    labels: { ...labels, system: 'generated' },
                    input_schema: op.requestBody?.content?.['application/json']?.schema || { type: 'object' },
                    output_schema: op.responses?.['200']?.content?.['application/json']?.schema || { type: 'object' },
                    config: {
                        base_url: baseUrl,
                        path: path,
                        method: method.toUpperCase(),
                        auth_type: 'none',
                    },
                    enabled: false, // Disabled by default as requested
                    created_at: now,
                    updated_at: now,
                };

                await db.insert(tools).values(toolData);
                createdTools.push({ tool_id, name });
            }
        }

        res.status(201).json({
            message: `Generated ${createdTools.length} tools`,
            tools: createdTools
        });

    } catch (error: any) {
        console.error('Error generating tools from OpenAPI:', error);
        res.status(500).json({ error: error.message });
    }
};

