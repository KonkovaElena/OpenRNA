---
title: "Documentation Reconciliation Audit 2026-03-31"
status: "historical-evidence"
version: "1.0.0"
last_updated: "2026-03-31"
tags: [documentation, audit, evidence, regulatory, toolchain, clinical-trials]
---

# Documentation Reconciliation Audit: OpenRNA

## Scope

This memo captures the March 31, 2026 reconciliation pass for the standalone OpenRNA repository.

Assessment boundary:
- routing and explanation surfaces: `README.md`, `design.md`
- evidence and reference surfaces: `docs/REGULATORY_CONTEXT.md`, `docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md`, `docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md`
- out of scope: formal legal opinions, sponsor-confidential CMC materials, and product-specific FDA or EMA correspondence that is not published in primary sources

## Executive Verdict

The active documentation layer is materially reconciled with both:
- the current repository state (`openrna`, Express 5, TypeScript 6, CommonJS runtime)
- the March 31, 2026 primary-source baseline used for clinical, regulatory, and toolchain claims

Three stale-claim classes are closed in the active surface:
1. incorrect registry anchors for late-stage V940 and BNT-122 programs
2. overbroad 21 CFR Part 11 wording
3. misleading TypeScript module guidance that implied `CommonJS` or `bundler + CommonJS` was the canonical modern Node recommendation

A targeted repo-local sweep found no remaining active references to superseded trial IDs `NCT04486378`, `NCT06220981`, or `NCT06548841`.

## Verification Table

| Dimension | Verified source | Finding | Result |
| --- | --- | --- | --- |
| Repo identity | `package.json`, `README.md` | Repo is documented as `openrna` with Node `>=22`, Express 5, and TypeScript 6 | PASS |
| Design and toolchain alignment | `design.md`, `docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md` | `CommonJS` is explicitly described as a repo-local compatibility choice, not official TypeScript best practice | PASS |
| V940 registry anchor | ClinicalTrials.gov `NCT05933577` | Active-not-recruiting high-risk melanoma study `V940-001` / intismeran autogene plus pembrolizumab | PASS |
| BNT-122 PDAC registry anchor | ClinicalTrials.gov `NCT05968326` | Recruiting Phase 2 `IMCODE003` study in resected PDAC, autogene cevumeran plus atezolizumab and mFOLFIRINOX versus mFOLFIRINOX | PASS |
| FDA Part 11 scope | FDA `Part 11, Electronic Records; Electronic Signatures - Scope and Application` guidance | FDA states Part 11 should be interpreted narrowly and applies when predicate-rule records or signatures are maintained or submitted electronically | PASS |
| EMA ATMP framing | EMA ATMP overview | EMA presents ATMP scope through defined categories and CAT or CHMP assessment processes, supporting case-specific framing instead of blanket assumptions | PASS |
| Residual stale IDs | Repo-local sweep | No active matches for superseded trial IDs or equivalent stale wording | PASS |

## Corrections Now Reflected In Active Docs

### Clinical evidence

- `design.md` and `docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md` now anchor Moderna and Merck's late-stage melanoma program to `NCT05933577` (`V940-001` / `INTerpath-001`) instead of stale identifiers.
- The BioNTech and Genentech PDAC program is now anchored to `NCT05968326` (`IMCODE003`) and described as a registry-backed adjuvant study in resected PDAC.

### Regulatory framing

- `docs/REGULATORY_CONTEXT.md` now treats 21 CFR Part 11 as predicate-rule-triggered and narrowly interpreted, consistent with FDA guidance.
- The EU section no longer claims blanket CAT classification or product type without product-specific evidence; it keeps ATMP treatment as a case-specific analysis problem.

### Toolchain framing

- `design.md`, `README.md`, and `docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md` now align on the live repo state: Node 22, Express 5, TypeScript 6, and `module: "CommonJS"`.
- The toolchain note explicitly records that TypeScript's current Node guidance prefers `node16`, `node18`, or `nodenext`, while this repo temporarily remains on `CommonJS` for compatibility.

## Remaining Uncertainties

These areas are intentionally left as uncertainties rather than claims:

- no formal FDA statement in this repo establishes a streamlined BLA path for individualized neoantigen vaccines
- no public EMA or CAT product-specific classification document is cited for this repository's hypothetical product
- current registry statuses are point-in-time snapshots and should be refreshed after public protocol amendments or major readouts
- the current TypeScript configuration is operationally valid for this repo, but it is not the terminal design choice for a future Node-native module migration

## Refresh Triggers

Refresh this memo and the companion docs if any of the following changes occur:

- ClinicalTrials.gov materially changes the status, title, or identifiers for `NCT05933577` or `NCT05968326`
- a public FDA guidance, meeting summary, or approval surface materially changes the regulatory baseline for individualized cancer vaccines
- EMA or CAT publishes product-specific classification or new ATMP guidance materially affecting RNA cancer vaccines
- the repository migrates away from `CommonJS`
- new Phase 3 or registrational readouts materially change the evidence hierarchy

## Certification Statement

As of 2026-03-31, the active documentation surface of the standalone OpenRNA repository was reconciled to the then-current repo state and to the specific primary-source checks performed for clinical registry anchors, FDA Part 11 scope, EMA ATMP framing, and TypeScript module guidance.

This memo certifies documentation accuracy for engineering and planning use. It does not constitute legal, regulatory, clinical, or investment advice.