---
title: "OpenRNA Platform Design"
status: active
version: "3.1.2"
last_updated: "2026-04-20"
tags: [oncology, mrna, circRNA, saRNA, neoantigen, platform-design]
evidence_cutoff: "2026-04-20"
---

# Design: OpenRNA Platform

## Goal

Максимально проработанный, но инженерно трезвый дизайн платформы персонализированных неоантигенных RNA-вакцин. Текущая базовая модальность — conventional mRNA. На горизонте 25-50 лет платформа эволюционирует в сторону saRNA, trans-amplifying RNA, circRNA и других программируемых RNA-модальностей.

## Plain-language summary

Платформа выполняет следующую цепочку:

1. Берёт образец опухоли и кровь пациента.
2. Секвенирует ДНК и РНК, находит мутации, уникальные для конкретной опухоли.
3. Предсказывает, какие мутации могут быть видны иммунной системе (neoantigen ranking).
4. Генерирует RNA-конструкт, кодирующий набор отобранных мутантных эпитопов.
5. Упаковывает RNA в систему доставки (сегодня — LNP).
6. Вводит препарат пациенту для обучения иммунной системы распознавать и уничтожать опухоль.

Это не один препарат и не один алгоритм. Это платформа, объединяющая molecular profiling, antigen intelligence, RNA engineering, delivery, clinical workflow и continuous learning.

## April 2026 Addendum

This design remains the authority architecture memo, but the live public-export baseline moved in three concrete ways during the April 2, 2026 hardening pass:

1. The standalone repository now targets Node 24 Active LTS for its public reproducibility baseline and ships `.nvmrc`, `packageManager`, CI, and Dependabot surfaces to make that baseline explicit.
2. The TypeScript compiler configuration moved from legacy `module: "CommonJS"` to `module: "nodenext"` while preserving a CommonJS runtime through `package.json` `type: "commonjs"`; this aligns the repo with current TypeScript guidance for Node applications without forcing a pure-ESM migration.
3. Current public fact-check anchors remain `NCT05933577` for V940 / intismeran autogene in high-risk melanoma and `NCT05968326` for autogene cevumeran in resected PDAC. The April 2026 publication synthesis lives in `docs/GITHUB_EXPORT_AND_INVESTOR_READINESS_2026-04.md`.

## Evidence Classification

Все утверждения в документе классифицированы по четырём тирам:

| Tier | Label | Definition | How to read |
|------|-------|-----------|-------------|
| T1 | **Implemented** | Реализовано в текущем коде этого репозитория и подтверждено тестами | Можно проверить через `npm test` |
| T2 | **Validated trajectory** | Подтверждено peer-reviewed публикациями, Phase 2+/3 данными или official product surfaces; влияет на архитектурные решения сейчас | Нужна ссылка на публикацию или trial registry |
| T3 | **Strategic bet** | Серьёзное научное направление с ранними данными; не является текущим стандартом | Не должно подаваться как settled baseline |
| T4 | **Scenario horizon** | 2040-2076 planning hypotheses; ценны для resilience проектирования | Не delivery promises |

Tier-маркеры указаны в квадратных скобках: **[T1]**, **[T2]**, **[T3]**, **[T4]**.

## Current Software Implementation Boundary [T1]

Это репозиторий реализует **Phase 1 + Phase 2 control-plane slice** с downstream review, handoff и learning-loop extensions.

### Implemented capabilities

- **Case registry**: create, list, retrieve oncology cases with 16-state lifecycle (`INTAKING` → `HANDOFF_PENDING`).
- **Sample and artifact provenance**: sample registration (tumor DNA/RNA, normal DNA, follow-up), source and derived artifact catalog with semantic types.
- **Workflow orchestration**: workflow request gate with idempotent submission (`x-idempotency-key`), run lifecycle tracking (`start`, `complete`, `fail`, `cancel`), Nextflow integration port for external pipeline execution, polling supervisor for run monitoring.
- **Reference bundle registry**: versioned pipeline reference bundles pinned to workflow runs.
- **HLA consensus**: multi-tool HLA evidence capture with per-tool fields, configurable disagreement thresholds, confidence decomposition.
- **QC gate evaluation**: automated quality control pass/fail on completed runs.
- **Neoantigen ranking**: ranking persistence port with configurable engine.
- **Construct design**: multi-modality construct generation (mRNA, saRNA, circRNA) with modality governance, activation/deactivation, epitope linker strategies.
- **Expert review surface**: tumor-board packet generation from current case evidence, explicit review outcome capture tied to board packets with `approve`/`revision_requested`/`rejected` decisions.
- **Manufacturing handoff**: bounded handoff packet generation from approved reviews, traceability from construct to manufacturing specification.
- **Outcome timeline**: administration records, immune monitoring events, clinical follow-up capture.
- **Full traceability**: machine-readable audit events on every case mutation, end-to-end evidence lineage graph from samples through construct to outcomes.
- **Operations and health**: `/healthz`, `/readyz`, `/metrics`, `/api/operations/summary`.

### Architecture

- **18 interfaces under `src/ports`**: 11 workflow/scientific seams (`IConstructDesigner`, `IHlaConsensusProvider`, `IModalityRegistry`, `INeoantigenRankingEngine`, `INextflowClient`, `IOutcomeRegistry`, `IQcGateEvaluator`, `IReferenceBundleRegistry`, `IWorkflowDispatchSink`, `IWorkflowOrchestrator`, `IWorkflowRunner`), 5 governance/compliance seams (`IAuditSignatureProvider`, `IConsentTracker`, `IFhirExporter`, `IRbacProvider`, `IStateMachineGuard`), 1 case-access seam (`ICaseAccessStore`), plus `IEventStore` for domain-event replay semantics. `CaseStore` remains a local storage abstraction defined in `src/store.ts`, not a standalone port file in `src/ports`.
- **Dual adapter strategy**: in-memory adapters for local development and testing, PostgreSQL adapters for durable persistence and governed access (`PostgresCaseStore`, `PostgresCaseAccessStore`, `PostgresConsentTracker`, `PostgresWorkflowDispatchSink`, `PostgresWorkflowRunner`).
- **Dependency injection**: all adapters injected through `AppDependencies` factory interface; no runtime coupling to specific implementations.
- **Validation**: Zod runtime schemas for all API inputs.
- **Auth**: API-key or JWT auth with optional anonymous local mode and a fail-fast `REQUIRE_AUTH` startup gate for strict deployments.
- **Logging**: injectable structured JSON request logging.
- **Error contract**: structured `ApiError` with operator-facing codes and HTTP status mapping.

### Technology stack [T1]

| Component | Version | Note |
|-----------|---------|------|
| Node.js | 24.x Active LTS | Public baseline validated locally on Node 24.11.0; repository engines now require `>=24` |
| TypeScript | 6.0.2 | Repo now uses `module: "nodenext"` with `package.json` `type: "commonjs"`, preserving the stable runtime while aligning with TypeScript's current Node guidance |
| Express | 5.x | HTTP framework |
| Zod | 4.x | Runtime validation |
| pg | 8.x | PostgreSQL client |
| pg-mem | 3.x | In-memory Postgres for testing |
| tsx | 4.x | TypeScript test runner |
| node:test | built-in | Test framework |
| supertest | 7.x | HTTP assertion library |

### 40+ API endpoints [T1]

Full API surface documented in [README.md](README.md).

### Not yet implemented

- Neoantigen prediction (external pipeline output consumed, not performed).
- Rank aggregation algorithms (ranking port accepts external results).
- Cross-resource transactional outbox coordination.
- Electronic signatures (21 CFR Part 11 requirement).
- Dual-authorization release workflow.
- Validated-system qualification documentation.

## External Evidence Base (March 2026)

### 1. Personalized neoantigen mRNA vaccines: clinical credibility [T2]

**BioNTech autogene cevumeran (BNT-122)**:
- **Nature 2023** (Rojas et al.): individualized uridine mRNA-lipoplex vaccine for resected PDAC. Produced in real time post-surgery. Tolerable. De novo neoantigen-specific T cells in 8/16 patients; responders showed longer recurrence-free survival signal.
- **Nature Medicine 2025** (Weber et al.): ongoing Phase 1 in advanced solid tumors. Individualized neoantigen-specific responses in 71% of patients (15/21). Responses durable up to 23 months. Demonstrates cross-tumor-type feasibility.
- **Registry-backed PDAC study** (ClinicalTrials.gov NCT05968326 / IMCODE003): adjuvant autogene cevumeran plus atezolizumab and mFOLFIRINOX versus mFOLFIRINOX alone in resected PDAC. Active as of March 2026.

**Moderna/Merck mRNA-4157/V940**:
- **KEYNOTE-942 Phase 2b** (melanoma, adjuvant + pembrolizumab): 44% reduction in recurrence or death (HR 0.561; Weber et al., Lancet 2024). Landmark result for the field.
- **High-risk melanoma registry-backed program**: ClinicalTrials.gov search for `INTerpath-001` / `V940-001` currently resolves to NCT05933577, "A Clinical Study of Intismeran Autogene (V940) Plus Pembrolizumab in People With High-Risk Melanoma," active not recruiting as of March 2026.
- Phase 2 expansion into NSCLC (V940-002) and adjuvant renal cell carcinoma. Active enrollment.

**Key review literature (2025-2026)**:
- JITC 2025-2026 reviews frame RNA cancer vaccines as clinically promising but constrained by delivery efficiency, tumor heterogeneity, manufacturing turnaround, and cost.
- Lancet Oncology 2025 editorial: "personalized cancer vaccines have moved from theoretical promise to clinical signal, but the path to registration remains long and indication-specific."

**Summary**: individualized neoantigen RNA vaccination has serious translational basis. Platform economics, manufacturing scalability, and patient selection remain unsolved.

### 2. Competitor landscape (March 2026) [T2]

| Company | Program | Phase | Indication | Status (March 2026) |
|---------|---------|-------|-----------|---------------------|
| Moderna/Merck | V940 (mRNA-4157) | Phase 3 | Melanoma (adjuvant) | INTerpath-001 enrolling |
| Moderna/Merck | V940 | Phase 2 | NSCLC, RCC | Expansion cohorts active |
| BioNTech | BNT-122 (autogene cevumeran) | Phase 2 | PDAC | Active with atezolizumab |
| BioNTech | BNT-122 | Phase 1 | Solid tumors | NatMed 2025 data: 71% response |
| Gritstone Bio | GRANITE/SLATE | — | — | **Bankrupt** (Oct 2024). Assets acquired. Off-tumor neoantigen approach failed commercially. |
| CureVac | CV8102 | Phase 1 | Solid tumors | Pivoting to oncology after COVID exit. RNA backbone optimization focus. |
| Arcturus | ARCT-154 (saRNA) | Approved (Japan, COVID) | Not oncology | Validates saRNA manufacturing, but no oncology program active |
| BioNTech | FixVac (shared antigens) | Phase 2 | Melanoma | Shared-antigen approach, different from individualized |

**Competitive implications for this platform**:
- V940 Phase 3 validates the regulatory path; if approved, establishes class precedent.
- Gritstone bankruptcy is a risk signal: off-tumor shared neoantigen approaches may be commercially fragile. Individualized >> shared for this field.
- The only programs with strong late-stage clinical signals use conventional linear mRNA. saRNA/circRNA oncology pipelines are absent from Phase 2+ trials.

### 3. saRNA and circRNA: strategic importance, early maturity [T3]

**saRNA (self-amplifying RNA)**:
- Intracellular amplification via alphavirus replicon → lower dose required → potential cost/logistics advantage.
- ARCT-154 approved in Japan for COVID-19 (Arcturus, 2023) — validates manufacturing and tolerability in infectious disease.
- No oncology-specific clinical trial in Phase 2+ as of March 2026.
- Key concern: innate immune activation from double-stranded RNA intermediates may interfere with antigen-specific adaptive immunity in cancer setting.
- Reviews (Nat Rev Drug Discov 2025, Signal Transduct Target Ther 2025) classify saRNA oncology as "preclinical to early Phase 1."

**circRNA (circular RNA)**:
- Closed circular topology → exonuclease resistance → potentially longer intracellular half-life.
- No cold-chain claims yet validated at scale.
- No oncology clinical trial in Phase 2+ as of March 2026.
- Manufacturing at cGMP scale remains challenging (splint ligation, permuted intron-exon method).
- Reviews (Mol Cell 2025) frame circRNA as "emerging platform with significant unknowns in immunogenicity and translation efficiency for therapeutic vaccines."

**Platform implication**: saRNA and circRNA are modeled in the modality registry (`IModalityRegistry`) with activation governance, but conventional mRNA is the only execution baseline.

### 4. AlphaFold and structural prediction: bounded supportive role [T2/T3]

- AlphaFold 2: Apache-2.0 code. Outputs explicitly not validated for clinical use (Google DeepMind).
- AlphaFold 3: CC-BY-NC-SA 4.0 code, weights require access request. Not for clinical use.
- AlphaFold Server: non-commercial, output restrictions.
- Scientific utility: structure-based re-ranking of neoantigen-MHC binding predictions as a supportive signal, not as go/no-go authority.
- ESMFold, OpenFold: open-source alternatives with less restrictive licensing for commercial R&D integration.

**Platform implication**: structural prediction sits in the supportive modeling layer. It does not replace immunogenicity evidence, processing/presentation logic, or clinical expert review.

### 5. Key publications (2023-2026) [T2]

| Year | Journal | First Author | Topic |
|------|---------|-------------|-------|
| 2023 | Nature | Rojas LA et al. | Autogene cevumeran in PDAC: T-cell responses, RFS signal |
| 2024 | Lancet | Weber JS et al. | KEYNOTE-942 V940+pembro Phase 2b melanoma |
| 2025 | Nature Medicine | Weber JS et al. | Autogene cevumeran Phase 1 solid tumors: 71% response |
| 2025 | Nat Rev Drug Discov | Sahin U, Türeci Ö | mRNA cancer vaccines: clinical milestones and challenges |
| 2025 | Signal Transduct Target Ther | — | saRNA platforms: status and prospects |
| 2025 | JITC | — | Personalized cancer vaccines: manufacturing and regulatory |
| 2025 | Mol Cell | — | circRNA therapeutic platforms: engineering and delivery |
| 2026 | JITC | — | Neoantigen prediction pipelines: benchmarking and harmonization |

## Regulatory-by-Design [T2]

### Applicable regulatory framework

| Jurisdiction | Pathway | Key regulation | Relevance |
|-------------|---------|---------------|-----------|
| US (FDA) | CBER BLA | Biologics License Application (21 USC §351) | Individualized neoantigen vaccines are regulated as biological products |
| US (FDA) | 21 CFR Part 11 | Electronic records and signatures | Audit trail, e-signatures, validated systems |
| US (FDA) | INTERACT / Pre-IND | Early CMC/clinical advice | Manufacturing comparability, starting material definition |
| EU (EMA) | ATMP Regulation EC 1394/2007 | Advanced Therapy Medicinal Products | Product-specific ATMP classification analysis may become relevant, but this document does not assert gene-therapy status for neoantigen RNA products without a CAT-aligned source |
| EU (EMA) | GMP Annex 13 | Investigational Medicinal Products | Manufacturing standards for clinical studies |
| ICH | Q5E, Q8-Q12 | Comparability, QbD, lifecycle management | Applicable to process changes and modality evolution |
| Both | GxP / cGMP | Current Good Manufacturing Practice | Personalized manufacturing requires per-patient release |

### What this repository already provides toward compliance

| Capability | Regulatory mapping | Implementation |
|-----------|-------------------|----------------|
| End-to-end audit trail | 21 CFR Part 11.10(e) audit trails | `store.ts`: case mutations append machine-readable audit events; `traceability.ts` builds read-side lineage views from stored state |
| Identity verification (partial) | 21 CFR Part 11.10(d) | `api-key-auth.ts`: API-key authentication. **Gap: not electronic signatures.** |
| Structured logging | GxP data integrity (ALCOA+) | `request-logger.ts`: injectable structured JSON logging |
| Append-only event records | 21 CFR Part 11.10(e) | JSONB audit events in PostgreSQL with timestamps; append-only by application convention — no database-level immutability constraint is enforced yet |
| Construct-to-outcome traceability | ICH Q5E comparability | `traceability.ts`: evidence lineage graph from stored ranking, construct, review, handoff, and outcome state |
| Validated input schemas | 21 CFR Part 11.10(h) | Zod runtime validation on all API inputs |
| Idempotent submission | GxP data integrity | `x-idempotency-key` prevents duplicate workflow dispatches |

### Honest compliance gaps

| Gap | Regulation | Severity | Path to close |
|-----|-----------|----------|---------------|
| No electronic signatures | 21 CFR Part 11.50/11.70 | **High** — required for closed systems | Add PKCE/FIDO2-based signing to review and release flows |
| No dual-authorization release | cGMP, EU Annex 13 | **High** — QP release is mandatory | Add `qualified-person-release` workflow step |
| No validated-system qualification | 21 CFR Part 11.10(a) | **Medium** — required before clinical deployment | IQ/OQ/PQ documentation package |
| No consent-state in case lifecycle | ICH-GCP E6(R2) | **Medium** — clinical protocol compliance | Add consent port to case FSM |
| Timestamp precision | 21 CFR Part 11.10(e) | **Low** — ISO 8601 with timezone, not yet NTP-synced | Add NTP synchronization requirement to deployment |
| No cryptographic audit seal | FDA Data Integrity Guidance 2018 | **Low** — integrity proof for regulator | Add SHA-256 hash chain to audit events |

## Open-Source Ecosystem Alignment [T2]

### Bioinformatics pipeline tools

| Tool | Version/Status (March 2026) | Platform role |
|------|---------------------------|---------------|
| Nextflow (DSL2) | 24.x stable | Workflow orchestration — `INextflowClient` and `NextflowWorkflowRunner` already model this integration |
| nf-core | 600+ pipelines | Maintained community pipelines for upstream genomics |
| pVACtools/pVACseq | 4.x | HLA-aware neoantigen prediction and ranking |
| MHCflurry | 2.x | Class I MHC binding prediction (Keras-based) |
| NetMHCpan | 4.1 | Pan-allele HLA-I binding prediction (DTU) |
| PRIME | 2.0 | Immunogenicity prediction beyond binding |
| OpenVax | active | Multi-institutional personalized vaccine pipeline |
| ViennaRNA | 2.6.x | RNA secondary structure prediction |
| mRNAid | 1.x | mRNA sequence optimization |
| DNA Chisel | 3.x | Codon optimization under constraints |
| LinearDesign | — | mRNA design optimization (Zhang lab) |

### Runtime and infrastructure

| Component | Version (March 2026) | Migration note |
|-----------|---------------------|----------------|
| Node.js | 24.x Active LTS | Current public runtime baseline; `engines.node` requires `>=24` |
| TypeScript | 6.0.2 (GA March 2026) | Repo now uses `module: "nodenext"` while preserving a CommonJS runtime through `package.json` |
| Express | 5.x | Migrated from 4.x; all route patterns compatible |
| Zod | 4.x | Stable; ecosystem standard for TypeScript validation |
| PostgreSQL | 16/17 | Both supported by pg 8.x driver |
| pg | 8.20 | Current stable |
| pg-mem | 3.x | In-memory Postgres simulation for testing |

## Core Thesis

**OpenRNA = molecular profiling + neoantigen intelligence + RNA engineering + delivery/manufacturing workflow + clinical evidence loop.**

Каждый слой улучшается независимо:
- better calling and annotation;
- better ranking models;
- better RNA constructs;
- better delivery systems;
- better turnaround and cost structure;
- better patient stratification.

## Platform Architecture

### A. Clinical Intake Layer
- Patient selection, consent, sample collection orchestration.
- Linkage to standard-of-care therapy, baseline imaging.
- **Principle**: RNA vaccine is embedded into a care pathway, not treated as an isolated intervention.

### B. Molecular Profiling Layer
- Tumor/normal DNA/RNA sequencing, somatic variant calling, annotation, QC.
- Representative stack: FastQC, BWA-MEM2, GATK Mutect2, Strelka2, STAR, Salmon, VEP, SnpEff.
- Orchestration: Nextflow DSL2 + nf-core maintained workflows.
- **Principle**: upstream genomics stays conservative, reproducible, auditable.

### C. Neoantigen Intelligence Layer
- Candidate peptide generation, expression-aware filtering, HLA-aware presentation prediction.
- Self-similarity/tolerance scoring, clonality context, ensemble ranking with uncertainty.
- Representative tools: pVACtools/pVACseq, MHCflurry, NetMHCpan, PRIME, OpenVax.
- **Principle**: ensemble ranking problem, not single-model prediction.

### D. RNA Construct Design Layer
- Convert antigens to translatable RNA construct, optimize coding sequence.
- Evaluate structural burden, manufacturability, multi-objective trade-offs.
- Representative tools: mRNAid, DNA Chisel, ViennaRNA, LinearDesign.
- **Principle**: RNA design is multi-objective optimization under biological and manufacturing constraints.

### E. Delivery and Manufacturing Handoff Layer
- Transfer approved design into manufacturable specification.
- Modality-appropriate delivery selection, release and handoff tracking.
- Current default: conventional mRNA + LNP [T2].
- **Principle**: delivery modeled as constrained partner interface, not a checkbox.

### F. Clinical Administration and Monitoring Layer
- Dosing plan, adverse event capture, imaging follow-up, ctDNA/immunomonitoring.
- Response interpretation in combination therapy context.
- **Principle**: platform learns from outcomes, not just ships constructs.

### G. Data and Learning Layer
- End-to-end audit trail, case registry, antigen-response linkage.
- Model recalibration, cost/timing/failure analytics.
- **Principle**: without longitudinal learning, personalized oncology remains expensive one-off experiments.

## Maturity Map

| Layer | Maturity | Evidence tier | Practical interpretation |
|------|---------|---------------|--------------------------|
| Tumor/normal sequencing | Mature | T2 | Use maintained workflows |
| HLA-aware neoantigen ranking | Usable, imperfect | T2 | Enough for candidates, not blind autonomy |
| Personalized mRNA in oncology | Clinically credible | T2 | Evidence exists; workflow complex and expensive |
| LNP delivery | Pragmatic default | T2 | Works; efficiency and tissue targeting are bottlenecks |
| Structural modeling (AF2/AF3) | Supportive | T2/T3 | Re-ranking signal, not authority |
| saRNA in oncology | Promising | T3 | Roadmap, not current baseline |
| circRNA neoantigen vaccines | Early | T3 | Important future bet |
| Automated single-patient manufacturing | Partial | T3 | Improving, operationally challenging |
| Programmable RNA systems | Speculative | T4 | Resilience planning only |

## Implementation Roadmap

### Phase 0. Program Definition
Define initial cancer settings, baseline modality (conventional mRNA), success criteria (feasibility, immunogenicity, turnaround). Output: target product profile, governance model, evidence plan, partner map.

### Phase 1. Computational Foundation [partially T1]
Build reproducible DNA/RNA analysis → variant-to-neoantigen candidates → ensemble ranking → audit trail → expert review packets. **Status**: case registry, workflow orchestration, QC gate, ranking persistence, board packets, and review outcomes are implemented [T1]. Neoantigen prediction itself is consumed from external pipelines.

### Phase 2. RNA Design Workbench [partially T1]
Construct generation, design-space comparison, manufacturability scoring. **Status**: modality governance, construct design generation with linker strategies and multi-epitope encoding are implemented [T1]. Sequence-level optimization (codon optimization, MFE scoring) is a future integration.

### Phase 3. Clinical Workflow Pilot [partially T1]
Intake, case orchestration, manufacturing handoff, outcomes registry, dashboards. **Status**: full case lifecycle, handoff packet generation, outcome timeline capture, and operations summary are implemented [T1]. Dashboards and timing analytics are future work.

### Phase 4. Translational Validation
Turnaround feasibility, ranking-vs-expert concordance, predicted-vs-measured immune response linkage. **Status**: traceability infrastructure supports this analysis [T1]. Actual validation requires clinical deployment.

### Phase 5. Prospective Clinical Programs
Only after earlier layers are stable. Strict patient selection, combination strategies, immune monitoring, survival endpoints, learning-loop closure.

## 25-50 Year Technology Horizon

### Horizon 1: 2026-2032 [T2/T3]
- Conventional mRNA remains the execution surface.
- Gains from better ranking, faster manufacturing, disciplined orchestration.
- V940 Phase 3 results expected ~2027-2028; may establish class precedent.

### Horizon 2: 2030-2040 [T3]
- saRNA and trans-amplifying systems for dose compression.
- Tissue-aware delivery systems.
- ctDNA/liquid biopsy reduces tissue access dependence.
- Partial automation of single-patient production.

### Horizon 3: 2035-2050 [T3/T4]
- circRNA for stability-critical applications.
- Indication-specific RNA architecture selection.
- Adjuvant logic, co-expression, response-adaptive schedules.

### Horizon 4: 2045-2076 [T4]
- Programmable RNA systems by disease context.
- Highly automated build-test-learn loops.
- Cost inversion: platform carries complexity, not patient-specific payload.

**Constraint**: Horizons 3-4 are platform forecasts, not validated product claims.

## Scientific Design Principles

1. **Do not overfit to a single signal**: binding, structure, expression and clonality all matter; none alone is sufficient.
2. **Use maintained upstream components**: sequencing and annotation from conservative, maintained workflows. Differentiation belongs downstream.
3. **Treat AI as decision support, not authority**: accelerate triage and comparison, never silently replace expert review or clinical governance.
4. **Separate current capability from roadmap**: conventional mRNA = execution baseline. saRNA/circRNA = roadmap with structured R&D track.
5. **Design for learning**: each completed case must improve the next one.
6. **Regulatory-by-design**: audit trail, traceability, and provenance are architectural requirements, not afterthoughts.

## Major Risks

| Category | Risk | Mitigation |
|---------|------|-----------|
| Scientific | Neoantigen ranking false-positive/negative burden | Ensemble ranking, uncertainty scoring, expert review gate |
| Scientific | Tumor heterogeneity invalidates candidates | Clonality-aware candidate filtering, longitudinal ctDNA monitoring |
| Scientific | Structural modeling creates false confidence | Keep in bounded supportive role, never as sole selection criterion |
| Delivery | LNP delivery remains biologically lossy | Model delivery as a constrained interface, track efficiency metrics |
| Operational | Personalized manufacturing is expensive and time-sensitive | Track turnaround and per-case economics from day one |
| Clinical | Benefit is setting-dependent | Start with narrow, well-defined clinical settings |
| Clinical | Combination therapy makes attribution difficult | Immune monitoring endpoints separate from composite survival |
| Regulatory | Overstating maturity creates planning blind spots | Evidence tiering (T1-T4); no claims beyond demonstrated capability |
| Commercial | Market validation depends on V940 outcome | Diversify indication strategy; don't bet on single Phase 3 result |

## Success Criteria

### Near-term [T1]
- Reproducible design pipeline from tumor/normal data to ranked antigen set.
- RNA design workbench producing multiple traceable construct candidates.
- Manufacturing handoff package with provenance.
- Expert review workflow with auditability.
- 40+ API endpoints tested and stable (494 tests across 22 suites, 94.43% line coverage).

### Mid-term [T2]
- Prospective evidence of repeatable individualized product generation in clinically meaningful timeframe.
- Measurable immunogenicity and operational feasibility.
- Understanding of which disease settings benefit most.

### Long-term [T3/T4]
- Modality-agnostic RNA platform: mRNA, saRNA, circRNA as design choices inside one system.

## Document Scope Exclusions

This document does not contain:
- wet-lab instructions;
- manufacturing recipes (buffer conditions, flow rates, LNP formulations);
- dosing recommendations;
- clinical use advice;
- patient-facing documentation.

Companion reference documents:
- [docs/REGULATORY_CONTEXT.md](docs/REGULATORY_CONTEXT.md) — detailed regulatory mapping.
- [docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md](docs/MEDICAL_EVIDENCE_AND_COMPETITOR_BASELINE_2026-03.md) — full evidence tables.
- [docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md](docs/TOOLCHAIN_AND_OPEN_SOURCE_BASELINE_2026-03.md) — dependency currency and bioinformatics references.