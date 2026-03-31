---
title: "Toolchain and Open-Source Baseline — March 2026"
status: active
evidence_cutoff: "2026-03-31"
---

# Toolchain and Open-Source Baseline

This document records the dependency currency state, migration decisions, and open-source bioinformatics reference landscape as of March 2026. It is companion material to `design.md` v3.0.0.

---

## 1. Runtime and Language

### 1.1 Node.js

| Field | Value |
|-------|-------|
| **Required** | ≥22 LTS (`engines.node` in package.json) |
| **Current LTS** | 22.x (Active LTS through April 2027) |
| **Latest stable** | 23.x (Current, not LTS) |
| **Decision** | Stay on 22 LTS. No features in 23.x justify leaving the LTS track for a production control-plane. Reassess when Node.js 24 enters LTS (October 2026). |

Key Node.js 22 features used by this project:
- Native `node:test` runner (used for all 296+ tests)
- Built-in `fetch` (available but not used; all HTTP surface is Express)
- V8 12.x with improved async performance
- ESM loader hooks stabilized (not used; project is CJS)

### 1.2 TypeScript

| Field | Value |
|-------|-------|
| **Pinned** | ^6.0.2 |
| **Previous** | 5.8.2 |
| **Migration date** | 2026-03-31 |

**Migration decision**: TypeScript 6.0 was released in March 2026. Key changes relevant to this project:

| TS 6 Change | Impact | Action Taken |
|-------------|--------|-------------|
| `moduleResolution: "Node"` deprecated | Renamed to `node10` in TS 6 | Removed explicit `moduleResolution: "bundler"`; TS 6 defaults to `node10` for CJS |
| `module: "node20"` requires `.js` extensions | Would require sweeping import changes | Not adopted — kept `module: "CommonJS"` which implies `node10` resolution |
| Stricter `isolatedDeclarations` default | No impact (not enabled) | None |
| Improved type narrowing for discriminated unions | Beneficial for Zod schemas | Free improvement |
| `--erasableSyntax` flag | Not needed (tsx handles TS stripping) | None |

**Why `CommonJS` without explicit `moduleResolution`**: The `bundler` resolution was designed for bundled web projects, not Node.js backends — it was an incorrect migration choice. The correct TS 6 approach for a CJS Node.js project is `module: "CommonJS"` with no explicit `moduleResolution` (defaults to `node10`, the TS 6 rename of the deprecated `"Node"`). The alternative `module: "node20"` would require `.js` extensions on all relative imports — a high-churn refactor with zero runtime benefit for a CJS project.

### 1.3 tsconfig.json Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "rootDir": ".",
    "outDir": "dist",
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

**Potential future hardening** (not done in this audit, deferred):
- `"noUncheckedIndexedAccess": true` — catches unguarded array/object access. High-value but requires sweeping changes.
- `"exactOptionalPropertyTypes": true` — distinguishes `undefined` from missing property. Useful for config types.
- `"isolatedDeclarations": true` — only useful if publishing .d.ts (not applicable).

---

## 2. Dependencies

### 2.1 Production Dependencies

| Package | Pinned | Latest (March 2026) | Status | Note |
|---------|--------|---------------------|--------|------|
| **express** | ^5.0.0 | 5.2.1 | ✅ Current | Migrated from 4.x in this audit. Express 5 includes native promise support for middleware, improved router, removed deprecated APIs |
| **pg** | ^8.20.0 | 8.20.0 | ✅ Current | PostgreSQL client. Stable; no breaking changes expected in 8.x |
| **zod** | ^4.3.6 | 4.3.6 | ✅ Current | Runtime validation. Zod 4 (2025) brought major performance improvements and simplified API |

### 2.2 Development Dependencies

| Package | Pinned | Latest (March 2026) | Status | Note |
|---------|--------|---------------------|--------|------|
| **typescript** | ^6.0.2 | 6.0.2 | ✅ Current | Migrated from 5.8.2 |
| **tsx** | ^4.21.0 | 4.21.0 | ✅ Current | TypeScript execution via esbuild. Used for `npm run dev` and test runner |
| **supertest** | ^7.2.2 | 7.2.2 | ✅ Current | HTTP assertion library for Express testing |
| **@types/express** | ^5.0.6 | 5.0.6 | ✅ Current | Express 5 type definitions |
| **@types/node** | ^22.19.15 | 22.19.15 | ✅ Current | Node.js type definitions aligned with Node 22 LTS |
| **pg-mem** | ^3.0.14 | 3.0.14 | ✅ Current | In-memory PostgreSQL emulator for testing |

### 2.3 Dependency Philosophy

- **Zero non-essential production dependencies.** Runtime contains only Express, pg, and Zod. No ORM, no logging framework, no config library. All abstracted through domain ports.
- **Testing uses Node.js built-in `node:test` runner.** No Jest/Vitest/Mocha dependency.
- **tsx for development-time TS execution.** Faster than ts-node; esbuild-based.
- **No lock on patch versions.** All ranges use `^` (SemVer compatible). `package-lock.json` pins exact versions for reproducibility.

---

## 3. Express 5 Migration Details

### 3.1 Pre-migration Scan Results

The following Express 5 breaking changes were scanned for in the codebase with zero matches:

| Removed/Changed API | Found in Codebase | Verdict |
|---------------------|-------------------|---------|
| `app.del()` | ❌ No | Clean |
| `app.param(fn)` (function overload) | ❌ No | Clean |
| `req.param()` | ❌ No | Uses `req.params` |
| `req.host` (without proxy trust) | ❌ No | Not used |
| `res.redirect('back')` | ❌ No | Clean |
| `res.redirect(url, status)` (argument order) | ❌ No | Uses `res.redirect(status, url)` |
| `res.sendfile` (lowercase) | ❌ No | Clean |
| Wildcard route `*` without name | ❌ No | Named params used |
| `res.json(null)` behavior change | ✅ Used | No-op; `null` still valid JSON |
| Middleware `err` as 4th param | ✅ Used | Compatible (unchanged in Express 5) |

### 3.2 Express 5 Benefits Gained

- **Native async/await error handling**: Rejected promises in route handlers are now automatically caught and forwarded to error middleware. Previously required `express-async-errors` wrapper or manual try/catch.
- **Improved `req.query` parsing**: Uses `qs` 6.x by default (already was in Express 4 with standard settings).
- **Path-to-regexp v8**: Stricter route matching; our routes use only simple `/path/:param` patterns and are fully compatible.
- **Removed deprecated API surface**: Smaller Express core.

### 3.3 Verification

- Full test suite: **296/296 pass** on Express 5.
- TypeScript compilation: **zero errors**.
- Runtime smoke (dev mode): `/healthz`, `/readyz`, API routes all operational.

---

## 4. Open-Source Bioinformatics Reference

These tools are not dependencies of this repository but represent the upstream/downstream ecosystem that the platform's port interfaces are designed to integrate with:

### 4.1 Pipeline Orchestration

| Tool | Version | License | Use |
|------|---------|---------|-----|
| **Nextflow** | 24.x (DSL2) | Apache-2.0 | Workflow orchestration for sequencing + variant calling + neoantigen prediction pipelines |
| **nf-core/sarek** | 3.x | MIT | Somatic variant calling pipeline (WGS/WES) |
| **Snakemake** | 8.x | MIT | Alternative workflow engine |

Platform integration: `INextflowClient` port and `IWorkflowRunner` port abstract external pipeline execution. `IReferenceBundleRegistry` pins pipeline versions.

### 4.2 Neoantigen Prediction

| Tool | Version | License | Use |
|------|---------|---------|-----|
| **pVACtools** | 4.x | AGPL-3.0 | Primary neoantigen prediction pipeline |
| **NetMHCpan** | 4.1 | Academic (DTU) | MHC-I binding prediction (gold standard) |
| **MHCflurry** | 2.1+ | Apache-2.0 | Open-source MHC binding prediction |
| **PRIME** | 2.0 | Academic | Antigen presentation likelihood |

Platform integration: `INeoantigenRankingEngine` port receives ranked neoantigen candidates from these tools. `IHlaConsensusProvider` resolves multi-tool HLA typing disagreements.

### 4.3 RNA Engineering / Optimization

| Tool | Version | License | Use |
|------|---------|---------|-----|
| **ViennaRNA** | 2.6+ | Custom (free) | RNA secondary structure prediction (MFE) |
| **mRNAid** | Latest | MIT | Codon optimization + UTR selection |
| **LinearDesign** | Latest | Research | mRNA structure-codon co-optimization (Baidu) |
| **DNA Chisel** | Latest | MIT | Sequence constraint optimization |

Platform integration: `IConstructDesigner` port generates constructs; these tools would be invoked within or downstream of construct design adapters.

### 4.4 OpenVax Suite

| Tool | Purpose | License | Status |
|------|---------|---------|--------|
| **Vaxrank** | Neoantigen ranking + vaccine peptide selection | Apache-2.0 | Research-grade; less active maintenance |
| **isovar** | Variant-to-protein translation | Apache-2.0 | RNA-seq aware variant effect prediction |
| **varcode** | Variant annotation | Apache-2.0 | Variant effects on coding sequences |
| **pyensembl** | Ensembl genome annotation | Apache-2.0 | Gene model queries |

Platform integration: Academic reference pipeline. Components may be used within `INeoantigenRankingEngine` adapter implementations.

---

## 5. Deferred Toolchain Decisions

| Decision | Rationale for Deferral | Reassess When |
|----------|----------------------|---------------|
| ESM migration (`"type": "module"`) | No runtime benefit; high churn for import paths. CJS works well with `tsx` and `node:test` | Node.js 24 LTS or if ESM-only dependency is required |
| `noUncheckedIndexedAccess` | High-value safety, but requires substantial code changes | Dedicated hardening sprint |
| Monorepo structure (nx/turborepo) | Current project is single-package. Premature for 39 source files | When project exceeds ~80 source files or adds separate services |
| CI/CD pipeline definition | No CI yet. GitHub Actions or similar when collaborative development begins | When team size > 1 or when approaching IND submission |
| ORM adoption (Drizzle/Prisma/Kysely) | Plain `pg` + domain ports provide sufficient abstraction. ORM adds coupling | When query complexity exceeds manual SQL ergonomics |
| Containerization (Docker/OCI) | Not blocking development. Compose file exists at repo root level for PostgreSQL | When deploying to staging or production environment |

---

*Last updated: 2026-03-31. All dependency versions verified against npm registry and project package-lock.json.*
