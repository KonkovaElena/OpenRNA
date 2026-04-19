---
title: "OpenRNA IQ Baseline Snapshot"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [validation, iq, baseline, snapshot]
---

# OpenRNA IQ Baseline Snapshot (2026-04-19)

## Snapshot Identity

| Field | Value |
|---|---|
| Snapshot ID | IQ-BASELINE-2026-04-19-LOCAL-VALIDATION |
| Environment Name | OpenRNA Validation Gate (Windows workstation, local durable-simulation) |
| Change Request ID | CR-OPENRNA-VALIDATION-2026-04-19-01 |
| Collection Timestamp (UTC) | 2026-04-19T19:11:54.8676680Z |
| OpenRNA Commit SHA (snapshot time) | a71ec76c8186d59126750df3259d1407d866c1ee |
| Node.js Version | v24.11.0 |
| npm Version | 11.6.1 |
| OS | Microsoft Windows 11 Pro for Workstations 10.0.26200 (Build 26200), 64-bit |

## Environment Baseline Evidence

| Control | Result | Evidence |
|---|---|---|
| OS and host inventory captured | PASS | `docs/validation/evidence/artifacts/iq_os_snapshot.json` |
| Runtime baseline captured | PASS | `docs/validation/evidence/artifacts/iq_node_version.txt`, `docs/validation/evidence/artifacts/iq_npm_version.txt` |
| Commit provenance captured | PASS | `docs/validation/evidence/artifacts/iq_commit_sha.txt` |
| Lockfile integrity captured | PASS | SHA256 `23AF139CD8E0D910894B48792D813ABA4D21404E27CDDDD7E06A7BAD7BF7E6DA` in `docs/validation/evidence/artifacts/iq_package_lock_hash.json` |
| SBOM generated and hashed | PASS | SHA256 `640C976EE2FD1031267D76F1632365712C1116CEF88A7152BCECCFD88EC9B172` in `docs/validation/evidence/artifacts/iq_sbom_hash.json` |
| CI gate (build + test + runtime audit) | PASS | `docs/validation/evidence/artifacts/ci_gate_summary_2026-04-19.json` (`pass 489`, `fail 0`, `vulnerabilities: 0`) |

## Durable-Path Qualification Notes

- This snapshot was captured in a local validation gate and includes durable-path behavioral evidence through automated PostgreSQL persistence/reload tests.
- Direct site PostgreSQL server version and migration execution transcripts remain environment-specific and must be attached when promoting to a deployment-bound IQ package.

## Outstanding Sign-Off Actions

- Attach deployment-site PostgreSQL version/config baseline.
- Attach deployment-site migration execution transcript.
- Add validation-owner, QA, and system-owner signatures for the target environment.

## Related Artifacts

- `docs/validation/IQ_ENVIRONMENT_CHECKLIST_2026.md`
- `docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md`
- `docs/validation/URS_TRACEABILITY_MATRIX_2026.md`