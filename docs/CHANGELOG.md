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

## [0.1.2] - 2026-05-02

Regulatory hardening pass based on academic gap analysis across five dimensions:
ICH E6(R2) consent governance, 21 CFR Part 11 data integrity (ALCOA+),
hexagonal architecture completion, ranking provenance, and FSM correctness.

### Added

- **`CONSENT_WITHDRAWN` lifecycle state** (ICH E6(R2) §4.8.2): absorbing terminal FSM state,
  preventing any downstream mutation on a consent-withdrawn case. Once a case enters
  `CONSENT_WITHDRAWN`, it is immutable; renewed consent requires opening a new case.
  `deriveCaseStatus()` now returns `CONSENT_WITHDRAWN` when `consentStatus === "withdrawn"`.
- **`ConsentStatus.withdrawn`** third value added to the `consentStatuses` enum; the governance
  route now maps `type: "withdrawn"` → `consentStatus: "withdrawn"` (was `"missing"`).
- **`ICaseStore` domain port** at `src/ports/ICaseStore.ts`: the `CaseStore` inline interface
  has been extracted to a canonical hexagonal-architecture port file; `CaseStore` in `store.ts`
  is now a type alias (`export type CaseStore = ICaseStore`), preserving all downstream imports.
- **`RankingEngineMetadata`** type on `RankingResult` (`name`, `version`, `licenseClass`,
  `evidence`). `InMemoryNeoantigenRankingEngine` now populates `engineMetadata` on every result
  with `licenseClass: "open"` and an explicit not-for-clinical-use note. Adapters wrapping
  restricted-license engines (e.g. AlphaFold 3) must set `licenseClass: "restricted"`.
- **Migration `004_audit_hardening.sql`**: adds `record_hash` and `prev_hash` columns to
  `audit_events`, enabling application-layer SHA-256 hash-chain for ALCOA+ tamper detection
  (FDA Data Integrity Guidance 2018). Includes `STRICTLY_TERMINAL_STATES`-aware index and
  Principle of Least Privilege grant commentary.
- **Typed domain events** for previously untyped state transitions: `consent.updated`,
  `revision.restarted`, and `hla.review.resolved` now carry properly typed payloads in
  `CaseDomainEventInput / CaseDomainEventRecord` and are replayed correctly by `CaseProjection`.
- **`assertConsentMutable` guard** added to `MemoryCaseStore`: all mutation methods throw
  `ApiError 409 / consent_withdrawn` if called on a `CONSENT_WITHDRAWN` case.
- **STRICTLY_TERMINAL_STATES set** in `InMemoryStateMachineGuard`: `HANDOFF_PENDING`,
  `REVIEW_REJECTED`, and `CONSENT_WITHDRAWN` cannot transition to any state, including
  `CONSENT_WITHDRAWN` itself. Only active (non-terminal) states may transition to withdrawal.
- **New test** `"new case after consent withdrawal unblocks a fresh treatment cycle"`
  documenting the correct clinical pattern per ICH E6(R2) §4.8.2.

### Changed

- `InMemoryStateMachineGuard.getAllowedTransitions()` now returns the full consent-aware set
  (includes `CONSENT_WITHDRAWN` for active states); `validateTransition()` uses the same set.
- Governance route `POST /api/cases/:caseId/consent`: renewal (`type: "renewed"`) on a
  `CONSENT_WITHDRAWN` case now returns `409 new_case_required_after_consent_withdrawal`;
  the store sync is performed before the consent-tracker record is written.
- `MemoryCaseStore.syncConsentStatus()`: throws `409 new_case_required_after_consent_withdrawal`
  if the caller attempts to re-open a `CONSENT_WITHDRAWN` case via a non-withdrawn status.

### Tests

- 505 tests (22 suites), 0 failures.
- Updated `"consent renewed re-activates consent gate"` to assert the new 409 invariant.
- Updated `"POST /consent synchronizes case readiness"` to assert `CONSENT_WITHDRAWN` / `"withdrawn"`.

### Compatibility Notes

- Any client testing consent withdrawal must update status assertions from `AWAITING_CONSENT`
  to `CONSENT_WITHDRAWN` and `consentStatus` from `"missing"` to `"withdrawn"`.
- Consent renewal after withdrawal is no longer supported on the same case; clients must
  create a new case.
- `CaseStore` interface still exported from `src/store.ts` as a type alias — no import changes required.
- `RankingResult.engineMetadata` is `optional`; existing stored results without the field
  remain valid.

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