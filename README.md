# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Control-plane for personalized neoantigen RNA vaccine workflows.**

430 tests. 94.8% line coverage. 17 domain ports. Zero runtime vulnerabilities. Apache-2.0.

## What This Is

A production-shaped control-plane slice covering Phases 1–2 of a personalized neoantigen RNA vaccine workflow: patient case intake → molecular profiling orchestration → neoantigen ranking → construct design → expert review → manufacturing handoff → outcome tracking.

The two largest clinical programs in this space — Moderna/Merck's V940 (INTerpath-001, 1,089 patients across 165 sites) and BioNTech's autogene cevumeran (IMCODE003) — demonstrate exactly the kind of per-patient operational complexity that a control plane manages: consent state, sample provenance, reference-bundle versioning, review packets, handoff traceability, outcome linkage.

**What it is not**: a bioinformatics pipeline, an RNA sequence designer, or a clinical decision system. Those are upstream/downstream systems that this platform orchestrates through well-defined port interfaces.

See [`design.md`](design.md) for full architecture and evidence classification.

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
| [`design.md`](design.md) | Authority architecture document for OpenRNA with 4-tier evidence classification |
| [`docs/REGULATORY_CONTEXT.md`](docs/REGULATORY_CONTEXT.md) | FDA/EMA/Part 11/GMP mapping and compliance gap analysis |
| [`docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md`](docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md) | Clinical evidence, competitor landscape, HLA/neoantigen tool catalog |
| [`docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md`](docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md) | Dependency versions, migration decisions, bioinformatics ecosystem |
| [`docs/GITHUB_MAINTAINER_BASELINE_2026-04.md`](docs/GITHUB_MAINTAINER_BASELINE_2026-04.md) | GitHub-side settings baseline for branch protection and security controls |
| [`docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md`](docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md) | April 2026 publication audit, investor-facing technical narrative, and export scope |
| [`docs/INVESTOR_ONE_PAGER_2026-04.md`](docs/INVESTOR_ONE_PAGER_2026-04.md) | Investor technical summary with market context & hard numbers |
| [`docs/reports/OPENRNA_HYPER_AUDIT_2026.md`](docs/reports/OPENRNA_HYPER_AUDIT_2026.md) | Academic-grade hyper audit of architecture, security, persistence, and control gaps |
| [`docs/reports/OPENRNA_HARDENING_ROADMAP_2026.md`](docs/reports/OPENRNA_HARDENING_ROADMAP_2026.md) | Sequenced hardening program derived from the April 2026 audit |
| [`docs/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md`](docs/reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md) | Naming unification and repository-topology audit for the April 2026 OpenRNA cleanup |

## API Surface

### Case Management
- `POST /api/cases` — Create case
- `GET /api/cases` — List cases
- `GET /api/cases/:caseId` — Get case

### Samples and Artifacts
- `POST /api/cases/:caseId/samples` — Register sample
- `POST /api/cases/:caseId/artifacts` — Register artifact

### Workflow Orchestration
- `POST /api/cases/:caseId/workflows` — Submit workflow (idempotent)
- `POST /api/cases/:caseId/runs/:runId/start` — Start run
- `POST /api/cases/:caseId/runs/:runId/complete` — Complete run
- `POST /api/cases/:caseId/runs/:runId/fail` — Fail run
- `POST /api/cases/:caseId/runs/:runId/cancel` — Cancel run
- `GET /api/cases/:caseId/runs` — List runs
- `GET /api/cases/:caseId/runs/:runId` — Get run

### HLA and QC
- `POST /api/cases/:caseId/hla-consensus` — Submit HLA consensus
- `GET /api/cases/:caseId/hla-consensus` — Get HLA consensus
- `POST /api/cases/:caseId/runs/:runId/qc` — Submit QC result
- `GET /api/cases/:caseId/runs/:runId/qc` — Get QC result

### Construct Design
- `POST /api/cases/:caseId/construct-design` — Generate construct
- `GET /api/cases/:caseId/construct-design` — Get construct

### Modality Governance
- `GET /api/modalities` — List modalities
- `GET /api/modalities/:modality` — Get modality
- `POST /api/modalities/:modality/activate` — Activate modality

### Outcomes
- `POST /api/cases/:caseId/outcomes/administration` — Record administration
- `POST /api/cases/:caseId/outcomes/immune-monitoring` — Record immune monitoring
- `POST /api/cases/:caseId/outcomes/clinical-follow-up` — Record follow-up
- `GET /api/cases/:caseId/outcomes` — Get outcomes

### Expert Review and Handoff
- `POST /api/cases/:caseId/board-packets` — Generate board packet
- `GET /api/cases/:caseId/board-packets` — List board packets
- `GET /api/cases/:caseId/board-packets/:packetId` — Get board packet
- `POST /api/cases/:caseId/review-outcomes` — Submit review outcome
- `GET /api/cases/:caseId/review-outcomes` — List review outcomes
- `GET /api/cases/:caseId/review-outcomes/:reviewId` — Get review outcome
- `POST /api/cases/:caseId/handoff-packets` — Generate handoff packet
- `GET /api/cases/:caseId/handoff-packets` — List handoff packets
- `GET /api/cases/:caseId/handoff-packets/:handoffId` — Get handoff packet

### Reference Bundles
- `GET /api/reference-bundles` — List bundles
- `GET /api/reference-bundles/:bundleId` — Get bundle
- `POST /api/reference-bundles` — Create bundle

### Traceability and Operations
- `GET /api/cases/:caseId/traceability` — Full evidence lineage graph
- `GET /api/operations/summary` — Operational summary
- `GET /healthz` — Liveness probe
- `GET /readyz` — Readiness probe
- `GET /metrics` — Prometheus-format metrics