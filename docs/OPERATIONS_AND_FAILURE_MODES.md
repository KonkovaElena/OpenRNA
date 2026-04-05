---
title: "OpenRNA Operations And Failure Modes"
status: "active"
version: "1.0.0"
last_updated: "2026-04-05"
tags: [operations, runtime, health, troubleshooting]
---

# OpenRNA Operations And Failure Modes

This guide explains how the standalone OpenRNA repository behaves at runtime, how to validate the basic operating path, and what the main failure classes look like in practice.

## Runtime Modes

OpenRNA has two main persistence modes.

| Mode | Trigger | What it affects |
|------|---------|-----------------|
| In-memory default | Leave database URLs unset | Case persistence and workflow dispatch state stay local to process memory |
| PostgreSQL-backed | Set `CASE_STORE_DATABASE_URL` and or `WORKFLOW_DISPATCH_DATABASE_URL` | Durable case records and workflow dispatch recording |

Key environment variables are validated by [src/config.ts](../src/config.ts).

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `4010` | Must be an integer between 1 and 65535 |
| `CASE_STORE_DATABASE_URL` | unset | Enables PostgreSQL-backed case persistence |
| `CASE_STORE_TABLE_NAME` | `case_records` | Must be a valid PostgreSQL identifier |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | Enables PostgreSQL-backed workflow dispatch recording |
| `WORKFLOW_DISPATCH_TABLE_NAME` | `workflow_dispatches` | Must be a valid PostgreSQL identifier |
| `API_KEY` | unset | Enables API-key authentication for protected routes |
| `API_KEY_PRINCIPAL_ID` | unset | Optional principal identifier paired with API-key auth |
| `RBAC_ALLOW_ALL` | `false` | Boolean compatibility switch for permissive RBAC behavior |
| `JWT_SHARED_SECRET` | unset | Must be at least 32 bytes when supplied |
| `JWT_PUBLIC_KEY_PEM` | unset | Enables RSA bearer-token verification |
| `JWT_EXPECTED_ISSUER` | unset | Optional bearer-token claim validation |
| `JWT_EXPECTED_AUDIENCE` | unset | Optional bearer-token claim validation |

## Basic Verification Path

```bash
npm ci
npm run build
npm test
npm run dev
```

In a separate shell:

```bash
curl http://127.0.0.1:4010/healthz
curl http://127.0.0.1:4010/readyz
curl http://127.0.0.1:4010/metrics
```

Expected success signals:

- `/healthz` returns `200 {"status":"ok"}`
- `/readyz` returns `200 {"status":"ready"}`
- `/metrics` returns Prometheus-style gauges

## Probe And Envelope Behavior

### Public bootstrap and probes

- `GET /` returns a runtime banner and the route inventory.
- `GET /healthz`, `GET /readyz`, and `GET /metrics` are auth-exempt.

### Correlation IDs

- `x-correlation-id` is echoed back if supplied.
- If absent, the app generates one and returns it in the response header.
- Application-level `ApiError` responses also include `correlationId` in the JSON envelope.

### Metrics

`GET /metrics` currently emits:

- `openrna_cases_total`
- `openrna_cases_by_status{status="..."}`

Those values are built from `store.getOperationsSummary()` in [src/routes/system.ts](../src/routes/system.ts).

## Auth, RBAC, And Consent Behavior

| Layer | Current behavior |
|-------|------------------|
| Authentication | `x-api-key` or bearer token when configured; anonymous or unsigned principal path otherwise |
| RBAC | Route-scoped checks when an RBAC provider is present; pass-through compatibility when absent |
| Consent | Case-scoped write routes can be blocked by `consent_required` |

Important limitation: these controls improve operator discipline, but they do not make the repository a Part 11-grade identity or electronic-signature system.

## Common Failure Modes

| Symptom | Likely cause | Typical response shape | Next move |
|---------|--------------|------------------------|-----------|
| Server fails on startup with `Invalid environment configuration` | Invalid `PORT`, invalid table name, or too-short `JWT_SHARED_SECRET` | process exits with startup error | Fix the environment values named by [src/config.ts](../src/config.ts) |
| `401` with `missing_credentials` | Protected route called without `x-api-key` or bearer token | `{ error, code }` | Supply credentials or disable auth for local bootstrap work |
| `403` with `invalid_api_key` | API key does not match | `{ error, code }` | Re-check the configured key and caller header |
| `403` with `invalid_token` | Bearer token parsing, signature, audience, issuer, or time claims failed | `{ error, code }` | Re-issue token or correct JWT settings |
| `403 Forbidden` with `detail` | RBAC provider rejected the action | `{ error, detail }` | Use a principal with the required action grant |
| `403` with `consent_required` | Case-scoped write attempted without active consent | `ApiError` envelope | Record or renew consent before retrying |
| `404` with `case_not_found`, `run_not_found`, or `reference_bundle_not_found` | Caller referenced an unknown resource | `ApiError` envelope | Retrieve a valid identifier from the corresponding list endpoint |
| `409` with `invalid_transition` | Case or workflow run is in the wrong lifecycle state | `ApiError` envelope | Read current status, then retry the allowed transition |
| `409` with `duplicate_sample_type` or `duplicate_artifact` | Provenance was submitted twice | `ApiError` envelope | Treat the request as duplicate input instead of retrying blindly |
| `409` with `missing_sample_provenance` | Artifact references an unregistered sample | `ApiError` envelope | Register sample provenance first |
| `500` with `internal_error` | Unhandled runtime failure | `{ code, message, nextStep, correlationId }` | Retry if transient, then inspect logs using the correlation ID |

## Operational Notes

- Request bodies are limited to 1 MB.
- Security headers are enabled by default.
- Rate limiting exists as an optional app-level dependency toggle, not as a fixed external contract.
- `/metrics` depends on store access. If the active persistence path is unavailable, this endpoint can fail even when the process is still alive.

## Source Surfaces

- Runtime config validation: [src/config.ts](../src/config.ts)
- App middleware chain and error handler: [src/app.ts](../src/app.ts)
- Probe and metrics routes: [src/routes/system.ts](../src/routes/system.ts)
- Auth resolution: [src/auth.ts](../src/auth.ts)
- Authentication context middleware: [src/middleware/auth-context.ts](../src/middleware/auth-context.ts)
- Consent gate middleware: [src/middleware/consent-gate.ts](../src/middleware/consent-gate.ts)