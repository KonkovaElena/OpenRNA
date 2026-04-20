# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Control-plane for personalized neoantigen RNA vaccine workflows.**

440 tests. 95.0% line coverage. 17 domain ports. Zero runtime vulnerabilities. Apache-2.0.

## What This Is

A production-shaped control-plane slice covering Phases 1–2 of a personalized neoantigen RNA vaccine workflow: patient case intake → molecular profiling orchestration → neoantigen ranking → construct design → expert review → manufacturing handoff → outcome tracking.

The two largest clinical programs in this space — Moderna/Merck's V940 (INTerpath-001, 1,089 patients across 165 sites) and BioNTech's autogene cevumeran (IMCODE003) — demonstrate exactly the kind of per-patient operational complexity that a control plane manages: consent state, sample provenance, reference-bundle versioning, review packets, handoff traceability, outcome linkage.

**What it is not**: a bioinformatics pipeline, an RNA sequence designer, or a clinical decision system. Those are upstream/downstream systems that this platform orchestrates through well-defined port interfaces.

See [`design.md`](design.md) for full architecture and evidence classification.

## Start Here

- [`docs/PUBLIC_ARCHITECTURE_INDEX.md`](docs/PUBLIC_ARCHITECTURE_INDEX.md) routes external readers to the right active and evidence docs.
- [`design.md`](design.md) is the authority architecture memo with T1-T4 evidence tiers.
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) groups the public HTTP surface, headers, and response conventions.
- [`docs/OPERATIONS_AND_FAILURE_MODES.md`](docs/OPERATIONS_AND_FAILURE_MODES.md) explains runtime modes, probes, and the main operational failure classes.
- [`docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md`](docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md) defines the public-export boundary and current diligence posture.
- [`docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md`](docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md) records the currently re-verified repository metrics and external fact anchors.

## Implemented Capabilities

- Case registry with 15-state lifecycle (`INTAKING` → `HANDOFF_PENDING`)
- Sample and artifact provenance (tumor DNA/RNA, normal DNA, derived artifacts)
- Workflow orchestration with idempotent submission (`x-idempotency-key`)
- Nextflow integration port for external pipeline execution
- Polling supervisor for workflow run monitoring
- Reference bundle registry pinned to workflow runs
- Multi-tool HLA consensus with configurable disagreement thresholds
- QC gate evaluation on completed runs
- Neoantigen ranking persistence port
- Multi-modality construct design (mRNA, saRNA, circRNA) with modality governance
- Expert review / tumor-board packet generation
- Manufacturing handoff packet generation from approved reviews
- Outcome timeline (administration, immune monitoring, clinical follow-up)
- Full traceability with machine-readable audit events
- Operations: `/healthz`, `/readyz`, `/metrics`, `/api/operations/summary`

## Non-Goals In This Slice

- Neoantigen prediction (delegated to external tools via `INeoantigenRankingEngine`)
- Rank aggregation algorithms
- Cross-resource transactional outbox coordination

## Architecture

- **17 domain port interfaces** abstracting all external dependencies
- **Dual adapter strategy**: in-memory (default) + PostgreSQL for durable persistence
- **Dependency injection** via `AppDependencies` factory — no runtime coupling to implementations
- **Zod runtime validation** on all API inputs
- **Structured error contract** (`ApiError` with operator codes and HTTP mapping)

See [`design.md § Architecture`](design.md) for the full port list and layer diagram.

## Technology Stack

| Component | Version | Note |
|-----------|---------|------|
| Node.js | 24.x Active LTS | Public baseline validated locally on 24.11.0 |
| TypeScript | 6.0.2 | Strict mode, `module: "nodenext"`, runtime remains CommonJS via `package.json` |
| Express | 5.x | Native async error handling |
| Zod | 4.x | Runtime validation |
| pg | 8.x | PostgreSQL client |
| node:test | built-in | Test runner (no Jest/Vitest) |

## Environment

Source of truth: [`src/config.ts`](src/config.ts) (Zod-validated, fail-fast on startup).

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4010` | HTTP listener port |
| `CASE_STORE_DATABASE_URL` | unset | PostgreSQL for durable case persistence. Omit for in-memory |
| `CASE_STORE_TABLE_NAME` | `case_records` | PostgreSQL table name |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | PostgreSQL for workflow dispatch recording. Omit for in-memory |
| `WORKFLOW_DISPATCH_TABLE_NAME` | `workflow_dispatches` | PostgreSQL table name |
| `API_KEY` | unset | Optional API key for request authentication (constant-time comparison) |

## Quickstart

```bash
npm ci
npm run build
npm test
npm run test:coverage
npm run sbom:cyclonedx:file
npm run dev
```

Leave database URLs blank for the in-memory path. Set `CASE_STORE_DATABASE_URL` and/or `WORKFLOW_DISPATCH_DATABASE_URL` for PostgreSQL-backed persistence.

## Public Repository Surfaces

- [`CONTRIBUTING.md`](CONTRIBUTING.md) defines the change and verification lanes.
- [`SECURITY.md`](SECURITY.md) explains supported versions and private vulnerability reporting.
- [`SUPPORT.md`](SUPPORT.md) routes usage questions and clarifies out-of-scope requests.
- [`RELEASE.md`](RELEASE.md) defines the release contract and consumer verification path.
- [`CHANGELOG.md`](CHANGELOG.md) tracks public repository changes that matter to release consumers and diligence readers.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) defines expected participation norms.
- [`CITATION.cff`](CITATION.cff) defines citation metadata for research and diligence workflows.
- [`.github/CODEOWNERS`](.github/CODEOWNERS) establishes review ownership for the standalone repository.
- [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE) provides structured bug and feature intake forms.
- [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) defines the review and evidence checklist.
- [`.github/release.yml`](.github/release.yml) configures GitHub autogenerated release-note categories.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs build, tests, coverage, `npm audit`, and a `/healthz` smoke check on Node 24.
- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) adds GitHub-native SAST scanning for JavaScript and TypeScript.
- [`.github/workflows/dependency-review.yml`](.github/workflows/dependency-review.yml) blocks pull requests that introduce high-severity runtime dependency risk.
- [`.github/workflows/supply-chain-provenance.yml`](.github/workflows/supply-chain-provenance.yml) publishes an attestable build bundle, CycloneDX SBOM, checksums, GitHub-native attestations, and release assets on semver tags.

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/PUBLIC_ARCHITECTURE_INDEX.md`](docs/PUBLIC_ARCHITECTURE_INDEX.md) | Public router for active docs, evidence packs, and historical audit surfaces |
| [`design.md`](design.md) | Authority architecture document for OpenRNA with 4-tier evidence classification |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | Grouped HTTP route map, auth headers, and response conventions |
| [`docs/OPERATIONS_AND_FAILURE_MODES.md`](docs/OPERATIONS_AND_FAILURE_MODES.md) | Runtime modes, health probes, metrics, and common operational failure classes |
| [`docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md`](docs/FORMAL_EVIDENCE_REGISTER_2026-04-05.md) | Current verified metrics, toolchain facts, and registry anchors refreshed on April 5, 2026 |
| [`docs/REGULATORY_CONTEXT.md`](docs/REGULATORY_CONTEXT.md) | FDA/EMA/Part 11/GMP mapping and compliance gap analysis |
| [`docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md`](docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md) | Clinical evidence, competitor landscape, HLA/neoantigen tool catalog |
| [`docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md`](docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md) | Dependency versions, migration decisions, bioinformatics ecosystem |
| [`docs/GITHUB_MAINTAINER_BASELINE_2026-04.md`](docs/GITHUB_MAINTAINER_BASELINE_2026-04.md) | GitHub-side settings baseline for branch protection and security controls |
| [`docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md`](docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md) | April 2026 publication audit, investor-facing technical narrative, and export scope |
| [`docs/INVESTOR_ONE_PAGER_2026-04.md`](docs/INVESTOR_ONE_PAGER_2026-04.md) | Investor technical summary with market context & hard numbers |
| [`docs/reports/OPENRNA_HYPER_AUDIT_2026.md`](docs/reports/OPENRNA_HYPER_AUDIT_2026.md) | Academic-grade hyper audit of architecture, security, persistence, and control gaps |
| [`docs/reports/OPENRNA_HARDENING_ROADMAP_2026.md`](docs/reports/OPENRNA_HARDENING_ROADMAP_2026.md) | Sequenced hardening program derived from the April 2026 audit |
| [`docs/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md`](docs/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md) | Naming unification and repository-topology audit for the April 2026 OpenRNA cleanup |

## Historical Evidence

These files remain in the repository for diligence and archaeology, but they are not part of the primary routing path for current readers.

- [`ISOLATION_CERTIFICATION_2026-03-30.md`](ISOLATION_CERTIFICATION_2026-03-30.md) preserves the March 30 repository isolation certification.
- [`DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md`](DOCUMENTATION_RECONCILIATION_AUDIT_2026-03-31.md) preserves the March 31 documentation reconciliation pass.
- [`DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md`](DOCUMENTATION_RECONCILIATION_AUDIT_2026-04-02.md) preserves the April 2 authority-analysis refresh.

## API Surface

See [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) for the full grouped route map, auth expectations, error-envelope caveats, and operational endpoints.

At a high level, the public surface is split into:

- case registry and provenance
- workflow execution and QC
- neoantigen ranking and construct design
- review, handoff, and outcomes
- governance, consent, audit, and FHIR export
- modalities, operations summary, and system probes