# OpenRNA

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

English · [Русский](README.ru.md)

OpenRNA is an operational control plane for personalized neoantigen RNA vaccine workflows.

It does not claim to replace bioinformatics engines, clinical decision systems, or regulatory qualification procedures. Its purpose is to provide a testable, auditable, and reproducible coordination layer between sample provenance, computational workflows, expert review, release authorization, and outcome tracking.

## Evidence Snapshot (2026-04-19)

- Local full lane (`npm run ci`) passed: 489 tests across 22 suites, 0 failures.
- Security gate (`npm audit --omit=dev --audit-level=high`) reported 0 vulnerabilities.
- Case lifecycle model includes 16 explicit states.
- Release authorization flow includes board review, independent QA release, and manufacturing handoff.
- Critical authorization supports step-up electronic signature assertions (`totp`, `webauthn`) for approved review and QA release actions.
- Audit trail integrity includes persisted hash-chain links (`previousEventHash`, `eventHash`) in durable storage.
- Validation package now includes intended use, IQ/OQ/PQ plan, and URS traceability matrix.
- Active governance set includes PHI minimization/crypto-shredding policy and a versioned FHIR capability baseline artifact.

Formal baseline register: [docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md](docs/archive/FORMAL_EVIDENCE_REGISTER_2026-04-05.md).

## Why This Layer Exists

The practical bottleneck in personalized cancer RNA programs is rarely a single prediction model. The operational bottleneck is continuity at the case level:

- consent state and authorization boundaries
- sample and artifact provenance
- reference bundle version pinning
- reproducible workflow dispatch and completion
- multidisciplinary review and release control
- handoff packets for manufacturing
- longitudinal outcome traceability

OpenRNA addresses this coordination layer.

Clinical context anchors used by this repository include NCT05933577 and NCT05968326. Detailed notes are maintained in [docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md](docs/archive/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md).

## Implemented Capability Surface

- Case lifecycle governance with explicit status transitions.
- Provenance registration for samples and source artifacts.
- Workflow request and run lifecycle orchestration with idempotency support (`x-idempotency-key`).
- HLA consensus integration and QC gate persistence.
- Neoantigen ranking and construct design persistence through explicit ports.
- Board packet generation and review outcome recording.
- Independent QA release route with maker-checker enforcement.
- Manufacturing handoff generation bound to approved review plus matching QA release.
- Outcome timeline aggregation (administration, immune monitoring, clinical follow-up).
- End-to-end traceability projection over review, release, handoff, and outcomes.

## Security, Authorization, and Compliance Controls

| Control | Implementation direction |
|---|---|
| Authentication | API key or JWT, resolved into request principal context |
| Authorization | RBAC route guards with deny-by-default posture |
| Consent interlock | Case-scoped write routes are consent-gated |
| Step-up signature assertions | Required for approved review outcomes and QA release actions |
| Maker-checker separation | QA reviewer identity must differ from board reviewer |
| Dual-authorization handoff guard | Handoff requestor is validated against reviewer identity constraints |
| Audit integrity | Hash-chained case audit events with deterministic linking |

For current boundaries and non-claims, see [docs/REGULATORY_CONTEXT.md](docs/REGULATORY_CONTEXT.md).

## Architecture Summary

- Business logic is organized around explicit ports in [src/ports](src/ports).
- Adapter implementations are wired through dependency injection in `AppDependencies`.
- In-memory mode is supported for deterministic local and CI execution.
- PostgreSQL mode is supported for durable persistence and reload tests.
- Input contracts are validated at API boundaries via Zod.
- Status transitions are enforced through `IStateMachineGuard`.

Architecture source of truth: [docs/design.md](docs/design.md).

## Explicit Boundaries

OpenRNA is not:

- a substitute for external workflow engines (for example Nextflow ecosystems)
- a standalone neoantigen predictor
- a clinical decision support system
- a claim of completed 21 CFR Part 11 qualification

## Quickstart

```bash
npm ci
npm run build
npm test
npm run test:coverage
npm run sbom:cyclonedx:file
npm run dev
```

Integrated verification lane:

```bash
npm run ci
```

## Key Environment Variables

Configuration authority: [src/config.ts](src/config.ts).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4010` | HTTP listener port |
| `CASE_STORE_DATABASE_URL` | unset | PostgreSQL case persistence; empty means in-memory |
| `WORKFLOW_DISPATCH_DATABASE_URL` | unset | PostgreSQL dispatch persistence; empty means in-memory |
| `API_KEY` | unset | API key authentication (`x-api-key`) |
| `REQUIRE_AUTH` | `false` | When `true`, startup fails unless API key or JWT auth is configured |
| `JWT_SHARED_SECRET` / `JWT_PUBLIC_KEY_PEM` | unset | JWT verification configuration |
| `RBAC_ALLOW_ALL` | `false` | Emergency permissive mode (not for production) |

## Documentation Map

| Document | Role |
|---|---|
| [docs/PUBLIC_ARCHITECTURE_INDEX.md](docs/PUBLIC_ARCHITECTURE_INDEX.md) | Entry router for active documentation |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | HTTP contract and route groups |
| [docs/OPERATIONS_AND_FAILURE_MODES.md](docs/OPERATIONS_AND_FAILURE_MODES.md) | Runtime and failure-mode model |
| [docs/CONSENT_ACCESS_POLICY_2026.md](docs/CONSENT_ACCESS_POLICY_2026.md) | Consent-gating policy matrix |
| [docs/INTENDED_USE_STATEMENT_2026.md](docs/INTENDED_USE_STATEMENT_2026.md) | Intended-use and deployment-boundary statement |
| [docs/security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md](docs/security/PHI_MINIMIZATION_AND_CRYPTO_SHREDDING_2026.md) | PHI minimization and crypto-shredding control baseline |
| [docs/fhir/FHIR_CONFORMANCE_BASELINE_2026.md](docs/fhir/FHIR_CONFORMANCE_BASELINE_2026.md) | FHIR R4 conformance boundary and capability artifact linkage |
| [docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md](docs/validation/IQ_OQ_PQ_QUALIFICATION_PLAN_2026.md) | Qualification planning scaffold |
| [docs/validation/URS_TRACEABILITY_MATRIX_2026.md](docs/validation/URS_TRACEABILITY_MATRIX_2026.md) | Requirement-to-evidence traceability map |
| [docs/RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md](docs/RUSSIAN_OMS_POLICY_SIGNAL_2026-04.md) | Payer-policy context note (April 2026) |
| [docs/archive](docs/archive) | Archived audits, publication packs, and historical evidence |

## Contribution and Governance

- Contribution guide: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- Security policy: [docs/SECURITY.md](docs/SECURITY.md)
- Support channels: [docs/SUPPORT.md](docs/SUPPORT.md)
- Code of conduct: [docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)

## License

Apache-2.0. See [LICENSE](LICENSE).