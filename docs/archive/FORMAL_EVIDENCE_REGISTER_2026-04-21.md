---
title: "OpenRNA Formal Evidence Register"
status: active-evidence
version: "1.1.0"
last_updated: "2026-04-21"
tags: [evidence, verification, fact-check, oncology, public-export]
mode: evidence
evidence_cutoff: "2026-04-21"
---

# OpenRNA Formal Evidence Register

## Purpose

This register captures the repo-local facts re-verified on April 21, 2026 after the final-release workflow and error-envelope hardening landed on `main`.

It is an incremental evidence cut for consumers who need the current OpenRNA runtime and API baseline after commits `e48be4b` and `bb47ad9`.

For the earlier public-export baseline, external registry anchors, and pre-April-21 toolchain notes, see [FORMAL_EVIDENCE_REGISTER_2026-04-05.md](FORMAL_EVIDENCE_REGISTER_2026-04-05.md).

## Method

This register uses repo-local evidence only.

1. Verification commands rerun on April 21, 2026 in the standalone repository: `npm run ci`, `npm run test:coverage`, and `npm run sbom:cyclonedx:file`.
2. Repository-grounded inspection of `package.json`, `src/ports/*.ts`, `src/adapters/*.ts`, `src/types.ts`, `src/routes/review.ts`, `src/store-review.ts`, `src/middleware/*.ts`, and `docs/API_REFERENCE.md`.
3. Git history inspection of the top commits on `main` to anchor which behavior change this evidence cut covers.

## Verified Repository Facts

| Claim | Source surface | Verified state on 2026-04-21 |
|------|----------------|-------------------------------|
| Verification surface | `npm run ci`, `npm run test:coverage`, `npm run sbom:cyclonedx:file` | `504` tests across `22` suites; line coverage `94.49%`; branch coverage `82.88%`; function coverage `94.11%`; runtime audit clean; CycloneDX SBOM regenerated successfully |
| Runtime baseline | `package.json`, `tsconfig.json` | Node `>=24`, npm `11.6.1`, `package.json` `type: "commonjs"`, TypeScript `module: "nodenext"` |
| Port inventory | `src/ports/*.ts` | `18` port interfaces |
| Adapter inventory | `src/adapters/*.ts` | `23` adapters total: `18` in-memory plus `5` integration/persistence adapters |
| Case lifecycle vocabulary | `src/types.ts` | `17` case states, including `AWAITING_FINAL_RELEASE` and `APPROVED_FOR_HANDOFF` |
| Final-release workflow | `src/routes/review.ts`, `src/store-review.ts`, `docs/API_REFERENCE.md` | approved review outcomes now land in `AWAITING_FINAL_RELEASE`; `POST /api/cases/:caseId/final-releases` is required before handoff |
| Dual authorization guard | `src/store-review.ts`, `tests/security-middleware.test.ts`, `tests/review-routes.test.ts` | releaser must differ from reviewer; same-identity release attempt is rejected with `dual_authorization_required` |
| Handoff authority binding | `src/store-review.ts`, `docs/API_REFERENCE.md` | handoff rejects when no final release exists and rejects when `requestedBy` does not match the final releaser |
| Auth/authz error contract | `src/middleware/auth-context.ts`, `src/middleware/rbac-auth.ts`, `src/middleware/case-access-auth.ts`, `src/app.ts` | auth, RBAC, and case-access denials now normalize to `{ code, message, nextStep, correlationId }` via `ApiError` |

## Commit Boundary

This evidence cut is specifically about the top-of-main behavior after these commits:

1. `bb47ad9` — `Unify auth and RBAC error envelopes`
2. `e48be4b` — `Add final release authorization before handoff`

Everything described here should be interpreted relative to that boundary, not to the earlier April 5 public-export snapshot.

## Drift Boundary

The following surfaces remain historical evidence and should not be treated as the current April 21 baseline:

- [FORMAL_EVIDENCE_REGISTER_2026-04-05.md](FORMAL_EVIDENCE_REGISTER_2026-04-05.md)
- [OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md](reports/OPENRNA_IDENTITY_AND_CANONICALIZATION_AUDIT_2026-04-05.md)
- [OPENRNA_HYPER_AUDIT_2026.md](reports/OPENRNA_HYPER_AUDIT_2026.md)

They remain valuable, but they describe an earlier repository state.

## Watch List

Recheck these claims when the underlying ground truth changes:

- test and coverage metrics after new workflow, review, release, or persistence work;
- handoff and final-release semantics after any RBAC or signer-identity refactor;
- the shared error envelope after any middleware or global error-handler change;
- the release artifact path whenever SBOM generation or provenance workflows change.