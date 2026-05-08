# OpenRNA PQ Execution Report

> Template only — not execution evidence until completed, signed, dated, and renamed to `PQ_EXECUTION_REPORT_YYYY-MM-DD.md` after execution in a production-representative PostgreSQL environment.

## 1. Execution Metadata

| Field | Value |
|---|---|
| Execution date | YYYY-MM-DD |
| Environment name | TBD |
| Environment classification | Integration / validation / production-representative |
| Executor name | TBD |
| Executor role | TBD |
| Reviewer name | TBD |
| Git commit SHA | TBD |
| OpenRNA version / release tag | TBD |
| PostgreSQL instance | TBD |
| OIDC / JWKS provider used for PQ-007 | TBD |

## 2. Preconditions

- IQ execution record completed and accepted: ☐ Yes / ☐ No — reference: TBD
- OQ test report completed and accepted: ☐ Yes / ☐ No — reference: TBD
- PostgreSQL migrations 001–004 applied: ☐ Yes / ☐ No
- NTP synchronization active: ☐ Yes / ☐ No
- Test data set approved for validation use: ☐ Yes / ☐ No

## 3. PQ Scenario Results

| PQ-ID | Scenario | Acceptance Criterion | Result | Evidence / Notes |
|---|---|---|---|---|
| PQ-001 | Create and fully process 50 concurrent cases through to HANDOFF_PENDING | All 50 cases reach terminal state; audit chain valid for all; no data corruption | ☐ Pass / ☐ Fail | TBD |
| PQ-002 | Submit 200 sequential workflow requests with idempotency keys | Exactly 200 distinct workflow records; no duplicate dispatch; idempotency violations return 409 | ☐ Pass / ☐ Fail | TBD |
| PQ-003 | Audit chain integrity after 1000 audit events across 20 cases | Verify endpoint returns `{ valid: true }` for all 20 cases | ☐ Pass / ☐ Fail | TBD |
| PQ-004 | Rate limiting under burst (150 req/s for 10s) | 429 for excess requests; no 500 errors; recovery after burst | ☐ Pass / ☐ Fail | TBD |
| PQ-005 | Database restart during active workflow | In-flight mutations complete or roll back; no partial audit records; readiness recovers ≤30s | ☐ Pass / ☐ Fail | TBD |
| PQ-006 | Consent withdrawal during active WORKFLOW_RUNNING state | Case transitions to CONSENT_WITHDRAWN; subsequent mutations rejected; audit event recorded | ☐ Pass / ☐ Fail | TBD |
| PQ-007 | Identity-bound signature with OIDC JWKS URI | RS256 JWT accepted; `principalId` from `sub`; `serverSeal` present on review outcome | ☐ Pass / ☐ Fail | TBD |
| PQ-008 | FHIR export round-trip for 5 cases with complete evidence bundles | All 5 bundles pass FHIR R4 validation; required fields present | ☐ Pass / ☐ Fail | TBD |

## 4. Deviations

| Deviation ID | PQ-ID | Description | Root Cause | Corrective Action | Retest Result |
|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD |

## 5. Final PQ Disposition

- Overall result: ☐ Pass / ☐ Fail
- System qualified for intended validation use: ☐ Yes / ☐ No

## 6. Signatures

| Role | Name | Signature | Date |
|---|---|---|---|
| Executor | TBD | TBD | YYYY-MM-DD |
| Validation reviewer | TBD | TBD | YYYY-MM-DD |
| System owner / responsible person | TBD | TBD | YYYY-MM-DD |
