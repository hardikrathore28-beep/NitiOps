-- Migration: Ingestion Schema Updates (Alter existing tables)

-- 1. Update ingestion_sources
-- Rename/Add columns to match new requirements if needed or verify existence

-- Add 'schedule' if missing
ALTER TABLE "ingestion_sources" ADD COLUMN IF NOT EXISTS "schedule" varchar(100);

-- 2. Update ingestion_jobs
-- Add columns: source_id, cursor, stats, error, ended_at, started_at
-- Note: 'started_at' might be 'created_at' in existing, but let's add specific execution start time if distinct.
-- Exiting 'created_at' exists.

ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "source_id" uuid REFERENCES "ingestion_sources"("id") ON DELETE CASCADE;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "cursor" jsonb;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "stats" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "error" text;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone DEFAULT now();
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "ended_at" timestamp with time zone;

-- Index for jobs
CREATE INDEX IF NOT EXISTS "idx_ingestion_jobs_source" ON "ingestion_jobs" ("source_id");

-- 3. Enhance documents table for versioning/lineage
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source_id" uuid REFERENCES "ingestion_sources"("id") ON DELETE SET NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ingestion_job_id" uuid REFERENCES "ingestion_jobs"("job_id") ON DELETE SET NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "content_hash" varchar(64); -- sha256
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source_uri" text;

-- Index for content deduplication lookup
CREATE INDEX IF NOT EXISTS "idx_documents_source_hash" ON "documents" ("source_id", "content_hash");
