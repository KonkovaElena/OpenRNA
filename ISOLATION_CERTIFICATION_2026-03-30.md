---
title: "OpenRNA Repository Topology Certification 2026-03-30"
status: "historical-evidence"
version: "1.0.0"
last_updated: "2026-03-30"
tags: [isolation, audit, evidence, standalone, mrna]
---

# Repository Topology Certification: OpenRNA

> Historical evidence only.
> Current public routing starts at [README.md](README.md) and [docs/PUBLIC_ARCHITECTURE_INDEX.md](docs/PUBLIC_ARCHITECTURE_INDEX.md).
> Current publication posture lives in [docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md](docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md).

## Scope

This memo preserves the March 30, 2026 evidence about the standalone OpenRNA repository topology and the linked comparison worktree that existed during that certification pass.

Assessment boundary:
- keeper candidate: the standalone OpenRNA repository
- non-keeper comparator: the linked comparison worktree used during the certification pass
- out of scope: the parent workspace, except where cross-repository coupling had to be detected and removed

## Executive Verdict

The standalone OpenRNA repository satisfied the practical isolation goal at the time of certification.

The repository now passes all five required rails:
- Git isolation
- install isolation
- build isolation
- test isolation
- runtime isolation

The linked comparison worktree remained structurally non-isolated because its `.git` entry was a gitfile pointing into the keeper repository's worktree storage rather than owning an independent `.git` directory.

## Truth Table

| Dimension | Keeper status | Evidence | Result |
| --- | --- | --- | --- |
| Git isolation | Own hidden `.git` directory, not a gitfile | `Get-Item -Force .git`, `git rev-parse --show-toplevel`, `git rev-parse --git-dir` | PASS |
| Git integrity | Object and ref graph healthy | `git fsck --full` | PASS |
| Repository root purity | `HEAD` tree contains only standalone package files at repo root | `git ls-tree --name-only HEAD` | PASS |
| Remote independence | No configured remotes observed during certification | `git remote -v` | PASS |
| Install isolation | Local lockfile reproduces dependencies cleanly | `npm ci` | PASS |
| Build isolation | Local TypeScript build succeeds after clean install | `npm run build` | PASS |
| Test isolation | Full standalone suite passes after clean install | `npm test` -> `276/276` passing | PASS |
| Runtime isolation | Start script launches emitted artifact and serves HTTP | `npm start`, `GET /healthz` -> `200 {"status":"ok"}` | PASS |
| Documentation isolation | No root-level markdown links escape the repository boundary | `tests/isolation-docs.test.ts` | PASS |
| Shutdown correctness | Server shutdown waits for resource cleanup before resolving | `tests/runtime-shutdown.test.ts` | PASS |
| Start-script correctness | `package.json` start command matches emitted TypeScript entrypoint | `tests/start-script.test.ts` | PASS |

## Keeper Changes Required To Reach PASS

The keeper needed three concrete fixes before it could be certified:

1. Start-script/output drift fixed.
   `package.json` previously started `dist/index.js`, while the actual emitted entrypoint was `dist/src/index.js`.

2. Shutdown sequencing hardened.
   `src/index.ts` previously initiated server close without awaiting downstream resource cleanup. The keeper now uses a dedicated shutdown helper and an idempotent shutdown promise.

3. Cross-repository documentation coupling removed.
   `design.md` previously linked to a root-workspace planning document outside the standalone repository.

## Delta Classification Against The Linked Worktree

### A. Correctness deltas already absorbed into the keeper

These differences were required for a defensible isolated keeper and were closed in the standalone OpenRNA repository:
- emitted entrypoint validation and corrected `package.json` start target
- awaited shutdown sequencing via `src/runtime-shutdown.ts`
- idempotent signal-driven shutdown handling in bootstrap
- removal of root-crossing markdown linkage in `design.md`

### B. Optional hardening still present mainly in the linked worktree

These differences are not required to certify isolation:
- shared-pool optimization when case-store and dispatch URLs are equal
- runtime adapter consolidation into a single `createRuntimeAdapters()` path

These are performance or operational refinements, not isolation blockers.

### C. Feature-expansion deltas still present mainly in the linked worktree

These are additive capabilities and should not be confused with isolation requirements:
- dispatch transition and recoverability HTTP surfaces
- evidence-lineage and orchestration-plan endpoints
- orchestration execution route additions
- newer wave-specific tests tied to those feature surfaces

These belong to a separate product-scope decision, not to isolation certification.

### D. Non-keeper structural blocker

The linked comparison worktree failed the keeper test at the repository-topology layer:
- its `.git` entry is a gitfile, not a real `.git` directory
- that gitfile pointed into the keeper repository's `.git/worktrees/...` storage

Therefore it can be a useful comparison worktree, but it cannot be certified as the single isolated repository without first being re-materialized as an independent Git repository.

## Remaining Blockers

No blocker remained for certifying the standalone OpenRNA repository as the isolated keeper.

Remaining work, if desired, is elective:
- port additional feature surfaces from the linked worktree into the keeper
- create a new independent repository if the linked worktree itself must survive as a portable artifact

## Certification Statement

As of 2026-03-30, the standalone OpenRNA repository was the only verified isolated repository variant in this workspace.

Historical note: the linked comparison worktree discussed in this memo was later removed during the April 5, 2026 repository canonicalization pass. This file remains as evidence of the earlier topology review, not as a current routing document.

The certification is grounded in direct repository-state inspection, clean reinstall, full rebuild, full test execution, and live HTTP runtime verification inside the standalone repository itself.