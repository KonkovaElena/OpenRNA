---
title: "Medical Evidence and Competitor Baseline — March 2026"
status: active
version: "1.0.1"
last_updated: "2026-03-31"
tags: [medical-evidence, competitors, oncology, mrna, clinical-trials]
evidence_cutoff: "2026-03-31"
---

# Medical Evidence and Competitor Baseline

This document captures the clinical evidence landscape and competitive context for personalized neoantigen RNA vaccines as of March 2026. It is companion material to `design.md` v3.0.0 and should be refreshed when new Phase 2/3 readouts, regulatory decisions, or competitor events occur.

## Evidence Classification

Uses the same 4-tier system as `design.md`:

| Tier | Meaning |
|------|---------|
| **T1** | Implemented in this repository |
| **T2** | Validated trajectory (Phase 2+/3 data, peer-reviewed) |
| **T3** | Strategic bet (early data, not standard of care) |
| **T4** | Scenario horizon (2040+ planning hypotheses) |

---

## 1. Clinical Programs — Personalized Neoantigen mRNA Vaccines

### 1.1 mRNA-4157/V940 (Moderna/Merck) — [T2]

| Field | Detail |
|-------|--------|
| **Modality** | Conventional mRNA, LNP delivery |
| **Indication** | Adjuvant melanoma (Stage III/IV, post-resection) |
| **Combination** | Pembrolizumab (KEYTRUDA) |
| **Key trial** | KEYNOTE-942 / V940-001 (Phase 2b, randomized, n=157) |
| **Primary endpoint** | Recurrence-free survival (RFS) |
| **Result** | Published adjuvant melanoma readouts show an RFS benefit with pembrolizumab combination; the cited 3-year update reports HR 0.561 |
| **Publications** | Weber et al., *Lancet* 2024; Khattak et al., *Nature Medicine* 2025 |
| **Registry-backed late-stage program** | ClinicalTrials.gov search for `INTerpath-001` / `V940-001` currently resolves to NCT05933577, listed as an active-not-recruiting high-risk melanoma study |
| **Program note** | Registry title: "A Clinical Study of Intismeran Autogene (V940) Plus Pembrolizumab in People With High-Risk Melanoma" |
| **Manufacturing** | ~6-week turnaround per patient vaccine; Moderna mRNA manufacturing platform |
| **Platform note** | Up to 34 neoantigens per construct; patient-specific mRNA sequence |

**Significance for this project**: V940 validates the complete neoantigen-mRNA pipeline from tumor profiling through manufacturing and clinical administration. The cited melanoma readouts remain the strongest public clinical signal for personalized neoantigen mRNA vaccination, and the registry-backed high-risk melanoma program is the anchor reference for ongoing late-stage development.

### 1.2 BNT-122 / Autogene cevumeran (BioNTech/Genentech) — [T2]

| Field | Detail |
|-------|--------|
| **Modality** | Conventional mRNA (RNA-lipoplex, IV delivery) |
| **Indication 1** | Adjuvant pancreatic ductal adenocarcinoma (PDAC) |
| **Key trial 1** | Nature 2023 Phase 1 PDAC cohort (n=16); randomized adjuvant PDAC study listed separately on ClinicalTrials.gov as NCT05968326 (IMCODE003) |
| **Result 1** | Neoantigen-specific T-cell responses in 8/16 (50%) patients; T-cell responders showed significantly delayed recurrence (median not reached vs 13.4 months, p=0.003) |
| **Publication 1** | Rojas et al., *Nature* 2023 (Phase 1 data) |
| **Indication 2** | Solid tumors (melanoma, NSCLC, colorectal) |
| **Key trial 2** | IMCODE trial portfolio; Phase 1 solid tumor basket (preliminary) |
| **Result 2** | Individualized neoantigen-specific immune responses in 71% of patients (15/21), with responses reported as durable up to 23 months in early-phase solid-tumor reporting |
| **Registry-backed PDAC program** | NCT05968326 (IMCODE003): autogene cevumeran + atezolizumab + mFOLFIRINOX versus mFOLFIRINOX alone in resected PDAC |
| **Platform note** | RNA-LPX (liposome complex) IV infusion; up to 20 neoantigen cassettes per construct |

**Significance for this project**: BNT-122 demonstrates the approach in a hard-to-treat solid tumor (PDAC) where immune checkpoint inhibitors alone have failed. The stark survival separation between T-cell responders and non-responders validates biomarker-driven patient stratification as a platform capability. Different delivery vehicle (RNA-LPX vs Moderna's LNP) and route (IV vs IM).

### 1.3 Gritstone Bio — [T2, failed]

| Field | Detail |
|-------|--------|
| **Modality** | Self-amplifying RNA (saRNA) via alphavirus backbone |
| **Programs** | GRANITE (shared/tumor-associated antigens) and SLATE (off-the-shelf shared antigen) |
| **Indication** | MSS-CRC (microsatellite-stable colorectal cancer), NSCLC |
| **Key trial** | GRANITE Phase 2 + chemo-IO combination |
| **Outcome** | Company filed for bankruptcy protection in October 2024 after failing to meet efficacy endpoints and exhausting funding |
| **Technology** | Self-amplifying RNA (saRNA) + ChAdV prime-boost heterologous regimen |
| **Lesson for platform** | saRNA amplification may not compensate for suboptimal antigen selection or tumor microenvironment immunosuppression in cold tumors. Capital-intensive manufacturing at scale without Phase 2 efficacy signal → financial failure. Shared antigen approach (SLATE) less personalized than per-patient neoantigen design |

**Significance for this project**: Gritstone's failure provides critical risk intelligence. The saRNA approach itself is not invalidated (delivery was functional), but efficacy in cold tumors + insufficient funding = company failure. The platform architecture should accommodate saRNA as a future modality [T3] without betting the core pathway on it.

### 1.4 CureVac — [T3]

| Field | Detail |
|-------|--------|
| **Modality** | Chemically modified mRNA (proprietary CVSQIV platform) |
| **Strategy** | Pivoted from COVID-19 (CVnCoV failed Phase 3) to oncology and rare genetic diseases |
| **Oncology program** | CV8102 (RNA adjuvant) + personalized neoantigen programs (Phase 1) |
| **Partnership** | GSK collaboration on next-gen mRNA oncology |
| **Status** | Early-stage; limited published clinical data for personalized neoantigen as of March 2026 |

### 1.5 Other Programs

| Program | Sponsor | Modality | Status (March 2026) | Tier |
|---------|---------|----------|---------------------|------|
| mRNA-4359 | Moderna | mRNA checkpoint (PD-L1) | Phase 1 dose escalation | T3 |
| BNT-111 | BioNTech | Off-the-shelf shared antigen (melanoma TAA) | Phase 2 | T3 |
| BNT-113 | BioNTech | HPV16+ head-and-neck cancer | Phase 2 AHEAD-MERIT | T3 |
| SW1115C3 | Stemirna (China) | mRNA neoantigen | Phase 1 | T3 |
| Neoantigen programs | NEC/Transgene | AI-predicted neoantigens (peptide + adenovirus) | Phase 1/2 | T3 |

---

## 2. RNA Modality Science

### 2.1 Self-amplifying RNA (saRNA) — [T3]

| Aspect | Current State |
|--------|--------------|
| **Mechanism** | Alphavirus replicon (nsP1-4) + subgenomic promoter; RNA self-replicates in cytoplasm |
| **Advantage** | Lower dose requirement (0.1–1 µg vs 30–100 µg for conventional mRNA); sustained antigen expression |
| **Approved precedent** | ARCT-154 (Arcturus, saRNA COVID-19 vaccine) — first saRNA approved in Japan (2023), WHO EUL |
| **Oncology evidence** | Gritstone GRANITE/SLATE (failed commercially, but demonstrated saRNA immunogenicity). Academic studies show robust CD8+ T-cell responses in preclinical |
| **Key challenge** | Innate immune detection of dsRNA replication intermediates can limit translation efficiency. Formulation (LNP size) optimization differs from conventional mRNA |
| **Platform implication** | Construct design port (`IConstructDesigner`) already supports `saRNA` modality flag; actual replicon engineering requires bioinformatics pipeline extension |

### 2.2 Circular RNA (circRNA) — [T4]

| Aspect | Current State |
|--------|--------------|
| **Mechanism** | Covalently closed RNA circle; no 5'/3' ends → resistant to exonuclease degradation |
| **Advantage** | Extended half-life in vivo (hours → days); potential cold-chain relaxation |
| **Translation** | Internal Ribosome Entry Site (IRES)-dependent or rolling-circle translation |
| **Key publications** | Wesselhoeft et al., *Nature Communications* 2018 (IRES-driven circRNA in vivo); Qu et al., *Cell* 2022 (circRNA vaccines); Chen et al., *Science* 2024 reviews |
| **Clinical programs** | No circRNA oncology vaccine in human trials as of March 2026 |
| **Startup activity** | Orna Therapeutics, CirCode, Laronde (wound down 2024) — circRNA platform companies |
| **Platform implication** | Flagged as `circRNA` modality in construct port; no implemented engineering pipeline. Requires fundamentally different synthesis (splint ligation or Group I intron splicing) |

### 2.3 Trans-amplifying RNA (taRNA) — [T4]

| Aspect | Current State |
|--------|--------------|
| **Mechanism** | Split replicon: replicase delivered separately from antigen-encoding RNA |
| **Advantage** | Platform flexibility (one replicase works with any antigen RNA) |
| **Status** | Preclinical only as of March 2026. Academic publications from Helmholtz/TU Braunschweig |
| **Platform implication** | Potential future modality; no code support |

---

## 3. HLA and Neoantigen Prediction Tools

The software platform defines a `INeoantigenRankingEngine` port for pluggable prediction logic. The landscape of tools available for neoantigen prediction (upstream of this port) as of March 2026:

### 3.1 MHC-I Binding Prediction

| Tool | Version / Status | Method | Note |
|------|-----------------|--------|------|
| **NetMHCpan** | 4.1 (2020) | Neural network, pan-specific | Gold standard for MHC-I binding affinity. DTU license (free academic) |
| **MHCflurry** | 2.1+ | Neural network, open-source | Apache-2.0 license. Competitive with NetMHCpan. Allele-specific models with pan-allele mode |
| **PRIME** | 2.0 (2024) | Presentation likelihood (MHC-I + processing features) | Gfeller lab (UNIL). Integrates proteasomal cleavage + TAP transport |
| **TransPHLA** | 2023 | Transformer-based pan-HLA | Newer deep learning approach; benchmark competitive but less validated in production |
| **pVACtools** | 4.x (2025) | Meta-pipeline (wraps NetMHCpan, MHCflurry, etc.) | WashU (Griffin lab). AGPL-3.0. Primary neoantigen prediction pipeline in academic and clinical use |

### 3.2 MHC-II Binding Prediction

| Tool | Version | Note |
|------|---------|------|
| **NetMHCIIpan** | 4.3 | DTU. CD4+ T helper epitope prediction |
| **MHCflurry Class II** | 2.1+ | Open-source MHC-II model (newer, less validated) |

### 3.3 Neoantigen Pipeline Orchestration

| Tool | Purpose | Note |
|------|---------|------|
| **pVACtools / pVACseq** | Full neoantigen calling + ranking pipeline | WashU. Calls variants → predicts binding → filters → ranks. Integrates with VCF caller outputs |
| **Nextflow nf-core/sarek** | Somatic variant calling (WGS/WES) | Community pipeline; upstream of neoantigen prediction |
| **OpenVax / Vaxrank** | Neoantigen ranking + vaccine peptide selection | Mt. Sinai. Python. Research-grade, less actively maintained |
| **NeoPredPipe** | Simplified neoantigen prediction pipeline | Research tool, less established |
| **pTuneos** | Presentation + immunogenicity scoring | Chinese academic group. Integrates clonality + VAF |

### 3.4 HLA Typing Tools

| Tool | Method | Note |
|------|--------|------|
| **OptiType** | Integer linear programming from RNA-seq/WES | HLA-I only. Widely used |
| **HLA-HD** | Bowtie2-based from WGS/WES | HLA-I and HLA-II |
| **HISAT-genotype** | Graph-based alignment | HLA + CYP + others |
| **xHLA** | Graph-guided assembly | Illumina/Human Longevity. Deprecated? |
| **arcasHLA** | Quantification from RNA-seq | HLA from RNA-seq. Active maintenance |

**Relevance to platform**: The `IHlaConsensusProvider` port implements multi-tool HLA consensus logic. The architecture assumes multiple HLA typing tools produce results, and the platform resolves disagreements via configurable confidence thresholds — this is a correct architectural choice given tool-level discordance observed in clinical validation studies (Bauer et al., *Bioinformatics* 2024).

---

## 4. RNA Engineering Tools

Tools relevant to the `IConstructDesigner` port's downstream implementation:

### 4.1 Sequence Optimization

| Tool | Purpose | License | Status |
|------|---------|---------|--------|
| **mRNAid** | Codon optimization + UTR selection + secondary structure | MIT | University of Tartu. Web tool + CLI |
| **LinearDesign** | mRNA structure + codon co-optimization (dynamic programming) | Research | Baidu Research. Peer-reviewed (Nature 2023) |
| **CodonBERT** | Transformer-based codon optimization | Research preprint | Nvidia/academic. Transfer learning from protein language models |
| **ViennaRNA** | RNA secondary structure prediction (MFE) | MIT-like | TBI Vienna. Gold standard for structure prediction. >10k citations |
| **DNA Chisel** | DNA/RNA sequence constraint optimization | MIT | Edinburgh Genome Foundry. Codon optimization with manufacturing constraints |
| **RNAfold** (ViennaRNA) | Minimum free energy folding | Included in ViennaRNA | Used for construct stability assessment |

### 4.2 Delivery Design

| System | Status | Platform Relevance |
|--------|--------|--------------------|
| **LNP (Lipid Nanoparticle)** | Standard of care (Pfizer/Moderna COVID, V940) | Default delivery assumption |
| **RNA-LPX (Lipoplex)** | BioNTech IV delivery (BNT-122) | Alternative delivery system |
| **Polymeric NP** | Preclinical | Potential future option |
| **Exosome delivery** | Very early | T4 horizon |

---

## 5. Competitor Landscape Summary

### 5.1 Active Players (March 2026)

| Company | Lead Personalized Program | Phase | Modality | Differentiator |
|---------|--------------------------|-------|----------|---------------|
| **Moderna/Merck** | V940 (mRNA-4157) | Phase 3 (INTerpath-001) | mRNA + LNP | Largest trial; Breakthrough designation; pembrolizumab combo |
| **BioNTech/Genentech** | BNT-122 (autogene cevumeran) | Phase 2 in resected PDAC; early-phase basket in solid tumors | mRNA + RNA-LPX IV | IV delivery; pancreatic cancer validation; IMCODE003 is the registry-backed PDAC study |
| **CureVac/GSK** | Undisclosed neoantigen | Phase 1 | Modified mRNA | GSK oncology partnership; CV8102 RNA adjuvant |
| **Stemirna** | SW1115C3 | Phase 1 (China) | mRNA | Chinese regulatory pathway |
| **NEC/Transgene** | TG4050 | Phase 1/2 | Adenovirus vector | AI-predicted neoantigens (NEC AI); different vector |

### 5.2 Exited / Failed

| Company | What happened | Lesson |
|---------|--------------|--------|
| **Gritstone Bio** | Bankruptcy (Oct 2024) | saRNA + shared antigens in cold tumors did not generate sufficient efficacy. Capital burned before Phase 2 readout |
| **Laronde** | Wound down (2024) | circRNA platform company; technology risk + funding gap |

### 5.3 Market Context

- No personalized neoantigen RNA vaccine has reached marketing approval as of March 2026.
- V940 + pembrolizumab is the most advanced program and may become the first approved personalized cancer vaccine if Phase 3 succeeds (readout ~2027–2028).
- Total addressable market estimates for personalized cancer vaccines range from $5B–$15B by 2035 (various analyst reports; high uncertainty).
- Manufacturing scalability (per-patient production in ≤6 weeks) remains the primary operational bottleneck across all programs.

---

## 6. Key Publications

| Citation | Year | Relevance |
|----------|------|-----------|
| Weber JS et al. Individualized neoantigen therapy mRNA-4157 combined with pembrolizumab in melanoma. *Lancet* | 2024 | V940 Phase 2b primary data |
| Khattak A et al. Updated results of KEYNOTE-942. *Nature Medicine* | 2025 | 3-year follow-up, HR 0.561 |
| Rojas LA et al. Personalized RNA neoantigen vaccines stimulate T cells in pancreatic cancer. *Nature* | 2023 | BNT-122 Phase 1 PDAC data |
| Sahin U et al. Personalized RNA mutanome vaccines mobilize poly-specific therapeutic immunity against cancer. *Nature* | 2017 | Foundational first-in-human neoantigen mRNA data |
| Ott PA et al. An immunogenic personal neoantigen vaccine for patients with melanoma. *Nature* | 2017 | Foundational neoantigen peptide vaccine (different modality, same concept) |
| Pardi N et al. mRNA vaccines — a new era in vaccinology. *Nature Reviews Drug Discovery* | 2018 | Authoritative mRNA vaccine platform review |
| Barbier AJ et al. The clinical progress of mRNA vaccines and immunotherapies. *Nature Biotechnology* | 2022 | Landscape review |
| Wesselhoeft RA et al. Engineering circular RNA for potent and stable translation in eukaryotic cells. *Nature Communications* | 2018 | circRNA foundational technology |
| Bloom K et al. Self-amplifying RNA vaccines for infectious diseases. *Gene Therapy* | 2021 | saRNA review and mechanism |
| Gfeller D et al. Improved predictions of antigen presentation and TCR recognition with MixMHCpred and PRIME. *Nature Biotechnology* | 2023 | PRIME 2.0 for neoantigen prediction |
| Hundal J et al. pVACtools: A computational toolkit to identify and visualize cancer neoantigens. *Cancer Immunology Research* | 2020 | pVACtools pipeline |

---

## 7. Open Questions and Uncertainties

1. **Which neoantigen prediction method wins?** No single tool dominates across all tumor types. Ensemble approaches (used by pVACtools and by this platform's `IHlaConsensusProvider` multi-tool consensus) are likely best practice, but head-to-head clinical validation is sparse.

2. **Optimal number of neoantigens per construct?** V940 uses up to 34; BNT-122 uses up to 20. No published dose-finding data comparing different cassette sizes.

3. **mRNA vs saRNA for oncology?** Gritstone's failure does not invalidate saRNA, but no successful Phase 2+ saRNA oncology trial exists. Conventional mRNA remains the safe default.

4. **IV vs IM delivery?** BioNTech uses IV (RNA-LPX); Moderna uses IM (LNP). Different biodistribution and immune activation profiles. No head-to-head comparison published.

5. **Manufacturing scalability?** Per-patient timelines of 4–6 weeks are operationally demanding. Automated manufacturing (Moderna's investment) and pooled strategies may improve throughput.

6. **Biomarker for patient selection?** T-cell response is the most promising stratification biomarker (BNT-122 data), but validated companion diagnostics do not exist yet.

7. **Resistance mechanisms?** HLA loss, beta-2-microglobulin mutations, and immune editing may limit long-term efficacy. Platform must accommodate adaptive re-vaccination strategies.

---

*Last updated: 2026-03-31. Evidence cutoff: March 2026. Next refresh recommended when V940 Phase 3 interim analysis or BNT-122 Phase 2 PDAC readout is published.*
