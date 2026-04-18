# Contributing To OpenRNA

## Scope

OpenRNA is a software control-plane for personalized neoantigen RNA workflows. It is not a bioinformatics caller, not a construct-optimization engine, and not a clinical decision system.

Contributions should preserve that boundary.

## Local Baseline

- Node.js: 24.x Active LTS
- npm: 11.6.1 or compatible within the Node 24 line
- Install: `npm ci`
- Build: `npm run build`
- Test: `npm test`
- Coverage: `npm run test:coverage`

Use `.nvmrc` plus `packageManager` in `package.json` as the reproducibility baseline.

## GitHub Intake And Review Control

- Use the structured issue forms in `.github/ISSUE_TEMPLATE/` for bug reports and feature requests.
- Use `.github/PULL_REQUEST_TEMPLATE.md` when opening a pull request.
- Review ownership is declared in `.github/CODEOWNERS`.
- GitHub-side security gates include CodeQL analysis and dependency review, but they do not replace local build and test verification.

## Change Lanes

### Code lane

Use this lane when changing `src/**`, `tests/**`, `package.json`, `tsconfig.json`, or the CI surface.

Minimum verification:

1. `npm run build`
2. `npm test`
3. `npm run test:coverage` for non-trivial changes
4. `npm audit --omit=dev --audit-level=high` if dependency or lockfile state changed
5. `npm run sbom:cyclonedx -- > openrna-runtime-sbom.cdx.json` when changing dependency or supply-chain surfaces

### Docs lane

Use this lane when changing `README.md`, `docs/design.md`, `docs/**`, or other publication surfaces.

Rules:

1. Prefer concise, objective writing.
2. Distinguish implemented behavior from research-backed claims and future bets.
3. Use primary sources for clinical, regulatory, toolchain, and dependency claims.
4. Update `docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md` if the public claim surface materially changes.

## Evidence Discipline

- Do not describe a feature as implemented unless it exists in this repository and passes verification.
- Do not present strategic or research-only modalities as production baseline.
- Do not add marketing language that outruns the evidence pack.
- If a claim depends on a publication, registry, or official guidance, cite the primary source in the affected document.

## Pull Request Checklist

Before opening a PR, verify all applicable items:

1. The repository still builds and tests cleanly.
2. New docs do not overclaim clinical, regulatory, or investor readiness.
3. Security-sensitive changes are reflected in [SECURITY.md](SECURITY.md) when needed.
4. Public entrypoints (`README.md`, `docs/**`) stay consistent with the actual codebase.
5. Dependency or workflow changes can pass the GitHub dependency review and CodeQL lanes.

## Security Issues

Do not open public issues with exploit details. Use the reporting path in [SECURITY.md](SECURITY.md).