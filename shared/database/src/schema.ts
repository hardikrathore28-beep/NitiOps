import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, boolean, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Tenants
export const tenants = pgTable('tenants', {
    id: uuid('id').defaultRandom().primaryKey(),
    realm_name: varchar('realm_name', { length: 255 }).notNull().unique(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    issuer_url: varchar('issuer_url', { length: 512 }).notNull(),
    display_name: varchar('display_name', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Audit Events (Note: triggers handle hashes, so they are optional on insert but required in DB)
export const auditEvents = pgTable('audit_events', {
    event_id: uuid('event_id').defaultRandom().primaryKey(),
    tenant_id: text('tenant_id').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    event_type: text('event_type').notNull(),
    actor: jsonb('actor').notNull(),
    purpose: text('purpose').notNull(),
    context: jsonb('context').default({}).notNull(),
    references: jsonb('references').default({}).notNull(),
    // These are handled by trigger, but we define them to map to DB columns.
    // We can make them optional in insert type using specific Drizzle patterns or types.
    payload_hash: text('payload_hash'),
    hash_prev: text('hash_prev'),
    hash_this: text('hash_this'),
});

// Ingestion: Documents
export const documents = pgTable('documents', {
    document_id: uuid('document_id').defaultRandom().primaryKey(),
    tenant_id: text('tenant_id').notNull(),
    source_type: varchar('source_type', { length: 50 }).notNull(),
    source_ref: text('source_ref').notNull(),
    content_type: varchar('content_type', { length: 100 }).notNull(),
    title: text('title').notNull(),
    language: varchar('language', { length: 10 }),
    classification: jsonb('classification').default({}),
    version: integer('version').default(1),
    status: varchar('status', { length: 50 }).default('ingested').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Ingestion: Blobs
export const documentBlobs = pgTable('document_blobs', {
    document_id: uuid('document_id').primaryKey().references(() => documents.document_id, { onDelete: 'cascade' }),
    blob_uri: text('blob_uri').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    size_bytes: integer('size_bytes').notNull(), // using integer for bigint might overflow in JS, but Drizzle has bigint mode
});

// Ingestion: Text
export const documentText = pgTable('document_text', {
    document_id: uuid('document_id').primaryKey().references(() => documents.document_id, { onDelete: 'cascade' }),
    extracted_text: text('extracted_text').notNull(),
    extractor: varchar('extractor', { length: 50 }).notNull(),
    confidence: real('confidence'),
    extracted_at: timestamp('extracted_at', { withTimezone: true }).defaultNow(),
});

// Ingestion: Jobs
export const ingestionJobs = pgTable('ingestion_jobs', {
    job_id: uuid('job_id').defaultRandom().primaryKey(),
    tenant_id: text('tenant_id').notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).default('pending').notNull(),
    payload: jsonb('payload').notNull(),
    result: jsonb('result'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Ingestion Sources
export const ingestionSources = pgTable('ingestion_sources', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenant_id: text('tenant_id').notNull(),
    type: varchar('type', { length: 50 }).notNull(), // s3, gcs, api
    name: text('name').notNull(),
    config: jsonb('config').notNull(), // { bucket, region, accessKey... } or { url, headers }
    status: varchar('status', { length: 50 }).default('active').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
