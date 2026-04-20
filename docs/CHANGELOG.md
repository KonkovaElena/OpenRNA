---
title: "OpenRNA Changelog"
status: "active"
version: "1.1.0"
last_updated: "2026-04-20"
tags: [changelog, releases, public-export]
---

# Changelog

This changelog tracks public repository changes that matter to release consumers and technical-diligence readers.

It is intentionally scoped to the standalone OpenRNA repository and excludes private investor annex material.

## [0.1.0] - 2026-04-05

## [0.1.1] - 2026-04-20

### Added

- April 20 formal evidence register in [archive/FORMAL_EVIDENCE_REGISTER_2026-04-20.md](archive/FORMAL_EVIDENCE_REGISTER_2026-04-20.md).

### Changed

- [README.md](../README.md) and [README.ru.md](../README.ru.md) now reflect the April 20 verification lane (`494` tests across `22` suites) and the strict startup security posture.
- [API_REFERENCE.md](API_REFERENCE.md) and [OPERATIONS_AND_FAILURE_MODES.md](OPERATIONS_AND_FAILURE_MODES.md) now document `REQUIRE_AUTH` fail-fast behavior and the `RBAC_ALLOW_ALL` incompatibility in strict mode.
- [design.md](design.md) now reflects the `16`-state lifecycle, `18` port interfaces, consent-driven lifecycle handling, and current verification metrics.
- [PUBLIC_ARCHITECTURE_INDEX.md](PUBLIC_ARCHITECTURE_INDEX.md) now routes active readers to the April 20 evidence register while keeping the April 5 register as historical evidence.

### Added

- Public docs router in [PUBLIC_ARCHITECTURE_INDEX.md](PUBLIC_ARCHITECTURE_INDEX.md).
- Dedicated HTTP route reference in [API_REFERENCE.md](API_REFERENCE.md).
- Dedicated runtime and failure-mode guide in [OPERATIONS_AND_FAILURE_MODES.md](OPERATIONS_AND_FAILURE_MODES.md).
- Formal evidence register in [archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md](archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md).
- Explicit historical-evidence routing in the public README and the retained audit memos.

### Changed

- [README.md](../README.md) now routes readers to active docs instead of carrying the full endpoint inventory inline.
- Historical topology and reconciliation memos are now explicitly framed as evidence, not active routing documents.
- Public metrics and toolchain claims are refreshed against the April 5, 2026 verification lane and official source pass.

### Security And Supply Chain

- The public baseline continues to ship GitHub-native CI, CodeQL, dependency review, CycloneDX SBOM generation, and provenance workflows.

### Notes

- This version represents a public technical-diligence baseline, not a clinical deployment claim.