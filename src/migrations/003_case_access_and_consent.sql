-- 003_case_access_and_consent.sql
-- Adds durable case access control and consent event history.

BEGIN;

CREATE TABLE IF NOT EXISTS case_access (
  case_id       TEXT        NOT NULL REFERENCES cases (case_id),
  principal_id  TEXT        NOT NULL,
  access_level  TEXT        NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, principal_id, access_level)
);

CREATE INDEX IF NOT EXISTS case_access_principal_idx ON case_access (principal_id, case_id);

CREATE TABLE IF NOT EXISTS consent_events (
  event_id      TEXT        PRIMARY KEY,
  case_id       TEXT        NOT NULL REFERENCES cases (case_id),
  type          TEXT        NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL,
  scope         TEXT        NOT NULL,
  version       TEXT        NOT NULL,
  witness_id    TEXT,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS consent_events_case_ts_idx ON consent_events (case_id, timestamp DESC);

COMMIT;
