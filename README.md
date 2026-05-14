# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

English · [Русский](README.ru.md)

A control plane for personalized neoantigen RNA vaccine workflows.

## At a glance

- Re-verified on 2026-05-14: **555 tests** (23 suites), all passing, `npm audit --omit=dev --audit-level=high` clean, lint and format gates pass with **0 errors / 0 warnings**.
- Architecture baseline: **22 port interfaces**, 24 adapters (18 in-memory + 6 integration), **18 case lifecycle states**.
- v0.1.5 hardening: Prometheus metrics (`prom-client`), cross-platform abstraction (`IPlatformAdapter`), tool-execution firewall (`IToolExecutionPolicy`), bounded rate-limiter eviction, capped JWKS cache, Express `trust proxy`, graceful shutdown timeouts, `docker-compose.dev.yml` local stack.
- v0.1.4: store.ts and validation.ts modularization, Biome 2.0 linting, Dockerfile, OpenAPI 3.1 spec generator (`docs/openapi.json`).
- v0.1.3 hardening: audit hash-chain write wiring and verify endpoint, identity-bound signatures (HMAC-SHA256 seal, JWT `sub`), OIDC JWKS URI support, and IQ/OQ/PQ validation package (`docs/VALIDATION_PACKAGE.md`).
- The repository is ready for engineering diligence, but it does not claim clinical deployment readiness and does not claim completed IQ/OQ/PQ execution on a target regulated environment.

Formal baseline snapshot: [docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md](docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-21.md).

Migration note for the April 21, 2026 control-plane changes: [docs/archive/reports/BREAKING_CHANGES_2026-04-21.md](docs/archive/reports/BREAKING_CHANGES_2026-04-21.md).

## Why this project exists

Personalized anti-cancer RNA therapy has moved beyond early exploratory framing. Public registries and peer-reviewed evidence show the field shifting toward larger, multi-center programs.

At this stage, the bottleneck is rarely a single algorithm. The real constraint is per-patient operational continuity: consent governance, sample provenance, reference bundle versioning, reproducible pipeline execution, expert review, manufacturing handoff, and follow-up outcomes.

OpenRNA addresses exactly this layer. It is not "yet another predictor". It is the coordination layer between bioinformatics tooling, clinical governance, and operational control.

Clinical anchors used by this project include NCT05933577 (V940/INTerpath-001) and NCT05968326 (autogene cevumeran/IMCODE003). See [`docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md`](docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md) for detailed context.

## What OpenRNA does

- Manages patient cases through a governed lifecycle (**18 states**, including the absorbing `CONSENT_WITHDRAWN` terminal state per ICH E6(R2) §4.8.2).
- Records sample and derived artifact provenance.
- Orchestrates workflow submission with idempotency (`x-idempotency-key`).
- Supports multi-tool HLA consensus with configurable disagreement thresholds and an operator-review gate when unresolved disagreements exceed the configured threshold.
- Evaluates QC gates and records QC decisions.
- Persists neoantigen ranking outputs and construct design payloads, including configurable epitope linker strategies (`ggs-flexible`, `aay-cleavage`, `direct-fusion`).
- Generates expert-review packets, review outcomes, independent final release authorizations, and manufacturing handoff packets.
- Maintains an outcome timeline (administration, immune monitoring, clinical follow-up).
- Provides end-to-end traceability through domain audit events.
- Exposes operational and FHIR-oriented export surfaces through explicit ports.

## What OpenRNA intentionally does not do

- It does not perform neoantigen prediction internally (it delegates to external engines via `INeoantigenRankingEngine`).
- It is not a replacement for Nextflow/sarek/pVACtools and does not compete as a computational pipeline.
- It is not a clinical decision system.
- It does not claim full 21 CFR Part 11 validation and is not positioned as a clinically validated medical product.

## Architecture model

- Business logic is built around explicit ports (`src/ports/*`) and is not coupled to concrete implementations.
- Adapters are wired through `AppDependencies`; in-memory is the default mode, PostgreSQL is the durable mode.
- Input contracts are validated at the API boundary with Zod.
- Lifecycle transitions are guarded through `IStateMachineGuard`.
- Audit events and correlation IDs provide a traceable operational chain.
- Access control is structured around API key/JWT and RBAC, with deny-by-default as the secure baseline and separate review-vs-release permissions for regulated handoff flow.

Architecture authority document: [`docs/design.md`](docs/design.md).

## Maturity status: explicit and honest

| Layer | Current status |
|---|---|
| Technical control-plane implementation | Implemented and test-covered |
| Repository engineering posture (CI/SAST/SBOM/provenance) | Implemented |
| Clinical deployment | Not claimed |
| Consent withdrawal as FSM-native absorbing state (ICH E6(R2) §4.8.2) | Implemented (May 2026) |
| `ICaseStore` domain port extracted to `src/ports/` | Implemented (May 2026) |
| Prometheus metrics (cases, HTTP requests, durations) | ✅ Implemented (v0.1.5) |
| `IPlatformAdapter` + `IToolExecutionPolicy` ports | ✅ Implemented (v0.1.5) |
| Bounded rate-limiter + JWKS cache eviction | ✅ Implemented (v0.1.5) |
| Express `trust proxy` + graceful shutdown timeouts | ✅ Implemented (v0.1.5) |
| `store.ts` / `validation.ts` modularization | ✅ Implemented (v0.1.4) |
| Biome 2.0 linting + CI gate (0 errors, 0 warnings) | ✅ Implemented (v0.1.4/v0.1.5) |
| OpenAPI 3.1 spec generation | ✅ Implemented (v0.1.4) |
| Production Dockerfile | ✅ Implemented (v0.1.4) |
| Audit hash-chain (schema + write wiring + verify endpoint) | ✅ Implemented (v0.1.3) |
| Electronic signatures — identity-bound via JWT `sub` + HMAC seal | ✅ Implemented (v0.1.3) |
| Per-user OIDC / JWKS URI | ✅ Supported (v0.1.3); IdP configuration required |
| Resource-scoped authorization and part of regulatory controls | ✅ Implemented for case-scoped routes; legacy records without ACL rows remain transitional |
| IQ/OQ/PQ validation package | ✅ Document authored; execution pending |

Hardening details: [`docs/archive/reports/OPENRNA_HARDENING_ROADMAP_2026.md`](docs/archive/reports/OPENRNA_HARDENING_ROADMAP_2026.md).

## Quickstart

```bash
npm ci
npm run build
npm test
npm run test:coverage
npm run lint
npm run openapi
npm run sbom:cyclonedx:file
npm run dev
```

One-command verification lane:

```bash
npm run ci
```

### Docker

```bash
docker build -t openrna .
docker run -p 3000:3000 -e API_KEY=dev-key openrna
```

Local development stack with PostgreSQL 16 and pgAdmin (see `docker-compose.dev.yml`):

```bash
docker-compose -f docker-compose.dev.yml up -d
```

## Environment variables

Source of truth: [`src/config.ts`](src/config.ts).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4010` | HTTP listener port |
| `CASE_STORE_DATABASE_URL` | unset | PostgreSQL case persistence; empty = in-memory |
| `CASE_STORE_TABLE_NAME` | `case_records` | Case table name |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | PostgreSQL dispatch persistence; empty = in-memory |
| `WORKFLOW_DISPATCH_TABLE_NAME` | `workflow_dispatches` | Dispatch table name |
| `API_KEY` | unset | API key auth via `x-api-key` |
| `API_KEY_PRINCIPAL_ID` | `api-key-client` | Principal id bound to API key auth |
| `RBAC_ALLOW_ALL` | `false` | Emergency permissive mode (not for production) |
| `JWT_SHARED_SECRET` | unset | JWT HS256 (minimum 32 bytes) |
| `JWT_PUBLIC_KEY_PEM` | unset | JWT RS256 public key |
| `JWT_JWKS_URI` | unset | OIDC JWKS endpoint for remote key verification |
| `JWT_EXPECTED_ISSUER` | unset | Optional `iss` validation |
| `JWT_EXPECTED_AUDIENCE` | unset | Optional `aud` validation |
| `JWT_PRINCIPAL_CLAIM` | `sub` | Claim containing principal id |
| `JWT_ROLE_CLAIM` | `roles` | Claim containing roles |
| `SIGNATURE_SEAL_KEY` | unset | HMAC-SHA256 seal key ≥32 bytes (required in production identity-bound signature flows) |
| `TRUST_PROXY` | `false` | Express `trust proxy` setting (set to `true` or a hop count behind a load balancer) |

## Quality and supply-chain security

Local checks:

```bash
npm run build
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=high
npm run sbom:cyclonedx:file
```

GitHub controls:

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) - build, tests, lint, format check, audit, smoke health checks.
- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) - SAST.
- [`.github/workflows/dependency-review.yml`](.github/workflows/dependency-review.yml) - dependency risk gate for PRs.
- [`.github/workflows/supply-chain-provenance.yml`](.github/workflows/supply-chain-provenance.yml) - SBOM, checksums, attestations, release assets.

## Documentation, publications, and reports

| Source | Role |
|---|---|
| [`docs/PUBLIC_ARCHITECTURE_INDEX.md`](docs/PUBLIC_ARCHITECTURE_INDEX.md) | Main router for active documentation |
| [`docs/INTENDED_USE.md`](docs/INTENDED_USE.md) | Formal intended-use statement and deployment boundary |
| [`docs/design.md`](docs/design.md) | Architecture SSOT for OpenRNA |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | HTTP contract map |
| [`docs/CONSENT_ACCESS_POLICY_2026.md`](docs/CONSENT_ACCESS_POLICY_2026.md) | Consent-gating matrix for write/read route families |
| [`docs/OPERATIONS_AND_FAILURE_MODES.md`](docs/OPERATIONS_AND_FAILURE_MODES.md) | Operations model and failure classes |
| [`docs/REGULATORY_CONTEXT.md`](docs/REGULATORY_CONTEXT.md) | Regulatory map and current implementation boundaries |
| [`docs/archive/`](docs/archive/) | Archived evidence, publication packs, and historical audits |

External anchors referenced in April 2026:

- ClinicalTrials.gov: NCT05933577, NCT05968326.
- Node.js release schedule (LTS status).
- TypeScript Modules Reference (`node16/node18/node20/nodenext` guidance).
- GitHub Docs on README and supply-chain security.

## Contributing

- Contribution guide: [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)
- Security policy: [`docs/SECURITY.md`](docs/SECURITY.md)
- Support channels: [`docs/SUPPORT.md`](docs/SUPPORT.md)
- Code of conduct: [`docs/CODE_OF_CONDUCT.md`](docs/CODE_OF_CONDUCT.md)

## License

Apache-2.0. See [`LICENSE`](LICENSE).
