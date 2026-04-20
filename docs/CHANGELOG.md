---
title: "OpenRNA Changelog"
status: "active"
version: "1.0.0"
last_updated: "2026-04-05"
tags: [changelog, releases, public-export]
---

# Changelog

This changelog tracks public repository changes that matter to release consumers and technical-diligence readers.

It is intentionally scoped to the standalone OpenRNA repository and excludes private investor annex material.

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