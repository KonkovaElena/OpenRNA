---
title: "OpenRNA PHI Minimization and Crypto-Shredding Policy"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [security, privacy, phi, minimization, crypto-shredding]
---

# OpenRNA PHI Minimization And Crypto-Shredding Policy

## Purpose

Define the minimum data-handling controls for personal and health-related identifiers in OpenRNA deployment paths.

This is a policy and architecture-control document. It is not a claim that all controls are already implemented in production.

## Scope

Applies to:
- case lifecycle records
- review, QA release, and handoff evidence records
- traceability and audit-event persistence
- FHIR export artifacts generated from case data

## Control Objectives

1. Minimize direct patient identifiers in core case aggregates.
2. Keep identity resolution in a separate approved identity system.
3. Support reversible unlinking for legitimate operations and irreversible unlinking for approved destruction events.
4. Preserve auditability of destruction actions without retaining recoverable identity material.

## Data Classification Baseline

| Class | Example fields | OpenRNA handling target |
|---|---|---|
| Direct identifiers (PII/PHI-high) | legal name, MRN, national ID, date of birth, exact address, phone/email | Must stay outside core case aggregate; store only in external identity vault/EHR/LIMS |
| Pseudonymous operational identifiers | `patientKey`, `caseId` | Allowed in core aggregate; no direct identifier payload in the same storage context |
| Clinical context (sensitive but non-direct) | indication, assay metadata, review rationale, QC metrics | Allowed with RBAC and consent controls; retention and disclosure policy required |
| Technical provenance and integrity data | artifact hashes, run manifests, event hash-chain links | Allowed; used for reproducibility and tamper-evidence |

## Architecture Rules

- `patientKey` is treated as a pseudonymous link key, not as a direct identity field.
- Direct-identifier lookup must be resolved in an external approved identity system.
- Any future local storage of direct identifiers requires explicit design approval, encryption controls, and URS update.

## Crypto-Shredding Control Model

Crypto-shredding is modeled as key-destruction, not row deletion.

Target control flow:

1. Case-scoped encrypted payloads use a per-case data encryption key (DEK).
2. DEK is wrapped by a key encryption key (KEK) managed by an approved key-management service.
3. Destruction event revokes and destroys the wrapping key material needed to unwrap the DEK.
4. Destruction action is recorded in audit trail with correlation and approval metadata.
5. Verification procedure confirms ciphertext remains but is no longer decryptable.

## Evidence Requirements

| Control | Required evidence |
|---|---|
| Field-level minimization decisions | approved data-classification matrix + architecture review record |
| Key-management wiring | deployment record referencing KMS/HSM integration |
| Destruction workflow | signed SOP + execution logs + independent verification record |
| Auditability of destruction | audit event proving who approved, when, and with what authority |

## Current Repository State (2026-04-19)

| Area | State |
|---|---|
| Pseudonymous `patientKey` in core case profile | Implemented |
| Direct-identifier externalization requirement | Documented policy boundary |
| Audit-event hash-chain integrity | Implemented on case audit events |
| Per-case DEK/KEK crypto-shredding workflow | Not yet implemented |
| Formal destruction SOP and verification runbook | Not yet implemented |

## Related Documents

- `docs/INTENDED_USE_STATEMENT_2026.md`
- `docs/REGULATORY_CONTEXT.md`
- `docs/validation/URS_TRACEABILITY_MATRIX_2026.md`
- `docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md`
