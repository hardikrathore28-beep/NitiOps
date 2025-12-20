import { createService, startService, logger } from '@nitiops/service-template';
import { Request, Response } from 'express';
import { createDb, auditEvents, sql, desc, and, eq, gte, lte } from '@nitiops/database';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const app = createService('audit-service');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Database Connection
const db = createDb(process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/nitiops');

// JSON Schema Validation
const ajv = new Ajv({ strict: false }); // strict: false to allow schema with unknown keywords if any
addFormats(ajv);

// --- Database Migration Helper ---
// Migrations handled externally

// Initialize Schema Validation
// AuditEvent schema validation load
const schemaPath = path.resolve(__dirname, '../../../shared/schemas/AuditEvent.json');
let validate: any;
try {
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    validate = ajv.compile(schema);
    logger.info('AuditEvent schema loaded successfully.');
} catch (err: any) {
    logger.error('Failed to load or compile AuditEvent schema', {
        path: schemaPath,
        dirname: __dirname,
        message: err.message,
        stack: err.stack,
        errors: err.errors
    });
    process.exit(1);
}


// --- Endpoints ---

// POST /audit/events
// Records a new audit event.
// Validation: Schema check
// Persistence: Insert into Postgres (Trigger handles hashing)
app.post('/audit/events', async (req: Request, res: Response) => {
    const event = req.body;

    // 1. Validate Schema
    const valid = validate(event);
    if (!valid) {
        logger.warn('Invalid audit event rejected', { errors: validate.errors });
        return res.status(400).json({ error: 'Invalid event payload', details: validate.errors });
    }

    // 2. Insert into Database
    try {
        // We use raw SQL for insert because we need to rely on the TRIGGER to calculate hashes.
        // Drizzle insert would expect us to match the schema.
        // The trigger handles payload_hash, hash_prev, hash_this.
        // But we want to return them.

        // Option 1: Drizzle raw SQL execution
        const result = await db.execute(sql`
            INSERT INTO audit_events (
                tenant_id, event_type, actor, purpose, context, "references", timestamp
            ) VALUES (
                ${event.tenant_id}, ${event.event_type}, ${event.actor}, ${event.purpose}, ${event.context || {}}, ${event.references || {}}, COALESCE(${event.timestamp}, NOW())
            ) RETURNING event_id, payload_hash, hash_prev, hash_this
        `);

        // Drizzle execute returns "QueryResult" type dependent on driver. 
        // For node-postgres, it's { rows: ... }
        const row = result.rows[0];

        logger.info('Audit event recorded successfully', {
            event_id: row.event_id,
            tenant_id: event.tenant_id
        });

        res.status(201).json({
            status: 'recorded',
            id: row.event_id,
            hashes: {
                payload: row.payload_hash,
                prev: row.hash_prev,
                this: row.hash_this
            }
        });

    } catch (err: any) {
        // Handle Immutability/Permission Errors
        if (err.message && err.message.includes('Security Violation')) {
            logger.error('Security Violation attempted during insert', { error: err.message });
            return res.status(403).json({ error: 'Security Violation' });
        }

        logger.error('Failed to persist audit event', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /audit/events
// Retrieves events with optional filtering.
app.get('/audit/events', async (req: Request, res: Response) => {
    const { tenant_id, event_type, from_time, to_time, limit = 50 } = req.query;

    try {
        const conditions = [];
        if (tenant_id) conditions.push(sql`tenant_id = ${tenant_id}`);
        if (event_type) conditions.push(eq(auditEvents.event_type, event_type as string));
        if (from_time) conditions.push(gte(auditEvents.timestamp, new Date(from_time as string)));
        if (to_time) conditions.push(lte(auditEvents.timestamp, new Date(to_time as string)));

        // Combine with AND
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const results = await db.select().from(auditEvents)
            .where(whereClause)
            .orderBy(desc(auditEvents.timestamp))
            .limit(parseInt(limit as string));

        res.json(results);

    } catch (err: any) {
        logger.error('Failed to fetch audit events', { error: err.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /audit/search
// Auditor-focused search with deep tracing capabilities.
// Requires tenant_id.
app.get('/audit/search', async (req: Request, res: Response) => {
    const { tenant_id, workflow_id, agent_invocation_id, event_type, from_time, to_time } = req.query;

    if (!tenant_id) {
        return res.status(400).json({ error: 'tenant_id is required' });
    }

    try {
        const conditions = [sql`tenant_id = ${tenant_id}`];

        // JSONB operators in Drizzle require sql template often for specific key/value checks if not purely mapped.
        // references->>'workflow_id'
        if (workflow_id) {
            conditions.push(sql`"references"->>'workflow_id' = ${workflow_id}`);
        }
        if (agent_invocation_id) {
            conditions.push(sql`"references"->>'agent_invocation_id' = ${agent_invocation_id}`);
        }
        if (event_type) {
            conditions.push(eq(auditEvents.event_type, event_type as string));
        }
        if (from_time) {
            conditions.push(gte(auditEvents.timestamp, new Date(from_time as string)));
        }
        if (to_time) {
            conditions.push(lte(auditEvents.timestamp, new Date(to_time as string)));
        }

        const whereClause = and(...conditions);

        const results = await db.select().from(auditEvents)
            .where(whereClause)
            .orderBy(desc(auditEvents.timestamp))
            .limit(1000);

        res.json(results);

    } catch (err: any) {
        logger.error('Failed to search audit events', { error: err.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Graceful Shutdown ---
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received');
    // Pool shutdown is handled by Drizzle/PG if needed, but for now we exit.
    // await pool.end();
    process.exit(0);
});

startService(app, PORT);
