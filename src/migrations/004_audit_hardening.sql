-- 004_audit_hardening.sql
-- Regulatory hardening: audit event hash-chain and consent-withdrawal support.
--
-- ALCOA+ requirement (FDA Data Integrity Guidance 2018): audit records must be
-- attributable, legible, contemporaneous, original, and accurate. This migration
-- adds a deterministic prev_hash / record_hash pair to audit_events, enabling
-- mathematical detection of insertion, deletion, or tampering of individual rows.
--
-- Design:
--   record_hash = SHA-256(event_id || '|' || case_id || '|' || event_type
--                         || '|' || occurred_at || '|' || actor_id
--                         || '|' || correlation_id)
--   prev_hash   = record_hash of the immediately preceding event on the same
--                 case_id (ordered by occurred_at, event_id); NULL for first.
--
-- The hash values are computed and written by the application layer on each
-- audit event insertion (InMemoryAuditSignatureProvider / PostgresCaseStore).
-- This migration only adds the columns; back-filling existing rows is the
-- responsibility of a one-time data migration task documented in the operator
-- runbook.
--
-- 21 CFR Part 11 §11.10(e): "Use of computer-generated, time-stamped audit trails
-- to independently record the date and time of operator entries and actions that
-- create, modify, or delete electronic records."

BEGIN;

-- ─── Audit hash-chain columns ────────────────────────────────────────────────
-- record_hash: integrity fingerprint of this event record.
-- prev_hash:   hash of the predecessor event; NULL iff this is the first event.
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS record_hash TEXT,
  ADD COLUMN IF NOT EXISTS prev_hash   TEXT;

-- Index for efficient chain-walk queries (e.g. gap detection).
CREATE INDEX IF NOT EXISTS audit_events_chain_idx
  ON audit_events (case_id, occurred_at, event_id);

-- ─── CONSENT_WITHDRAWN as a valid case status ────────────────────────────────
-- The cases.status column is a plain TEXT column without a CHECK constraint.
-- No DDL change is required; this comment documents the migration boundary for
-- operators performing database-level audits: from this migration onwards,
-- status = 'CONSENT_WITHDRAWN' is a valid, absorbing terminal value meaning
-- that the patient's informed consent has been formally withdrawn and the case
-- is locked for further data mutations per ICH E6(R2) §4.8.2.
--
-- Existing rows with status IN ('REVIEW_REJECTED', 'HANDOFF_PENDING') were
-- already terminal; CONSENT_WITHDRAWN extends the terminal set.

-- ─── Principle of Least Privilege (21 CFR Part 11 §11.10(d)) ─────────────────
-- The following GRANT statements restrict the application role to append-only
-- access on audit_events. Adjust the role name to match your deployment.
-- Example (uncomment and adapt):
--   REVOKE UPDATE, DELETE ON audit_events FROM openrna_app;
--   GRANT  SELECT, INSERT  ON audit_events TO   openrna_app;

COMMIT;
