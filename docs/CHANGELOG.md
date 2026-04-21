---
title: "OpenRNA Changelog"
status: "active"
version: "1.1.0"
last_updated: "2026-04-21"
tags: [changelog, releases, public-export]
---

# Changelog

This changelog tracks public repository changes that matter to release consumers and technical-diligence readers.

It is intentionally scoped to the standalone OpenRNA repository and excludes private investor annex material.

## [0.1.1] - 2026-04-21

### Added

- Dedicated final-release endpoint `POST /api/cases/:caseId/final-releases` for regulated release authorization before manufacturing handoff.
- Consumer migration note in [docs/archive/reports/BREAKING_CHANGES_2026-04-21.md](archive/reports/BREAKING_CHANGES_2026-04-21.md).
- Fresh evidence cut in [docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md](archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md).

### Changed

- Approved review outcomes now move a case to `AWAITING_FINAL_RELEASE` rather than directly to handoff readiness.
- Manufacturing handoff now requires an approved review, stored construct design, recorded final release, and `requestedBy` matching the final releaser.
- Auth, RBAC, and case-access denials now use the shared `ApiError` envelope `{ code, message, nextStep, correlationId }`.
- README evidence links now point to the April 21, 2026 verification snapshot instead of the missing April 20 path.

### Compatibility Notes

- Any client that previously called handoff immediately after `review-outcomes` approval must insert `POST /api/cases/:caseId/final-releases` first.
- Any UI or SDK that parsed legacy auth/RBAC error payloads such as `{ error, detail }` must switch to the normalized `ApiError` contract.

### Verification

- Re-verified on 2026-04-21 via `npm run ci`, `npm run test:coverage`, and `npm run sbom:cyclonedx:file`.
- Current baseline: `504` tests across `22` suites, line coverage `94.49%`, branch coverage `82.88%`, function coverage `94.11%`, runtime audit clean.

## [0.1.0] - 2026-04-05

### Added

- Public docs router in [docs/PUBLIC_ARCHITECTURE_INDEX.md](docs/PUBLIC_ARCHITECTURE_INDEX.md).
- Dedicated HTTP route reference in [docs/API_REFERENCE.md](docs/API_REFERENCE.md).
- Dedicated runtime and failure-mode guide in [docs/OPERATIONS_AND_FAILURE_MODES.md](docs/OPERATIONS_AND_FAILURE_MODES.md).
- Formal evidence register in [docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md](docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md).
- Explicit historical-evidence routing in the public README and the retained audit memos.

### Changed

- [README.md](README.md) now routes readers to active docs instead of carrying the full endpoint inventory inline.
- Historical topology and reconciliation memos are now explicitly framed as evidence, not active routing documents.
- Public metrics and toolchain claims are refreshed against the April 5, 2026 verification lane and official source pass.

### Security And Supply Chain

- The public baseline continues to ship GitHub-native CI, CodeQL, dependency review, CycloneDX SBOM generation, and provenance workflows.

### Notes

- This version represents a public technical-diligence baseline, not a clinical deployment claim.