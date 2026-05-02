---
title: "OpenRNA Computer System Validation Package"
status: "draft"
version: "0.1.0"
last_updated: "2026-05-02"
tags: [validation, iq, oq, pq, part-11, gxp, regulatory]
regulatory_basis: "21 CFR Part 11 §11.10(a); FDA General Principles of Software Validation (2002)"
---

# OpenRNA — Computer System Validation Package

> **Status: DRAFT.** This document is a validation-readiness template grounded in the current
> OpenRNA implementation evidence. It is not a substitute for a site-specific Computer System
> Validation (CSV) plan executed by a qualified validation engineer in the context of the intended
> regulated deployment. Before clinical or IND-supporting use, a formal validation package signed by
> responsible personnel must replace this template.

---

## 1. Purpose and Scope

This document describes the Installation Qualification (IQ), Operational Qualification (OQ), and
Performance Qualification (PQ) framework for the OpenRNA control-plane software, version `0.1.x`,
operating as a computer system for governed management of personalized neoantigen RNA vaccine case
records.

**Regulatory basis:** 21 CFR Part 11 §11.10(a) requires that electronic-records systems be
"validated to ensure accuracy, reliability, consistent intended performance, and the ability to
discern invalid or altered records." FDA's *General Principles of Software Validation* (January 2002)
provides the risk-based methodology applied here.

**System description:** OpenRNA is a TypeScript/Node.js Express API that manages the lifecycle of
patient oncology cases from intake through manufacturing handoff. It does not perform neoantigen
prediction, execute bioinformatics pipelines, or make autonomous therapeutic decisions.

**System boundary:**
- In scope: the Node.js application, its PostgreSQL schema (migrations 001–004), and all HTTP API
  surfaces documented in `docs/API_REFERENCE.md`.
- Out of scope: the bioinformatics pipeline tools (Nextflow, pVACtools, sarek), the deployment
  infrastructure (Kubernetes, cloud provider), and downstream manufacturing execution systems.

---

## 2. User Requirements Specification (URS)

The following user requirements define what the system must do from a regulatory and operational
perspective. Each URS entry is mapped to a Functional Specification (FS) reference and to the
corresponding test evidence.

| URS-ID | Requirement | FS Reference | Evidence |
|--------|-------------|--------------|---------|
| URS-001 | The system shall maintain a unique, immutable identifier for each patient case | FS-001 | `tests/api.test.ts` — case creation returns `caseId` |
| URS-002 | The system shall record consent status and prevent downstream mutations after consent withdrawal | FS-002 | `tests/consent-gate.test.ts`, `tests/lifecycle-controls.test.ts` |
| URS-003 | The system shall maintain an append-only audit trail for every case mutation | FS-003 | `tests/audit-chain.test.ts` |
| URS-004 | The system shall enforce a defined finite-state machine for case lifecycle transitions | FS-004 | `tests/state-machine-guard.test.ts`, `tests/lifecycle-controls.test.ts` |
| URS-005 | The system shall require dual authorization (distinct reviewer and releaser) before manufacturing handoff | FS-005 | `tests/compliance-controls.test.ts` — "Two-Person Release Control" |
| URS-006 | The system shall record electronic signature manifestations for review and release decisions | FS-006 | `tests/compliance-controls.test.ts` — "Part 11 Signature Manifestation" |
| URS-007 | The system shall validate all API inputs against typed schemas before processing | FS-007 | `tests/api.test.ts`, Zod schemas in `src/validation.ts` |
| URS-008 | The system shall prevent replay of workflow runs with altered identity fields | FS-008 | `tests/event-journal-foundation.test.ts` |
| URS-009 | The system shall support HLA consensus recording with per-tool evidence and disagreement thresholds | FS-009 | `tests/wave6-bundle-hla.test.ts` |
| URS-010 | The system shall export audit lineage as a machine-readable graph | FS-010 | `tests/outcomes.test.ts` — "Full Traceability" |
| URS-011 | The system shall provide a FHIR R4 Genomics Reporting export surface | FS-011 | `tests/fhir-exporter.test.ts` |
| URS-012 | The system shall enforce role-based access control with deny-by-default | FS-012 | `tests/rbac.test.ts`, `tests/rbac-coverage.test.ts` |
| URS-013 | The system shall limit access to case records based on per-case authorization grants | FS-013 | `tests/resource-authz-owner.test.ts` |
| URS-014 | The system shall compute a hash-chain over audit events to enable tamper detection | FS-014 | `tests/audit-chain.test.ts` — chain verification |
| URS-015 | When configured, the system shall derive signer identity from the verified IdP principal | FS-015 | `tests/signature-integrity.test.ts` — identity-bound tests |
| URS-016 | The system shall support OIDC JWKS URI for RS256 key discovery without manual PEM rotation | FS-016 | `tests/signature-integrity.test.ts` — `hasAuthenticationConfig` / `jwt.jwksUri` config |

---

## 3. Risk Classification

Per FDA *General Principles of Software Validation* §4.4, software is categorized by the level
of concern based on the potential hazard of the device or system:

| Category | Criterion | Classification for OpenRNA |
|----------|-----------|---------------------------|
| Level of Concern | Direct patient safety risk | **Minor** — OpenRNA does not make autonomous clinical decisions; all manufacturing-release decisions require explicit human authorization |
| System criticality | Impact on regulated records | **High** — electronic records for clinical trial governance may be relied upon for IND/BLA submissions |
| Data integrity | Sensitivity of managed data | **High** — patient genomic identifiers, treatment protocols, and expert-review decisions |

**Risk conclusion:** Medium overall validation rigor is required. Full IQ/OQ/PQ with formal sign-off
is expected before IND-supporting use; a risk-proportionate test-evidence package (which this
document begins to define) satisfies pre-IND / INTERACT preparation.

---

## 4. Installation Qualification (IQ)

IQ verifies that the system is installed correctly and that the installation environment meets
specified requirements.

### 4.1 IQ Checklist

| IQ-ID | Item | Method | Acceptance Criterion | Status |
|-------|------|--------|----------------------|--------|
| IQ-001 | Node.js runtime version ≥ 24 | `node --version` | Output matches `v24.x.x` | ☐ Pending |
| IQ-002 | npm version ≥ 11 | `npm --version` | Output ≥ `11.x.x` | ☐ Pending |
| IQ-003 | All production dependencies installed | `npm ci --omit=dev` exits 0 | Exit code = 0 | ☐ Pending |
| IQ-004 | No high/critical vulnerabilities | `npm audit --omit=dev --audit-level=high` | Zero vulnerabilities reported | ☐ Pending |
| IQ-005 | TypeScript compilation succeeds | `npm run build` | Exit code = 0; `dist/` populated | ☐ Pending |
| IQ-006 | PostgreSQL version ≥ 15 | `psql --version` | Version ≥ 15 | ☐ Pending |
| IQ-007 | All database migrations applied | `psql -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"` | Tables `cases`, `audit_events`, `review_outcomes`, `handoff_packets` present | ☐ Pending |
| IQ-008 | Migration 004 columns present | `\d audit_events` | `record_hash` and `prev_hash` columns exist | ☐ Pending |
| IQ-009 | Environment configuration valid | Application startup without config-schema errors | No `Invalid environment configuration` error on start | ☐ Pending |
| IQ-010 | CycloneDX SBOM generated | `npm run sbom:cyclonedx:file` | `openrna-runtime-sbom.cdx.json` generated with correct component count | ☐ Pending |
| IQ-011 | SIGNATURE_SEAL_KEY ≥ 32 bytes set in production | Config schema validation | `loadConfig()` succeeds; application warns if absent with API key | ☐ Pending |
| IQ-012 | NTP synchronization active | `chronyc tracking` or `ntpq -p` | Offset < 100ms, stratum ≤ 3 | ☐ Pending |

### 4.2 IQ Acceptance Criteria

All IQ-xxx items must achieve status ✅ Pass before OQ execution. Any deviation must be documented
in a Deviation Report with a root-cause analysis and corrective action.

---

## 5. Operational Qualification (OQ)

OQ verifies that the installed system operates according to its functional specification across the
full range of operating conditions, including boundary and error conditions.

### 5.1 OQ Test Suites

The automated test suite in `tests/` constitutes the primary OQ evidence corpus. Each test suite
maps to one or more URS requirements.

| OQ-ID | Test Suite | URS | Description | Current Status |
|-------|-----------|-----|-------------|----------------|
| OQ-001 | `tests/api.test.ts` | URS-001, URS-007 | Full case lifecycle HTTP round-trip including input validation | 539 tests pass (2026-05-02) |
| OQ-002 | `tests/state-machine-guard.test.ts` | URS-004 | FSM transition validation including `CONSENT_WITHDRAWN` terminal state | ✅ |
| OQ-003 | `tests/consent-gate.test.ts` | URS-002 | Consent gate middleware — grant, withdraw, terminal withdrawal, new-case pattern | ✅ |
| OQ-004 | `tests/lifecycle-controls.test.ts` | URS-002, URS-004 | Consent status synchronization with CONSENT_WITHDRAWN; restart-from-revision | ✅ |
| OQ-005 | `tests/compliance-controls.test.ts` | URS-005, URS-006 | 21 CFR Part 11 signature manifestations; two-person release control | ✅ |
| OQ-006 | `tests/audit-chain.test.ts` | URS-003, URS-014 | Hash-chain computation, integrity verification, break detection | ✅ |
| OQ-007 | `tests/signature-integrity.test.ts` | URS-006, URS-015, URS-016 | Identity-bound signatures, HMAC server seals, JWKS config | ✅ |
| OQ-008 | `tests/event-journal-foundation.test.ts` | URS-001, URS-008 | Domain event replay idempotency and audit metadata preservation | ✅ |
| OQ-009 | `tests/rbac.test.ts`, `tests/rbac-coverage.test.ts` | URS-012 | Role-based access control, deny-by-default, role-action matrix | ✅ |
| OQ-010 | `tests/resource-authz-owner.test.ts` | URS-013 | Per-case OWNER/REVIEWER/MANUFACTURING grants | ✅ |
| OQ-011 | `tests/consent-tracker.test.ts`, `tests/postgres-consent-tracker.test.ts` | URS-002 | Consent event log persistence, active/withdrawn state derivation | ✅ |
| OQ-012 | `tests/fhir-exporter.test.ts` | URS-011 | FHIR R4 Genomics Reporting export surface | ✅ |
| OQ-013 | `tests/wave6-bundle-hla.test.ts` | URS-009 | HLA consensus with per-tool evidence and disagreement thresholds | ✅ |
| OQ-014 | `tests/outcomes.test.ts` | URS-010 | Full traceability lineage from sample to clinical outcome | ✅ |
| OQ-015 | `tests/postgres-case-store.test.ts` | URS-001–URS-014 | PostgreSQL durable path round-trip | ✅ |
| OQ-016 | `tests/isolation-docs.test.ts` | All | Verifies that each test suite documents its isolation requirements | ✅ |
| OQ-017 | `tests/config.test.ts` | IQ-009, IQ-011 | Configuration schema validation including SIGNATURE_SEAL_KEY validation | ✅ |

### 5.2 OQ Execution Protocol

1. Execute `npm run ci` in a clean checkout on a validated test environment.
2. Record the full test output, including pass/fail counts, duration, and timestamp.
3. Any failure causes the OQ to fail; the failure must be documented with a Deviation Report before
   re-execution.
4. The recorded output is the OQ evidence artifact.

### 5.3 OQ Acceptance Criteria

- All 539+ tests pass with exit code 0.
- `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities.
- Code coverage (line ≥ 90%, branch ≥ 80%, function ≥ 90%) reported by `npm run test:coverage`.
- No `[SKIP]` or `[TODO]` test markers introduced without a documented rationale.

---

## 6. Performance Qualification (PQ)

PQ verifies that the system performs consistently in its intended operating environment under
representative workload. It is executed after IQ and OQ in the target deployment environment.

### 6.1 PQ Scenarios

| PQ-ID | Scenario | Acceptance Criterion |
|-------|----------|----------------------|
| PQ-001 | Create and fully process 50 concurrent cases through to HANDOFF_PENDING | All 50 cases reach terminal state; audit chain valid for all; no data corruption |
| PQ-002 | Submit 200 sequential workflow requests with idempotency keys | Exactly 200 distinct workflow records; no duplicate dispatch; idempotency violations return 409 |
| PQ-003 | Audit chain integrity after 1000 audit events across 20 cases | `GET /api/cases/:caseId/audit-chain/verify` returns `{ valid: true }` for all 20 cases |
| PQ-004 | Rate limiting under burst (150 req/s for 10s with `RATE_LIMIT_MAX_TOKENS=100`) | Response codes include 429 for excess requests; no 500 errors; system recovers after burst |
| PQ-005 | Database restart during active workflow (simulate Postgres restart mid-transaction) | In-flight mutations either complete or are rolled back; no partial audit records; system health endpoint returns ready within 30s |
| PQ-006 | Consent withdrawal during active WORKFLOW_RUNNING state | Case transitions to CONSENT_WITHDRAWN; subsequent mutations rejected with 409; audit event recorded |
| PQ-007 | Identity-bound signature with OIDC JWKS URI (integration with mock OIDC server) | JWT RS256 token from OIDC server accepted; `principalId` from `sub` claim; `serverSeal` present on review outcome |
| PQ-008 | FHIR export round-trip for 5 cases with complete evidence bundles | All 5 FHIR bundles pass R4 schema validation; no missing required fields |

### 6.2 PQ Execution Notes

- PQ requires a production-representative environment with PostgreSQL, NTP synchronization, and
  (for PQ-007) a mock OIDC server (e.g., Keycloak in docker-compose).
- PQ-001 through PQ-006 can be executed against a local PostgreSQL instance with migration 001–004
  applied.
- Results must be recorded in a PQ Execution Report signed by the test executor and reviewed by the
  validation engineer.

---

## 7. Traceability Matrix Summary

| URS | OQ Test(s) | PQ Test(s) | IQ Test(s) |
|-----|-----------|-----------|-----------|
| URS-001 | OQ-001, OQ-008, OQ-015 | PQ-001 | IQ-001–IQ-007 |
| URS-002 | OQ-003, OQ-004, OQ-011 | PQ-006 | — |
| URS-003 | OQ-006 | PQ-003 | IQ-008 |
| URS-004 | OQ-002, OQ-004 | — | — |
| URS-005 | OQ-005 | — | — |
| URS-006 | OQ-005, OQ-007 | PQ-007 | IQ-011 |
| URS-007 | OQ-001, OQ-017 | — | — |
| URS-008 | OQ-008 | — | — |
| URS-009 | OQ-013 | — | — |
| URS-010 | OQ-014 | PQ-008 | — |
| URS-011 | OQ-012 | PQ-008 | — |
| URS-012 | OQ-009 | — | — |
| URS-013 | OQ-010 | — | — |
| URS-014 | OQ-006 | PQ-003 | IQ-008 |
| URS-015 | OQ-007 | PQ-007 | IQ-011 |
| URS-016 | OQ-007 | PQ-007 | — |

---

## 8. Change Control

All changes to the validated system must follow the change control procedure:

1. **Change Request** documented with the change description, affected modules, and risk assessment.
2. **Impact Assessment** on URS requirements (does any URS need to be updated?).
3. **Re-validation scope** determined: full (all OQ/PQ), partial (affected OQ/PQ only), or
   regression only (existing test suite without new test development).
4. **Implementation** and peer review via pull request.
5. **Validation execution** recorded with test output.
6. **Change Record** signed by the validation engineer and responsible person.

The Git commit history and pull request records constitute the change control audit trail for
development-phase changes. Production changes require a separate site-specific change-control
procedure.

---

## 9. Known Gaps and Open Items (v0.1.0)

| Gap ID | Description | Regulatory Driver | Target Version |
|--------|-------------|-------------------|---------------|
| GAP-VAL-001 | IQ checklist items IQ-001–IQ-012 not formally executed and signed | 21 CFR Part 11 §11.10(a) | v0.2.0 |
| GAP-VAL-002 | PQ scenarios not yet executed in a production-representative environment | 21 CFR Part 11 §11.10(a) | v0.2.0 |
| GAP-VAL-003 | Audit hash-chain write path implemented (migration 004); PostgresCaseStore.saveCaseRecord() populates record_hash/prev_hash — full verification endpoint at `GET /audit-chain/verify` operational | ✅ Closed (v0.1.3) | — |
| GAP-VAL-004 | Identity-bound signatures via OIDC JWKS URI implemented; SIGNATURE_SEAL_KEY server seals computed on review/release records | ✅ Closed (v0.1.3) | — |
| GAP-VAL-005 | Formal IQ/OQ/PQ sign-off by qualified validation engineer | 21 CFR Part 11 §11.10(a) | Pre-IND |
| GAP-VAL-006 | Traceability matrix not yet linked to formal Functional Specification documents | 21 CFR Part 11 §11.10(a) | v0.2.0 |
| GAP-VAL-007 | No approved Standard Operating Procedure (SOP) for system administration, backup, and recovery | FDA Data Integrity Guidance 2018 | Pre-IND |

---

## 10. References

- FDA: 21 CFR Part 11 — Electronic Records; Electronic Signatures (current)
- FDA: General Principles of Software Validation (January 2002)
- FDA: Part 11, Electronic Records; Electronic Signatures — Scope and Application (2003)
- FDA: Data Integrity and Compliance With Drug cGMP (December 2018)
- ICH E6(R2): Good Clinical Practice (2016)
- GAMP 5: A Risk-Based Approach to Compliant GxP Computerized Systems (ISPE, 2008)
- OpenRNA `docs/REGULATORY_CONTEXT.md` — live gap analysis and compliance mapping
- OpenRNA `docs/CHANGELOG.md` — version-level change record
- OpenRNA `src/migrations/` — database schema history
