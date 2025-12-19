import { createService, startService, logger, audit } from '@nitiops/service-template';
import { Request, Response } from 'express';
import { db, initDB } from './db';
import { initKeycloak, createTenantRealm, createUserInRealm } from './keycloak';

const app = createService('tenant-service');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3003;

// Initialize dependencies
initDB();
initKeycloak();

const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

import { governedRoute, ACTIONS, Resource } from '@nitiops/governed-http';

app.post('/tenants', governedRoute({
    action: ACTIONS.TENANT_CREATE,
    resourceResolver: (req) => ({
        type: 'tenant',
        id: req.body.slug || 'unknown',
        labels: { operation: 'create' },
        owner_department_id: 'platform'
    }),
    privileged: true, // Fail closed
    purposeRequired: true
}, async (req: Request, res: Response) => {
    const { slug, displayName } = req.body;

    // 0. Input Validation (Still needed here, or can be done in resolver/middleware?)
    // Basic validation is fine here.
    if (!slug || !/^[a-z0-9]+$/.test(slug)) {
        return res.status(400).json({ error: 'Invalid slug. Must be lowercase alphanumeric.' });
    }

    // 1. Logic (Auth/Audit/Policy handled by middleware)
    // Access context if needed: (req as any).actor, (req as any).obligations

    // 2. Keycloak Provisioning
    const kcResult = await createTenantRealm(slug, displayName);

    // 3. DB Persistence
    const result = await db.query(
        `INSERT INTO tenants (realm_name, slug, issuer_url, display_name) VALUES ($1, $2, $3, $4) RETURNING *`,
        [kcResult.realmName, slug, kcResult.issuerUrl, displayName]
    );
    const newTenant = result.rows[0];

    // Audit Success is automatic (REQUEST_COMPLETED)
    // But we might want to emit a specific BUSINESS event like TENANT_CREATED?
    // The middleware audits "REQUEST_COMPLETED". 
    // If we want "TENANT_CREATED", we can use AuditClient manually OR rely on the generic logs.
    // The prompt says "Audit: TENANT_CREATED" was in the manual version. 
    // Governed SDK middleware emits generic request events. 
    // We can import AuditClient and emit custom events too.
    const { audit } = require('@nitiops/service-template'); // Or use SDK's client
    // Let's use the one from service-template for backward comp or the new one.
    // Actually, let's stick to the prompt's new pattern where middleware covers "audit coverage".
    // If specific business events are needed, we can log them.

    res.status(201).json(newTenant);
}));

app.post('/tenants/:tenantId/users', async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { username, email, firstName, lastName, roles } = req.body;

    // 0. Input Validation
    if (!username || !email) {
        return res.status(400).json({ error: 'Username and email are required' });
    }

    try {
        // 1. Identify Realm
        // Assuming tenantId in URL is the ID (slug or UUID). Let's query by slug or realm_name or ID.

        let realmName: string;
        let tenantUuid: string;

        const tenantQuery = await db.query(
            'SELECT * FROM tenants WHERE id::text = $1 OR slug = $1',
            [tenantId]
        );

        if (tenantQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const tenant = tenantQuery.rows[0];
        realmName = tenant.realm_name; // e.g. tenant-demo
        tenantUuid = tenant.id;

        // 2. AuthZ Check
        const authHeader = req.headers.authorization;
        const policyResponse = await fetch('http://policy-service:3002/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenant_id: realmName, // Policy expects realm name for now context
                actor: {
                    actor_id: 'unknown-actor',
                    actor_type: 'user',
                    roles: ['tenant_admin'],
                    department_id: 'unknown'
                },
                action: 'user.create',
                resource: {
                    type: 'user',
                    id: username,
                    owner_department_id: 'unknown'
                },
                purpose: 'Onboard new user to tenant',
                context: {
                    time: new Date().toISOString()
                }
            })
        });

        const decision = await policyResponse.json();

        // Audit: AUTHZ_DECISION
        await audit({
            tenant_id: tenantUuid, // Use UUID for audit
            event_type: 'AUTHZ_DECISION',
            actor: { type: 'user', id: 'unknown-actor' },
            purpose: 'Authorization check for user.create',
            context: { decision, username, realm: realmName },
            timestamp: new Date().toISOString()
        });

        if (!decision.allow) {
            return res.status(403).json({ error: 'Forbidden', details: decision.reasons });
        }

        // 3. Create User in Keycloak
        // This helper handles user creation + role assignment + temp password/required actions
        const newUser = await createUserInRealm(realmName, {
            username,
            email,
            firstName,
            lastName,
            roles // e.g. ['tenant_admin', 'auditor']
        });

        // 4. Audit: USER_CREATED
        await audit({
            tenant_id: tenantUuid,
            event_type: 'USER_CREATED',
            actor: { type: 'user', id: 'unknown-actor' },
            purpose: 'User onboarding',
            context: {
                user_id: newUser.id,
                username: newUser.username,
                assigned_roles: roles
            },
            timestamp: new Date().toISOString()
        });

        res.status(201).json({
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            enabled: newUser.enabled,
            createdTimestamp: newUser.createdTimestamp,
            realm: realmName
        });

    } catch (error: any) {
        logger.error('Failed to create user', { error: error.message, stack: error.stack });
        if (error.response?.status === 409) {
            return res.status(409).json({ error: 'User already exists' });
        }
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});


// Verification Endpoint for Step 5
// This uses the shared middleware to prove we can validate tokens from any valid tenant realm
import { createAuthorizationMiddleware } from '@nitiops/service-template';

const whoamiAuth = createAuthorizationMiddleware((req) => ({
    action: 'auth.inspect',
    resource: { type: 'identity', id: 'me' },
    purpose: 'verification'
}));

app.get('/whoami', whoamiAuth, (req: Request, res: Response) => {
    const authReq = req as any;
    res.json({
        message: 'You are authenticated!',
        actor: authReq.actor,
        tenant_id: authReq.tenant_id,
        obligations: authReq.obligations
    });
});

startService(app, PORT);
