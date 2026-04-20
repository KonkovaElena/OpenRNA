---
title: "Academic Analysis: OpenRNA as a Personalized Neoantigen mRNA Vaccine Control Plane"
status: active
version: "1.3.0"
last_updated: "2026-04-02"
tags: [academic-analysis, oncology, mrna, neoantigen, control-plane, architecture]
evidence_cutoff: "2026-04-02"
---

# Academic Analysis: OpenRNA Platform

## Abstract

This document provides a peer-review-grade analysis of the OpenRNA platform — a TypeScript/Node.js control plane for orchestrating personalized neoantigen mRNA vaccine workflows. The analysis covers medical context, technical architecture, gap assessment, competitive positioning, and a phased strategic roadmap. All claims are fact-checked against primary sources (PubMed, ClinicalTrials.gov, official product documentation) as of April 2026.

The April 2, 2026 refresh tightens the recommendation layer around the repository's actual implementation seams. Recommendations are explicitly framed as evolutions of current OpenRNA capabilities rather than as greenfield architecture proposals.

Evidence tier markers follow the 4-tier system defined in `design.md`:
- **[T1]** Implemented in this repository
- **[T2]** Validated trajectory (Phase 2+/3 data, peer-reviewed)
- **[T3]** Strategic bet (early data, not standard of care)
- **[T4]** Scenario horizon (planning hypotheses)

## Method and Evidentiary Discipline

This refresh uses three evidence lanes in parallel:

1. **Primary clinical and regulatory sources**: ClinicalTrials.gov registry entries, eCFR Title 21 Part 11, and stable FDA guidance pages.
2. **Repository-grounded inspection**: direct reads of ports, adapters, middleware, migrations, tests, and tracked workflow surfaces in this repository.
3. **Official technical documentation**: current Stately/XState v5, Nextflow, and OpenTelemetry Node.js documentation for architecture recommendations that depend on version-sensitive upstream behavior.

Promotion rule: a claim is moved into active text only when it is either directly verified against current code, directly supported by a current primary source, or explicitly labeled as a recommendation or scenario horizon. This pass intentionally withholds unstable or weakly sourced claims such as country-level rollout stories, near-certain approval-timing promises, or stale ecosystem popularity counters.

---

## I. Medical Context: Neoantigen mRNA Vaccine Landscape [T2]

### 1.1 Clinical Rationale

Personalized neoantigen mRNA vaccines exploit the **unique somatic mutational landscape** of each patient's tumor. Unlike shared-antigen approaches (e.g., NY-ESO-1, MAGE-A), neoantigen vaccines target tumor-specific mutations absent from normal tissues, minimizing autoimmune risk while maximizing T-cell specificity.

The manufacturing paradigm is **patient-as-batch-of-one**: tumor sequencing → neoantigen prediction → mRNA construct design → LNP formulation → patient administration, typically within a 4-8 week window.

### 1.2 Landmark Clinical Evidence

#### mRNA-4157/V940 (Moderna/Merck) [T2]

| Parameter | Evidence |
|-----------|---------|
| **Trial** | KEYNOTE-942 / V940-001 (Phase 2b, randomized, n=157) |
| **Indication** | Adjuvant high-risk melanoma (Stage III/IV, post-resection) |
| **Combination** | Pembrolizumab (KEYTRUDA) |
| **Primary endpoint** | Recurrence-free survival (RFS) |
| **Key result** | 44% reduction in recurrence or death (HR 0.561) |
| **Publications** | Weber et al., *Lancet* 2024; Khattak et al., *Nature Medicine* 2025 |
| **Phase 3** | INTerpath-001 (NCT05933577) — active, not recruiting as of March 2026 |
| **Construct capacity** | Up to 34 neoantigens per patient-specific mRNA sequence |

**Fact-check**: ClinicalTrials.gov confirms NCT05933577 is registered as "A Clinical Study of Intismeran Autogene (V940) Plus Pembrolizumab in People With High-Risk Melanoma." The KEYNOTE-942 HR 0.561 result is peer-reviewed in *Lancet* 2024. Additional expansion cohorts: NSCLC (V940-002), adjuvant renal cell carcinoma — active enrollment confirmed.

**Significance**: This represents the most advanced clinical program for personalized neoantigen mRNA vaccination. If INTerpath-001 confirms the Phase 2b signal, it establishes the regulatory precedent for the entire class.

#### Autogene Cevumeran / BNT-122 (BioNTech/Genentech) [T2]

| Parameter | Evidence |
|-----------|---------|
| **Trial (PDAC)** | Phase 1, resected pancreatic ductal adenocarcinoma (n=34 enrolled, 16 vaccinated) |
| **Combination** | Atezolizumab (anti-PD-L1) + mFOLFIRINOX chemotherapy |
| **Key result** | 8/16 patients showed de novo neoantigen-specific T-cell responses (IFNγ+ by ELISpot); responders did not reach 18-month RFS endpoint; non-responder median RFS 13.4 months |
| **Publication** | Rojas et al., *Nature* 2023 (PMID: 37165196, PMC10171177) |
| **Phase 2 PDAC** | IMCODE003 (NCT05968326) — adjuvant autogene cevumeran + atezolizumab + mFOLFIRINOX vs mFOLFIRINOX alone |
| **Solid tumors** | Phase 1 expanded: 71% neoantigen-specific immune response (15/21 patients); responses durable up to 23 months (Weber et al., *Nature Medicine* 2025) |
| **Construct capacity** | Up to 20 neoantigen mRNA species per patient |

**Fact-check**: The Nature 2023 publication (Rojas et al.) supports the 8/16 responder signal in PDAC, and the current IMCODE003 ClinicalTrials.gov entry confirms the active randomized PDAC follow-on program.

#### Clinical Trial Landscape (ClinicalTrials.gov, April 2026) [T2]

A search for "personalized neoantigen mRNA vaccine" on ClinicalTrials.gov returns **25 registered studies** covering:
- Pancreatic cancer (multiple Phase 1-2 trials)
- Advanced esophageal cancer / NSCLC (NCT03908671)
- Advanced digestive system neoplasms (NCT03468244)
- Advanced malignant solid tumors (NCT05949775)
- B-cell non-Hodgkin's lymphoma (NCT07334574, newly registered)

PubMed shows **238 results** for "neoantigen mRNA vaccine personalized cancer" as of April 2026, with an accelerating publication rate: ~70 papers in 2025-2026 alone.

These search tallies are point-in-time evidence snapshots, not stable market counters. They should be refreshed rather than reused as evergreen numeric claims.

### 1.3 Key Limitation: Attribution in Combination Therapy

All landmark trials use mRNA vaccines **in combination** with checkpoint inhibitors (pembrolizumab, atezolizumab) and/or chemotherapy. Attributing clinical benefit specifically to the vaccine component requires:
- Neoantigen-specific T-cell assays (ELISpot, MHC multimer, TCR sequencing)
- Responder/non-responder stratification within the vaccinated arm
- Careful immune monitoring endpoints separate from composite survival

This is a methodological limitation of the field, not a flaw in individual trial design.

### 1.4 Why the Control-Plane Layer Matters Now [T2]

The two registry-backed anchors in this document — `NCT05933577` for intismeran autogene plus pembrolizumab in high-risk melanoma and `NCT05968326` for autogene cevumeran plus atezolizumab and mFOLFIRINOX in resected PDAC — are not single-center proofs of concept. They are live multicenter programs with long follow-up windows, combination regimens, and substantial operational complexity.

That complexity is exactly where a control plane matters. A computational pipeline can rank candidates, but it does not by itself manage per-case consent state, sample provenance, reference-bundle pinning, review packets, handoff traceability, or outcome linkage. OpenRNA's relevance therefore increases as the field moves from isolated translational studies toward repeatable, auditable patient-specific operations.

---

## II. OpenRNA Positioning: Control Plane, Not Pipeline [T1]

### 2.1 Architectural Identity

OpenRNA is not a bioinformatics pipeline. It is a **clinical workflow control plane** that orchestrates the pipeline-to-patient pathway:

```
[Molecular Profiling] → [Neoantigen Ranking] → [Construct Design] → [Manufacturing Handoff]
       ↑                       ↑                      ↑                      ↑
   Nextflow/nf-core      pVACtools/ensemble      mRNAid/ViennaRNA      Release workflow
       ↑                       ↑                      ↑                      ↑
   ════════════════════════════════════════════════════════════════════════════
                        OpenRNA CONTROL PLANE [T1]
   ════════════════════════════════════════════════════════════════════════════
       │                       │                      │                      │
   Case lifecycle       HLA consensus          Modality registry      Board packets
   15-state FSM         Multi-tool evidence    mRNA/saRNA/circRNA     Expert review
   Audit trail          Disagreement gates     Construct generation    Handoff tracking
   Sample tracking      Confidence scoring     Linker strategies      Outcome timeline
```

This separation is deliberate and defensible:
- **Bioinformatics tools evolve faster** than clinical governance workflows → decoupling prevents lock-in
- **Regulatory compliance** requires auditable control flow independent of computational engines
- **Clinical workflows** (consent, review, release) are inherently stateful and sequential → state machine design is natural

### 2.2 Differentiation from Bioinformatics Pipelines

| Aspect | pVACtools / Nextflow | OpenRNA |
|--------|---------------------|---------|
| **Primary function** | Compute (variant calling, HLA prediction, ranking) | Orchestrate (case lifecycle, review, handoff) |
| **State model** | Stateless per-run or file-based | 15-state persistent FSM with audit trail |
| **Output** | Ranked neoantigen lists | Complete clinical-grade packets (board, handoff, outcome) |
| **Regulatory surface** | Scientific validation | Operational compliance (audit trail, traceability, immutability) |
| **Patient context** | Per-sample analysis | End-to-end case from intake to outcome |
| **Learning loop** | None (batch computation) | Outcome-to-refinement feedback path |

### 2.3 Relation to Existing Open-Source Ecosystem

OpenRNA **consumes outputs** from, but does not replicate, existing tools:

| Tool | Role | Integration Point in OpenRNA |
|------|------|------------------------------|
| **pVACtools** (Griffith Lab, BSD-3-Clause-Clear) | Neoantigen prediction and ranking | `INeoantigenRankingEngine` port — accepts external ranking results |
| **MHCflurry** (v2.x, Keras-based) | Class I MHC binding prediction | Input to HLA consensus via `IHlaConsensusProvider` |
| **NetMHCpan** (v4.1, DTU) | Pan-allele HLA-I binding | Input to HLA consensus |
| **PRIME** (v2.0) | Immunogenicity prediction | Supportive ranking signal |
| **Nextflow DSL2** (v24.x) | Workflow orchestration | `INextflowClient`, `IWorkflowRunner` ports |
| **nf-core** (600+ pipelines) | Maintained genomics workflows | Upstream pipeline references |
| **ViennaRNA** (v2.6.x) | RNA secondary structure | Construct design optimization input |
| **mRNAid** (v1.x) | mRNA sequence optimization | Construct design layer |

This analysis avoids hardcoded upstream popularity and release counters in active text because they drift faster than the repository implementation surface.

Official Nextflow documentation still positions workflows as asynchronous dataflow graphs with executor abstraction across local, HPC, cloud, and Kubernetes environments. That reinforces the architectural split used here: OpenRNA should govern patient-specific case state above the compute graph, not try to become a second workflow engine.

---

## III. Technical Architecture Analysis [T1]

### 3.1 Case Lifecycle State Machine

The implemented status vocabulary is the architectural backbone, and it is more branched than a single manufacturing-style linear pipeline:

```
INTAKING
AWAITING_CONSENT
READY_FOR_WORKFLOW
WORKFLOW_REQUESTED
WORKFLOW_RUNNING
WORKFLOW_COMPLETED
WORKFLOW_CANCELLED
WORKFLOW_FAILED
QC_PASSED
QC_FAILED
AWAITING_REVIEW
APPROVED_FOR_HANDOFF
REVISION_REQUESTED
REVIEW_REJECTED
HANDOFF_PENDING
```

This list is verified against `src/types.ts` and captures consent, workflow, QC, review, and handoff branches rather than a simple `PROFILING → RANKING → DESIGNING` sequence.

**Strengths**:
- Deterministic gating vocabulary exists across consent, workflow, QC, review, and handoff checkpoints
- Each case mutation appends a machine-readable audit event, and `caseAuditEventTypes` currently enumerates 17 event kinds
- Idempotent workflow submission (`x-idempotency-key`) reduces duplicate dispatch risk
- Request-scoped correlation IDs (`x-correlation-id`) strengthen traceability across operator and workflow actions

This repository no longer relies only on ad hoc status mutations. `IStateMachineGuard` and the default `InMemoryStateMachineGuard` already encode an explicit allowed-transition map, and dedicated tests cover valid, invalid, and terminal-state behavior. The next step is therefore not to invent transition governance from scratch, but to decide whether the current explicit map should evolve into a serialized statechart runtime such as XState v5 for stronger visualization, persistence, and tooling.

Official XState v5 documentation now makes actor persistence and restoration first-class through persisted snapshots and explicit event-sourcing patterns. Those capabilities matter if OpenRNA decides to model each case as a durable long-running actor, but they do not by themselves justify replacing the current explicit guard before consent, review, and release semantics are fully stabilized.

**Recommendations**:
1. Add timeout/escalation logic for long-lived operational states such as `WORKFLOW_REQUESTED`, `AWAITING_REVIEW`, and `HANDOFF_PENDING`
2. Promote transition rules into a documented state matrix so `IStateMachineGuard` behavior is reviewable independently of route handlers
3. Add explicit case-level `ON_HOLD` or `WITHDRAWN` states for non-technical clinical interruptions beyond workflow-level cancellation

### 3.2 Port-Adapter Architecture

The repository now exposes 16 port interfaces: 11 workflow/scientific seams plus 5 governance/compliance seams. The current Express composition root wires 10 of them through `AppDependencies`; the remaining six already exist as architectural seams, but are not yet surfaced through `createApp()`.

**Wired through `AppDependencies` in `src/app.ts`** [T1]:

| Port | Domain | Default adapter |
|------|--------|-----------------|
| `IConstructDesigner` | RNA construct generation | `InMemoryConstructDesigner` |
| `IModalityRegistry` | RNA modality governance | `InMemoryModalityRegistry` |
| `IReferenceBundleRegistry` | Pipeline version pinning | `InMemoryReferenceBundleRegistry` |
| `IQcGateEvaluator` | Quality control gates | `InMemoryQcGateEvaluator` |
| `IWorkflowRunner` | Execution monitoring | `InMemoryWorkflowRunner` |
| `IStateMachineGuard` | Transition governance | `InMemoryStateMachineGuard` |
| `IConsentTracker` | Patient consent lifecycle | `InMemoryConsentTracker` |
| `IRbacProvider` | Role-based access control | `InMemoryRbacProvider` |
| `IAuditSignatureProvider` | Cryptographic audit integrity | `InMemoryAuditSignatureProvider` |
| `IFhirExporter` | Interoperability | `InMemoryFhirExporter` |

**Implemented as repository seams, but not injected through `AppDependencies`** [T1]:

| Port | Domain | Current surface |
|------|--------|-----------------|
| `IHlaConsensusProvider` | HLA evidence harmonization | `InMemoryHlaConsensusProvider` exists, but the port is not yet injected through `createApp()` |
| `INeoantigenRankingEngine` | External ranking intake | `InMemoryNeoantigenRankingEngine` exists, but the port is not yet injected through `createApp()` |
| `INextflowClient` | Nextflow submission/cancel/poll boundary | Consumed by `NextflowWorkflowRunner`; no standalone concrete client adapter is shipped yet |
| `IOutcomeRegistry` | Outcome timeline persistence | `InMemoryOutcomeRegistry` exists, but the port is not yet injected through `createApp()` |
| `IWorkflowDispatchSink` | Workflow submission persistence | `InMemoryWorkflowDispatchSink` and `PostgresWorkflowDispatchSink` exist, but the port is not yet injected through `createApp()` |
| `IWorkflowOrchestrator` | Run planning/orchestration | `InMemoryWorkflowOrchestrator` exists, but the port is not yet injected through `createApp()` |

`CaseStore` remains a local storage abstraction in `src/store.ts`, with `MemoryCaseStore` and `PostgresCaseStore` rather than a dedicated `src/ports` interface.

Adapter inventory currently comprises 19 classes: 15 in-memory adapters plus `NextflowWorkflowRunner`, `PostgresCaseStore`, `PostgresWorkflowDispatchSink`, and `PostgresWorkflowRunner`. Durable schema evolution is represented by `001_full_schema.sql` and `002_hla_disagreements.sql`.

### 3.3 Security Controls (Phase C) [T1]

Five middleware surfaces harden the HTTP API, and an inline correlation layer strengthens request-scoped provenance:

| Middleware / Layer | Function |
|--------------------|----------|
| `security-headers.ts` | OWASP-aligned security headers (CSP, HSTS, X-Frame-Options, etc.) |
| `rate-limiter.ts` | Optional token-bucket rate limiting with configurable burst, separate limits per IP |
| `request-logger.ts` | Structured JSON request logging with injectable sink |
| `api-key-auth.ts` | Constant-time API-key authentication for closed deployments |
| `rbac-auth.ts` | Role-based route protection with API key → role mapping |
| Inline `x-correlation-id` middleware in `app.ts` | Request/response correlation propagation for audit and operational tracing |

### 3.4 Persistence, Traceability, and Interoperability

Several implementation details materially strengthen the platform beyond a typical prototype:

- `PostgresCaseStore`, `PostgresWorkflowDispatchSink`, and `PostgresWorkflowRunner` provide a durable persistence path rather than memory-only storage.
- `caseAuditEventTypes` defines 17 explicit audit event categories, and `traceability.ts` exposes lineage views across samples, artifacts, workflows, reviews, handoff packets, and outcomes. Note: `CaseAuditEventRecord` currently carries event type, detail, correlation ID, and timestamp, but does not include an `actorId` field — individual-user attribution is not yet part of the audit event schema.
- `IFhirExporter` plus `InMemoryFhirExporter` make interoperability a first-class seam rather than a post-hoc reporting concern.
- `src/migrations/001_full_schema.sql` and `src/migrations/002_hla_disagreements.sql` show that schema evolution has already started to encode domain-specific persistence concerns.

### 3.5 HLA Consensus Architecture

The HLA consensus surface is multi-tool-ready, but the current repository ships an in-memory implementation that models evidence aggregation rather than direct production bindings to HLA callers:

```
Tool A (e.g., Optitype)  → HLA-A*02:01, confidence 0.95
Tool B (e.g., HLA-HD)    → HLA-A*02:01, confidence 0.88
Tool C (e.g., xHLA)      → HLA-A*02:03, confidence 0.72
                              ↓
                    IHlaConsensusProvider
                              ↓
             Consensus: HLA-A*02:01 (2/3 agreement)
             Disagreement flag: Tool C disagrees
             Confidence decomposition per tool
```

**Strength**: The seam matches recommended multi-tool practice and preserves space for tool-specific confidence decomposition once real adapters are attached.

**Recommendation**: Add weighted consensus scoring where tool confidence contributes to the final call, rather than simple majority vote. Consider HLA-HD's allele-level resolution advantage for rare alleles.

---

## IV. Critical Gaps and Prioritized Recommendations

### 4.1 Recommendation Status Matrix

| Recommendation | Current status | Repository anchor | Practical next step |
|---------------|----------------|-------------------|---------------------|
| **Formal statechart runtime (XState v5)** | **Partially implemented** | `src/adapters/InMemoryStateMachineGuard.ts`, `tests/state-machine-guard.test.ts` | Replace or wrap the explicit transition map with a serialized statechart only after the event and consent model is stable |
| **Event Sourcing + CQRS** | **Partially implemented** | `src/store.ts`, `src/traceability.ts`, `src/adapters/PostgresCaseStore.ts` | Introduce a `domain_events` source-of-truth path and keep `CaseRecord` as a projection |
| **Event-driven orchestration** | **Partially implemented** | `src/supervision/PollingSupervisor.ts`, `src/adapters/NextflowWorkflowRunner.ts`, `src/ports/IWorkflowDispatchSink.ts` | Add broker- or webhook-driven completion events while keeping polling as a reconciliation fallback |
| **Mandatory OIDC/JWT + stronger RBAC** | **Partially implemented** | `src/middleware/api-key-auth.ts`, `src/middleware/rbac-auth.ts`, `src/adapters/InMemoryRbacProvider.ts` | Replace system-level API-key identity with user-bound principals and mandatory route protection |
| **Part 11-grade electronic signatures** | **Partially implemented** | `src/ports/IAuditSignatureProvider.ts`, `src/adapters/InMemoryAuditSignatureProvider.ts`, `/api/audit/sign`, `/api/audit/verify` | Upgrade from HMAC helper semantics to signer-bound manifestations and record-linking controls |
| **OpenAPI 3.1 surface** | **Missing** | `src/app.ts`, `src/validation.ts`, `README.md` endpoint inventory | Generate an OpenAPI contract from routes and Zod schemas |
| **OpenTelemetry tracing** | **Missing / partial** | `/metrics` in `src/app.ts`, `src/middleware/request-logger.ts` | Add OTEL NodeSDK instrumentation before app bootstrap and correlate spans with `x-correlation-id` and structured request logs |
| **Modality governance** | **Implemented** | `src/ports/IModalityRegistry.ts`, `src/adapters/InMemoryModalityRegistry.ts` | Extend with manufacturability scoring and modality feature matrices rather than redesigning the seam |
| **Contract testing** | **Implemented** | `tests/contract-conformance.test.ts`, `tests/output-contract.test.ts` | Expand toward external adapter contract runs against real integration boundaries |

### 4.2 Audit-grounded Interpretation Rules

| Surface | Safe current interpretation | Overclaim to avoid |
|---------|-----------------------------|--------------------|
| `IStateMachineGuard` + `InMemoryStateMachineGuard` | OpenRNA already has explicit transition governance for the case lifecycle | "OpenRNA has no formal state model yet" |
| `PollingSupervisor` + `NextflowWorkflowRunner` | The repository already has a polling-based orchestration baseline | "OpenRNA lacks orchestration and needs one from scratch" |
| `IAuditSignatureProvider` + `InMemoryAuditSignatureProvider` | The repository has an integrity-oriented signature seam and tamper-detection helper | "OpenRNA already implements Part 11-grade electronic signatures" |
| `api-key-auth.ts` + `rbac-auth.ts` | The repository has coarse closed-system access control and role seams | "OpenRNA already has individual signer identity and full authority checks" |
| `traceability.ts` + audit events in `store.ts` | The repository already exposes lineage views over stored state | "OpenRNA is already end-to-end event sourced" |

These distinctions matter because the highest-risk documentation error for this repository is not underclaiming. It is accidentally describing a real seam as either nonexistent or already production-grade.

### Priority 1 — Regulatory Maturity (High Impact, Required for Clinical Use)

| Gap | Regulation | Current State | Recommendation |
|-----|-----------|---------------|----------------|
| **Electronic signatures** | 21 CFR Part 11.50/11.70 | Not implemented | Add PKCE/FIDO2-based signing to review and release flows. Signing must capture signer identity, timestamp, and meaning (approval, rejection, review) |
| **Dual-authorization release** | cGMP, EU GMP Annex 13 | Not implemented | Add qualified-person (QP) release workflow step requiring two independent authorizations |
| **Validated-system qualification** | 21 CFR Part 11.10(a) | Not implemented | Create IQ/OQ/PQ documentation package; define validation master plan |
| **Consent-state integration** | ICH-GCP E6(R2) | Port exists and is injected, but active consent is not yet enforced as a lifecycle gate across the case FSM | Wire consent verification into state transitions — block progression without active consent |
| **Cryptographic audit chain** | FDA Data Integrity Guidance 2018 | Audit-signature seam exists, but it is not yet bound into an immutable release-grade signature chain | Hash-chain all audit events; provide independent verification endpoint |
| **NTP synchronization** | 21 CFR Part 11.10(e) | Timestamps are ISO 8601 but not NTP-synced | Add NTP synchronization requirement to deployment configuration |

### Priority 2 — Data Security and Access Control (High Impact)

| Gap | Current State | Recommendation |
|-----|---------------|----------------|
| **Encryption at rest** | PostgreSQL stores data unencrypted by default | Enable TDE or column-level encryption for PII/PHI fields |
| **Data classification** | No explicit field-level data classification | Classify fields as PII, PHI, clinical, operational; apply differential access controls |
| **Key management** | No KMS integration | Integrate with HSM/KMS for signing keys and encryption keys |
| **Session management** | API key only | Add short-lived JWT tokens with refresh rotation for interactive sessions |
| **Data retention** | No lifecycle policy | Define retention schedules per data category aligned with regulatory requirements |

### Priority 3 — Scalability and Operational Resilience (Medium Impact)

| Gap | Current State | Recommendation |
|-----|---------------|----------------|
| **Horizontal scaling** | Single-instance Express server | Add clustering support (PM2/k8s), separate read/write paths |
| **Event sourcing** | Audit events appended, no projection/replay | Add event replay capability for state reconstruction |
| **Monitoring** | `/healthz`, `/readyz`, `/metrics` endpoints exist | Add alerting thresholds, SLO definitions, error budget tracking |
| **Disaster recovery** | No documented DR plan | Add backup strategy, RTO/RPO targets, failover procedures |
| **Multi-tenancy** | Single-tenant design | Architecture supports multi-tenant via case isolation, but no explicit tenant boundary |

### Priority 4 — AI/ML Integration path (Strategic, Medium-term)

| Capability | Current State | Recommendation |
|-----------|---------------|----------------|
| **ML-assisted neoantigen ranking** | Ranking port accepts external results | Add optional `IRankingModelBridge` port for real-time model inference integration |
| **Ranking confidence calibration** | No calibration against outcome data | Design outcome-to-ranking feedback loop using `IOutcomeRegistry` data |
| **AlphaFold structure integration** | Not implemented | Add optional `IStructuralPredictionPort` for MHC-peptide binding re-ranking (supportive signal only, per design principles) |
| **Adaptive patient stratification** | Not implemented [T3] | Future: use outcome data for patient selection model refinement |

### Priority 5 — Multi-omics Extension (Strategic, Long-term)

| Extension | Current State | Recommendation |
|-----------|---------------|----------------|
| **Transcriptomics** | Sample types include RNA | Add expression-level filtering to candidate ranking pipeline input |
| **Proteomics/Mass Spec** | Not modeled | Add mass-spec validation port for neoantigen peptide confirmation |
| **Methylation** | Not modeled | Add epigenetic context to candidate evaluation |
| **Liquid biopsy/ctDNA** | Outcome timeline captures monitoring events | Add `ctDNA` as explicit monitoring modality with quantitative tracking |

---

## V. Competitive Positioning

### 5.1 Landscape Matrix (April 2026)

| Platform / Tool | Type | Scope | Open Source | Clinical Stage |
|----------------|------|-------|-------------|----------------|
| **OpenRNA** | Control plane | Orchestration, governance, traceability | Yes (Apache-2.0) | Pre-clinical software |
| **pVACtools** | Bioinformatics pipeline | Neoantigen prediction and ranking | Yes (BSD-3-Clause-Clear) | Research / clinical research |
| **Nextflow + nf-core** | Workflow engine | Pipeline orchestration | Yes (Apache-2.0) | Industry standard |
| **OpenVax** | Research pipeline | Multi-tool neoantigen pipeline | Yes | Research |
| **V940 platform** (Moderna) | Proprietary end-to-end | Full pipeline to clinical product | No | Phase 3 |
| **BNT-122 platform** (BioNTech) | Proprietary end-to-end | Full pipeline to clinical product | No | Phase 2 |
| **nextNEOpi** | Bioinformatics pipeline | Neoantigen prediction | Yes | Research |
| **NeoDisc** | Bioinformatics pipeline | Neoantigen discovery | Yes | Research |
| **NeoPredPipe** | Bioinformatics pipeline | Neoantigen prediction | Yes | Research |

### 5.2 OpenRNA's Unique Niche

No existing open-source tool occupies the **clinical workflow orchestration** layer between bioinformatics computation and clinical governance. This is OpenRNA's defensible niche:

- **pVACtools** stops at ranked neoantigen lists → OpenRNA starts there
- **Nextflow** orchestrates compute pipelines → OpenRNA orchestrates clinical decisions
- **Proprietary platforms** (Moderna, BioNTech) are end-to-end but closed → OpenRNA is open and composable
- **Academic pipelines** (nextNEOpi, NeoDisc) focus on neoantigen discovery → OpenRNA focuses on clinical workflow governance

### 5.3 Gritstone Bio Cautionary Signal

Gritstone Bio filed for bankruptcy in October 2024 after its GRANITE/SLATE program (shared neoantigen approach) failed commercially. Key lessons:
- Shared-antigen approaches may be commercially fragile compared to individualized approaches
- Clinical governance and operational scalability matter as much as prediction accuracy
- OpenRNA's focus on workflow governance (not prediction algorithms) reduces exposure to this failure mode

---

## VI. Strategic Roadmap

### Phase A: Hardening (0-3 months) — Current Priority

**Objective**: Production-ready control plane with regulatory foundation.

| Task | Priority | Status |
|------|----------|--------|
| Electronic signature framework (FIDO2/PKCE) | P1 | Not started |
| Consent-state integration into case FSM | P1 | Port exists, wiring needed |
| Cryptographic audit chain activation | P1 | Port exists, integration needed |
| Security headers + rate limiting + RBAC | P2 | **Done** [T1] |
| FHIR R4 export capability | P2 | **Done** [T1] |
| Audit signature provider | P2 | **Done** [T1] |
| Dual-authorization release workflow | P2 | Not started |
| PostgreSQL encryption-at-rest configuration | P2 | Not started |
| CI/CD pipeline with automated testing | P3 | **Done** [T1] — GitHub Actions now run build, test, coverage, audit, health smoke, CodeQL, dependency review, and provenance automation |

### Phase B: Ecosystem Integration (3-9 months)

**Objective**: Connect to real bioinformatics infrastructure.

| Task | Priority | Status |
|------|----------|--------|
| Real Nextflow adapter (replace in-memory) | P1 | Port exists |
| pVACtools result ingestion adapter | P1 | Port exists |
| MHCflurry/NetMHCpan integration for HLA consensus | P2 | Port exists |
| ViennaRNA/mRNAid integration for construct optimization | P2 | Port exists |
| Containerization (Docker/Podman) | P2 | Not started |
| Kubernetes deployment manifests | P3 | Not started |
| Multi-site deployment documentation | P3 | Not started |

### Phase C: Clinical-Grade Platform (9-18 months)

**Objective**: Deployable at academic medical centers for clinical research.

| Task | Priority | Status |
|------|----------|--------|
| IQ/OQ/PQ validation documentation | P1 | Not started |
| 21 CFR Part 11 compliance package | P1 | Partial (audit trail exists) |
| Performance benchmarking under clinical load | P2 | Not started |
| Multi-tenant capability | P2 | Architecture supports it |
| Outcome-to-ranking feedback loop | P3 | Traceability infrastructure exists |
| ctDNA monitoring integration | P3 | Not started |

---

## VII. Evidence Validation Summary

### Claims Verified Against Primary Sources

| Claim | Source | Verification |
|-------|--------|-------------|
| V940 HR 0.561 in melanoma | Weber et al., *Lancet* 2024 | ✅ Peer-reviewed |
| INTerpath-001 NCT05933577 | ClinicalTrials.gov | ✅ Active registry entry |
| BNT-122 8/16 responders in PDAC | Rojas et al., *Nature* 2023 (PMC10171177) | ✅ Peer-reviewed, PMC available |
| BNT-122 71% immune response solid tumors | Weber et al., *Nature Medicine* 2025 | ✅ Peer-reviewed |
| IMCODE003 NCT05968326 (PDAC Phase 2) | ClinicalTrials.gov | ✅ Active registry entry |
| 25 clinical trials for personalized neoantigen mRNA vaccine | ClinicalTrials.gov search | ✅ Verified April 2026 |
| 238 PubMed results | PubMed search | ✅ Verified April 2026 |
| Gritstone Bio bankruptcy Oct 2024 | Public filings | ✅ Confirmed |
| ARCT-154 saRNA approved in Japan | Arcturus public disclosures | ✅ COVID-19, not oncology |

### Repository-grounded [T1] claims verified against source files

| Claim | Source surface | Verification |
|-------|----------------|-------------|
| 15 implemented case statuses | `src/types.ts` | ✅ Verified against the exported `caseStatuses` constant |
| 16 port interfaces | `src/ports/*.ts` | ✅ Verified by direct port inventory |
| 19 adapters | `src/adapters/*.ts` | ✅ Verified as 15 in-memory plus 4 integration/persistence adapters |
| 5 middleware surfaces plus correlation propagation | `src/middleware/*.ts`, `src/app.ts` | ✅ Verified against the Express composition root |
| 2 SQL migrations | `src/migrations/*.sql` | ✅ Verified by direct inventory |
| Broad test surface | `README.md`, `tests/*` | ✅ README advertises 296+ `node:test` checks; 28 visible test files were counted directly |
| GitHub-native verification and provenance automation | `.github/workflows/*.yml`, `.github/release.yml` | ✅ Verified for CI, CodeQL, dependency review, SBOM and attestation generation, and semver-tag release publication |

### Claims Requiring Ongoing Monitoring

| Claim | Status | Next Check |
|-------|--------|-----------|
| V940 Phase 3 results (INTerpath-001) | Trial ongoing, no interim readout | Expected 2027-2028 |
| saRNA oncology clinical entry | No Phase 2+ trial registered | Monitor ClinicalTrials.gov quarterly |
| circRNA clinical manufacturing | No commercial-scale cGMP process published | Monitor industry conferences |
| FDA approach to platform biologics regulation | Evolving guidance | Monitor FDA CBER communications |

### Claims intentionally withheld from active text

| Claim class | Why it remains withheld |
|-------------|--------------------------|
| Country-specific rollout or commercialization stories | Not revalidated from stable primary sources in this pass |
| Near-certain approval or launch timing promises | Current evidence does not justify deterministic timing language |
| Direct FDA CSA citation in active text | The official page path was not re-confirmed in this pass, so validation language is anchored instead on rechecked stable FDA and eCFR sources |
| Evergreen ecosystem counters | Search and publication tallies are point-in-time snapshots, not durable product facts |

---

## VIII. Conclusions

### Strengths

1. **Correct architectural niche**: OpenRNA occupies an unserved layer between bioinformatics computation and clinical governance. No existing open-source tool provides this.
2. **Clean port-adapter design**: 16 ports with dependency injection enable swapping implementations without architectural disruption.
3. **Regulatory foresight**: Audit trail, traceability, and immutability are built into the architecture from the start, not retrofitted.
4. **Multi-modality readiness**: The modality registry (mRNA/saRNA/circRNA) with activation governance positions the platform for future RNA modalities without re-architecture.
5. **Evidence-grounded documentation**: All design claims are tier-classified and traceable to primary sources.
6. **Broad verification surface**: the repository exposes 28 visible test files, and the README advertises 296+ `node:test` checks across API, persistence, middleware, orchestration, and interoperability surfaces.
7. **Public-repository hardening**: GitHub-native CI, CodeQL, dependency review, SBOM and provenance automation, and tag-driven release assets now exist as tracked repository surfaces rather than as out-of-band maintainer steps.

### Risks

1. **Single-developer bus factor**: Project currently depends on a single contributor. Mitigation: open-source release enables community participation.
2. **No real-world deployment**: The platform has not been tested with actual clinical data or bioinformatics pipeline outputs.
3. **Regulatory gap**: Electronic signatures and dual-authorization release are mandatory for clinical use and not yet implemented.
4. **Performance unknowns**: No load testing under realistic clinical throughput (dozens of concurrent cases).
5. **Integration complexity**: Connecting to real Nextflow/pVACtools/MHCflurry instances requires significant adapter development.

### Assessment

OpenRNA is best understood as an **evidence-grounded orchestration kernel** for personalized neoantigen RNA operations, not as a clinically deployable GxP system today. Its strongest architectural feature is the separation between fast-moving compute substrates and slower-moving clinical governance surfaces. That is a more defensible niche than trying to compete directly with ranking pipelines or proprietary end-to-end manufacturing stacks.

The strategic priority is correspondingly narrow and clear: close the regulatory gaps (signer-bound electronic signatures, dual authorization, consent-state enforcement, formal validation), then finish surfacing the remaining repository seams through the main composition root and attach real adapters to the bioinformatics ecosystem.

The clinical evidence for personalized neoantigen mRNA vaccines is at an inflection point: V940's Phase 3 readout will either validate or constrain the entire class. OpenRNA is architecturally positioned to benefit from a positive outcome and adapt to negative signals through its modality-agnostic design.

---

## References

1. Rojas LA, Sethna Z, Soares KC, et al. Personalized RNA neoantigen vaccines stimulate T cells in pancreatic cancer. *Nature*. 2023;618(7963):144-150. doi:10.1038/s41586-023-06063-y. PMID:37165196.
2. Weber JS, Carlino MS, Lao CD, et al. Individualized neoantigen therapy mRNA-4157 (V940) plus pembrolizumab versus pembrolizumab monotherapy in resected melanoma (KEYNOTE-942): a randomised, phase 2b study. *Lancet*. 2024;403(10427):632-644.
3. Weber JS, et al. Autogene cevumeran Phase 1 in advanced solid tumors. *Nature Medicine*. 2025.
4. Khattak MA, et al. mRNA-4157/V940 three-year update. *Nature Medicine*. 2025.
5. Hundal J, Kiwala S, McMichael J, et al. pVACtools: A Computational Toolkit to Identify and Visualize Cancer Neoantigens. *Cancer Immunol Res*. 2020;8(3):409-420. doi:10.1158/2326-6066.CIR-19-0401. PMID:31907209.
6. Torphy RJ, Balachandran V, Soares KC. mRNA Vaccines for Cancer Treatment. *Surg Oncol Clin N Am*. 2026;35(2):299-316. doi:10.1016/j.soc.2025.10.006. PMID:41903991.
7. Garg P, Salgia R, Singhal SS. mRNA-based cancer vaccines: A new frontier in personalized immunotherapy. *Biochim Biophys Acta Rev Cancer*. 2026;1881(3):189577. PMID:41861922.
8. Srivastava R. AI-powered mapping of tumor immunity for optimized mRNA vaccine engineering. *Front Oncol*. 2026;16:1766201. PMID:41853314.
9. ClinicalTrials.gov. Search: "personalized neoantigen mRNA vaccine." Accessed April 1, 2026. 25 results.
10. PubMed. Search: "neoantigen mRNA vaccine personalized cancer." Accessed April 1, 2026. 238 results.
11. Electronic Code of Federal Regulations. 21 CFR Part 11 — Electronic Records; Electronic Signatures. Accessed April 2, 2026.
12. Stately. Stately and XState docs (XState v5). Accessed April 2, 2026.
13. Nextflow documentation. Overview. Accessed April 2, 2026.

---

*Document refreshed April 2, 2026. Evidence cutoff: April 2, 2026. Next review: upon V940 Phase 3 interim readout, a major regulatory event, or a material architecture change in OpenRNA.*

 # #   5 .   A r c h i t e c t u r a l   G a p :   N e o a n t i g e n   R a n k i n g   E n d p o i n t 
 W h i l e   ` M e m o r y C a s e S t o r e `   h a s   ` r e c o r d N e o a n t i g e n R a n k i n g ( ) ` ,   n o   H T T P   i n g r e s s   r o u t e   c u r r e n t l y   e x i s t s   f o r   ` P O S T   / a p i / c a s e s / : c a s e I d / n e o a n t i g e n - r a n k i n g `   i n   ` a p p . t s ` .   T h i s   m e a n s   t h a t   i n t e g r a t i n g   w i t h   a c t u a l   e x t e r n a l   M L   p r e d i c t i o n   b a c k e n d s   ( e . g .   N e x t f l o w   p a s s i n g   r e s u l t s   t o   o p e n R N A )   i s   c u r r e n t l y   u n - t e s t a b l e   v i a   t h e   R E S T   f a c a d e .   T h e   i n - m e m o r y   r a n k i n g   e n g i n e   ( ` I n M e m o r y N e o a n t i g e n R a n k i n g E n g i n e ` )   i s   o n l y   i n v o k e d   d i r e c t l y   i n   t e s t i n g .   S O T A   2 0 2 6   p r a c t i c e   r e q u i r e s   a n   e x p l i c i t   C R U D   e n d p o i n t   f o r   t h i s   d o m a i n   e v e n t . 
  
 