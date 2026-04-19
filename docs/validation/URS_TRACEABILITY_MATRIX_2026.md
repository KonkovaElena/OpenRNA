---
title: "OpenRNA URS Traceability Matrix"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [validation, urs, traceability, oq, pq]
---

# OpenRNA URS Traceability Matrix

## Purpose

Map user requirements for the intended GxP boundary to concrete implementation surfaces and verification evidence.

This matrix is a software validation planning artifact. It does not claim completed IQ/OQ/PQ qualification by itself.

## Scope

Applies to the durable deployment path used for regulated operations:
- PostgreSQL-backed case store
- Authenticated and authorized API access
- Signed review and QA release critical actions
- Traceability and audit-event persistence

## Matrix

| URS ID | Requirement | Implementation Surface | Verification Evidence | Qualification Phase | Status |
|--------|-------------|------------------------|-----------------------|---------------------|--------|
| URS-001 | The system shall enforce role-based access controls on case and governance endpoints. | `src/middleware/rbac-auth.ts`, route guards in `src/app.ts` and route registrars | `tests/rbac-coverage.test.ts` | OQ | Implemented, automated evidence available |
| URS-002 | The system shall expose review, QA release, and handoff routes as first-class API surface. | `src/routes/review.ts`, `src/routes/system.ts`, route wiring in `src/app.ts` | `tests/route-registrars.test.ts`, `tests/outcomes.test.ts` | OQ | Implemented, automated evidence available |
| URS-003 | Approved review outcomes shall require electronic signature evidence and step-up authentication assertion input. | `src/routes/review.ts` (`signCriticalAction`), `src/store.ts` validation parsing | Route-level behavior covered by `tests/outcomes.test.ts`; negative signature-path tests pending targeted qualification scripts | OQ | Implemented, additional negative OQ cases pending |
| URS-004 | QA release shall enforce maker-checker separation from board reviewer identity. | `src/store-review.ts` (`recordQaReleaseForCase`) | `tests/outcomes.test.ts` (maker-checker violation case) | OQ | Implemented, automated evidence available |
| URS-005 | Manufacturing handoff shall require approved review and matching QA release context. | `src/store-review.ts` (`generateHandoffPacketForCase`) | `tests/outcomes.test.ts` (positive handoff and non-approved rejection cases) | OQ | Implemented, automated evidence available |
| URS-006 | The system shall persist and replay review, QA release, and handoff events with deterministic ordering. | `src/store-review.ts`, event journal replay in `src/event-journal.ts` | `tests/event-journal-foundation.test.ts` | OQ/PQ | Implemented, automated evidence available |
| URS-007 | The system shall expose full traceability including review outcomes, QA releases, and handoff packets. | `src/traceability.ts`, `src/routes/review.ts`, `src/routes/outcomes.ts` | `tests/outcomes.test.ts` (`GET /api/cases/:caseId/traceability`) | OQ | Implemented, automated evidence available |
| URS-008 | The durable store shall preserve review, QA release, and handoff records across process restart. | `src/adapters/PostgresCaseStore.ts`, `src/migrations/001_full_schema.sql` | `tests/outcomes.test.ts` (Postgres persistence and reload case) | PQ | Implemented, automated evidence available |
| URS-009 | API reference shall reflect live route inventory for regulated-critical endpoints. | `docs/API_REFERENCE.md`, `src/routes/system.ts` | Documentation review against runtime route inventory | IQ/OQ | Implemented, manual docs check required during closure |
| URS-010 | Validation package shall include intended use, regulatory context, IQ/OQ/PQ plan, and URS matrix. | `docs/INTENDED_USE_STATEMENT_2026.md`, `docs/REGULATORY_CONTEXT.md`, `docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md`, this file | Documentation closure rail outputs (`sync:metrics`, `sync:metrics:check`, `agent:preflight`) | IQ/OQ/PQ | Implemented, closure evidence required per release |

## Open Qualification Items

- Add explicit negative OQ tests for malformed signature evidence on approved review and QA release endpoints.
- Attach IQ environment checklist and approved baseline snapshot to the release evidence bundle.
- Record PQ throughput and restart/recovery drill evidence for the target deployment profile.

## Linked Artifacts

- `docs/INTENDED_USE_STATEMENT_2026.md`
- `docs/REGULATORY_CONTEXT.md`
- `docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md`
