---
title: "Regulatory Context for Personalized Neoantigen RNA Vaccines"
status: active
version: "1.0.1"
last_updated: "2026-03-31"
tags: [regulatory, fda, ema, part-11, atmp, oncology]
evidence_cutoff: "2026-03-31"
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

## 21 CFR Part 11 Compliance Mapping

FDA's 2003 scope-and-application guidance explicitly says the Agency intends to interpret Part 11 narrowly: it applies to predicate-rule records kept or submitted electronically, not to every computerized system used somewhere in a GxP environment.

### Part 11 Requirements vs. Current Implementation

| Part 11 Requirement | Section | Current State | Gap |
|---------------------|---------|--------------|-----|
| **§11.10(a)** Validation of systems | System validation | ❌ No IQ/OQ/PQ documentation | Requires validation package before clinical use |
| **§11.10(b)** Ability to generate accurate and complete copies | Data export | ✅ JSON API responses, JSONB storage | Full backup/restore procedures needed |
| **§11.10(c)** Protection of records for retention period | Record retention | ⚠️ PostgreSQL persistence available | Needs formal retention policy and archival strategy |
| **§11.10(d)** Limiting system access to authorized individuals | Access control | ⚠️ API-key auth (`api-key-auth.ts`) | Not equivalent to individual user authentication. Needs RBAC. |
| **§11.10(e)** Secure, computer-generated, time-stamped audit trails | Audit trail | ⚠️ `store.ts` records audit events during mutations; `traceability.ts` builds read-side lineage views from stored state | NTP synchronization for timestamp accuracy needed |
| **§11.10(h)** Input checks (device checks) | Input validation | ✅ Zod runtime schemas on all API inputs | Validation rules need formal specification document |
| **§11.10(k)** Documentation and audit trail for system changes | Change control | ⚠️ Git version control | Needs formal change control procedure documentation |
| **§11.50** Electronic signature manifestations | E-signatures | ❌ Not implemented | Requires PKCE/FIDO2 or equivalent |
| **§11.70** Electronic signature/record linking | Signature binding | ❌ Not implemented | Required for review approval and QP release |

### ALCOA+ Data Integrity Principles

| Principle | Implementation | Status |
|-----------|---------------|--------|
| **A**ttributable | API-key identifies calling system; no individual user attribution yet | ⚠️ Partial |
| **L**egible | JSON structured data, human-readable audit events | ✅ |
| **C**ontemporaneous | Timestamps at event creation time | ✅ |
| **O**riginal | JSONB storage in PostgreSQL; in-memory store is volatile | ⚠️ PostgreSQL path only |
| **A**ccurate | Zod validation on input; immutable audit events | ✅ |
| +**C**omplete | Full event history per case via audit trail | ✅ |
| +**C**onsistent | Consistent timestamp format (ISO 8601) | ✅ |
| +**E**nduring | PostgreSQL with configurable retention | ⚠️ No formal retention policy |
| +**A**vailable | API-accessible, no offline-only data | ✅ |

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

1. **Machine-readable audit trail** (`store.ts` + `traceability.ts`): case mutations append auditable events with timestamp, actor, and payload, while `traceability.ts` assembles end-to-end lineage views from stored state. This is the most relevant current software capability for Part 11-aligned record integrity.

2. **Input validation** (Zod schemas in `validation.ts`): All API inputs are runtime-validated against typed schemas. Rejects malformed data before it enters the system.

3. **Idempotent workflow submission** (`x-idempotency-key`): Prevents duplicate workflow dispatches — critical for manufacturing-adjacent operations.

4. **Construct-to-outcome traceability** (`traceability.ts`): Evidence lineage graph from sample registration through construct design to clinical outcomes. Supports ICH Q5E comparability analysis.

5. **Structured error contract** (`errors.ts`): Operator-facing error codes with HTTP status mapping. Supports auditability of system failures.

6. **Dual adapter architecture**: In-memory for development; PostgreSQL for durable records. Allows validated-system qualification on the durable path without constraining development velocity.

### Gaps (honest assessment)

| Gap | Priority | Regulatory Driver | Effort Estimate |
|-----|----------|-------------------|-----------------|
| Electronic signatures | **Critical** | 21 CFR Part 11 §11.50/11.70 | Significant — requires crypto/auth infrastructure |
| Individual user authentication | **Critical** | 21 CFR Part 11 §11.10(d), cGMP | Moderate — replace API-key with RBAC + identity provider |
| Dual-authorization release | **Critical** | EU QP release, cGMP release workflow | Moderate — new workflow step + e-signature prerequisite |
| System validation documentation | **High** | 21 CFR Part 11 §11.10(a) | Documentation-heavy — IQ/OQ/PQ package |
| Formal change control | **High** | 21 CFR Part 11 §11.10(k) | Process documentation — Git history is necessary but not sufficient |
| Consent-state management | **High** | ICH E6(R2) | Moderate — add consent port to case lifecycle FSM |
| Retention and archival policy | **Medium** | FDA Data Integrity Guidance | Documentation and infrastructure — backup/archival procedures |
| NTP-synchronized timestamps | **Low** | 21 CFR Part 11 §11.10(e) | Deployment configuration — not a code change |
| Cryptographic audit seal | **Low** | FDA Data Integrity Guidance | Moderate — SHA-256 hash chain on audit events |

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
9. Formal computer system validation against predefined user requirements.

### BLA-Supporting Phase
10. Cryptographic audit seals for tamper evidence.
11. Full traceability validation across representative clinical dataset.
12. Platform comparability documentation for modality evolution (ICH Q5E).

## References

- FDA: 21 CFR Part 11 — Electronic Records; Electronic Signatures
- FDA: Data Integrity and Compliance With Drug CGMP (December 2018)
- EU: Regulation (EC) No 1394/2007 on Advanced Therapy Medicinal Products
- EU: EudraLex Volume 4, GMP Annex 13 — Investigational Medicinal Products
- ICH: Q5E Comparability of Biotechnological/Biological Products
- ICH: E6(R2) Good Clinical Practice
- FDA: Guidance for Industry: Individualized Antisense Oligonucleotide Drug Products (2021) — analogous framework for individualized products
