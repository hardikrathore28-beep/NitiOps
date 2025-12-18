import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { logger, audit } from './index';

const POLICY_SERVICE_URL = process.env.POLICY_SERVICE_URL || 'http://policy-service:3002';

// 1. JWKS Client Cache (Global per process)
// Map issuer URL -> JwksClient instance
const jwksClients = new Map<string, JwksClient>();

const getJwksClient = (issuer: string): JwksClient => {
    // If running in Docker (implied by service-to-service calls), localhost from token (client-side)
    // is not reachable. We map it to internal service name 'keycloak'.
    let jwksUri = `${issuer}/protocol/openid-connect/certs`;
    if (process.env.KEYCLOAK_INTERNAL_HOST) {
        // e.g. keycloak:8080
        jwksUri = jwksUri.replace('localhost:8080', process.env.KEYCLOAK_INTERNAL_HOST);
    } else {
        // Default fallback for docker-compose standard checking
        jwksUri = jwksUri.replace('localhost:8080', 'keycloak:8080');
    }

    if (!jwksClients.has(issuer)) {
        logger.info(`Creating JWKS client for issuer: ${issuer} using URI: ${jwksUri}`);
        jwksClients.set(issuer, jwksClient({
            jwksUri: jwksUri,
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10,
            // 24 hour cache window ideally, but jwks-rsa default is good enough
        }));
    }
    return jwksClients.get(issuer)!;
};

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
    resource?: { type: string, id: string;[key: string]: any };
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
        let tenant_id = 'platform'; // Fallback for anonymous or platform-level calls

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                // A. Decode without verifying first to get issuer
                const decoded: any = jwt.decode(token, { complete: true });
                if (!decoded || !decoded.payload) {
                    throw new Error('Invalid token structure');
                }

                const iss = decoded.payload.iss;
                if (!iss || typeof iss !== 'string' || !iss.startsWith('http')) {
                    throw new Error('Invalid issuer format');
                }

                // B. Validate Issuer Pattern
                // Allowed: .../realms/tenant-<slug> OR .../realms/platform
                const realmMatch = iss.match(/\/realms\/(tenant-[a-z0-9-]+|platform)$/);
                if (!realmMatch) {
                    throw new Error(`Issuer ${iss} does not match allowed realm pattern`);
                }
                const realmName = realmMatch[1];
                tenant_id = realmName;

                // C. Fetch JWKS and Verify
                const client = getJwksClient(iss);

                const getKey = (header: any, callback: any) => {
                    client.getSigningKey(header.kid, (err, key) => {
                        if (err) {
                            callback(err, null);
                            return;
                        }
                        const signingKey = key?.getPublicKey();
                        callback(null, signingKey);
                    });
                };

                const verified: any = await new Promise((resolve, reject) => {
                    jwt.verify(token, getKey, {
                        issuer: iss, // Enforce exact issuer match
                        algorithms: ['RS256'], // Strict algorithm
                        // audience: '...', // Can be made configurable via env
                    }, (err, decoded) => {
                        if (err) reject(err);
                        else resolve(decoded);
                    });
                });

                // D. Build Actor
                // Mapping: sub -> actor_id
                // realm_access.roles -> roles
                // resource_access -> fallback roles? (Assuming realm roles for now)
                actor = {
                    actor_id: verified.sub,
                    actor_type: 'user', // Default to user, could be service-account if checked
                    roles: verified.realm_access?.roles || [],
                    department_id: verified.department_id || 'unknown'
                };

                // Service Account Check
                if (verified.azp && !verified.email) {
                    // heuristic for service account if needed, or check preferred_username
                    if (verified.preferred_username?.startsWith('service-account-')) {
                        actor.actor_type = 'service';
                    }
                }

            } catch (err: any) {
                logger.warn('Token validation failed', { error: err.message, tenant_id });
                // FAIL CLOSED: Unauthenticated/Invalid Token -> 401
                return res.status(401).json({ error: 'Unauthorized', details: err.message });
            }
        } else {
            // STRICT: No token -> 401. Public endpoints should use a separate middleware or skip this one.
            return res.status(401).json({ error: 'Authentication Required' });
        }

        // 2. Extract Context
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

                // Audit the denial (Fire and Forget)
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
            res.status(500).json({ error: 'Authorization Service Unavailable' });
        }
    };
};
