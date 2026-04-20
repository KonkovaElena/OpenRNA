# Personalized mRNA Control Plane

Control-plane bootstrap for a human personalized neoantigen and mRNA platform.

## Current Scope

This repository currently implements a Phase 1 + Phase 2 control-plane slice:
- human oncology case registry;
- sample and assay provenance registration;
- source artifact catalog registration;
- workflow request gate;
- idempotent workflow submission via `x-idempotency-key`;
- workflow run lifecycle tracking (`start`, `complete`, `fail`);
- reference bundle registry lookup and run pinning;
- HLA consensus capture with per-tool evidence;
- QC gate evaluation on completed runs;
- expert review / tumor-board packet generation from current case evidence;
- machine-readable audit events on case mutations;
- operations summary and health surfaces.

## Non-Goals In This Slice

- neoantigen prediction;
- rank aggregation;
- payload design;
- manufacturing handoff;
- outcomes registry;
- durable persistence.

## Current Architecture Note

The package currently uses an in-memory bootstrap store by default. That is intentional for local development and control-plane iteration, but it is not the intended durable production path.

The current hardening direction is:
- keep the HTTP and control-plane contracts stable;
- preserve idempotent workflow submission at the API boundary;
- add durable PostgreSQL persistence and transactional outbox behavior behind local abstractions rather than rewriting the package into a different runtime.

## Quickstart

```bash
npm install
npm test
npm run build
```

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
- `GET /api/cases/:caseId/runs`
- `GET /api/cases/:caseId/runs/:runId`
- `POST /api/cases/:caseId/hla-consensus`
- `GET /api/cases/:caseId/hla-consensus`
- `POST /api/cases/:caseId/runs/:runId/qc`
- `GET /api/cases/:caseId/runs/:runId/qc`
- `POST /api/cases/:caseId/board-packets`
- `GET /api/cases/:caseId/board-packets`
- `GET /api/cases/:caseId/board-packets/:packetId`
- `GET /api/reference-bundles`
- `GET /api/reference-bundles/:bundleId`
- `GET /api/operations/summary`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`