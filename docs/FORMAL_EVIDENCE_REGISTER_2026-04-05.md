---
title: "OpenRNA Formal Evidence Register"
status: active-evidence
version: "1.0.0"
last_updated: "2026-04-05"
tags: [evidence, verification, fact-check, oncology, public-export]
evidence_cutoff: "2026-04-05"
---

# OpenRNA Formal Evidence Register

## Purpose

This register captures the current facts re-verified on April 5, 2026 for the standalone OpenRNA repository.

It exists to hold claims that drift faster than the main architecture memo: local verification metrics, toolchain baselines, and external registry anchors.

## Method

This register uses three evidence lanes:

1. Repository-grounded inspection of `package.json`, `tsconfig.json`, `src/ports/*.ts`, `src/adapters/*.ts`, `src/types.ts`, `src/app.ts`, `src/routes/system.ts`, and tracked GitHub workflow files.
2. Local verification outputs reproduced on April 5, 2026 via `npm test`, `npm run test:coverage`, and the earlier same-day `npm run ci` pass in the standalone repository.
3. Official external sources: Node.js releases, TypeScript Modules Reference, and ClinicalTrials.gov entries `NCT05933577` and `NCT05968326`.

## Verified Repository Facts

| Claim | Source surface | Verified state on 2026-04-05 |
|------|----------------|-------------------------------|
| Runtime baseline | `package.json`, `tsconfig.json` | Node `>=24`, npm `11.6.1`, `package.json` `type: "commonjs"`, TypeScript `module: "nodenext"` |
| Verification surface | `npm test`, `npm run test:coverage`, earlier same-day `npm run ci` | `440` tests across `22` suites; line coverage `95.00%`; branch coverage `83.44%`; function coverage `94.94%`; runtime audit clean |
| Port inventory | `src/ports/*.ts` | `17` port interfaces |
| Adapter inventory | `src/adapters/*.ts` | `20` adapters total: `16` in-memory plus `4` integration/persistence adapters |
| Case lifecycle vocabulary | `src/types.ts` | `15` case states |
| Probe and route inventory surface | `src/app.ts`, `src/routes/system.ts` | Root route inventory plus `/healthz`, `/readyz`, and `/metrics` remain wired in the Express composition root |
| Public automation surfaces | `.github/workflows/*.yml`, `.github/release.yml` | CI, CodeQL, dependency review, and supply-chain provenance workflows are tracked repository surfaces |

## Verified External Anchors

| Anchor | Official source | Verified state on 2026-04-05 |
|-------|-----------------|-------------------------------|
| Node LTS baseline | Node.js Releases page | Node `24` is `Active LTS`; Node `22` is `Maintenance LTS` |
| TypeScript Node module guidance | TypeScript Modules Reference (updated March 31, 2026) | `node16`, `node18`, `node20`, and `nodenext` are the correct `module` options for Node apps; raw `commonjs` is not the recommended default |
| V940 / INTerpath-001 | ClinicalTrials.gov `NCT05933577` | Active, not recruiting; `1,089` estimated participants; `165` locations; primary completion estimated `2029-10-26` |
| Autogene cevumeran / IMCODE003 | ClinicalTrials.gov `NCT05968326` | Recruiting Phase 2 PDAC study; `260` estimated participants; `89` locations; primary completion estimated `2031-01-01` |

## Drift Boundary

The following root-level memos remain intentionally historical and preserve earlier repository snapshots:

- `ISOLATION_CERTIFICATION_2026-03-30.md`
- `DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md`
- `DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md`

They are evidence artifacts, not the current baseline. The current baseline for public readers is:

1. `README.md`
2. `design.md`
3. `docs/PUBLIC_ARCHITECTURE_INDEX.md`
4. this register
5. the April 2026 active docs under `docs/`

## Watch List

Recheck these claims when the underlying ground truth changes:

- test and coverage metrics after route, state-machine, or persistence work
- Node and TypeScript baseline after any LTS or compiler-guidance shift
- `NCT05933577` and `NCT05968326` at least quarterly while the trials are active
- public investor and audit docs whenever verification metrics or registry anchors move