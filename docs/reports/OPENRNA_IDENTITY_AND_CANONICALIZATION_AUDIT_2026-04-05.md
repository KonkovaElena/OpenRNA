---
title: "OpenRNA Identity And Canonicalization Audit 2026-04-05"
status: active-evidence
version: "1.0.0"
last_updated: "2026-04-05"
tags: [openrna, naming, topology, audit, repository-hygiene]
mode: evidence
evidence_cutoff: "2026-04-05"
---

# OpenRNA Identity And Canonicalization Audit

## Scope

This memo records the April 5, 2026 pass to unify the standalone repository on one OpenRNA name, remove legacy workspace-path leakage from active or semi-active documentation, and confirm the current repository topology after the local cleanup.

Assessed surfaces:

- runtime identity strings and bootstrap output
- system root JSON identity and metrics namespace
- architecture and evidence documents with legacy `mRNA-standalone` wording
- repository navigation surfaces in `README.md`
- local repository hygiene for generated SBOM artifacts

Out of scope:

- GitHub-hosted settings in the web UI
- product-scope refactors unrelated to naming or repository topology
- historical log files ignored by the repository

## Executive Verdict

The standalone repository now has one human-facing product name: OpenRNA.

The cleanup normalized four drift classes:

1. runtime identity strings no longer expose `personalized-mrna-control-plane`;
2. metrics now use the `openrna_*` namespace instead of `human_mrna_*`;
3. authority and evidence documents no longer present `external/mRNA-standalone` as an active repository identity;
4. historical topology memos are explicitly historical rather than active routing surfaces.

Two exceptions are intentional and were preserved:

1. the package slug `openrna` remains lowercase where technical ecosystems require it;
2. domain descriptions such as `personalized neoantigen RNA vaccine workflows` remain descriptive product context, not competing names.

## What Changed

| Surface | Before | After |
| --- | --- | --- |
| Runtime bootstrap | `personalized-mrna-control-plane listening ...` | `OpenRNA listening ...` |
| Root system identity | `personalized-mrna-control-plane` | `OpenRNA` |
| Metrics namespace | `human_mrna_*` | `openrna_*` |
| Design authority title | `Personalized Neoantigen RNA Platform Design` | `OpenRNA Platform Design` |
| README evidence routing | historical isolation memo linked as active doc | active routing now points to this April 5 audit |
| Historical evidence status | `active-evidence` on older topology or reconciliation memos | `historical-evidence` where the file is now primarily archaeological |

## Historical-Evidence Boundary

The following files remain valuable, but should be read as dated evidence rather than as current routing docs:

- `DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md`
- `DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md`
- `ISOLATION_CERTIFICATION_2026-03-30.md`

The reason is simple: they describe earlier repo states, earlier workspace topology, or earlier documentation passes. They are still useful, but they are no longer the current identity surface for OpenRNA.

## Repository Hygiene Notes

- `openrna-runtime-sbom.cdx.json` is now ignored as a generated local artifact. Release evidence still comes from the tracked provenance workflow and explicit SBOM generation commands.
- Local scratch logs remain ignored through `*.log`; they are not part of the product identity surface.

## Verification Snapshot

The repository state used during this audit passed the local standalone engineering lane:

- `npm run build`
- `npm test`
- `npm run test:coverage`
- `npm audit --omit=dev --audit-level=high`
- `npm run sbom:cyclonedx:file`

Result snapshot from the audited working tree:

- tests: `440/440` passing
- coverage: `95.10%` lines, `83.18%` branches, `94.84%` functions
- runtime audit: `0 vulnerabilities`

## Certification Statement

As of 2026-04-05, the standalone repository presents one coherent product identity: OpenRNA. Legacy workspace-path wording and competing runtime names were either removed, normalized, or explicitly downgraded to historical evidence status.