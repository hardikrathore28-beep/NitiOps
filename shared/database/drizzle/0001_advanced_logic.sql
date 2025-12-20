-- Migration: Advanced Logic (Triggers, Roles, Constraints)
-- Consolidated from audit-service and ingestion-service

-- Enable pgcrypto for cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --- AUDIT SERVICE LOGIC ---

-- 1. Create Roles (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nitiops_app_role') THEN
    CREATE ROLE nitiops_app_role WITH NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nitiops_auditor_role') THEN
    CREATE ROLE nitiops_auditor_role WITH NOLOGIN;
  END IF;
END
$$;

-- 2. Grant permissions
REVOKE ALL ON audit_events FROM PUBLIC;
GRANT INSERT, SELECT ON audit_events TO nitiops_app_role;
GRANT SELECT ON audit_events TO nitiops_auditor_role;

-- 3. Hashing Trigger Function
CREATE OR REPLACE FUNCTION calculate_audit_hashes() 
RETURNS TRIGGER AS $$
DECLARE
    previous_hash TEXT;
    calculated_payload_hash TEXT;
BEGIN
    calculated_payload_hash := encode(digest(
        COALESCE(NEW.tenant_id::text, '') ||
        COALESCE(NEW.event_type, '') ||
        COALESCE(NEW.actor::text, '') ||
        COALESCE(NEW.purpose, '') ||
        COALESCE(NEW.context::text, '') ||
        COALESCE(NEW."references"::text, ''),
        'sha256'), 'hex');
        
    NEW.payload_hash := calculated_payload_hash;

    SELECT hash_this INTO previous_hash 
    FROM audit_events 
    ORDER BY timestamp DESC, event_id DESC 
    LIMIT 1;

    IF previous_hash IS NULL THEN
        previous_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.hash_prev := previous_hash;
    NEW.hash_this := encode(digest(NEW.payload_hash || NEW.hash_prev, 'sha256'), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_hashing ON audit_events;
CREATE TRIGGER trigger_audit_hashing
BEFORE INSERT ON audit_events
FOR EACH ROW EXECUTE FUNCTION calculate_audit_hashes();

-- 4. Mutation Prevention Trigger
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Violation: audit_events table is immutable. UPDATE/DELETE is not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_audit_update ON audit_events;
CREATE TRIGGER trigger_block_audit_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

DROP TRIGGER IF EXISTS trigger_block_audit_delete ON audit_events;
CREATE TRIGGER trigger_block_audit_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

DROP TRIGGER IF EXISTS trigger_block_audit_truncate ON audit_events;
CREATE TRIGGER trigger_block_audit_truncate
BEFORE TRUNCATE ON audit_events
EXECUTE FUNCTION prevent_audit_mutation();


-- --- INGESTION SERVICE CONSTRAINTS ---

-- 1. Documents Constraints
DO $$ BEGIN
    ALTER TABLE documents ADD CONSTRAINT documents_source_type_check CHECK (source_type IN ('upload', 'api_rest', 'api_soap', 'confluence', 'servicenow', 'salesforce', 'email', 'other'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE documents ADD CONSTRAINT documents_status_check CHECK (status IN ('ingested', 'processing', 'ready', 'error'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Document Text Constraints
DO $$ BEGIN
    ALTER TABLE document_text ADD CONSTRAINT document_text_extractor_check CHECK (extractor IN ('tika', 'ocr', 'manual', 'api', 'transcription-stub'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
