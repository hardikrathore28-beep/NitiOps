-- Migration: Create audit_events table with immutability and hashing
-- Date: 2025-12-17
-- Description: Establishes the append-only ledger for audit logs.

-- Enable pgcrypto for cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create the audit_events table
CREATE TABLE IF NOT EXISTS audit_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    actor JSONB NOT NULL,
    purpose TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    "references" JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_hash TEXT NOT NULL,
    hash_prev TEXT NOT NULL,
    hash_this TEXT NOT NULL
);

-- 2. Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_id ON audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type);
-- JSONB Indexes for specific keys likely to be queried
CREATE INDEX IF NOT EXISTS idx_audit_ref_workflow ON audit_events (("references"->>'workflow_id'));
CREATE INDEX IF NOT EXISTS idx_audit_ref_agent_inv ON audit_events (("references"->>'agent_invocation_id'));

-- 3. Immutability Rules
-- Prevent UPDATE
CREATE OR REPLACE RULE audit_events_no_update AS 
    ON UPDATE TO audit_events 
    DO INSTEAD NOTHING;

-- Prevent DELETE
CREATE OR REPLACE RULE audit_events_no_delete AS 
    ON DELETE TO audit_events 
    DO INSTEAD NOTHING;

-- 4. Hashing Trigger Function
CREATE OR REPLACE FUNCTION calculate_audit_hashes() 
RETURNS TRIGGER AS $$
DECLARE
    previous_hash TEXT;
    calculated_payload_hash TEXT;
BEGIN
    -- Calculate payload_hash
    -- Rule: payload_hash excludes hash fields.
    -- We concatenate strict fields to ensure detecting tampering of content.
    -- Using | ensures no null issues by coalescing.
    calculated_payload_hash := encode(digest(
        COALESCE(NEW.tenant_id::text, '') ||
        COALESCE(NEW.event_type, '') ||
        COALESCE(NEW.actor::text, '') ||
        COALESCE(NEW.purpose, '') ||
        COALESCE(NEW.context::text, '') ||
        COALESCE(NEW."references"::text, ''),
        'sha256'), 'hex');
        
    NEW.payload_hash := calculated_payload_hash;

    -- Get hash_this from the most recent record to form the chain
    -- Locking advice: In high throughput, this requires serialization (e.g., table lock or advisory lock)
    -- to guarantee no forks. For this schema design, we simply fetch the latest.
    SELECT hash_this INTO previous_hash 
    FROM audit_events 
    ORDER BY timestamp DESC, event_id DESC 
    LIMIT 1;

    -- Handle Genesis Block case
    IF previous_hash IS NULL THEN
        previous_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.hash_prev := previous_hash;
    
    -- Rule: hash_this = hash(payload + hash_prev)
    -- We use the calculated payload_hash.
    NEW.hash_this := encode(digest(NEW.payload_hash || NEW.hash_prev, 'sha256'), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach Trigger
DROP TRIGGER IF EXISTS trigger_audit_hashing ON audit_events;
CREATE TRIGGER trigger_audit_hashing
BEFORE INSERT ON audit_events
FOR EACH ROW EXECUTE FUNCTION calculate_audit_hashes();
