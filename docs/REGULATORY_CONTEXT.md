---
title: "Regulatory Context for Personalized Neoantigen RNA Vaccines"
status: active
version: "1.2.0"
last_updated: "2026-04-19"
tags: [regulatory, fda, ema, part-11, atmp, oncology]
evidence_cutoff: "2026-04-19"
---

# Regulatory Context

This document maps the regulatory landscape for personalized neoantigen RNA vaccines as it applies to the capabilities implemented in this repository. It distinguishes between what the current software provides and what remains required for clinical deployment.

This is a regulatory-orientation and gap-analysis note, not a formal product-classification opinion.

## Applicable Regulatory Frameworks

### United States (FDA)

**Classification**: Individualized neoantigen mRNA vaccines are regulated as biological products under the FDA Center for Biologics Evaluation and Research (CBER).

| Regulation | Scope | Relevance |
|-----------|-------|-----------|
| **21 USC §351** (Biologics License Application) | Marketing authorization for biological products | Required for commercial deployment of any individualized neoantigen vaccine |
| **21 CFR Part 11** | Electronic records and electronic signatures | FDA guidance says Part 11 should be interpreted narrowly: it applies when predicate-rule records/signatures are kept or submitted electronically |
| **FDA Guidance: Clinical Decision Support Software** (January 2026) | Clarifies section 520(o)(1)(E) non-device CDS criteria | Defines boundary between clinician-support software and device-class software functions |
| **21 CFR Parts 210/211** | Current Good Manufacturing Practice (cGMP) | Manufacturing facility and process requirements |
| **21 CFR Part 312** | Investigational New Drug (IND) | Clinical trial authorization |
| **FDA Guidance: Data Integrity and Compliance with Drug cGMP** (2018) | ALCOA+ principles for data integrity | Audit trail design, metadata, backup/recovery |
| **INTERACT / Pre-IND** | Early CMC and clinical development advice | Starting material definition, manufacturing comparability for personalized products |

**Key FDA considerations for personalized vaccines**:
- Each patient's vaccine is a unique manufactured lot → per-patient release testing.
- Regulatory expectations for individualized platform products continue to evolve; this repository should not assume a streamlined BLA pathway without a directly cited FDA source.
- Manufacturing comparability for a "platform" product where the active substance changes per patient is a novel regulatory question.

### European Union (EMA)

| Regulation | Scope | Relevance |
|-----------|-------|-----------|
| **EC 1394/2007** (ATMP Regulation) | Advanced Therapy Medicinal Products | ATMP classification may require case-specific analysis for personalized RNA products; this document does not assert CAT classification without product-specific evidence |
| **Directive 2001/83/EC** | EU pharmaceutical legislation | General marketing authorization framework |
| **GMP Annex 13** | Investigational Medicinal Products | Manufacturing for clinical trials |
| **EMA/CAT** | Committee for Advanced Therapies | Scientific assessment body for ATMPs |
| **Hospital Exemption (Art. 28)** | Limited ATMP exemption for hospital use | Potentially relevant for academic medical center deployment |

**Key EMA considerations**:
- If a concrete product falls within ATMP scope, CAT assessment adds complexity but also provides structured engagement.
- Hospital exemption pathway allows limited non-commercial use in individual EU member states under national rules — potentially relevant for early academic deployment.
- EU regulatory path tends to be longer but more structured for novel ATMPs.

### International Harmonization (ICH)

| Guideline | Topic | Platform relevance |
|-----------|-------|-------------------|
| **ICH Q5E** | Comparability of biotechnological products | Critical for modality evolution (mRNA → saRNA transition) |
| **ICH Q8** | Pharmaceutical development / Quality by Design | Design space definition for RNA constructs |
| **ICH Q9** | Quality risk management | Risk-based approach to manufacturing controls |
| **ICH Q10** | Pharmaceutical quality system | Lifecycle management across platform evolution |
| **ICH Q12** | Lifecycle management | Post-approval changes to manufacturing process |
| **ICH E6(R2)** | Good Clinical Practice | Clinical trial conduct, informed consent, data management |

## April 2026 Part 11 Precision Points

The eCFR page for Title 21 Part 11 was rechecked on April 19, 2026. It was displayed as up to date as of April 16, 2026.

For this repository, the most operational sections are:

- **§11.10** closed-system controls: validation, access limitation, audit trails, sequencing and authority checks, and documentation controls.
- **§11.50** signature manifestations: printed name, execution time, and signing meaning.
- **§11.70** signature and record linking.
- **§§11.100, 11.200, and 11.300** signature uniqueness and identification-code or password controls.

This matters because OpenRNA already models a closed-system deployment posture more than an open public submission surface. The practical question is not whether Part 11 exists, but which concrete controls remain unsatisfied by the current implementation.

### What the FDA scope guidance changes in practice

FDA's 2003 Part 11 scope-and-application guidance does not cancel Part 11. It narrows the scope and explains enforcement discretion for some validation, audit-trail, record-retention, and copy-generation provisions while still enforcing predicate rules and key closed-system controls.

For this repository, that leads to a more disciplined posture:

- do not treat every internal software feature as automatically Part 11-scoped;
- do identify which electronic records and signatures would actually be relied on for regulated activity;
- do document that decision up front;
- do not use enforcement-discretion language as a substitute for access control, authority checks, signer identity, or record integrity.

The correct question is therefore not "is OpenRNA globally Part 11 compliant?" The correct question is "which regulated records would this system create or hold, and what control set is required for those records in intended use?"

### Risk-based software validation stance

FDA's `General Principles of Software Validation` guidance remains a stable reference for this repository's validation posture. The key operational principle is that validation depth should be justified by intended use and by the software's effect on accuracy, reliability, record integrity, and, where relevant, product quality or patient safety.

For OpenRNA, this means engineering verification is necessary but not sufficient. Current tests, typed schemas, and CI gates are useful software evidence, but they are not a replacement for a documented intended-use statement, user requirements, risk assessment, traceability matrix, and IQ/OQ/PQ-style qualification package on the durable deployment path.

This pass deliberately anchors validation language on rechecked eCFR text and stable FDA guidance pages. A newer CSA framing may still be useful internally, but it is not promoted here until its official page path is re-confirmed.

## Clinical Decision Support Boundary (FDA Guidance, January 2026)

FDA's January 2026 CDS guidance (section 520(o)(1)(E) clarification) is a key boundary source for this repository.

Operational interpretation for OpenRNA:

- OpenRNA is intended to support clinician and QA workflows by organizing and presenting evidence.
- OpenRNA is not intended to independently diagnose, select therapy, or generate autonomous treatment recommendations.
- Human reviewers remain the accountable decision point for approval and release actions.

Escalation boundary:

- If a deployment introduces opaque recommendation logic that cannot be independently reviewed by the intended healthcare professional user, or introduces autonomous patient-level treatment selection, the non-device CDS framing must be re-evaluated before use.

## 21 CFR Part 11 Compliance Mapping

FDA's 2003 scope-and-application guidance explicitly says the Agency intends to interpret Part 11 narrowly: it applies to predicate-rule records kept or submitted electronically, not to every computerized system used somewhere in a GxP environment.

### Part 11 Requirements vs. Current Implementation

| Part 11 Requirement | Section | Current State | Gap |
|---------------------|---------|--------------|-----|
| **§11.10(a)** Validation of systems | System validation | ❌ No IQ/OQ/PQ documentation | Requires validation package before clinical use |
| **§11.10(b)** Ability to generate accurate and complete copies | Data export | ✅ JSON API responses, JSONB storage | Full backup/restore procedures needed |
| **§11.10(c)** Protection of records for retention period | Record retention | ⚠️ PostgreSQL persistence available | Needs formal retention policy and archival strategy |
| **§11.10(d)** Limiting system access to authorized individuals | Access control | ⚠️ API-key auth plus RBAC seam (`api-key-auth.ts`, `rbac-auth.ts`) | Not equivalent to per-user OIDC or JWT identity, Part 11 authority checks, or signer-bound attribution. |
| **§11.10(e)** Secure, computer-generated, time-stamped audit trails | Audit trail | ⚠️ `store.ts` records audit events during mutations; `traceability.ts` builds read-side lineage views from stored state | NTP synchronization for timestamp accuracy needed |
| **§11.10(h)** Input checks (device checks) | Input validation | ✅ Zod runtime schemas on all API inputs | Validation rules need formal specification document |
| **§11.10(k)** Documentation and audit trail for system changes | Change control | ⚠️ Git version control | Needs formal change control procedure documentation |
| **§11.50** Electronic signature manifestations | E-signatures | ⚠️ Audit-signature seam exists, but not Part 11-complete | Needs signer name, execution time, signing meaning, and stronger identity binding than the current HMAC helper |
| **§11.70** Electronic signature/record linking | Signature binding | ⚠️ Signature provider exists, but signatures are not yet bound into release-grade records | Required for review approval, release authorization, and non-repudiation |

### ALCOA+ Data Integrity Principles

| Principle | Implementation | Status |
|-----------|---------------|--------|
| **A**ttributable | API key plus optional role mapping identify caller class, not a unique signer or reviewer | ⚠️ Partial |
| **L**egible | JSON structured data, human-readable audit events | ✅ |
| **C**ontemporaneous | Timestamps at event creation time | ✅ |
| **O**riginal | JSONB storage in PostgreSQL; in-memory store is volatile | ⚠️ PostgreSQL path only |
| **A**ccurate | Zod validation on input; audit events are append-only by application convention (no database-level immutability constraint) | ⚠️ Partial |
| +**C**omplete | Full event history per case via audit trail | ✅ |
| +**C**onsistent | Consistent timestamp format (ISO 8601) | ✅ |
| +**E**nduring | PostgreSQL with configurable retention | ⚠️ No formal retention policy |
| +**A**vailable | API-accessible, no offline-only data | ✅ |

## FHIR Interoperability Baseline (R4)

OpenRNA currently exposes FHIR export seams for case-level bundle export and HLA consensus views.

To keep interoperability claims bounded and auditable:

- FHIR baseline conformance is documented in `docs/fhir/FHIR_CONFORMANCE_BASELINE_2026.md`.
- A versioned capability artifact is published at `docs/fhir/CAPABILITY_STATEMENT_R4_2026-04.json`.
- Current claim boundary remains: implementation seam exists; site-level interoperability qualification and profile validation are deployment responsibilities.

## Data Minimization And Crypto-Shredding Boundary

This repository stores pseudonymous case identifiers (`patientKey`) in its core case profile model and avoids direct patient identifiers in the primary case aggregate.

Policy-level controls for PHI minimization, field classification, and crypto-shredding workflow are documented in:

- `docs/security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md`

## cGMP Considerations for Personalized Manufacturing

Personalized neoantigen vaccines present unique cGMP challenges:

| Challenge | Traditional Biologics | Personalized Vaccines | Platform Impact |
|-----------|----------------------|----------------------|----------------|
| Batch size | Large (thousands of doses) | Single patient | Manufacturing handoff must track per-patient lot |
| Release testing | Statistical sampling | Per-lot release | QC gate evaluation per run is architecturally aligned |
| Identity testing | Compare to reference standard | Each product is unique | Construct traceability from antigens to final product is essential |
| Turnaround | Weeks to months | Days to weeks (clinical window) | Workflow timing tracking in operations summary |
| Comparability | Process change = comparability study | Platform change = re-validation | Modality registry with activation governance supports this |

## What This Repository Provides Toward Compliance

### Strengths (honest assessment)

1. **Machine-readable audit trail** (`store.ts` + `traceability.ts`): case mutations append auditable events with event type, detail string, correlation ID, and timestamp (`CaseAuditEventRecord`), while `traceability.ts` assembles end-to-end lineage views from stored state. Individual actor identity is not yet captured in the audit event record — the current event schema carries correlation context, not signer attribution. This is the most relevant current software capability for Part 11-aligned record integrity, but actor-bound attribution remains an open gap.

2. **Input validation** (Zod schemas in `validation.ts`): All API inputs are runtime-validated against typed schemas. Rejects malformed data before it enters the system.

3. **Idempotent workflow submission** (`x-idempotency-key`): Prevents duplicate workflow dispatches — critical for manufacturing-adjacent operations.

4. **Construct-to-outcome traceability** (`traceability.ts`): Evidence lineage graph from sample registration through construct design to clinical outcomes. Supports ICH Q5E comparability analysis.

5. **Structured error contract** (`errors.ts`): Operator-facing error codes with HTTP status mapping. Supports auditability of system failures.

6. **Dual adapter architecture**: In-memory for development; PostgreSQL for durable records. Allows validated-system qualification on the durable path without constraining development velocity.

### Gaps (honest assessment)

| Gap | Priority | Regulatory Driver | Effort Estimate |
|-----|----------|-------------------|-----------------|
| Electronic signatures | **Critical** | 21 CFR Part 11 §11.50/11.70 and Subpart C | Significant — current audit-signature seam must evolve into signer-bound electronic records |
| Individual user authentication | **Critical** | 21 CFR Part 11 §11.10(d)/(g), §11.100, cGMP | Moderate — replace API-key baseline with RBAC + identity provider |
| Dual-authorization release | **Critical** | EU QP release, cGMP release workflow | Moderate — new workflow step + e-signature prerequisite |
| System validation documentation | **High** | 21 CFR Part 11 §11.10(a) | Documentation-heavy — IQ/OQ/PQ package |
| Formal change control | **High** | 21 CFR Part 11 §11.10(k) | Process documentation — Git history is necessary but not sufficient |
| Consent-state management | **High** | ICH E6(R2) | Moderate — add consent port to case lifecycle FSM |
| Retention and archival policy | **Medium** | FDA Data Integrity Guidance | Documentation and infrastructure — backup/archival procedures |
| NTP-synchronized timestamps | **Low** | 21 CFR Part 11 §11.10(e) | Deployment configuration — not a code change |
| Cryptographic audit seal | **Low** | FDA Data Integrity Guidance | Moderate — SHA-256 hash chain on audit events |

## Claim Boundary For This Repository

| Safe current claim | Not yet justified |
|--------------------|-------------------|
| OpenRNA has Part 11-oriented seams for audit, access control, and signature handling | OpenRNA is Part 11 compliant |
| The PostgreSQL path can support durable regulated records | Record retention, archival, and recovery controls are formally validated |
| The review and handoff workflow can evolve into release authorization controls | Dual-authorization or qualified-person release exists today |
| FHIR export is a first-class interoperability seam | Clinical profile conformance and site-to-site interoperability are formally qualified |
| The repository has engineering verification evidence | The repository is a validated computerized system for regulated use |

## Path to Clinical Deployment

### Pre-IND / INTERACT Phase
1. Complete electronic signature infrastructure.
2. Implement RBAC with individual user authentication.
3. Document system validation (IQ/OQ/PQ).
4. Formalize change control procedures.
5. Add consent-state handling to case lifecycle.

### IND-Enabling Phase
6. Dual-authorization release workflow (Qualified Person).
7. Retention and archival policy documentation.
8. NTP synchronization requirement in deployment specification.
9. Formal computer system validation against predefined user requirements, documented risk assessment, and traceability from requirements to evidence.

### BLA-Supporting Phase
10. Cryptographic audit seals for tamper evidence.
11. Full traceability validation across representative clinical dataset.
12. Platform comparability documentation for modality evolution (ICH Q5E).

## References

- FDA: 21 CFR Part 11 — Electronic Records; Electronic Signatures
- FDA: Part 11, Electronic Records; Electronic Signatures — Scope and Application (Guidance for Industry, 2003)
- FDA: Clinical Decision Support Software (Guidance for Industry and FDA Staff, January 2026)
- FDA: General Principles of Software Validation (Guidance for Industry and FDA Staff, 2002)
- FDA: Data Integrity and Compliance With Drug CGMP (December 2018)
- EU: Regulation (EC) No 1394/2007 on Advanced Therapy Medicinal Products
- EU: EudraLex Volume 4, GMP Annex 13 — Investigational Medicinal Products
- HL7: FHIR standard overview (`hl7.org/fhir`)
- HL7 Clinical Genomics Work Group: FHIR Genomics Reporting IG (`hl7.org/fhir/uv/genomics-reporting`)
- ICH: Q5E Comparability of Biotechnological/Biological Products
- ICH: E6(R2) Good Clinical Practice
- FDA: Guidance for Industry: Individualized Antisense Oligonucleotide Drug Products (2021) — analogous framework for individualized products
