---
title: "OpenRNA Intended Use Statement"
status: active
version: "1.1.0"
last_updated: "2026-04-19"
tags: [intended-use, regulatory-boundary, gxp, part-11]
---

# OpenRNA Intended Use Statement

## Intended Use

OpenRNA is intended to support case orchestration, evidence assembly, and controlled handoff preparation for personalized neoantigen RNA workflow operations.

Intended operator groups:
- Molecular tumor board participants
- Bioinformatics and translational operations teams
- Quality assurance reviewers
- Clinical informatics integration teams

Intended technical functions:
- Case lifecycle management from intake through release-gated handoff
- Workflow request and run-state orchestration
- HLA, QC, ranking, design, and outcome traceability joins
- Controlled review, QA release, and manufacturing handoff packet generation
- Structured audit/event records with signature and chain metadata

## Regulatory Positioning Boundary (April 2026)

OpenRNA is positioned as coordination software for clinical and translational operations, not as an autonomous treatment recommendation engine.

For U.S. deployment framing, the relevant external reference is FDA's January 2026 guidance "Clinical Decision Support Software" (section 520(o)(1)(E) interpretation).

Repository-level boundary:
- OpenRNA may aggregate, normalize, and present evidence for clinician-led review.
- OpenRNA does not independently determine diagnosis, treatment selection, or dose decisions.
- OpenRNA is designed so that review/approval decisions remain attributable to identified human reviewers.

Escalation trigger:
- If deployment introduces opaque model outputs that clinicians cannot independently review, or introduces autonomous patient-specific recommendation logic, a new regulatory classification review is required before release.

## Data Minimization And Identity Boundary

OpenRNA uses pseudonymous case keys (`patientKey`) in its primary case profile model.

Direct patient identifiers are expected to remain out of band from the core case aggregate and should be managed by an approved identity vault or hospital master system.

Operational policy and control targets are defined in:
- `docs/security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md`

## Not Intended Use

OpenRNA is not intended to:
- Perform autonomous clinical diagnosis
- Replace physician judgment or institutional governance boards
- Act as an independently validated medical device decision engine
- Claim production-ready 21 CFR Part 11 compliance without deployment qualification artifacts
- Replace cGMP manufacturing controls, QMS, or validated LIMS/ELN infrastructure

## Regulatory Record Scope Decision

OpenRNA treats the following as potentially regulated electronic records when used in GxP context:
- Review outcomes for board decisions
- QA release authorizations
- Handoff packet issuance metadata
- Case audit trail events tied to the above critical actions

Records outside this scope can still be logged for engineering observability, but are not automatically treated as Part 11 scoped unless a predicate-rule mapping says they are.

## Signature Policy Boundary

For critical actions (review approval and QA release), OpenRNA requires:
- Signature intent fields (printed name, signing meaning)
- Step-up authentication assertion evidence (TOTP or WebAuthn assertion format)
- Signature manifest persisted into record context
- Signature provenance mirrored into audit event metadata

Current implementation provides integrity-focused controls and separation-of-duties checks. Legal non-repudiation, PKI/HSM anchoring, and formal validation package controls remain deployment responsibilities.

## Change Control

Changes to intended-use scope or regulatory record classification must update all of:
- This file
- docs/REGULATORY_CONTEXT.md
- docs/validation/URS_TRACEABILITY_MATRIX_2026.md
- docs/security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md
- docs/fhir/FHIR_CONFORMANCE_BASELINE_2026.md
- Any impacted API contract documentation in docs/API_REFERENCE.md
