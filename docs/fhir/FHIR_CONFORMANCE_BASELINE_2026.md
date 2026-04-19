---
title: "OpenRNA FHIR Conformance Baseline (R4)"
status: active
version: "1.0.0"
last_updated: "2026-04-19"
tags: [fhir, interoperability, conformance, genomics]
---

# OpenRNA FHIR Conformance Baseline (R4)

## Purpose

Define the current FHIR interoperability baseline implemented by OpenRNA and separate implemented behavior from site-level qualification claims.

## Supported Export Surface

| Route | Output | Notes |
|---|---|---|
| `GET /api/cases/:caseId/fhir/bundle` | FHIR `Bundle` (collection) | Case-level export assembled from OpenRNA case state |
| `GET /api/cases/:caseId/fhir/hla-consensus` | Array of FHIR `Observation` | HLA consensus projection when consensus data exists |

## Profile Baseline

Current exporter mapping is aligned to FHIR R4 semantics and uses Clinical Genomics profile references where applicable.

Current profile references in exporter:
- `http://hl7.org/fhir/uv/genomics-reporting/StructureDefinition/genotype`

Current resource patterns in use:
- `Patient`
- `DiagnosticReport`
- `Observation`
- `Bundle`

## Versioned Capability Artifact

Published capability baseline artifact:
- `docs/fhir/CAPABILITY_STATEMENT_R4_2026-04.json`

This artifact is repository-scoped documentation evidence. It is not a statement that all target deployment sites already expose a production FHIR endpoint with equivalent behavior.

## Validation Evidence

Automated evidence surfaces:
- `tests/fhir-exporter.test.ts`
- `tests/consent-gate.test.ts` (consent-gated FHIR route behavior)
- `tests/rbac-coverage.test.ts` (RBAC enforcement on FHIR routes)

## Claim Boundary

Safe current claim:
- OpenRNA has a working FHIR export seam with tested R4-shaped payload generation.

Not yet justified without deployment evidence:
- Full site-level interoperability qualification across partner EHR/LIMS ecosystems.
- National profile certification or jurisdiction-specific conformance attestation.

## External Standards References

- HL7 FHIR specification overview: `https://www.hl7.org/fhir/`
- HL7 Clinical Genomics IG: `https://hl7.org/fhir/uv/genomics-reporting/`
