-- 001_full_schema.sql
-- Normalized schema for personalized-mrna-control-plane.
-- Replaces the JSONB-blob case_records table with proper relational tables.

BEGIN;

-- ─── Cases ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  case_id        TEXT        PRIMARY KEY,
  status         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL,
  -- CaseProfile stored as JSONB (nested value object, rarely queried by field)
  case_profile   JSONB       NOT NULL,
  neoantigen_ranking JSONB,
  construct_design JSONB
);

CREATE INDEX IF NOT EXISTS cases_created_idx ON cases (created_at, case_id);
CREATE INDEX IF NOT EXISTS cases_status_idx  ON cases (status);

-- ─── Samples ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS samples (
  sample_id      TEXT        PRIMARY KEY,
  case_id        TEXT        NOT NULL REFERENCES cases (case_id),
  sample_type    TEXT        NOT NULL,
  assay_type     TEXT        NOT NULL,
  accession_id   TEXT        NOT NULL,
  source_site    TEXT        NOT NULL,
  registered_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS samples_case_idx ON samples (case_id);

-- ─── Artifacts (source artifacts attached to a sample) ──────────────
CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id    TEXT        PRIMARY KEY,
  case_id        TEXT        NOT NULL REFERENCES cases (case_id),
  artifact_class TEXT        NOT NULL,
  sample_id      TEXT        NOT NULL,
  semantic_type  TEXT        NOT NULL,
  schema_version INTEGER     NOT NULL,
  artifact_hash  TEXT        NOT NULL,
  storage_uri    TEXT,
  media_type     TEXT,
  registered_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS artifacts_case_idx ON artifacts (case_id);

-- ─── Workflow Requests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_requests (
  request_id         TEXT        PRIMARY KEY,
  case_id            TEXT        NOT NULL REFERENCES cases (case_id),
  workflow_name      TEXT        NOT NULL,
  reference_bundle_id TEXT       NOT NULL,
  execution_profile  TEXT        NOT NULL,
  requested_by       TEXT,
  requested_at       TIMESTAMPTZ NOT NULL,
  idempotency_key    TEXT,
  correlation_id     TEXT
);

CREATE INDEX IF NOT EXISTS workflow_requests_case_idx ON workflow_requests (case_id);

-- ─── Workflow Runs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_runs (
  run_id                   TEXT        PRIMARY KEY,
  case_id                  TEXT        NOT NULL REFERENCES cases (case_id),
  request_id               TEXT        NOT NULL,
  status                   TEXT        NOT NULL,
  workflow_name            TEXT        NOT NULL,
  reference_bundle_id      TEXT        NOT NULL,
  pinned_reference_bundle  JSONB,
  execution_profile        TEXT        NOT NULL,
  accepted_at              TIMESTAMPTZ,
  started_at               TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  failure_reason           TEXT,
  failure_category         TEXT,
  terminal_metadata        JSONB,
  manifest                 JSONB
);

CREATE INDEX IF NOT EXISTS workflow_runs_case_idx   ON workflow_runs (case_id);
CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs (status);

-- ─── Run Artifacts (derived artifacts produced by a workflow run) ────
CREATE TABLE IF NOT EXISTS run_artifacts (
  artifact_id    TEXT        PRIMARY KEY,
  run_id         TEXT        NOT NULL REFERENCES workflow_runs (run_id),
  case_id        TEXT        NOT NULL REFERENCES cases (case_id),
  artifact_class TEXT        NOT NULL DEFAULT 'DERIVED',
  semantic_type  TEXT        NOT NULL,
  artifact_hash  TEXT        NOT NULL,
  producing_step TEXT        NOT NULL,
  registered_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS run_artifacts_run_idx  ON run_artifacts (run_id);
CREATE INDEX IF NOT EXISTS run_artifacts_case_idx ON run_artifacts (case_id);

-- ─── Audit Events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  event_id       TEXT        PRIMARY KEY,
  case_id        TEXT        NOT NULL REFERENCES cases (case_id),
  event_type     TEXT        NOT NULL,
  detail         TEXT        NOT NULL,
  correlation_id TEXT        NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_case_idx ON audit_events (case_id, occurred_at);

-- ─── Timeline Events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_events (
  id             SERIAL      PRIMARY KEY,
  case_id        TEXT        NOT NULL REFERENCES cases (case_id),
  at             TIMESTAMPTZ NOT NULL,
  event_type     TEXT        NOT NULL,
  detail         TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS timeline_events_case_idx ON timeline_events (case_id, at);

-- ─── Outcome Timeline ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outcome_timeline (
  entry_id           TEXT        PRIMARY KEY,
  case_id            TEXT        NOT NULL REFERENCES cases (case_id),
  construct_id       TEXT        NOT NULL,
  construct_version  INTEGER     NOT NULL,
  entry_type         TEXT        NOT NULL,
  occurred_at        TIMESTAMPTZ NOT NULL,
  payload            JSONB       NOT NULL
);

CREATE INDEX IF NOT EXISTS outcome_timeline_case_idx ON outcome_timeline (case_id, occurred_at, entry_id);

-- ─── HLA Consensus (one per case) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS hla_consensus (
  case_id            TEXT    PRIMARY KEY REFERENCES cases (case_id),
  alleles            JSONB   NOT NULL,
  per_tool_evidence  JSONB   NOT NULL,
  confidence_score   REAL    NOT NULL,
  tie_break_notes    TEXT,
  reference_version  TEXT    NOT NULL,
  produced_at        TIMESTAMPTZ NOT NULL,
  disagreements      JSONB,
  confidence_decomposition JSONB
);

-- ─── QC Gates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qc_gates (
  case_id        TEXT        NOT NULL REFERENCES cases (case_id),
  run_id         TEXT        NOT NULL REFERENCES workflow_runs (run_id),
  outcome        TEXT        NOT NULL,
  results        JSONB       NOT NULL,
  evaluated_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (case_id, run_id)
);

-- ─── Board Packets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_packets (
  packet_id      TEXT        PRIMARY KEY,
  case_id        TEXT        NOT NULL REFERENCES cases (case_id),
  artifact_class TEXT        NOT NULL DEFAULT 'BOARD_PACKET',
  board_route    TEXT        NOT NULL,
  version        INTEGER     NOT NULL,
  schema_version INTEGER     NOT NULL,
  packet_hash    TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  snapshot       JSONB       NOT NULL
);

CREATE INDEX IF NOT EXISTS board_packets_case_idx ON board_packets (case_id);

-- ─── Review Outcomes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_outcomes (
  review_id           TEXT        PRIMARY KEY,
  case_id             TEXT        NOT NULL REFERENCES cases (case_id),
  packet_id           TEXT        NOT NULL REFERENCES board_packets (packet_id),
  reviewer_id         TEXT        NOT NULL,
  reviewer_role       TEXT,
  review_disposition  TEXT        NOT NULL,
  rationale           TEXT        NOT NULL,
  comments            TEXT,
  reviewed_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS review_outcomes_case_idx ON review_outcomes (case_id, reviewed_at);

-- ─── Handoff Packets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handoff_packets (
  handoff_id          TEXT        PRIMARY KEY,
  case_id             TEXT        NOT NULL REFERENCES cases (case_id),
  review_id           TEXT        NOT NULL REFERENCES review_outcomes (review_id),
  packet_id           TEXT        NOT NULL REFERENCES board_packets (packet_id),
  artifact_class      TEXT        NOT NULL DEFAULT 'HANDOFF_PACKET',
  construct_id        TEXT        NOT NULL,
  construct_version   INTEGER     NOT NULL,
  handoff_target      TEXT        NOT NULL,
  schema_version      INTEGER     NOT NULL,
  packet_hash         TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL,
  snapshot            JSONB       NOT NULL
);

CREATE INDEX IF NOT EXISTS handoff_packets_case_idx ON handoff_packets (case_id, created_at);

COMMIT;
