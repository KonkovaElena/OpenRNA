# Security Policy

## Supported Version

| Version | Status |
|---------|--------|
| 0.1.x | Supported |

## What This Policy Covers

This policy covers software vulnerabilities in the OpenRNA repository, including:

- API authentication and authorization behavior
- request validation and error handling
- audit-trail integrity
- dependency and supply-chain risk in runtime packages
- CI and repository automation surfaces

This policy does not offer medical, clinical, or regulatory advice.

## Defense-In-Depth Signals

This repository also uses GitHub-native security automation as a secondary signal layer:

- Dependabot for dependency freshness
- dependency review on pull requests
- CodeQL code scanning for JavaScript and TypeScript
- CycloneDX SBOM generation plus GitHub-native artifact attestations for build provenance

These signals do not replace responsible private disclosure. Report suspected vulnerabilities even if automation has not flagged them.

## Reporting A Vulnerability

Preferred path:

1. Use GitHub private vulnerability reporting for this repository if it is enabled.
2. If that channel is unavailable, contact the repository owner through the GitHub profile associated with this repository.

Repository maintainers should treat private vulnerability reporting as part of the expected GitHub settings baseline documented in `GITHUB_MAINTAINER_BASELINE_2026-04.md`.

Please avoid posting exploit details in public issues, discussions, or pull requests.

## What To Include

- affected file, route, or workflow surface
- impact description
- reproduction steps or proof-of-concept
- whether the issue affects default configuration or only a custom deployment
- any relevant dependency version information

## Response Expectations

- triage and acknowledgement as soon as maintainers are able to review the report
- reproduction and impact assessment before a public statement
- fix and disclosure timing based on severity, exploitability, and operational risk

## Operational Boundaries

OpenRNA is a software control-plane slice. A security fix in this repository does not imply clinical validation, regulatory qualification, or suitability for production healthcare deployment.