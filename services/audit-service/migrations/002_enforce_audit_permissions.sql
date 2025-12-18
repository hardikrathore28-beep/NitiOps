-- Migration: Enforce strict permissions and mutation blocking triggers
-- Date: 2025-12-17
-- Description: Hardens the audit_events table by managing roles, revoking privileges, and adding exception-raising triggers.

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

-- 2. Revoke all default privileges on the table
REVOKE ALL ON audit_events FROM PUBLIC;

-- 3. Grant strictly scoped permissions
-- Application Role: can only INSERT. Cannot UPDATE, DELETE, or TRUNCATE.
GRANT INSERT ON audit_events TO nitiops_app_role;
GRANT SELECT ON audit_events TO nitiops_app_role; -- Often needed for returning ID or validating

-- Auditor Role: can only SELECT.
GRANT SELECT ON audit_events TO nitiops_auditor_role;


-- 4. Defense in Depth: Exception-Raising Triggers
-- Even if someone (like a superuser) bypasses permission checks, this trigger prevents logical mutation.
-- We replace the previous RULEs (silent ignore) with TRIGGERS (loud error).

DROP RULE IF EXISTS audit_events_no_update ON audit_events;
DROP RULE IF EXISTS audit_events_no_delete ON audit_events;

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Violation: audit_events table is immutable. UPDATE/DELETE is not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_block_audit_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER trigger_block_audit_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER trigger_block_audit_truncate
BEFORE TRUNCATE ON audit_events
EXECUTE FUNCTION prevent_audit_mutation();
