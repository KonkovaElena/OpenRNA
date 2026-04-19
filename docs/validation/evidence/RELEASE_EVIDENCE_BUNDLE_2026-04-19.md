---
title: "OpenRNA Release Evidence Bundle"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [validation, release, evidence, gate]
---

# OpenRNA Release Evidence Bundle (Validation Gate, 2026-04-19)

## Bundle Purpose

Provide a single release-gate evidence index covering IQ baseline capture, OQ/PQ execution evidence, and traceability alignment for the current OpenRNA state.

## Bundle Scope

- OpenRNA mainline validation gate after QA-release hardening and signature-control tests.
- Includes documentation artifacts, measured latency/recovery evidence, and CI gate output.

## Evidence Inventory

### Core validation documents

- `docs/validation/URS_TRACEABILITY_MATRIX_2026.md`
- `docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md`
- `docs/validation/IQ_ENVIRONMENT_CHECKLIST_2026.md`
- `docs/validation/PQ_THROUGHPUT_AND_RECOVERY_DRILL_2026.md`

### Filled validation reports

- `docs/validation/evidence/IQ_BASELINE_SNAPSHOT_2026-04-19.md`
- `docs/validation/evidence/PQ_DRILL_REPORT_2026-04-19.md`

### Raw machine artifacts

- `docs/validation/evidence/artifacts/iq_collected_at_utc.txt`
- `docs/validation/evidence/artifacts/iq_commit_sha.txt`
- `docs/validation/evidence/artifacts/iq_os_snapshot.json`
- `docs/validation/evidence/artifacts/iq_node_version.txt`
- `docs/validation/evidence/artifacts/iq_npm_version.txt`
- `docs/validation/evidence/artifacts/iq_package_lock_hash.json`
- `docs/validation/evidence/artifacts/iq_sbom_hash.json`
- `docs/validation/evidence/artifacts/ci_gate_summary_2026-04-19.json`
- `docs/validation/evidence/artifacts/pq_latency_metrics_2026-04-19.json`
- `docs/validation/evidence/artifacts/pq_recovery_summary_2026-04-19.json`

## Gate Summary

| Gate dimension | Result | Evidence |
|---|---|---|
| Build/test/security CI lane | PASS | `ci_gate_summary_2026-04-19.json` (`pass 489`, `fail 0`, `vulnerabilities: 0`) |
| Signature-control negative OQ paths | PASS | `tests/compliance-controls.test.ts`, URS-003 evidence mapping |
| IQ baseline snapshot capture | PASS (captured) | `IQ_BASELINE_SNAPSHOT_2026-04-19.md` |
| PQ throughput p95 evidence | PASS (captured) | `PQ_DRILL_REPORT_2026-04-19.md`, `pq_latency_metrics_2026-04-19.json` |
| PQ recovery integrity drill | PASS (captured) | `pq_recovery_summary_2026-04-19.json` |

## Decision State

Current state: **Validation Gate Package Assembled**.

Promotion caveat:

- Deployment-site signatures and environment-specific IQ/PQ approvals are still required for final regulated release authorization.

## Ownership And Sign-Off

| Role | Status |
|---|---|
| Engineering evidence assembly | Complete |
| Validation owner approval | Pending |
| QA approval | Pending |
| System owner approval | Pending |