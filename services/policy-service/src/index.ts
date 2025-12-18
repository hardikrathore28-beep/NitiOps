import { createService, startService, logger } from '@nitiops/service-template';
import { Request, Response } from 'express';
import { validateRequest } from './schemas';
import { evaluatePolicy } from './opa';
import { AuditClient } from './audit';
import { AuthorizeRequest } from './types';

const app = createService('policy-service');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;

app.post('/authorize', async (req: Request, res: Response) => {
    const input = req.body as AuthorizeRequest;

    // 1. Validation
    if (!validateRequest(input)) {
        logger.warn('Invalid authorization request', { errors: validateRequest.errors });
        return res.status(400).json({ error: 'Invalid request', details: validateRequest.errors });
    }

    // 2. Audit: Check
    const auditActor = {
        id: input.actor.actor_id,
        type: input.actor.actor_type,
        ...input.actor
    };

    logger.info('Sending AUTHZ_CHECK', { payload: { ...input, actor: auditActor } });

    await AuditClient.logEvent('AUTHZ_CHECK', {
        ...input,
        actor: auditActor
    });

    // 3. Evaluate Policy (OPA)
    try {
        const decision = await evaluatePolicy(input);

        // 4. Audit: Decision
        await AuditClient.logEvent('AUTHZ_DECISION', {
            ...(input as object),
            actor: auditActor,
            decision
        });

        res.json(decision);
    } catch (error: any) {
        logger.error('Policy evaluation failed', { error: error.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

startService(app, PORT);
