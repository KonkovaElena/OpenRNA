---
title: "OpenRNA PQ Throughput And Recovery Drill Template"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [validation, pq, throughput, recovery, gxp]
---

# OpenRNA PQ Throughput And Recovery Drill Template

## Purpose

Provide a structured template for recording performance qualification (PQ) evidence for throughput, restart behavior, and recovery integrity.

This template is deployment-specific and must be populated for each qualified environment/profile.

## Test Profile Definition

| Field | Value |
|---|---|
| Profile ID |  |
| Environment Name |  |
| Date (UTC) |  |
| OpenRNA Commit SHA |  |
| Data Volume (cases) |  |
| Concurrency Target |  |
| Execution Window |  |
| Operator Team |  |

## Throughput Run Evidence

| Metric | Target | Observed | Pass/Fail |
|---|---|---|---|
| Case ingestion rate (cases/hour) |  |  |  |
| Workflow dispatch latency (p95) |  |  |  |
| Review outcome recording latency (p95) |  |  |  |
| QA release recording latency (p95) |  |  |  |
| Handoff packet generation latency (p95) |  |  |  |
| Traceability query latency (p95) |  |  |  |

## Restart And Recovery Drill

| Checkpoint | Expected Behavior | Evidence | Pass/Fail |
|---|---|---|---|
| Controlled service stop | No durable data corruption | stop/start log + DB state capture |  |
| Service restart | Health/readiness recovered | `/healthz` + `/readyz` checks |  |
| Case state continuity | Case statuses unchanged after restart | pre/post snapshot compare |  |
| Release chain continuity | review -> qaRelease -> handoff links preserved | traceability export compare |  |
| Audit hash-chain continuity | `previousEventHash` and `eventHash` chain intact | chain verification report |  |
| Replay integrity | persisted events replay without divergence | replay diff report |  |

## Deviations And CAPA

| ID | Deviation | Root Cause | CAPA Owner | Due Date | Closure Evidence |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Approval Sign-Off

| Role | Name | Signature/Approval Ref | Date |
|---|---|---|---|
| Validation Owner |  |  |  |
| QA Representative |  |  |  |
| System Owner |  |  |  |

## Related Documents

- docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md
- docs/validation/URS_TRACEABILITY_MATRIX_2026.md
- docs/validation/IQ_ENVIRONMENT_CHECKLIST_2026.md