---
title: "OpenRNA IQ/OQ/PQ Qualification Plan"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [validation, iq, oq, pq, gxp]
---

# OpenRNA IQ/OQ/PQ Qualification Plan

## Purpose

Define qualification evidence needed before using OpenRNA as part of a regulated operational flow.

## Scope

This plan covers the durable deployment path (PostgreSQL-backed store, authenticated API, signed critical actions) and excludes local in-memory development mode as a validation target.

## IQ (Installation Qualification)

Objective:
- Prove that the target environment is installed as designed.

Required evidence:
- Approved deployment baseline (OS, runtime, DB version, network controls)
- Dependency manifest and SBOM artifact
- Migration execution evidence for schema baseline
- Secrets provider and key-management wiring evidence
- Time synchronization source configuration (NTP)

Acceptance criteria:
- Environment inventory matches approved baseline
- Schema migrations applied with no drift
- Health and readiness endpoints operational

## OQ (Operational Qualification)

Objective:
- Prove functional controls operate correctly under expected conditions.

Core OQ controls:
- Authentication and RBAC authorization behavior
- Consent gate behavior on case-scoped writes
- FSM transition guard behavior
- Review approval requiring signature evidence
- QA release requiring independent checker
- Handoff generation requiring approved review plus QA release
- Audit-event provenance chain continuity

Expected automated evidence:
- Node test suite results for security, review, handoff, and event journal flows
- TypeScript build success
- API contract checks for critical routes

Acceptance criteria:
- All mandatory OQ test suites pass
- No unresolved high-severity deviations

## PQ (Performance Qualification)

Objective:
- Prove system remains controlled in production-like workload and operational conditions.

PQ profile examples:
- Sustained case throughput at expected concurrent load
- Recovery behavior after process restart with durable store
- Signature and release flows under realistic operator concurrency
- Audit lineage and traceability integrity under replay conditions

Required evidence:
- Production-like workload report with acceptance thresholds
- Recovery drill report (backup/restore and replay)
- Operator sign-off for workflow and QA release usability

Acceptance criteria:
- Throughput and latency within approved bounds
- No loss of audit, release, or traceability records during restart/recovery drills

## Deviation Management

Any failed IQ/OQ/PQ checkpoint requires:
- Deviation record with root cause
- CAPA plan with owner and due date
- Re-test evidence for closure

## Linked Artifacts

- docs/INTENDED_USE_STATEMENT_2026.md
- docs/validation/URS_TRACEABILITY_MATRIX_2026.md
- docs/REGULATORY_CONTEXT.md
