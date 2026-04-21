---
title: "OpenRNA Breaking Changes 2026-04-21"
status: active-evidence
version: "1.0.0"
last_updated: "2026-04-21"
tags: [openrna, migration, compatibility, api, release]
mode: how-to
evidence_cutoff: "2026-04-21"
---

# OpenRNA Breaking Changes 2026-04-21

## Purpose

This note records the consumer-visible API and process changes introduced on April 21, 2026.

It is intended for operators, SDK maintainers, and anyone automating the review-to-handoff workflow.

## What Changed

### 1. Approved review no longer means handoff-ready

An approved review outcome now moves a case to `AWAITING_FINAL_RELEASE`.

Handoff readiness now requires a separate final-release step.

### 2. New endpoint: final release authorization

OpenRNA now exposes:

- `POST /api/cases/:caseId/final-releases`

This endpoint records the independent final releaser and is guarded by `RELEASE_CASE` RBAC.

### 3. Dual authorization is enforced in the application layer

The final releaser must differ from the reviewer.

If the same identity attempts both actions, the API returns `403 dual_authorization_required`.

### 4. Handoff is bound to the final releaser

`POST /api/cases/:caseId/handoff-packets` now requires all of the following:

- approved review outcome;
- stored construct design;
- recorded final release;
- `requestedBy` equal to `finalRelease.releaserId`.

### 5. Auth and RBAC failures now use the shared ApiError envelope

Legacy authz payloads such as:

```json
{ "error": "Forbidden", "detail": "..." }
```

have been replaced with the normalized response shape:

```json
{
  "code": "forbidden",
  "message": "Forbidden.",
  "nextStep": "Use a principal with 'RELEASE_CASE' permission for this route.",
  "correlationId": "corr_..."
}
```

The same envelope now applies to missing credentials, invalid API keys, invalid bearer tokens, RBAC denies, and case-access denies.

## Who Is Affected

- API clients that called handoff immediately after approved review.
- UIs or SDKs that parsed legacy auth/RBAC error envelopes.
- Operators who treated review approval as the last manual gate before manufacturing handoff.

## Migration Checklist

1. Insert `POST /api/cases/:caseId/final-releases` after approved review and before handoff.
2. Ensure the final releaser is a different principal from the reviewer.
3. Pass `requestedBy` equal to the final releaser on handoff requests.
4. Update API clients to parse `{ code, message, nextStep, correlationId }` for auth and authorization failures.
5. Re-run any handoff workflow smoke tests that assumed review approval implied `APPROVED_FOR_HANDOFF`.

## Verification Snapshot

This migration note is grounded in the April 21, 2026 local verification lane:

- `npm run ci`
- `npm run test:coverage`
- `npm run sbom:cyclonedx:file`

Current verification baseline:

- `504` tests across `22` suites
- line coverage `94.49%`
- branch coverage `82.88%`
- function coverage `94.11%`
- runtime audit clean

## Source Surfaces

- [docs/API_REFERENCE.md](../../API_REFERENCE.md)
- [src/routes/review.ts](../../../src/routes/review.ts)
- [src/store-review.ts](../../../src/store-review.ts)
- [src/middleware/auth-context.ts](../../../src/middleware/auth-context.ts)
- [src/middleware/rbac-auth.ts](../../../src/middleware/rbac-auth.ts)