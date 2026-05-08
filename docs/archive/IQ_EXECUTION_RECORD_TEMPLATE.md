# OpenRNA IQ Execution Record

> Template only — not execution evidence until completed, signed, dated, and renamed to `IQ_EXECUTION_RECORD_YYYY-MM-DD.md` after execution on the target environment.

## 1. Execution Metadata

| Field | Value |
|---|---|
| Execution date | YYYY-MM-DD |
| Environment name | TBD |
| Environment classification | Target / validation / staging / production-representative |
| Executor name | TBD |
| Executor role | TBD |
| Reviewer name | TBD |
| Git commit SHA | TBD |
| OpenRNA version / release tag | TBD |

## 2. Environment Snapshot

| Item | Observed value | Evidence command / source |
|---|---|---|
| Operating system | TBD | `uname -a` / OS inventory |
| Node.js version | TBD | `node --version` |
| npm version | TBD | `npm --version` |
| PostgreSQL version | TBD | `psql --version` / managed DB inventory |
| Database host / instance id | TBD | CMDB / deployment record |
| NTP source and offset | TBD | `chronyc tracking` / `ntpq -p` |

## 3. IQ Checklist Execution

| IQ-ID | Item | Method | Acceptance Criterion | Result | Evidence / Notes |
|---|---|---|---|---|---|
| IQ-001 | Node.js runtime version ≥ 24 | `node --version` | Output matches `v24.x.x` | ☐ Pass / ☐ Fail | TBD |
| IQ-002 | npm version ≥ 11 | `npm --version` | Output ≥ `11.x.x` | ☐ Pass / ☐ Fail | TBD |
| IQ-003 | All production dependencies installed | `npm ci --omit=dev` exits 0 | Exit code = 0 | ☐ Pass / ☐ Fail | TBD |
| IQ-004 | No high/critical vulnerabilities | `npm audit --omit=dev --audit-level=high` | Zero vulnerabilities reported | ☐ Pass / ☐ Fail | TBD |
| IQ-005 | TypeScript compilation succeeds | `npm run build` | Exit code = 0; `dist/` populated | ☐ Pass / ☐ Fail | TBD |
| IQ-006 | PostgreSQL version ≥ 15 | `psql --version` | Version ≥ 15 | ☐ Pass / ☐ Fail | TBD |
| IQ-007 | All database migrations applied | Information schema query | Required tables present | ☐ Pass / ☐ Fail | TBD |
| IQ-008 | Migration 004 columns present | Audit table schema inspection | `record_hash` and `prev_hash` columns exist | ☐ Pass / ☐ Fail | TBD |
| IQ-009 | Environment configuration valid | Application startup/config validation | No config-schema errors | ☐ Pass / ☐ Fail | TBD |
| IQ-010 | CycloneDX SBOM generated | `npm run sbom:cyclonedx:file` | SBOM generated successfully | ☐ Pass / ☐ Fail | TBD |
| IQ-011 | `SIGNATURE_SEAL_KEY` ≥ 32 bytes set in production | Config schema validation | `loadConfig()` succeeds | ☐ Pass / ☐ Fail | TBD |
| IQ-012 | NTP synchronization active | `chronyc tracking` or `ntpq -p` | Offset < 100ms, stratum ≤ 3 | ☐ Pass / ☐ Fail | TBD |

## 4. Deviations

| Deviation ID | IQ-ID | Description | Root Cause | Corrective Action | Retest Result |
|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD |

## 5. Final IQ Disposition

- Overall result: ☐ Pass / ☐ Fail
- OQ may proceed: ☐ Yes / ☐ No

## 6. Signatures

| Role | Name | Signature | Date |
|---|---|---|---|
| Executor | TBD | TBD | YYYY-MM-DD |
| Validation reviewer | TBD | TBD | YYYY-MM-DD |
