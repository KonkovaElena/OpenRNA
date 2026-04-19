---
title: "OpenRNA IQ Environment Checklist"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [validation, iq, environment, baseline, gxp]
---

# OpenRNA IQ Environment Checklist

## Purpose

Provide an installation-qualification checklist and baseline snapshot template for a target regulated deployment environment.

This document is a controlled template. It does not, by itself, certify qualification until site-specific values are populated and approved.

## Applicability

Use this checklist for durable OpenRNA deployments (PostgreSQL-backed store, authenticated API, signed critical actions).

## IQ Control Checklist

| ID | Control Item | Evidence Artifact | Result (Pass/Fail/N-A) | Reviewer | Date |
|---|---|---|---|---|---|
| IQ-001 | Host OS and patch level match approved baseline | OS inventory export + approval reference |  |  |  |
| IQ-002 | Node.js runtime version and npm version match approved baseline | `node -v`, `npm -v` capture |  |  |  |
| IQ-003 | PostgreSQL engine version and configuration match approved baseline | DB version capture + config snapshot |  |  |  |
| IQ-004 | Application dependencies are locked and reproducible | `package-lock.json` hash + install log |  |  |  |
| IQ-005 | Runtime SBOM is generated and archived | `openrna-runtime-sbom.cdx.json` artifact |  |  |  |
| IQ-006 | Secrets provider and key material wiring verified | Secret-source wiring record (no secret values) |  |  |  |
| IQ-007 | Clock synchronization source configured and healthy | NTP status capture |  |  |  |
| IQ-008 | Network exposure matches approved ingress/egress profile | Firewall/routing checklist |  |  |  |
| IQ-009 | Schema migration applied without drift | migration log + schema checksum |  |  |  |
| IQ-010 | Health endpoints operational after deployment | `/healthz`, `/readyz` checks |  |  |  |
| IQ-011 | Critical route inventory matches approved API baseline | system route dump vs reference |  |  |  |
| IQ-012 | Deployment record linked to change and approval ID | change ticket + approval evidence |  |  |  |

## Baseline Snapshot Template

Populate once per qualified target environment/release bundle.

| Field | Value |
|---|---|
| Snapshot ID |  |
| Environment Name |  |
| Change Request ID |  |
| Deployment Date/Time (UTC) |  |
| OpenRNA Commit SHA |  |
| Node.js Version |  |
| npm Version |  |
| PostgreSQL Version |  |
| Schema Migration Version |  |
| SBOM Artifact Reference |  |
| Dependency Lockfile Hash |  |
| Security Baseline Reference |  |
| Approved By |  |
| Approval Date |  |

## Approval Sign-Off

| Role | Name | Signature/Approval Ref | Date |
|---|---|---|---|
| Validation Owner |  |  |  |
| QA Representative |  |  |  |
| System Owner |  |  |  |

## Related Documents

- docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md
- docs/validation/URS_TRACEABILITY_MATRIX_2026.md
- docs/INTENDED_USE_STATEMENT_2026.md
- docs/REGULATORY_CONTEXT.md