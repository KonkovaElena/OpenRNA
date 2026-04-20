# Personalized mRNA Control Plane

Control-plane bootstrap for a human personalized neoantigen and mRNA platform.

## Current Scope

This repository currently implements a Phase 1 + Phase 2 control-plane slice with downstream review, handoff, and learning-loop extensions:
- human oncology case registry;
- sample and assay provenance registration;
- source artifact catalog registration;
- workflow request gate;
- idempotent workflow submission via `x-idempotency-key`;
- workflow run lifecycle tracking (`start`, `complete`, `fail`, `cancel`);
- reference bundle registry lookup and run pinning;
- HLA consensus capture with per-tool evidence;
- QC gate evaluation on completed runs;
- neoantigen ranking persistence;
- construct design generation and modality governance;
- expert review / tumor-board packet generation from current case evidence;
- explicit review outcome capture tied to board packets;
- bounded manufacturing handoff packet generation from approved reviews;
- outcome timeline capture and full construct traceability;
- machine-readable audit events on case mutations;
- operations summary and health surfaces.

## Non-Goals In This Slice

- neoantigen prediction;
- rank aggregation;
- cross-resource transactional outbox coordination across all persistence seams.

## Current Architecture Note

The package currently uses an in-memory bootstrap store by default. That is intentional for local development and control-plane iteration, but it is not the only storage path anymore.

The current hardening direction is:
- keep the HTTP and control-plane contracts stable;
- validate request payloads with runtime schemas instead of ad hoc field checks;
- load runtime configuration through a typed fail-fast config module;
- preserve idempotent workflow submission at the API boundary;
- add durable PostgreSQL persistence behind local abstractions rather than rewriting the package into a different runtime.

Today that means:
- the default local path remains fully in-memory;
- `CASE_STORE_DATABASE_URL` enables PostgreSQL-backed durable case persistence;
- `WORKFLOW_DISPATCH_DATABASE_URL` enables PostgreSQL-backed workflow dispatch recording.

## Environment

Use `.env.example` as the baseline environment contract.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4010` | HTTP listener port for the control-plane API. |
| `CASE_STORE_DATABASE_URL` | unset | Optional PostgreSQL connection string for durable case persistence. If omitted, the API keeps the in-memory case store. |
| `CASE_STORE_TABLE_NAME` | `case_records` | PostgreSQL table name for durable case snapshots. |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | Optional PostgreSQL connection string for durable workflow dispatch recording. If omitted, the API uses the in-memory dispatch sink. |
| `WORKFLOW_DISPATCH_TABLE_NAME` | `workflow_dispatches` | PostgreSQL table name for workflow dispatch persistence. |

## Quickstart

Copy `.env.example` to `.env` if you want to customize the runtime configuration.

```bash
npm install
npm test
npm run build
npm run dev
```

If you do not need PostgreSQL-backed persistence locally, leave the database URLs blank and the app will stay on the in-memory path.

## Evidence

For the current standalone certification verdict and linked-worktree delta classification, see [ISOLATION_CERTIFICATION_2026-03-30.md](ISOLATION_CERTIFICATION_2026-03-30.md).

## API Surface

- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/:caseId`
- `POST /api/cases/:caseId/samples`
- `POST /api/cases/:caseId/artifacts`
- `POST /api/cases/:caseId/workflows`
- `POST /api/cases/:caseId/runs/:runId/start`
- `POST /api/cases/:caseId/runs/:runId/complete`
- `POST /api/cases/:caseId/runs/:runId/fail`
- `POST /api/cases/:caseId/runs/:runId/cancel`
- `GET /api/cases/:caseId/runs`
- `GET /api/cases/:caseId/runs/:runId`
- `POST /api/cases/:caseId/hla-consensus`
- `GET /api/cases/:caseId/hla-consensus`
- `POST /api/cases/:caseId/runs/:runId/qc`
- `GET /api/cases/:caseId/runs/:runId/qc`
- `POST /api/cases/:caseId/construct-design`
- `GET /api/cases/:caseId/construct-design`
- `GET /api/modalities`
- `GET /api/modalities/:modality`
- `POST /api/modalities/:modality/activate`
- `POST /api/cases/:caseId/outcomes/administration`
- `POST /api/cases/:caseId/outcomes/immune-monitoring`
- `POST /api/cases/:caseId/outcomes/clinical-follow-up`
- `GET /api/cases/:caseId/outcomes`
- `GET /api/cases/:caseId/traceability`
- `POST /api/cases/:caseId/board-packets`
- `GET /api/cases/:caseId/board-packets`
- `GET /api/cases/:caseId/board-packets/:packetId`
- `POST /api/cases/:caseId/review-outcomes`
- `GET /api/cases/:caseId/review-outcomes`
- `GET /api/cases/:caseId/review-outcomes/:reviewId`
- `POST /api/cases/:caseId/handoff-packets`
- `GET /api/cases/:caseId/handoff-packets`
- `GET /api/cases/:caseId/handoff-packets/:handoffId`
- `GET /api/reference-bundles`
- `GET /api/reference-bundles/:bundleId`
- `POST /api/reference-bundles`
- `GET /api/operations/summary`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`