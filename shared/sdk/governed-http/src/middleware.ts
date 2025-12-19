import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { v4 as uuidv4 } from 'uuid';
import { GovernedRequest, Actor, RouteConfig, Decision, Resource } from './types';
import { AuditClient } from './auditClient';
import { PolicyClient } from './policyClient';
import { HTTP_HEADERS } from './constants';

// --- JWKS Client Cache ---
const jwksClients = new Map<string, JwksClient>();
const getJwksClient = (issuer: string): JwksClient => {
    let jwksUri = `${issuer}/protocol/openid-connect/certs`;
    // Docker networking fix (same as in service-template)
    if (process.env.KEYCLOAK_INTERNAL_HOST) {
        jwksUri = jwksUri.replace('localhost:8080', process.env.KEYCLOAK_INTERNAL_HOST);
    } else {
        jwksUri = jwksUri.replace('localhost:8080', 'keycloak:8080');
    }

    if (!jwksClients.has(issuer)) {
        jwksClients.set(issuer, jwksClient({
            jwksUri: jwksUri,
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10
        }));
    }
    return jwksClients.get(issuer)!;
};

// --- Middleware: requireAuth ---
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const govReq = req as GovernedRequest;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication Required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded: any = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.payload) throw new Error('Invalid token structure');

        const iss = decoded.payload.iss;
        if (!iss || typeof iss !== 'string') throw new Error('Invalid issuer');

        // Validate Realm Pattern
        const realmMatch = iss.match(/\/realms\/(tenant-[a-z0-9-]+|platform)$/);
        if (!realmMatch) throw new Error('Issuer not allowed');
        const realmName = realmMatch[1];
        if (realmName === 'platform') {
            govReq.tenant_id = '00000000-0000-0000-0000-000000000000';
        } else {
            govReq.tenant_id = realmName; // TODO: Resolve to UUID from token claim or lookup
        }

        // Verify Signature
        const client = getJwksClient(iss);
        const getKey = (header: any, callback: any) => {
            client.getSigningKey(header.kid, (err, key) => {
                if (err) return callback(err, null);
                callback(null, key?.getPublicKey());
            });
        };

        const verified: any = await new Promise((resolve, reject) => {
            // @ts-ignore
            jwt.verify(token, getKey, { issuer: iss, algorithms: ['RS256'] }, (err, decoded) => {
                if (err) reject(err);
                else resolve(decoded);
            });
        });

        // Build Actor
        govReq.actor = {
            actor_id: verified.sub,
            actor_type: 'user',
            roles: verified.realm_access?.roles || [],
            department_id: verified.department_id || (realmName === 'platform' ? 'platform' : 'unassigned')
        };

        next();
    } catch (err: any) {
        return res.status(401).json({ error: 'Unauthorized', details: err.message });
    }
};

// --- Middleware: requirePurpose ---
export const requirePurpose = (req: Request, res: Response, next: NextFunction) => {
    const purpose = req.headers[HTTP_HEADERS.PURPOSE.toLowerCase()] as string || req.headers[HTTP_HEADERS.PURPOSE] as string;
    if (!purpose) {
        return res.status(400).json({ error: `Missing required header: ${HTTP_HEADERS.PURPOSE}` });
    }
    (req as GovernedRequest).purpose = purpose;
    next();
};

// --- Main Wrapper: governedRoute ---
export const governedRoute = (config: RouteConfig, handler: (req: Request, res: Response, next: NextFunction) => void) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const govReq = req as GovernedRequest;
        const requestId = (req.headers['x-request-id'] as string) || uuidv4();
        // @ts-ignore
        govReq.audit_context = { request_id: requestId, trace_id: requestId }; // Simplify for now

        // 1. Auth (Explicit call or assumed? Prompt says correct execution order, let's run them explicitly if not composed)
        // Ideally governedRoute composes them. But express middleware chain is usually linear.
        // If we use governedRoute as the ONLY handler, we must run auth manually or assume it run before.
        // Prompt says "Implement governedRoute so the pipeline order is exactly: 1) requireAuth..."
        // So we should execute requireAuth logic or call it. Calling middleware from middleware is tricky in express.
        // We will execute the logic inline or use a helper to chain promise-based.
        // For simplicity and correctness with the prompt, I'll wrap them.

        // Helper to run middleware
        const runMiddleware = (fn: Function) => {
            return new Promise<void>((resolve, reject) => {
                let finished = false;
                const onFinish = () => {
                    if (!finished) {
                        finished = true;
                        resolve();
                    }
                };
                res.once('finish', onFinish);

                fn(req, res, (err: any) => {
                    res.removeListener('finish', onFinish);
                    if (finished) return;
                    finished = true;
                    if (err) reject(err);
                    else resolve(); // next() called
                });
            });
        };

        // PIPELINE EXECUTION
        try {
            // STEP 1: Auth
            await runMiddleware(requireAuth);
        } catch (e: any) {
            // If auth failed, response likely sent or error thrown
            return;
        }

        // Check if response sent by requireAuth
        if (res.headersSent) return;

        // STEP 2: Purpose
        if (config.purposeRequired !== false) {
            try {
                await runMiddleware(requirePurpose);
            } catch (e: any) { return; }
        }
        if (res.headersSent) return;

        const actor = govReq.actor!;
        const tenant_id = govReq.tenant_id || 'unknown';
        const purpose = govReq.purpose || 'unknown';
        const resource = config.resourceResolver(req);

        // STEP 3: Audit REQUEST_RECEIVED
        try {
            await AuditClient.emit({
                tenant_id,
                event_type: 'REQUEST_RECEIVED',
                actor,
                purpose,
                context: {
                    action: config.action,
                    resource: { ...resource, id: config.redactRequestBody ? resource.id : resource }, // minimal
                    request_id: requestId
                }
            });
        } catch (e) {
            if (config.privileged) {
                return res.status(503).json({ error: 'Audit Service Unavailable (Fail Closed)' });
            }
        }

        // STEP 4: Authorize
        let decision: Decision;
        try {
            decision = await PolicyClient.authorize({
                tenant_id,
                actor,
                action: config.action,
                resource,
                purpose,
                context: { time: new Date().toISOString() }
            });
        } catch (e) {
            if (config.privileged) {
                // Fail closed
                await AuditClient.emit({
                    tenant_id,
                    event_type: 'REQUEST_FAILED',
                    actor,
                    purpose,
                    context: { error: 'Policy Service Unavailable', request_id: requestId }
                }).catch(() => { });
                return res.status(503).json({ error: 'Policy Service Unavailable (Fail Closed)' });
            }
            // Fallback Deny
            decision = { allow: false, decision_id: 'fail-open-prevented', reasons: ['Policy Service Unavailable'] };
        }

        // STEP 5: Audit AUTHZ_DECISION
        try {
            await AuditClient.emit({
                tenant_id,
                event_type: 'AUTHZ_DECISION',
                actor,
                purpose,
                context: { decision, request_id: requestId }
            });
        } catch (e) {
            if (config.privileged) return res.status(503).json({ error: 'Audit Service Unavailable (Fail Closed)' });
        }

        // STEP 6: Enforce Decision
        if (!decision.allow) {
            // audit REQUEST_COMPLETED (denied) ?? Prompt says "audit REQUEST_COMPLETED" separately or "REQUEST_FAILED"
            // Prompt says: "if deny -> return 403 ..., audit REQUEST_COMPLETED"
            await AuditClient.emit({
                tenant_id,
                event_type: 'REQUEST_COMPLETED',
                actor,
                purpose,
                context: { outcome: 'DENIED', decision_id: decision.decision_id, request_id: requestId }
            }).catch(() => { });

            return res.status(403).json({
                error: 'Forbidden',
                decision_id: decision.decision_id,
                reasons: decision.reasons
            });
        }

        govReq.obligations = decision.obligations;

        // STEP 7: Call Handler
        // We wrap the handler to intercept errors/completion for auditing
        // But handler might be async.
        try {
            await new Promise<void>(async (resolve, reject) => {
                try {
                    // We can't easily wait for the handler to finish if it just calls res.send().
                    // We can hook into res.on('finish').

                    res.on('finish', () => {
                        // STEP 8: Audit REQUEST_COMPLETED
                        // Note: This runs AFTER response is sent.
                        const outcome = res.statusCode >= 400 ? 'FAILED' : 'SUCCESS';
                        AuditClient.emit({
                            tenant_id,
                            event_type: 'REQUEST_COMPLETED',
                            actor,
                            purpose,
                            context: {
                                outcome,
                                status: res.statusCode,
                                request_id: requestId
                            }
                        }).catch(e => console.error('Failed audit log', e));
                        resolve();
                    });

                    await handler(req, res, next);
                } catch (e) {
                    reject(e);
                }
            });
        } catch (error: any) {
            // Handler threw error
            await AuditClient.emit({
                tenant_id,
                event_type: 'REQUEST_FAILED',
                actor,
                purpose,
                context: { error: error.message, request_id: requestId }
            }).catch(() => { });
            next(error); // Pass to global error handler
        }
    };
};
