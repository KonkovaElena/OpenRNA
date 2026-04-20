---
title: "OpenRNA Hyper Audit 2026"
status: active
version: "1.2.1"
last_updated: "2026-04-05"
tags: [openrna, audit, security, architecture, event-sourcing, compliance]
mode: evidence
evidence_cutoff: "2026-04-05"
---

# OpenRNA Hyper Audit 2026

## Executive Verdict

OpenRNA, as of April 5, 2026, is a strong research-grade control plane with unusually good verification depth for a standalone public repository. We verified the local evidence chain directly: `npm run build`, `npm test`, `npm run test:coverage`, `npm audit --omit=dev --audit-level=high`, and CycloneDX SBOM emission all pass clean.

The project is stronger than the initial audit snapshot suggested. Several previously open gaps are now closed:

1. RBAC is deny-by-default — in config and in the in-memory provider;
2. Route-level authorization covers case reads and case-mutating endpoints;
3. Case-scoped writes are blocked by active-consent middleware;
4. `stateMachineGuard` is injected in both memory and PostgreSQL store paths.

That said — it's not ready for regulated human-oncology deployment or a security-sensitive pilot. The remaining blockers are narrower and more precise than before:

1. Authorization is route-complete but not resource-scoped (no case-ownership enforcement);
2. Consent gates writes but doesn't yet govern lifecycle snapshots or export surfaces;
3. Event sourcing is durable only in memory — PostgreSQL stores projections, not the event stream;
4. Audit signing uses HMAC for integrity, not asymmetric signatures for non-repudiation.

Bottom line: strong engineering discipline, high testability, visible hardening momentum — but several trust-boundary and traceability claims still need tightening before this can support higher-assurance deployment narratives.

## Scope

This audit covers the standalone OpenRNA repository as a separate software product.

Audited surfaces:

- application entry and bootstrap: `src/index.ts`, `src/app.ts`, `src/config.ts`;
- state and persistence: `src/store.ts`, `src/adapters/PostgresCaseStore.ts`, `src/migrations/001_full_schema.sql`;
- event projection and audit context: `src/queries/CaseProjection.ts`, `src/audit-context.ts`, `src/adapters/InMemoryEventStore.ts`;
- auth, RBAC, consent, FHIR export: `src/auth.ts`, `src/middleware/auth-context.ts`, `src/adapters/InMemoryRbacProvider.ts`, `src/adapters/InMemoryConsentTracker.ts`, `src/adapters/InMemoryFhirExporter.ts`;
- CI and supply-chain surfaces: `.github/workflows/ci.yml`, `.github/workflows/supply-chain-provenance.yml`, generated `openrna-runtime-sbom.cdx.json`;
- tests and current verification artifacts under `tests/` and `.audit-*.txt`.

Out of scope:

- wet-lab procedures and manufacturing protocols;
- live GitHub branch protection or repository settings in the GitHub UI;
- production infrastructure, cloud secrets, or deployment-time key management;
- correctness of external bioinformatics tools beyond the repository's integration boundaries.

## Methodology

The audit used four evidence layers.

1. Static code inspection of runtime, persistence, and security-sensitive surfaces.
2. Direct validation against current local verification outputs generated on 2026-04-05.
3. Test-surface review to distinguish implemented guarantees from untested claims.
4. External standards anchoring against current official references:
   - OWASP ASVS 5.0.0 for application security verification;
   - NIST SP 800-218 SSDF 1.1 for secure development and supply-chain governance;
   - CycloneDX SBOM guidance for software inventory and provenance;
   - HL7 FHIR specification overview for interoperability framing.

The audit intentionally distinguishes three classes of statements:

- implemented and locally verified;
- documented but not fully enforced;
- future or regulatory aspirations acknowledged by the design documents.

## Verification Snapshot

The following local verification results were reproduced during this audit:

| Surface | Result | Evidence |
|---|---:|---|
| TypeScript build | PASS | `npm run build` exit code `0` |
| Full test suite | PASS | `440/440` tests passed, `22` suites, `0` failed |
| Coverage | PASS | line `95.00%`, branch `83.44%`, functions `94.94%` |
| Runtime dependency audit | PASS | `found 0 vulnerabilities` |
| SBOM generation | PASS | `openrna-runtime-sbom.cdx.json` emitted successfully |

Observed strengths from the verification lane:

- the repository has deep behavioral coverage across workflow orchestration, event replay, FHIR export, modality governance, PostgreSQL persistence, and security middleware;
- `process.env` usage is confined to configuration loading in `src/config.ts`;
- local simulation adapters for HLA consensus and neoantigen ranking are explicitly marked with `@sota-stub`, avoiding hallucinated completeness.

## Findings

### Finding 1. Authorization is deny-by-default and route-complete, but not resource-scoped

**Severity:** High

**Evidence chain**

- `src/config.ts` now sets `RBAC_ALLOW_ALL` default to `false`.
- `src/adapters/InMemoryRbacProvider.ts` now defaults `allowAll` to `false` and requires assigned roles.
- `src/app.ts` applies `rbacAuth(...)` across case reads, case-mutating routes, reference-bundle reads, summary endpoints, consent endpoints, FHIR export, and audit surfaces.
- `tests/rbac.test.ts` verifies deny-by-default behavior and explicit allow-all opt-in.
- `tests/rbac-coverage.test.ts` verifies `403` coverage across the route matrix when no roles are granted.
- `tests/security-middleware.test.ts` verifies that unsigned `x-api-key` hints do not become implicit principals when auth is not configured.
- `IRbacProvider.checkPermission(principal, action, resource?)` still accepts a resource identifier, but `InMemoryRbacProvider` does not evaluate the `resource` argument.

**What this means**

The prior trust-boundary gap around permissive defaults and missing route coverage has been materially reduced. However, authorization is still role-only rather than resource-aware. A principal with `VIEW_CASE`, `REQUEST_WORKFLOW`, or `APPROVE_REVIEW` can still act across cases because there is no ownership, tenancy, or reviewer-to-case binding at the authorization layer.

**Why this matters academically and operationally**

This is closer to OWASP ASVS-style access-control expectations than the earlier snapshot, but it is not yet least-privilege in the domain sense. Route protection without resource scoping still leaves lateral access risk between patient cases.

**Recommendation**

- Preserve the current deny-by-default baseline and route coverage tests.
- Implement resource-scoped checks for case ownership, reviewer authority, and manufacturing handoff authority.
- Extend the RBAC contract or add an authorization policy layer so `resource` is semantically enforced instead of ignored.

### Finding 2. Consent is enforced on case-scoped writes, but not yet authoritative for lifecycle state or disclosure surfaces

**Severity:** High

**Evidence chain**

- `src/middleware/consent-gate.ts` blocks case-scoped write operations when `IConsentTracker.isConsentActive(caseId)` returns false.
- `src/app.ts` wires `consentGateMw` onto case-scoped write routes such as samples, artifacts, workflows, run lifecycle, QC, outcomes, board packets, review outcomes, and handoff packets.
- `tests/consent-gate.test.ts` verifies no-consent rejection, post-grant success, post-withdrawal re-blocking, and renewal behavior.
- `src/store.ts` still derives readiness and status transitions from `caseProfile.consentStatus`, samples, artifacts, and workflow state rather than from the latest `IConsentTracker` event.
- `src/app.ts` keeps `GET /api/cases/:caseId/traceability` and `GET /api/cases/:caseId/fhir/*` behind RBAC only, not behind consent-aware disclosure policy.
- `POST /api/cases/:caseId/consent` records tracker events, but does not update the embedded case profile or lifecycle status directly.

**What this means**

The repository no longer has the earlier no-write-barrier problem. Instead, the remaining consent gap is narrower: the authoritative consent signal is still split between the tracker and the persisted case profile, and export/read surfaces can still disclose data under RBAC even after consent withdrawal.

**Why this matters academically and operationally**

For regulated healthcare workflows, consent should not only stop writes. It should also govern readiness, downstream disclosure, and operator-visible case state. The current design now has a runtime gate, but not yet a single authoritative consent model.

**Recommendation**

- Promote the latest consent event into the lifecycle source of truth for readiness and case state.
- Add explicit policy for whether withdrawn consent blocks traceability and FHIR export.
- Add integration tests for withdrawn-consent denial on disclosure/export endpoints, not only write endpoints.
- Consider representing consent changes as first-class domain events if event sourcing remains a long-term target.

### Finding 3. Event sourcing is real in memory, but not durable in PostgreSQL

**Severity:** High

**Evidence chain**

- `src/store.ts` constructs `MemoryCaseStore` with an `InMemoryEventStore` and replays state through `replayCaseEvents()`.
- `tests/event-journal-foundation.test.ts` validates replay for intake, workflow lifecycle, QC, board packets, review outcomes, and handoff state.
- `src/adapters/PostgresCaseStore.ts` delegates mutations through `MemoryCaseStore`, preserving business logic and state-machine enforcement, but then persists the reconstructed projection state into relational tables.
- `src/migrations/001_full_schema.sql` defines `cases`, `samples`, `workflow_requests`, `workflow_runs`, `run_artifacts`, `audit_events`, `timeline_events`, and other projection tables, but no `case_domain_events` or equivalent durable event stream table.
- `tests/postgres-case-store.test.ts` proves projection persistence and restart behavior, not durable domain-event replay parity.

**What this means**

The repository has strong replay semantics in memory and strong relational persistence in PostgreSQL, but those are not the same storage contract. PostgreSQL currently persists the latest reconstructed state and audit evidence, not a first-class durable domain event journal.

**Why this matters academically and operationally**

If OpenRNA wants to claim durable event-sourced traceability rather than replay-tested in-memory semantics, the PostgreSQL path needs to preserve the domain event stream itself. Otherwise, replay is a development/runtime pattern, not a durability guarantee.

**Recommendation**

- Either implement `PostgresEventStore` plus a durable `case_domain_events` table, or explicitly narrow the architecture language to `projection-backed persistence with replay-tested in-memory journal semantics`.
- Add parity tests that prove the PostgreSQL path can round-trip the same domain-event stream as the memory path.
- Keep `audit_events` and `domain_events` conceptually separate: one is operator-facing evidence, the other is the state-transition log.

### Finding 4. Regulatory-grade signature and release controls remain acknowledged gaps

**Severity:** High for regulated deployment

**Evidence chain**

- `design.md` explicitly lists missing electronic signatures and dual-authorization release controls as high-severity compliance gaps.
- `src/adapters/InMemoryAuditSignatureProvider.ts` uses HMAC-style signing for integrity verification rather than asymmetric non-repudiation.
- `.github/workflows/supply-chain-provenance.yml`, `npm audit`, and CycloneDX SBOM emission materially improve provenance and transparency, but they do not create 21 CFR Part 11-grade signer identity or release ceremony.

**What this means**

This is not a hidden defect. The codebase is honest about the boundary between integrity checks and regulatory-grade signatures. That honesty should be preserved in product and investor narratives.

**Recommendation**

- Preserve the current documentation honesty around regulatory readiness.
- Do not compress HMAC-based tamper checks into `electronic signatures` language.
- Add asymmetric signing, signer identity, key rotation, and dual-review release workflows before any regulated deployment claims.

## Strengths To Preserve

### 1. Verification depth is unusually strong for a public early-stage platform

The repository is not lightly tested. On the audited revision it passed:

- `440` tests across `22` suites;
- `95.00%` line coverage;
- `83.44%` branch coverage;
- `94.94%` function coverage.

The hot spots with comparatively lower branch coverage are visible and actionable rather than hidden.

### 2. The repository already closed several meaningful control gaps during this audit window

The current codebase now demonstrates:

- deny-by-default RBAC defaults in both configuration and the in-memory provider;
- route-level authorization coverage across case read/write and export surfaces;
- an active-consent barrier on case-scoped writes;
- `stateMachineGuard` injection in both bootstrapped memory and PostgreSQL store paths.

Those changes matter because they convert earlier architectural intentions into enforceable runtime behavior.

### 3. Supply-chain transparency is materially better than average

The project already has:

- CI build and smoke verification in `.github/workflows/ci.yml`;
- a dedicated provenance workflow in `.github/workflows/supply-chain-provenance.yml`;
- CycloneDX SBOM generation with successful local emission of `openrna-runtime-sbom.cdx.json`;
- a clean local runtime dependency audit (`found 0 vulnerabilities`).

This aligns well with NIST SSDF 1.1 emphasis on protected builds, provenance data, and repeatable verification.

### 4. Security hygiene is generally disciplined where it is implemented

- authentication uses `timingSafeEqual` and supports both API key and JWT modes;
- request context carries `actorId`, `principalId`, `authMechanism`, and `correlationId` into audit surfaces;
- security headers and request logging are first-class middleware;
- simulated external adapters are explicitly marked with `@sota-stub` instead of pretending to be production I/O.

### 5. The FHIR boundary is bounded and engineering-realistic

The exporter does not claim full EMR interoperability. Instead, it provides a constrained bridge from case data into `Patient`, `DiagnosticReport`, and `Observation` resources, which is the right scope for a platform of this maturity.

One note of rigor: the external interoperability reference for this audit is the published HL7 FHIR R5 overview, which frames FHIR as a resource-based exchange standard with dedicated security, privacy, workflow, and conformance modules. Formal conformance claims should still be tied to published implementation guides and capability statements, not only to generic overview pages.

## Recommendations

### Immediate Priority: before any production-like pilot

1. Enforce resource-scoped ownership and tenancy checks on top of the now-deny-by-default RBAC baseline.
2. Make consent authoritative for workflow readiness, lifecycle state, and disclosure/export policy, not only for case-scoped writes.
3. Decide whether OpenRNA is truly event-sourced in the durable path. If yes, implement a PostgreSQL event store. If not, revise architecture language accordingly.
4. Replace integrity-only audit signatures with signer-identified, asymmetric release and review authority before any regulated deployment claims.

### Near-Term Hardening: next one to two sprints

1. Turn rate limiting on by default for write routes and expensive evidence/traceability reads.
2. Add an endpoint inventory or route-action generation test so auth coverage cannot drift silently.
3. Add integration tests for withdrawn-consent denial on traceability and FHIR export surfaces.
4. Add parity tests between memory and PostgreSQL storage semantics for domain-event replay versus projection persistence.
5. Introduce explicit case ownership or tenant scoping into the RBAC provider contract or adjacent policy layer.
6. Document the consent and authorization model together so disclosure behavior is not left implicit.

### Strategic Horizon: before clinical or partner-facing expansion

1. Add WORM-style immutability or cryptographic chaining for audit records.
2. Publish a versioned FHIR CapabilityStatement and stable implementation profile set.
3. Add release-signing and dual-authorization ceremony for manufacturing handoff artifacts.
4. Move workflow-runner integrations from local-memory semantics toward explicit external execution provenance and job identity.
5. Formalize a deployment baseline covering key management, GitHub branch protection, attestation verification, and database backup/restore evidence.

## Audit Confidence

This audit uses the repository's internal reliability tuple, applied conservatively to the audit process itself rather than to the product.

- `E = 1.0`: at least five independent checks were used (`build`, `test`, `coverage`, `npm audit`, SBOM generation), plus direct file inspection.
- `V = 1.0`: findings were validated against direct runtime or exact changed-path evidence rather than reasoning alone.
- `T = 1.0`: automated verification covered both targeted behavior and broad repository health.
- `B = 0.5`: the blast-radius audit covered core files plus one dependency direction, but not a live deployed environment.

Therefore:

`R = 0.30*E + 0.25*V + 0.25*T + 0.20*B = 0.90`

Interpretation: the audit conclusions are strong enough to guide engineering decisions now, but not strong enough to certify live operational compliance without environment-level verification.

## Residual Uncertainty And Human Verification Needs

The following items remain outside what can be proven from local code and local test execution alone:

1. actual GitHub branch-protection and repository-rule enforcement;
2. whether release attestations are being consumed and verified by downstream operators;
3. production secret management and signing-key handling;
4. database backup, restore, retention, and immutability controls;
5. external workflow-runner hardening in a non-local environment;
6. formal FHIR profile conformance against published implementation guides and capability statements.

## Bottom Line

OpenRNA already behaves like a serious engineering repository — and noticeably more so than the earliest April snapshot suggested. It doesn't yet behave like a security-complete or compliance-complete oncology platform. That distinction is healthy.

What we have now: a high-quality translational research control plane with real hardening momentum, strong verification discipline, and clear upgrade paths.

What comes next: don't add more features first. Finish the control work — resource-scoped authorization, authoritative consent governance, durable domain-event history, and release authority. The gaps are well-defined and the architecture already anticipates them.