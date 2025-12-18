import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as winston from 'winston';

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: process.env.SERVICE_NAME || 'unknown-service' },
    transports: [
        new winston.transports.Console()
    ]
});

const AUDIT_URL = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3001/audit/events';
const IS_AUDIT_SERVICE = process.env.SERVICE_NAME === 'audit-service';

// Helper to send audit event
export const audit = async (event: any): Promise<void> => {
    // Prevent infinite loops: Audit service does not audit itself via HTTP
    if (IS_AUDIT_SERVICE) return;

    try {
        const response = await fetch(AUDIT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });

        if (!response.ok) {
            throw new Error(`Audit service responded with ${response.status}`);
        }
    } catch (error) {
        logger.error('Failed to emit audit event', { error });
        throw error; // Propagate for "fail closed" logic
    }
}

export const createService = (name: string): Express => {
    const app = express();

    app.use(cors());
    app.use(bodyParser.json());

    // Audit & Logging Middleware
    app.use(async (req: Request, res: Response, next: NextFunction) => {
        const traceId = req.headers['x-trace-id'] || 'unknown';
        const actorId = req.headers['x-actor-id'] || 'anonymous';

        logger.info(`Incoming request: ${req.method} ${req.url}`);

        // 1. Audit: REQUEST_RECEIVED
        // Rule: Block if audit is mandatory (default: yes)
        try {
            await audit({
                tenant_id: req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000', // Default invalid UUID if missing
                event_type: 'REQUEST_RECEIVED',
                actor: { type: 'system', id: actorId }, // Simplified actor
                purpose: `Handle ${req.method} ${req.url}`,
                context: {
                    method: req.method,
                    url: req.url,
                    headers: req.headers
                },
                references: {
                    workflow_id: req.headers['x-workflow-id'],
                    agent_invocation_id: req.headers['x-agent-invocation-id']
                },
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            logger.error('CRITICAL: Audit mandatory check failed. Blocking request.');
            res.status(503).json({ error: 'System Audit Failure - Request Blocked' });
            return;
        }

        // Hook for REQUEST_COMPLETED / FAILED
        res.on('finish', () => {
            const status = res.statusCode;
            const eventType = status >= 400 ? 'REQUEST_FAILED' : 'REQUEST_COMPLETED';

            // Best effort auditing for completion (don't block response, it's already sent)
            audit({
                tenant_id: req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000',
                event_type: eventType,
                actor: { type: 'system', id: actorId },
                purpose: `Completed ${req.method} ${req.url}`,
                context: { status },
                references: {
                    workflow_id: req.headers['x-workflow-id'],
                    agent_invocation_id: req.headers['x-agent-invocation-id']
                },
                timestamp: new Date().toISOString()
            }).catch(e => logger.error('Failed to log completion audit', { error: e }));
        });

        next();
    });

    // Health check
    app.get('/health', (req: Request, res: Response) => {
        res.json({ status: 'ok', service: name, timestamp: new Date().toISOString() });
    });

    // Placeholder Auth Middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
        // In real impl, verify JWT here.
        // Audit: AUTHZ_DECISION could be emitted here
        next();
    });

    return app;
};

export const startService = (app: Express, port: number) => {
    app.listen(port, () => {
        logger.info(`Service listening on port ${port}`);
    });
};

// Placeholder for policy check
export const authorize = async (actor: string, action: string, resource: string): Promise<boolean> => {
    // Call OPA here
    return true;
}
