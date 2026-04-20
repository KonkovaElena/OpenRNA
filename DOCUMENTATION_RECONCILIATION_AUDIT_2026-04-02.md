---
title: "Documentation Reconciliation Audit 2026-04-02"
status: "active-evidence"
version: "1.0.0"
last_updated: "2026-04-02"
tags: [documentation, audit, evidence, academic-analysis, regulatory, clinical-trials]
---

# Documentation Reconciliation Audit: OpenRNA (2026-04-02)

## Scope

This memo certifies the April 2, 2026 refresh of the OpenRNA authority analysis layer in `external/mRNA-standalone`.

Assessment boundary:
- [docs/ACADEMIC_ANALYSIS_2026-04.md](docs/ACADEMIC_ANALYSIS_2026-04.md)
- [docs/REGULATORY_CONTEXT.md](docs/REGULATORY_CONTEXT.md)
- direct repository seams referenced by the refreshed recommendation layer
- official-source spot checks for state-machine, regulatory, and trial-anchor language

Out of scope:
- sponsor-confidential CMC materials
- legal or regulatory opinions
- country-specific rollout claims not revalidated from stable primary sources in this pass

## Executive Verdict

The authority analysis layer is now materially tighter in three ways:

1. recommendation language is implementation-grounded rather than greenfield
2. Part 11 framing is tied to concrete April 2026 eCFR sections instead of broad compliance shorthand
3. stale operational phrasing about CI absence has been removed and replaced with the current tracked GitHub-native verification and provenance surfaces

This refresh did not widen the claim surface indiscriminately. Several candidate additions were intentionally withheld because they were not primary-source-stable enough for active documentation.

## Verification Table

| Dimension | Verified source | Finding | Result |
| --- | --- | --- | --- |
| XState recommendation framing | Stately / XState v5 docs | XState is currently documented as an XState v5 state-machine and actor library suitable for JavaScript and TypeScript applications | PASS |
| Part 11 current status | eCFR Title 21 Part 11 | eCFR displayed Title 21 as up to date as of 2026-03-31 and last amended 2026-03-25; §§11.10, 11.50, 11.70, 11.100, 11.200, and 11.300 remain the relevant hooks for this repo's gap framing | PASS |
| V940 registry anchor | ClinicalTrials.gov `NCT05933577` | High-risk melanoma Phase 3 program remains a live registry-backed anchor for intismeran autogene plus pembrolizumab | PASS |
| BNT-122 registry anchor | ClinicalTrials.gov `NCT05968326` | IMCODE003 remains the active registry-backed PDAC anchor for autogene cevumeran plus atezolizumab and mFOLFIRINOX | PASS |
| Nextflow positioning | Nextflow official overview docs | Nextflow continues to position itself as a portable, reproducible workflow system using asynchronous dataflow and execution abstraction across local, HPC, cloud, and Kubernetes targets | PASS |
| State-machine seam | `src/adapters/InMemoryStateMachineGuard.ts`, `tests/state-machine-guard.test.ts` | OpenRNA already ships explicit transition governance; XState is an evolution path, not a missing baseline | PASS |
| Auth and RBAC seam | `src/middleware/api-key-auth.ts`, `src/middleware/rbac-auth.ts`, `src/adapters/InMemoryRbacProvider.ts` | API-key and RBAC seams exist, but user-bound identity and mandatory fine-grained authorization do not | PASS |
| Signature seam | `src/ports/IAuditSignatureProvider.ts`, `src/adapters/InMemoryAuditSignatureProvider.ts` | Audit signing exists as a seam and HMAC helper, but not as a Part 11-grade electronic signature implementation | PASS |
| Orchestration seam | `src/supervision/PollingSupervisor.ts`, `src/adapters/NextflowWorkflowRunner.ts` | Polling-based orchestration exists; broker or webhook-driven orchestration is a future evolution, not a correction of a nonexistent layer | PASS |
| Public verification surfaces | `.github/workflows/*.yml`, `.github/release.yml` | CI, CodeQL, dependency review, provenance, and tag-driven release publication are now tracked repository surfaces | PASS |

## Corrections Now Reflected In Active Docs

### Recommendation framing

- [docs/ACADEMIC_ANALYSIS_2026-04.md](docs/ACADEMIC_ANALYSIS_2026-04.md) now includes a recommendation-status matrix that explicitly distinguishes `implemented`, `partially implemented`, and `missing` capabilities.
- XState is now framed as an evolution of the existing state-machine guard.
- Event sourcing is now framed as an evolution of the current state-oriented store plus audit trail.
- Event-driven orchestration is now framed as an evolution of the current polling and workflow-runner seams.

### Regulatory precision

- [docs/REGULATORY_CONTEXT.md](docs/REGULATORY_CONTEXT.md) now names the exact Part 11 hooks most relevant to OpenRNA's current gap analysis.
- The access-control row now reflects the real current state: API-key plus RBAC seam, but no per-user OIDC or JWT identity.
- The electronic-signature rows now reflect the existing audit-signature seam rather than describing the repository as having no signature boundary at all.

### Operational posture

- The academic analysis no longer says CI is absent. It now reflects the tracked GitHub Actions surfaces for build, test, coverage, audit, CodeQL, dependency review, and provenance or release automation.

### Source quality

- Weak source wording around the BNT-122 PDAC fact-check was removed.
- Search-count language now explicitly notes that ClinicalTrials.gov and PubMed tallies are point-in-time snapshots rather than evergreen market counters.

## Withheld Or Narrowed Claims

The following candidate additions were intentionally not promoted into active authority docs during this pass:

- country-specific rollout claims such as Neooncovac in Russia
- commercialization or approval timing promises stated as near-certainties
- a direct FDA CSA web URL whose current official path could not be stably re-confirmed during this pass
- new global candidate-count claims beyond the already-frozen point-in-time tallies in the active analysis

These claims may be added later, but only after a fresh primary-source verification pass.

## Relationship To Prior Audit

This memo does not overwrite [DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md](DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md). The March 31 memo remains the historical evidence layer for the earlier clinical, regulatory, and toolchain reconciliation pass. The April 2 memo records a narrower follow-on refresh centered on the authority analysis surface and recommendation discipline.

## Refresh Triggers

Refresh this memo and the linked authority docs if any of the following occur:

- a material architecture change lands in OpenRNA around state-machine runtime, event sourcing, auth identity, or orchestration
- ClinicalTrials.gov materially changes `NCT05933577` or `NCT05968326`
- FDA materially updates Part 11-adjacent software validation or electronic-signature guidance relevant to this repository
- a stable primary source is obtained for currently withheld country-level or commercialization claims

## Certification Statement

As of 2026-04-02, the OpenRNA authority analysis layer is reconciled to the current repository state for the recommendation areas touched in this refresh, and the regulatory and clinical anchors named above were rechecked against current official sources.

This memo certifies documentation accuracy for engineering, planning, and publication-discipline use. It does not constitute legal, regulatory, clinical, or investment advice.