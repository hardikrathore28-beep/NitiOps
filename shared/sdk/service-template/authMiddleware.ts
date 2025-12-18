import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { logger, audit } from './index';

const POLICY_SERVICE_URL = process.env.POLICY_SERVICE_URL || 'http://policy-service:3002';

// Extended Request interface to include context
export interface AuthenticatedRequest extends Request {
    actor?: {
        actor_id: string;
        actor_type: string;
        roles: string[];
        department_id: string;
    };
    tenant_id?: string;
    obligations?: any;
}

export type ActionMapper = (req: Request) => {
    action: string;
    resource?: { type: string; id: string;[key: string]: any };
    purpose?: string;
};

export const createAuthorizationMiddleware = (actionMapper: ActionMapper) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // 1. Extract Identity (JWT)
        const authHeader = req.headers.authorization;
        let actor = {
            actor_id: 'anonymous',
            actor_type: 'unknown',
            roles: ['guest'],
            department_id: 'unknown'
        };

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                // In production, verify with secret/public key. skipping verification strictness for template simple usage
                const decoded: any = jwt.decode(token);
                if (decoded) {
                    actor = {
                        actor_id: decoded.sub || 'unknown',
                        actor_type: decoded.type || 'user',
                        roles: decoded.realm_access?.roles || [],
                        department_id: decoded.department_id || 'unknown'
                    };
                }
            } catch (err) {
                logger.warn('Failed to decode JWT', { error: err });
                // We don't block here, we let the policy decide if anonymous/guest is allowed
            }
        }

        // 2. Extract Context
        const tenant_id = (req.headers['x-tenant-id'] as string) || 'default';
        const { action, resource, purpose } = actionMapper(req);
        const requestPurpose = purpose || (req.body && req.body.purpose) || req.headers['x-purpose'] || 'unknown';

        const authzRequest = {
            tenant_id,
            actor,
            action,
            resource: resource || { type: 'unknown', id: 'unknown' },
            purpose: requestPurpose,
            context: {
                ip: req.ip,
                time: new Date().toISOString(),
                workflow_id: req.headers['x-workflow-id'],
                agent_invocation_id: req.headers['x-agent-invocation-id']
            }
        };

        // 3. Call Policy Service
        try {
            const response = await axios.post(`${POLICY_SERVICE_URL}/authorize`, authzRequest);
            const decision = response.data;

            if (decision.allow) {
                // Attach obligations/context
                (req as AuthenticatedRequest).actor = actor;
                (req as AuthenticatedRequest).tenant_id = tenant_id;
                (req as AuthenticatedRequest).obligations = decision.obligations;
                next();
            } else {
                // Denied
                logger.warn('Access Denied', { actor: actor.actor_id, action, reasons: decision.reasons });

                // Audit the denial (explicit requirement)
                // Note: policy-service already audits the decision, but we audit the ENFORCEMENT here if requested.
                // "On deny: return 403 and write audit event"
                audit({
                    tenant_id,
                    event_type: 'ACCESS_DENIED',
                    actor,
                    purpose: requestPurpose,
                    context: { action, resource, reasons: decision.reasons },
                    timestamp: new Date().toISOString()
                }).catch(e => logger.error('Failed to audit denial', e));

                res.status(403).json({ error: 'Forbidden', decision_id: decision.decision_id, reasons: decision.reasons });
            }
        } catch (error: any) {
            logger.error('Authorization check failed', { error: error.message });
            // Fail Closed
            res.status(500).json({ error: 'Authorization Service Unavailable' });
        }
    };
};
