---
title: "OpenRNA — Investor Technical Summary"
status: active
version: "1.0.0"
last_updated: "2026-04-04"
tags: [investor, summary, oncology, mrna, control-plane]
---

# OpenRNA — Investor Technical Summary

**One-line**: Open-source control plane for personalized neoantigen RNA vaccine workflows. The governance layer between bioinformatics pipelines and clinical delivery.

---

## The Problem

Personalized neoantigen mRNA vaccines are the most promising frontier in cancer immunotherapy. Moderna/Merck's V940 showed a **44% reduction in recurrence or death** in melanoma (KEYNOTE-942, *Lancet* 2024). Their Phase 3 trial — INTerpath-001 — has **1,089 patients across 165 sites in 20+ countries**, with primary completion expected October 2029.

But every patient is a batch of one: tumor sequencing → neoantigen prediction → mRNA construct design → LNP formulation → administration. That's a 4-8 week per-patient manufacturing pipeline that requires **consent governance, sample provenance, workflow orchestration, quality gates, expert review, manufacturing handoff, and outcome tracking** — all auditable.

No open-source tool does this. pVACtools ranks neoantigens. Nextflow runs pipelines. Nobody governs the clinical workflow between them.

## The Market

| Metric | Value | Source |
|--------|-------|--------|
| mRNA therapeutics market (2023) | $11.75B | Grand View Research |
| mRNA therapeutics market (2030 projected) | $31.30B | Grand View Research |
| CAGR | 17.05% | Grand View Research |
| Fastest-growing segment | Oncology | Grand View Research |
| Active clinical trials (neoantigen mRNA, April 2026) | 17 active/recruiting | ClinicalTrials.gov |
| Largest trial | INTerpath-001: 1,089 patients, 165 sites | NCT05933577 |

## What We've Built

OpenRNA is a TypeScript/Node.js control plane — not a pipeline, not a bioinformatics tool. It orchestrates the patient journey from intake to outcome.

**By the numbers (verified April 3, 2026):**

| Metric | Value |
|--------|-------|
| Tests | 430 across 22 suites |
| Line coverage | 94.81% |
| Branch coverage | 82.64% |
| Function coverage | 94.07% |
| Domain port interfaces | 17 |
| Adapter implementations | 20 (16 in-memory + 4 PostgreSQL/Nextflow) |
| Case lifecycle states | 15 |
| Runtime vulnerabilities | 0 (`npm audit --omit=dev --audit-level=high`) |
| License | Apache-2.0 |

**Key capabilities:**
- 15-state case lifecycle from intake through handoff
- Multi-modality construct design (mRNA, saRNA, circRNA) with activation governance
- Multi-tool HLA consensus with configurable disagreement thresholds
- Deny-by-default RBAC + active-consent gating on case-scoped writes
- Full audit trail with machine-readable events and correlation IDs
- CycloneDX SBOM generation + Sigstore provenance attestation
- CI/CD with CodeQL SAST, dependency review, and automated release publishing

## Why Now

1. **V940 Phase 3 readout (~2028-2029)** — if positive, establishes the regulatory precedent for personalized neoantigen vaccines. The first control-plane builder captures the integration layer.
2. **No open-source competitor** — the governance layer between pipelines and clinical delivery is unserved. Pharma builds proprietary; academia builds pipelines. Neither builds the connective tissue.
3. **Modality-agnostic** — mRNA, saRNA, circRNA all flow through the same governance layer. We capture upside from ANY RNA modality that wins, not just one.

## What's Honest

We separate what exists from what's planned. Every claim carries an evidence tier:
- **T1**: Implemented and locally verified
- **T2**: Validated by external evidence (peer-reviewed, registry-backed)
- **T3**: Strategic bet (early data)
- **T4**: Scenario horizon

**What we don't have yet**: electronic signatures (Part 11), resource-scoped RBAC, durable PostgreSQL event store, real patient data, commercial traction. These are documented gaps, not hidden ones.

## Comparable Exits

| Company | Category | Valuation | Relevance |
|---------|----------|-----------|-----------|
| Recursion | AI drug discovery platform | $6B+ | Platform > product thesis |
| Tempus AI | Clinical data infrastructure | IPO 2024 | Data infra for precision medicine |
| Benchling | Lab workflow software | $6.1B (2021) | Workflow governance for life sciences |
| DNAnexus | Genomics data management | Acquired | Compute + governance layer |

OpenRNA sits in the intersection: **workflow governance** (like Benchling) for **precision oncology** (like Tempus) using **open-source infrastructure** (like Nextflow).

## Architecture

```
[Molecular Profiling] → [Neoantigen Ranking] → [Construct Design] → [Manufacturing Handoff]
       ↑                       ↑                      ↑                      ↑
   Nextflow/nf-core      pVACtools/ensemble      mRNAid/ViennaRNA      Release workflow
       ↑                       ↑                      ↑                      ↑
   ════════════════════════════════════════════════════════════════════════════
                        OpenRNA CONTROL PLANE
   ════════════════════════════════════════════════════════════════════════════
   Case lifecycle  │  HLA consensus  │  Modality registry  │  Board packets
   15-state FSM    │  Multi-tool     │  mRNA/saRNA/circRNA  │  Expert review
   Audit trail     │  Disagreement   │  Construct design    │  Handoff tracking
   Consent gates   │  gates          │  Linker strategies   │  Outcome timeline
```

## Next Steps

1. **Resource-scoped authorization** — case ownership, tenant access, reviewer binding
2. **Durable event store** — PostgreSQL domain-event journal (current: in-memory replay)
3. **Release authority** — asymmetric signing, dual-authorization ceremony
4. **Real adapter integration** — Nextflow + pVACtools + clinical FHIR export

---

*April 4, 2026. All numbers verified against primary sources. NCT IDs resolve on ClinicalTrials.gov. Market data from Grand View Research (2024 report). Test counts from local `npm test` execution.*
