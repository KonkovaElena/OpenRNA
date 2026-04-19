---
title: "OpenRNA API Reference"
status: "active"
version: "1.1.0"
last_updated: "2026-04-19"
tags: [api, reference, http, public-export]
---

# OpenRNA API Reference

This page is the public HTTP route reference for the standalone OpenRNA control-plane slice.

Route registration lives in [src/app.ts](../src/app.ts). The canonical route inventory is also exposed by `GET /` from [src/routes/system.ts](../src/routes/system.ts).

## Request Conventions

### Authentication

- Auth-exempt paths: `GET /`, `GET /healthz`, `GET /readyz`, `GET /metrics`.
- Protected requests use `x-api-key` or `Authorization: Bearer <token>` when authentication is configured.
- If no authentication settings are configured, the app resolves an unsigned or anonymous principal path instead of hard-failing every request.
- RBAC enforcement is route-scoped. When no RBAC provider is supplied, requests pass through for backward compatibility.
- Case-scoped write routes and regulated lifecycle/disclosure reads pass through the consent gate and can fail with `consent_required` when no active consent exists.
- Route-level matrix: [CONSENT_ACCESS_POLICY_2026.md](CONSENT_ACCESS_POLICY_2026.md).

### Headers

| Header | Purpose |
|--------|---------|
| `x-correlation-id` | Optional caller-supplied correlation ID. If absent, the app generates one and echoes it back. |
| `x-api-key` | API-key authentication path for protected routes. |
| `Authorization` | Bearer-token authentication path when JWT auth is configured. |
| `x-idempotency-key` | Replay-safe submission key for `POST /api/cases/:caseId/workflows`. |

### Body And Envelope Rules

- JSON request bodies are limited to 1 MB.
- Most successful application routes return object envelopes such as `{ case }`, `{ run }`, `{ runs, meta }`, `{ consensus }`, or `{ gate }`.
- Most application errors use the `ApiError` envelope: `{ code, message, nextStep, correlationId }`.
- Authentication middleware currently returns a smaller envelope: `{ error, code }`.
- RBAC denials currently return `{ error, detail }`.

## Route Groups

## Bootstrap And Probes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Returns the service banner and the route inventory exposed by the runtime |
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe |
| `GET` | `/metrics` | Prometheus-style runtime metrics |

## Cases And Provenance

| Method | Path |
|--------|------|
| `POST` | `/api/cases` |
| `GET` | `/api/cases` |
| `GET` | `/api/cases/:caseId` |
| `POST` | `/api/cases/:caseId/samples` |
| `POST` | `/api/cases/:caseId/artifacts` |
| `GET` | `/api/cases/:caseId/traceability` |

## Workflow Execution

| Method | Path |
|--------|------|
| `POST` | `/api/cases/:caseId/workflows` |
| `POST` | `/api/cases/:caseId/runs/:runId/start` |
| `POST` | `/api/cases/:caseId/runs/:runId/complete` |
| `POST` | `/api/cases/:caseId/runs/:runId/fail` |
| `POST` | `/api/cases/:caseId/runs/:runId/cancel` |
| `GET` | `/api/cases/:caseId/runs` |
| `GET` | `/api/cases/:caseId/runs/:runId` |

Notes:

- Workflow requests require `referenceBundleId`.
- `POST /api/cases/:caseId/workflows` supports `x-idempotency-key` replay protection.
- Start, complete, fail, and cancel operations are transition-aware and can return `invalid_transition` when the persisted run state does not permit the operation.

## HLA, QC, Ranking, And Design

| Method | Path |
|--------|------|
| `POST` | `/api/cases/:caseId/hla-consensus` |
| `GET` | `/api/cases/:caseId/hla-consensus` |
| `POST` | `/api/cases/:caseId/runs/:runId/qc` |
| `GET` | `/api/cases/:caseId/runs/:runId/qc` |
| `POST` | `/api/cases/:caseId/neoantigen-ranking` |
| `GET` | `/api/cases/:caseId/neoantigen-ranking` |
| `POST` | `/api/cases/:caseId/construct-design` |
| `GET` | `/api/cases/:caseId/construct-design` |

## Review, QA Release, Handoff, And Outcomes

| Method | Path |
|--------|------|
| `POST` | `/api/cases/:caseId/board-packets` |
| `GET` | `/api/cases/:caseId/board-packets` |
| `GET` | `/api/cases/:caseId/board-packets/:packetId` |
| `POST` | `/api/cases/:caseId/review-outcomes` |
| `GET` | `/api/cases/:caseId/review-outcomes` |
| `GET` | `/api/cases/:caseId/review-outcomes/:reviewId` |
| `POST` | `/api/cases/:caseId/qa-releases` |
| `GET` | `/api/cases/:caseId/qa-releases` |
| `GET` | `/api/cases/:caseId/qa-releases/:qaReleaseId` |
| `POST` | `/api/cases/:caseId/handoff-packets` |
| `GET` | `/api/cases/:caseId/handoff-packets` |
| `GET` | `/api/cases/:caseId/handoff-packets/:handoffId` |
| `POST` | `/api/cases/:caseId/outcomes/administration` |
| `POST` | `/api/cases/:caseId/outcomes/immune-monitoring` |
| `POST` | `/api/cases/:caseId/outcomes/clinical-follow-up` |
| `GET` | `/api/cases/:caseId/outcomes` |

Notes:

- `POST /api/cases/:caseId/review-outcomes` with `reviewDisposition=approved` requires electronic signature evidence.
- `POST /api/cases/:caseId/qa-releases` requires independent QA reviewer identity and signature evidence.
- `POST /api/cases/:caseId/handoff-packets` requires matching `reviewId` and `qaReleaseId` for final release handoff.

## Governance, Consent, FHIR, And Audit

| Method | Path |
|--------|------|
| `GET` | `/api/reference-bundles` |
| `GET` | `/api/reference-bundles/:bundleId` |
| `POST` | `/api/reference-bundles` |
| `GET` | `/api/cases/:caseId/allowed-transitions` |
| `POST` | `/api/cases/:caseId/validate-transition` |
| `POST` | `/api/cases/:caseId/consent` |
| `GET` | `/api/cases/:caseId/consent` |
| `POST` | `/api/cases/:caseId/restart-from-revision` |
| `GET` | `/api/cases/:caseId/fhir/bundle` |
| `GET` | `/api/cases/:caseId/fhir/hla-consensus` |
| `POST` | `/api/audit/sign` |
| `POST` | `/api/audit/verify` |

FHIR conformance baseline artifacts:
- `docs/fhir/FHIR_CONFORMANCE_BASELINE_2026.md`
- `docs/fhir/CAPABILITY_STATEMENT_R4_2026-04.json`

## Modalities And Operations Summary

| Method | Path |
|--------|------|
| `GET` | `/api/modalities` |
| `GET` | `/api/modalities/:modality` |
| `POST` | `/api/modalities/:modality/activate` |
| `GET` | `/api/operations/summary` |

## Frequent Error Codes

These codes appear repeatedly across route handlers, stores, and adapters.

| Code | Typical meaning |
|------|------------------|
| `invalid_input` | Request body, URL param, or required field is malformed or absent |
| `missing_field` | A required field is absent from the request body |
| `missing_credentials` | No usable API key or bearer token was supplied |
| `invalid_api_key` | API key failed constant-time comparison |
| `invalid_token` | JWT could not be parsed, verified, or validated |
| `consent_required` | Case-scoped write operation or consent-gated lifecycle/disclosure read attempted without active consent |
| `not_found` | Resource type exists conceptually, but no record exists for this case or run |
| `case_not_found` | `caseId` does not resolve to a stored case |
| `run_not_found` | `runId` does not resolve to a stored workflow run |
| `reference_bundle_not_found` | Workflow request or start path referenced an unknown bundle |
| `invalid_transition` | Current case or run state does not allow the requested action |
| `duplicate_sample_type` | Same sample type submitted more than once in the current slice |
| `duplicate_artifact` | Source artifact already registered for the given sample and semantic type |
| `missing_sample_provenance` | Artifact references a sample that is not registered on the case |

## Source Of Truth Notes

- Route registration: [src/app.ts](../src/app.ts)
- Public route inventory returned at runtime: [src/routes/system.ts](../src/routes/system.ts)
- Auth resolution and bearer support: [src/auth.ts](../src/auth.ts)
- Authentication context middleware: [src/middleware/auth-context.ts](../src/middleware/auth-context.ts)
- Consent gate: [src/middleware/consent-gate.ts](../src/middleware/consent-gate.ts)
- Error envelope contract: [src/errors.ts](../src/errors.ts)