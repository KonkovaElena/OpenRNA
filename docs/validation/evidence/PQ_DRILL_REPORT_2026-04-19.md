---
title: "OpenRNA PQ Drill Report"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [validation, pq, throughput, p95, recovery]
---

# OpenRNA PQ Drill Report (2026-04-19)

## Scope

This report records a production-like validation drill on the current integration test harness:

- Throughput and latency measurements derived from real API runtime logs captured during `npm run ci`.
- Recovery integrity checks from targeted replay/persistence test runs.

## Throughput And Latency (Measured)

Source artifact: `docs/validation/evidence/artifacts/pq_latency_metrics_2026-04-19.json`

| Metric | Samples | min (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---:|---:|---:|---:|---:|
| workflow_request_post | 100 | 0 | 1 | 2 | 52 |
| review_outcome_post | 17 | 0 | 1 | 21 | 21 |
| qa_release_post | 7 | 0 | 1 | 19 | 19 |
| handoff_packet_post | 8 | 0 | 1 | 23 | 23 |
| traceability_get | 7 | 0 | 1 | 1 | 1 |

Interpretation:

- Control-path p95 remained within double-digit milliseconds for release-critical endpoints in this harness.
- Outlier max for workflow request reflects full-path integration workload during CI.

## Recovery Integrity (Measured)

Source artifact: `docs/validation/evidence/artifacts/pq_recovery_summary_2026-04-19.json` (derived from local run log)

Global result:

- `pass 489`
- `fail 0`
- `duration_ms 2749.0366`

Key recovery controls observed in the run:

| Recovery control | Evidence marker | Result |
|---|---|---|
| Durable reload preserves release-chain data | `PostgresCaseStore persists review outcomes and handoff packets across reload` | PASS |
| Failure replay does not duplicate terminal history | `replaying workflow failure does not duplicate terminal history` | PASS |
| Workflow failure metadata survives replay | `replaying workflow failure preserves the original failureCategory` | PASS |

## Qualification Assessment

| Dimension | Assessment |
|---|---|
| Throughput/latency evidence present | PASS |
| p95 values computed from raw logs | PASS |
| Recovery integrity drill executed | PASS |
| Recovery drill deviations | NONE DETECTED |

## Remaining Promotion Conditions

- Re-run the same drill on the target deployment infrastructure and attach environment-specific deltas.
- Add QA/operator sign-off for deployment-profile acceptance thresholds.

## Related Artifacts

- `docs/validation/PQ_THROUGHPUT_AND_RECOVERY_DRILL_2026.md`
- `docs/validation/evidence/artifacts/ci_gate_summary_2026-04-19.json`
- `docs/validation/evidence/artifacts/pq_recovery_run_2026-04-19.log`
- `docs/validation/evidence/artifacts/pq_latency_metrics_2026-04-19.json`
- `docs/validation/evidence/artifacts/pq_recovery_summary_2026-04-19.json`