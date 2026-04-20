---
title: "OpenRNA Hardening Roadmap 2026"
status: active
version: "1.1.0"
last_updated: "2026-04-03"
tags: [openrna, roadmap, hardening, security, architecture]
mode: how-to
---

# OpenRNA Hardening Roadmap 2026

This roadmap converts the findings from [`OPENRNA_HYPER_AUDIT_2026.md`](OPENRNA_HYPER_AUDIT_2026.md) into a sequenced engineering program.

## Goal

Raise OpenRNA from a research-grade, strongly tested control plane to a pre-production platform with explicit enforcement at the resource-authorization, consent-governance, durable-traceability, and release-authority layers.

## Priority Rule

Do not spend the next wave on new product features first.

The next highest-value work is control completion:

1. resource-scoped authorization;
2. authoritative consent governance;
3. durable domain event history semantics;
4. release and signing authority.

## Completed Baseline As Of 2026-04-03

The following baseline hardening work is already materially in place and should be preserved, not re-opened:

- `RBAC_ALLOW_ALL=false` is now the secure default in `src/config.ts`;
- `InMemoryRbacProvider` is deny-by-default unless permissive mode is explicitly enabled;
- route-level RBAC coverage exists across case reads and case-mutating endpoints in `src/app.ts`;
- case-scoped write routes are gated by `requireActiveConsent(...)` in `src/middleware/consent-gate.ts`;
- `stateMachineGuard` is injected into both bootstrapped memory and PostgreSQL store paths via `src/index.ts` and `src/adapters/PostgresCaseStore.ts`.

The next roadmap waves should extend these controls, not revisit them as if they were still missing.

## Workstream 1. Resource-Scoped Authorization

**Objective:** move from route-complete RBAC to case-aware authorization.

### Deliverables

- preserve the current deny-by-default and route-coverage baseline;
- introduce a route-to-action matrix or generated inventory as a tested artifact;
- implement resource-scoped checks so case ownership, tenant access, reviewer authority, and handoff authority are evaluated, not just role membership;
- decide whether to extend `IRbacProvider.checkPermission(..., resource)` or add a separate policy layer for ownership and tenant rules.

### Acceptance Evidence

- all mutating routes in `src/app.ts` remain covered by authz middleware;
- unauthorized principals cannot read or mutate cases they do not own or are not authorized to review;
- permissive fallback remains impossible unless explicitly configured.

### Suggested Verification

```bash
npm test -- tests/rbac.test.ts
npm test -- tests/rbac-coverage.test.ts
npm test -- tests/security-middleware.test.ts
npm test -- tests/api.test.ts
```

## Workstream 2. Consent As Authoritative Lifecycle And Disclosure Governance

**Objective:** make consent authoritative across readiness, lifecycle state, and disclosure behavior.

### Deliverables

- define one authoritative consent source for lifecycle evaluation;
- make workflow readiness depend on active consent, not only on `caseProfile.consentStatus`;
- reject traceability and FHIR export when the latest consent event is `withdrawn`, unless an explicit exception policy exists;
- add explicit transitions for consent withdrawal and re-activation.

### Acceptance Evidence

- a case with withdrawn consent cannot request or continue workflow execution;
- a case with withdrawn consent cannot record downstream clinical outcomes;
- a case with withdrawn consent cannot disclose traceability or FHIR export data unless explicitly authorized by policy;
- consent withdrawal and renewal are visible in both lifecycle state and audit evidence.

### Suggested Verification

```bash
npm test -- tests/consent-tracker.test.ts
npm test -- tests/consent-gate.test.ts
npm test -- tests/api.test.ts
npm test -- tests/outcomes.test.ts
```

## Workstream 3. Durable Domain Event History

**Objective:** align persistence semantics with the repository's event-sourcing language.

### Deliverables

- decide explicitly between:
  - true durable event sourcing; or
  - relational projection persistence with audit history.
- if durable event sourcing is kept as the architecture target:
  - add `PostgresEventStore`;
  - add a `case_domain_events` table or equivalent;
  - round-trip replay against PostgreSQL-backed state;
  - keep projection rebuild behavior parity with `MemoryCaseStore`.
- if not, narrow the design language so the docs no longer imply durable event sourcing in the Postgres path.

### Acceptance Evidence

- PostgreSQL path can replay the same case event stream as the memory path; or
- docs and implementation are made semantically consistent.

### Suggested Verification

```bash
npm test -- tests/event-journal-foundation.test.ts
npm test -- tests/postgres-case-store.test.ts
npm test -- tests/postgres-restart.test.ts
```

## Workstream 4. Release Authority And Regulatory Evidence

**Objective:** prepare the repository for stronger external trust and compliance claims.

### Deliverables

- replace integrity-only HMAC audit signatures with asymmetric signing for review and release actions;
- define signer identity, key provenance, and rotation model;
- add dual-authorization for manufacturing handoff or release-grade artifacts;
- document a deployment-time trust model for secrets, attestation verification, and release consumers.

### Acceptance Evidence

- review and handoff artifacts have signer identity plus verification path;
- release artifacts can be verified independently from the build system;
- docs do not overclaim 21 CFR Part 11 readiness before the controls exist.

## Sequencing

### Wave A

- Workstream 1
- Workstream 2

### Wave B

- Workstream 3

### Wave C

- Workstream 4
- FHIR/profile conformance tightening
- deployment baseline and operational recovery evidence

## Recommended Engineering Policy

For the next cycle, accept a simple rule:

**No new feature work unless it also closes one control gap or ships behind an already-complete control surface.**

That policy is the fastest path to moving OpenRNA from impressive prototype to defensible platform.