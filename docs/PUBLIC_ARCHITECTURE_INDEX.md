---
title: "OpenRNA Public Architecture Index"
status: "active"
version: "1.1.0"
last_updated: "2026-04-19"
tags: [navigation, architecture, evidence, public-export]
---

# OpenRNA Public Architecture Index

Use this page as the public router for the standalone OpenRNA repository.

The active layer is intentionally smaller than the total evidence layer. Start with the active docs, then move outward into evidence packs and historical audits only when you need more detail.

## Start Here

| Document | Use it when you need |
|----------|----------------------|
| [README.md](../README.md) | The fastest orientation to the repository, runtime, and public scope |
| [design.md](design.md) | The authority architecture memo and T1-T4 evidence model |
| [API_REFERENCE.md](API_REFERENCE.md) | The grouped HTTP route map, auth headers, and response conventions |
| [OPERATIONS_AND_FAILURE_MODES.md](OPERATIONS_AND_FAILURE_MODES.md) | Runtime modes, health probes, metrics, and the main operational failure classes |

## Publication And Diligence

| Document | Role |
|----------|------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution process and repository workflow rules |
| [SECURITY.md](SECURITY.md) | Security policy and vulnerability reporting path |
| [SUPPORT.md](SUPPORT.md) | Support channels and issue triage expectations |
| [CHANGELOG.md](CHANGELOG.md) | Public release and documentation-surface change history |
| [RELEASE.md](RELEASE.md) | Release flow and maintainer checklist |

## Evidence And Reference

| Document | Role |
|----------|------|
| [REGULATORY_CONTEXT.md](REGULATORY_CONTEXT.md) | Regulatory framing and current gap analysis |
| [security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md](security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md) | Active PHI minimization and crypto-shredding control baseline |
| [fhir/FHIR_CONFORMANCE_BASELINE_2026.md](fhir/FHIR_CONFORMANCE_BASELINE_2026.md) | Active FHIR R4 conformance boundary and capability artifact map |
| [CONSENT_ACCESS_POLICY_2026.md](CONSENT_ACCESS_POLICY_2026.md) | Consent-gating matrix for route families |
| [archive/](archive/) | Archived evidence, publication packs, and historical audits |
| [archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md](archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md) | Current verified metrics, toolchain facts, and live registry anchors |
| [RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md](RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md) | April 2026 payer/policy signal note with source-authority and claim-boundary guardrails |
| [archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md](archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md) | Clinical, competitor, and toolchain-adjacent evidence |
| [archive/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md](archive/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md) | Runtime and open-source baseline decisions |
| [archive/ACADEMIC_ANALYSIS_2026-04.md](archive/ACADEMIC_ANALYSIS_2026-04.md) | Recommendation layer and architecture evolution analysis |
| [archive/reports/OPENRNA_HYPER_AUDIT_2026.md](archive/reports/OPENRNA_HYPER_AUDIT_2026.md) | Deep architecture and security findings pack |
| [archive/reports/OPENRNA_HARDENING_ROADMAP_2026.md](archive/reports/OPENRNA_HARDENING_ROADMAP_2026.md) | Sequenced hardening backlog |
| [archive/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md](archive/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md) | Naming and public-boundary cleanup audit |

## Historical Evidence

These files remain useful for diligence and archaeology, but they are not the primary routing path for current repository state.

| Historical memo | Why it still exists |
|-----------------|---------------------|
| [archive/reports/ISOLATION_CERTIFICATION_2026-03-30.md](archive/reports/ISOLATION_CERTIFICATION_2026-03-30.md) | Preserves the March 30 repository-isolation certification pass |
| [archive/reports/DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md](archive/reports/DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md) | Preserves the March 31 documentation reconciliation pass |
| [archive/reports/DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md](archive/reports/DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md) | Preserves the April 2 authority-analysis refresh |

## Reading Order

1. Start with [README.md](../README.md).
2. Read [design.md](design.md) for the system model and evidence tiers.
3. Use [API_REFERENCE.md](API_REFERENCE.md) and [OPERATIONS_AND_FAILURE_MODES.md](OPERATIONS_AND_FAILURE_MODES.md) for implementation and operator questions.
4. Use [archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md](archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md) when you need the formal evidence baseline and registry anchors.
5. Use [RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md](RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md) when you need the April 2026 payer-side signal without over-claiming operational rollout.
6. Use archived publication and audit docs for investor or maintainer diligence.
7. Read the historical memos only when you need provenance of earlier decisions.
