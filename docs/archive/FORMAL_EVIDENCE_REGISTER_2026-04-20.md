---
title: "OpenRNA Formal Evidence Register"
status: active-evidence
version: "1.1.0"
last_updated: "2026-04-20"
tags: [evidence, verification, fact-check, oncology, public-export]
evidence_cutoff: "2026-04-20"
---

# OpenRNA Formal Evidence Register

## Purpose

This register captures the current repository-grounded facts re-verified on April 20, 2026 for the standalone OpenRNA repository.

It exists to hold claims that drift faster than the main architecture memo: local verification metrics, toolchain baselines, port and adapter inventory, and live runtime-security posture.

## Method

This register uses four evidence lanes:

1. Repository-grounded inspection of `package.json`, `tsconfig.json`, `src/ports/*.ts`, `src/adapters/*.ts`, `src/types.ts`, `src/config.ts`, `src/auth.ts`, `src/bootstrap/security-posture.ts`, `src/app.ts`, and `src/routes/system.ts`.
2. Same-day local verification outputs reproduced on April 20, 2026 via `npm run ci`, `npm run test:coverage`, `npm audit --omit=dev --audit-level=high`, and `npm run sbom:cyclonedx:file` in the standalone repository.
3. Active-document reconciliation across `README.md`, `README.ru.md`, `docs/API_REFERENCE.md`, `docs/OPERATIONS_AND_FAILURE_MODES.md`, `docs/PUBLIC_ARCHITECTURE_INDEX.md`, and `docs/design.md`.
4. Carried-forward external anchors last independently verified on April 5, 2026 from official Node.js, TypeScript, and ClinicalTrials.gov sources.

## Verified Repository Facts

| Claim | Source surface | Verified state on 2026-04-20 |
|------|----------------|-------------------------------|
| Runtime baseline | `package.json`, `tsconfig.json` | Node `>=24`, npm `11.6.1`, `package.json` `type: "commonjs"`, TypeScript `module: "nodenext"` |
| Verification surface | `npm run ci`, `npm run test:coverage`, `npm audit --omit=dev --audit-level=high`, `npm run sbom:cyclonedx:file` | `494` tests across `22` suites; line coverage `94.43%`; branch coverage `82.91%`; function coverage `94.03%`; runtime audit clean; CycloneDX runtime SBOM generated |
| Port inventory | `src/ports/*.ts` | `18` port interfaces |
| Adapter inventory | `src/adapters/*.ts` | `23` adapters total: `17` in-memory plus `6` integration or persistence adapters |
| Case lifecycle vocabulary | `src/types.ts` | `16` case states |
| Startup security posture | `src/config.ts`, `src/bootstrap/security-posture.ts`, `src/auth.ts` | `REQUIRE_AUTH` enforces fail-fast startup unless API key or JWT auth is configured; strict mode rejects `RBAC_ALLOW_ALL=true`; probe routes remain auth-exempt |
| Probe and route inventory surface | `src/app.ts`, `src/routes/system.ts` | Root route inventory plus `/healthz`, `/readyz`, and `/metrics` remain wired in the Express composition root |
| Public automation surfaces | `.github/workflows/*.yml`, `.github/release.yml` | CI, CodeQL, dependency review, and supply-chain provenance workflows remain tracked repository surfaces |

## Carried-Forward External Anchors

These anchors were not re-queried in the April 20 local verification sweep. They remain carried forward from the April 5, 2026 official-source pass.

| Anchor | Official source | Last independently verified |
|-------|-----------------|-----------------------------|
| Node LTS baseline | Node.js Releases page | Node `24` is `Active LTS`; Node `22` is `Maintenance LTS` (`2026-04-05`) |
| TypeScript Node module guidance | TypeScript Modules Reference (updated March 31, 2026) | `node16`, `node18`, `node20`, and `nodenext` are the correct `module` options for Node apps; raw `commonjs` is not the recommended default (`2026-04-05`) |
| V940 / INTerpath-001 | ClinicalTrials.gov `NCT05933577` | Active, not recruiting; `1,089` estimated participants; `165` locations; primary completion estimated `2029-10-26` (`2026-04-05`) |
| Autogene cevumeran / IMCODE003 | ClinicalTrials.gov `NCT05968326` | Recruiting Phase 2 PDAC study; `260` estimated participants; `89` locations; primary completion estimated `2031-01-01` (`2026-04-05`) |

## Drift Boundary

The following evidence surfaces remain intentionally historical and preserve earlier repository snapshots:

- `FORMAL_EVIDENCE_REGISTER_2026-04-05.md`
- `reports/ISOLATION_CERTIFICATION_2026-03-30.md`
- `reports/DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md`
- `reports/DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md`

They are evidence artifacts, not the current baseline. The current baseline for public readers is:

1. `README.md`
2. `docs/design.md`
3. `docs/PUBLIC_ARCHITECTURE_INDEX.md`
4. this register
5. the April 2026 active docs under `docs/`

## Watch List

Recheck these claims when the underlying ground truth changes:

- test and coverage metrics after route, state-machine, persistence, or compliance-control work
- startup security posture after auth, RBAC, or middleware changes
- port and adapter counts after any new seam or durable adapter is introduced
- Node and TypeScript baseline after any LTS or compiler-guidance shift
- `NCT05933577` and `NCT05968326` at least quarterly while the trials are active
- public investor and audit docs whenever verification metrics or registry anchors move