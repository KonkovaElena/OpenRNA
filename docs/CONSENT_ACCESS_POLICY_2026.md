---
title: "OpenRNA Consent Access Policy 2026"
status: "active"
version: "1.1.0"
last_updated: "2026-04-21"
tags: [consent, authorization, policy, api]
---

# OpenRNA Consent Access Policy 2026

This document defines which API surfaces require active consent (`consent_required`) after RBAC authorization.

Consent gate implementation: [src/middleware/consent-gate.ts](../src/middleware/consent-gate.ts).

## Decision Rule

1. RBAC is evaluated first.
2. For consent-gated routes, active consent is required for the target case.
3. If consent is not active, the API returns `403` with code `consent_required`.

## Route Family Matrix

| Route family | Consent gate |
|---|---|
| `POST /api/cases/:caseId/samples`, `POST /api/cases/:caseId/artifacts` | Required |
| Workflow writes: `POST /api/cases/:caseId/workflows`, `POST /api/cases/:caseId/runs/:runId/*`, `POST /api/cases/:caseId/runs/:runId/qc` | Required |
| Workflow reads: `GET /api/cases/:caseId/runs`, `GET /api/cases/:caseId/runs/:runId`, `GET /api/cases/:caseId/hla-consensus`, `GET /api/cases/:caseId/runs/:runId/qc` | Required |
| Design writes: `POST /api/cases/:caseId/neoantigen-ranking`, `POST /api/cases/:caseId/construct-design` | Required |
| Design reads: `GET /api/cases/:caseId/neoantigen-ranking`, `GET /api/cases/:caseId/construct-design` | Required |
| Review/handoff writes: `POST /api/cases/:caseId/board-packets`, `POST /api/cases/:caseId/review-outcomes`, `POST /api/cases/:caseId/final-releases`, `POST /api/cases/:caseId/handoff-packets` | Required |
| Review/handoff reads: `GET /api/cases/:caseId/board-packets*`, `GET /api/cases/:caseId/review-outcomes*`, `GET /api/cases/:caseId/handoff-packets*` | Required |
| Outcomes writes: `POST /api/cases/:caseId/outcomes/*` | Required |
| Outcomes reads: `GET /api/cases/:caseId/outcomes`, `GET /api/cases/:caseId/traceability` | Required |
| FHIR export reads: `GET /api/cases/:caseId/fhir/*` | Required |
| Consent events: `POST /api/cases/:caseId/consent` | Not required |
| Consent history: `GET /api/cases/:caseId/consent` | Not required |
| Case summary: `GET /api/cases/:caseId`, `GET /api/cases` | Not required |
| Governance summary: `GET /api/operations/summary`, `GET /api/cases/:caseId/allowed-transitions`, `POST /api/cases/:caseId/validate-transition` | Not required |
| Reference bundles, modalities, audit sign/verify, probes | Not required |

## Notes

- `POST /api/cases/:caseId/restart-from-revision` is consent-gated because it mutates lifecycle state and re-opens downstream workflow execution.
- This policy is enforced in route registrars (`src/routes/*`) via injected `consentGateMw` from `src/bootstrap/app-dependencies.ts`.
- Tests covering this policy include [tests/consent-gate.test.ts](../tests/consent-gate.test.ts), [tests/lifecycle-controls.test.ts](../tests/lifecycle-controls.test.ts), and [tests/rbac-coverage.test.ts](../tests/rbac-coverage.test.ts).

## Test/Debug Override

When `createApp({ consentGateEnabled: false })` is used, the consent middleware becomes pass-through for deterministic scenario testing. This switch is intended for tests and local diagnostics, not production deployment.
