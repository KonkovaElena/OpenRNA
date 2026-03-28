---
title: "Personalized Neoantigen RNA Platform Design"
status: active
version: "2.0.0"
last_updated: "2026-03-28"
tags: [oncology, mrna, circRNA, saRNA, neoantigen, platform-design]
---

# Design: Personalized Neoantigen RNA Platform

## Goal
Сформировать максимально проработанный, но инженерно трезвый дизайн платформы персонализированных неоантигенных RNA-вакцин, которая сегодня может работать на conventional mRNA, а на горизонте 25-50 лет эволюционировать в сторону saRNA, trans-amplifying RNA, circRNA и других программируемых RNA-модальностей.

## Простыми словами: что мы строим
Мы строим программу, которая делает следующее:

1. Берёт образец опухоли и кровь пациента.
2. Секвенирует ДНК и РНК, находит мутации, уникальные для рака.
3. Компьютер предсказывает, какие мутации действительно могут быть видны иммунной системе.
4. Дизайнит RNA-конструкт, кодирующий набор этих мутантных фрагментов.
5. Упаковывает RNA в систему доставки, сегодня обычно LNP.
6. Вводит препарат пациенту, чтобы иммунная система научилась узнавать и атаковать опухоль.

Важная идея: это не один препарат и не один алгоритм. Это платформа, которая объединяет molecular profiling, antigen intelligence, RNA engineering, delivery, clinical workflow и continuous learning.

## Что значит горизонт 25-50 лет
Горизонт 25-50 лет означает, что мы проектируем не только сегодняшнюю линейную mRNA-вакцину, но и платформу, способную пережить смену поколений технологии:

- сегодня: conventional mRNA + LNP;
- следующий слой: saRNA и trans-amplifying RNA для снижения дозы и ускорения economics;
- следующий слой: circRNA для большей стабильности и потенциально более мягких требований к cold chain;
- дальний горизонт: адаптивные RNA-системы, smarter delivery, автоматизированное single-patient manufacturing и более тесная связка с ctDNA, real-time monitoring и комбинационной иммунотерапией.

## Evidence framing for horizon claims

Этот документ сочетает current implementation design и long-horizon platform thinking, поэтому классы утверждений нужно читать раздельно:

- current software boundary: то, что уже относится к текущему control-plane implementation;
- validated trajectory: направления, которые уже поддержаны official or peer-reviewed surfaces и влияют на архитектуру сейчас;
- strategic bet: сильные направления развития, которые не должны подаваться как settled baseline;
- scenario horizon: 2050+ planning hypotheses for resilience, not delivery promises.

Для отдельного long-horizon planning surface см. [2026-03-28-rna-oncology-platform-horizon-audit-2050-2076.md](../../docs/superpowers/specs/2026-03-28-rna-oncology-platform-horizon-audit-2050-2076.md).

## Current software implementation boundary

Текущий `external/mRNA` package реализует Phase 1 control-plane slice, а не полную end-to-end oncology platform:

- case registry and sample provenance;
- workflow request gate with idempotent submission semantics;
- in-memory default adapter for bootstrap and local demo use;
- structured operator-facing error contract.

Durable PostgreSQL persistence, transactional outbox behavior, and richer external execution status handling are implementation hardening steps, not already-finished capabilities.

## Scope
Документ описывает:

- продуктовую и научную логику платформы;
- то, что уже подтверждено клинически или translationally;
- what remains experimental;
- архитектуру вычислительного и операционного контура;
- дорожную карту по поколениям RNA-модальностей;
- риски, ограничения и критерии зрелости.

Документ сознательно не содержит:

- wet-lab инструкций;
- точных производственных рецептур;
- конкретных дозировок, buffer conditions, flow-rate recipes или иных protocol-level manufacturing параметров;
- advice for clinical use.

## Executive Summary
Персонализированные neoantigen RNA-вакцины больше не выглядят как чистая научная фантазия. Наиболее сильный опубликованный сигнал сегодня состоит в том, что:

- individualized RNA neoantigen vaccines могут быть изготовлены в clinically relevant timeframe;
- они способны индуцировать measurable neoantigen-specific T-cell responses;
- в отдельных программах уже есть ранний клинический сигнал в human oncology;
- но field всё ещё не сводится к готовой, стандартизованной, дешёвой и массово доступной платформе.

Главный практический вывод: строить нужно не "AI, который придумал вакцину", а end-to-end platform for individualized cancer immunotherapy.

Её минимально достаточные блоки:

1. Patient and sample intake.
2. Tumor/normal molecular profiling.
3. Neoantigen discovery and prioritization.
4. RNA construct design.
5. Delivery and manufacturing handoff.
6. Clinical administration and monitoring.
7. Outcome registry and model learning loop.

## External Evidence Base

### 1. Personalized neoantigen RNA vaccines are scientifically credible
Наиболее сильная академическая опора сейчас выглядит так:

- Nature 2023, PDAC: individualized uridine mRNA-lipoplex vaccine autogene cevumeran была произведена в real time после surgery, оказалась tolerable и вызвала de novo high-magnitude neoantigen-specific T cells у 8 из 16 пациентов; responders показали более длинный recurrence-free survival signal.
- Nature Medicine 2025, advanced solid tumors: ongoing phase 1 study autogene cevumeran показало, что individualized neoantigen-specific responses возникали у 71% пациентов, а ответы могли сохраняться до 23 месяцев.
- Review literature 2024-2025 consistently frames RNA cancer vaccines as promising, но всё ещё constrained delivery, tumor heterogeneity, manufacturing cost и workflow complexity.

Вывод:
Персонализированная neoantigen RNA-vaccination уже имеет серьёзную translational basis. Но это не значит, что у поля уже есть solved platform economics, solved manufacturing или solved patient selection.

### 2. Melanoma program progress does not mean the whole field is "already solved"
Сильный industrial signal идёт от mRNA-4157/V940 + pembrolizumab:

- phase 2b melanoma data gave an important recurrence-risk signal;
- reviews 2025 treat this as a major milestone for the field;
- public reporting and literature indicate that phase 3 development has started for this specific program.

Вывод:
Корректно говорить не "RNA cancer vaccines already reached Phase 3 as a category", а "at least one major personalized melanoma program has progressed into late-stage development".

### 3. saRNA and circRNA are strategically important, but still earlier in oncology
Review literature 2024-2025 consistently converges on the following:

- saRNA is attractive because it may reduce required dose through intracellular amplification;
- circRNA is attractive because closed circular structure improves resistance to exonuclease degradation and may improve stability relative to standard linear mRNA;
- both modalities are strategically important for future platform evolution;
- neither modality should be described today as a clinically settled replacement for conventional individualized mRNA oncology workflows.

Вывод:
saRNA and circRNA belong in the platform roadmap, not in the "already validated standard of care" bucket.

### 4. AlphaFold and AlphaFold 3 are supportive tools, not clinical decision engines
Official Google DeepMind surfaces confirm:

- AlphaFold 2 code is Apache-2.0, but both AlphaFold 2 and its outputs are not intended, validated, or approved for clinical use;
- AlphaFold 3 code and weights are not simply unrestricted open source: code is under CC-BY-NC-SA 4.0, model parameters require access request, and outputs are again explicitly not for clinical use;
- AlphaFold Server is non-commercial and has output restrictions.

Scientific guidance also remains conservative:

- structural prediction can help as a re-ranking or plausibility signal;
- it does not replace immunogenicity evidence, processing/presentation logic, or clinical review.

Вывод:
В платформе AlphaFold-like tools should sit in the supportive modeling layer, not at the center of go/no-go antigen selection.

## Core Thesis
Лучшая форма такого проекта:

**Personalized neoantigen RNA platform = molecular profiling + neoantigen intelligence + RNA engineering + delivery/manufacturing workflow + clinical evidence loop.**

Не нужно проектировать это как один monolithic wet-lab product. Нужна управляемая система, где каждый слой можно улучшать независимо:

- better calling and annotation;
- better ranking models;
- better RNA constructs;
- better delivery systems;
- better turnaround and cost structure;
- better patient stratification.

## Platform Architecture

### A. Clinical Intake Layer
Функция:

- patient selection;
- consent and governance;
- sample collection orchestration;
- linkage to standard-of-care therapy;
- baseline imaging and biospecimen schedule.

Ключевой принцип:
RNA vaccine should be embedded into a care pathway, not treated as an isolated magical intervention.

### B. Molecular Profiling Layer
Функция:

- tumor/normal DNA sequencing;
- RNA sequencing where clinically justified;
- somatic variant calling;
- annotation of coding effects, fusions and expression support;
- quality control and provenance tracking.

Representative stack today:

- FASTQ QC: FastQC, MultiQC, fastp;
- DNA pipeline: BWA-MEM2, GATK Mutect2, Strelka2, bcftools;
- RNA pipeline: STAR, Salmon or equivalent expression stack, fusion callers where needed;
- annotation: VEP, SnpEff;
- orchestration: Nextflow and maintained workflows rather than a homegrown sequencing engine.

Ключевой принцип:
upstream genomics should stay conservative, reproducible and auditable.

### C. Neoantigen Intelligence Layer
Функция:

- candidate peptide generation from somatic events;
- expression-aware filtering;
- HLA-aware presentation prediction;
- self-similarity and tolerance-risk scoring;
- clonality and tumor-burden context;
- ranking and uncertainty scoring.

Representative tools today:

- pVACtools / pVACseq;
- OpenVax as an important clinical workflow reference;
- Seq2Neo and related ML-based ranking layers;
- custom ensemble ranking over binding, expression, clonality and manufacturability.

Ключевой принцип:
This is an ensemble ranking problem, not a one-model prediction problem.

### D. RNA Construct Design Layer
Функция:

- convert selected antigens into a translatable RNA construct;
- optimize coding sequence and architectural constraints;
- evaluate sequence properties, structural burden and manufacturability;
- keep design variant history and rationale.

Representative tooling today:

- mRNAid;
- DNA Chisel;
- ViennaRNA;
- sequence design and codon-optimization utilities;
- internal scoring layer that weighs translation, stability and practical manufacturability.

Ключевой принцип:
RNA design is not just codon optimization. It is multi-objective design under biological and manufacturing constraints.

### E. Delivery and Manufacturing Handoff Layer
Функция:

- transfer approved design into a manufacturable specification;
- choose delivery modality appropriate to the generation of the platform;
- track release, handoff and turnaround constraints;
- separate research design from GMP execution.

Current default:

- conventional mRNA with LNP remains the pragmatic current-generation baseline;
- delivery science is still a bottleneck, not a solved infrastructure layer.

Ключевой принцип:
For the design surface, delivery should be modeled as a constrained partner interface, not a simplistic "wrap RNA into LNP" checkbox.

### F. Clinical Administration and Monitoring Layer
Функция:

- dosing plan ownership by clinical team;
- adverse event capture;
- imaging follow-up;
- ctDNA and immunomonitoring where available;
- response interpretation in the context of combination therapy.

Ключевой принцип:
the platform has to learn from outcomes, not just ship constructs.

### G. Data and Learning Layer
Функция:

- end-to-end audit trail;
- case registry;
- linkage between predicted antigens and observed immune responses;
- model recalibration;
- cost, timing and failure-mode analytics.

Ключевой принцип:
Without longitudinal learning, personalized oncology remains a sequence of expensive one-off experiments.

## What Is Validated Today vs What Is Horizon Work

| Layer | Current status | Practical interpretation |
|------|----------------|--------------------------|
| Tumor/normal sequencing and annotation | mature | use maintained workflows, do not reinvent base genomics |
| HLA-aware neoantigen ranking | usable but imperfect | enough for candidate generation, not enough for blind autonomy |
| Personalized neoantigen mRNA in oncology | clinically credible | evidence exists, but workflow remains complex and expensive |
| LNP delivery | pragmatic current default | works, but delivery efficiency and tissue targeting remain bottlenecks |
| AlphaFold/AF3 structural modeling | supportive | use as re-ranking signal, not as authority |
| saRNA in oncology | promising | keep in roadmap and selective R&D track |
| circRNA neoantigen vaccines | promising but earlier | important future bet, not current baseline |
| fully automated single-patient rapid manufacturing | partial | improving, but still operationally challenging |

## Recommended Product Strategy

### What We Are Actually Building
Лучший продуктовый framing здесь такой:

- not a single therapeutic SKU;
- not a lab protocol book;
- not a consumer promise;
- but a modular platform for individualized RNA cancer vaccine design and execution.

### Best near-term shape
На ближайшем горизонте наиболее рационален platform stack из трёх уровней:

1. Computational design engine.
2. Clinical workflow and review surface.
3. Manufacturing handoff and evidence registry.

Это даёт возможность улучшать ranking, RNA architecture и delivery отдельно, не ломая весь system contract.

## Implementation Roadmap

### Phase 0. Program Definition
Нужно определить:

- initial cancer settings;
- whether platform starts in adjuvant or minimal residual disease context;
- which modality is baseline: conventional mRNA first, not future RNA forms;
- what counts as success: feasibility, immunogenicity, turnaround, recurrence reduction, or a narrower objective.

Output:

- target product profile;
- governance model;
- evidence plan;
- partner map.

### Phase 1. Computational Foundation
Build:

- reproducible DNA/RNA analysis workflow;
- variant-to-neoantigen candidate generation;
- ensemble ranking engine;
- audit trail for each ranking decision;
- expert review packet generation.

Success signal:

- reproducible outputs on retrospective/public datasets;
- explicit uncertainty flags;
- stable provenance from raw data to ranked candidate list.

### Phase 2. RNA Design Workbench
Build:

- construct generation engine;
- design-space comparison across candidate RNA architectures;
- manufacturability scoring and delivery-aware constraints;
- versioned sequence rationale.

Success signal:

- multiple viable construct candidates per case;
- documented tradeoff surface rather than single opaque output.

### Phase 3. Clinical Workflow Pilot Layer
Build:

- intake and case orchestration;
- multidisciplinary review workflow;
- manufacturing handoff packet;
- outcomes registry;
- timing and cost dashboards.

Success signal:

- every case can be tracked from sample receipt to decision package to follow-up.

### Phase 4. Translational Validation
Focus:

- feasibility of turnaround;
- concordance between computational ranking and expert review;
- link between predicted candidates and measured immune response;
- operational failure modes.

Success signal:

- credible go/no-go basis for prospective clinical programs.

### Phase 5. Prospective Clinical Programs
Only after earlier layers are stable should the platform move into broader prospective use.

What matters here:

- strict patient selection;
- combination strategy clarity;
- immune monitoring;
- survival and recurrence endpoints where appropriate;
- learning-loop closure back into the platform.

## 25-50 Year Technology Horizon

### Horizon 1: 2026-2032
Baseline platform generation:

- conventional individualized mRNA remains the main execution surface;
- LNP stays the default delivery backbone;
- biggest gains come from better neoantigen ranking, faster manufacturing and more disciplined workflow orchestration.

What to optimize:

- turnaround;
- cost per case;
- candidate selection quality;
- combination therapy logic.

### Horizon 2: 2030-2040
Platform broadens into multi-modality RNA design:

- saRNA and trans-amplifying systems become realistic for dose compression and potentially better economics;
- delivery systems become more tissue-aware;
- ctDNA and liquid biopsy may reduce dependence on repeated tissue access in some scenarios;
- partial automation of single-patient production becomes practical.

### Horizon 3: 2035-2050
Platform begins to incorporate more stable RNA formats:

- circRNA becomes strategically important where stability and distribution constraints dominate;
- RNA architecture selection becomes indication-specific rather than one-size-fits-all;
- construct design may include adjuvant logic, co-expression logic and response-adaptive schedules.

### Horizon 4: 2045-2076
Long-range platform vision:

- programmable RNA systems selected by disease context;
- highly automated build-test-learn loops;
- much faster individualization cycle;
- lower cost because the platform, not the patient-specific payload, carries more of the complexity.

Important constraint:
These long-horizon statements are platform forecasts, not validated product claims.

## Scientific Design Principles

### 1. Do not overfit to a single signal
Binding affinity, structural plausibility, expression and clonality all matter, but none of them alone is sufficient.

### 2. Use maintained upstream components
Sequencing analysis and annotation should rely on conservative, maintained workflows. Product differentiation belongs downstream in ranking, orchestration and evidence integration.

### 3. Treat AI as decision support, not authority
AI should accelerate literature synthesis, candidate triage and design-space comparison. It should not silently replace expert review, translational validation or clinical governance.

### 4. Separate current capability from roadmap ambition
Conventional mRNA is current execution baseline. saRNA and circRNA belong in roadmap and selective R&D track until stronger oncology-specific evidence accumulates.

### 5. Design for learning, not only for output
The platform is valuable only if each completed case improves the next one.

## Major Risks

### Scientific Risk
- Neoantigen ranking still has high false-positive and false-negative burden.
- Tumor heterogeneity can invalidate apparently strong candidates.
- Structural modeling may create false confidence if treated as a central oracle.

### Delivery Risk
- LNP delivery remains biologically lossy.
- Better delivery may matter as much as better antigen ranking.

### Operational Risk
- Personalized manufacturing is still expensive and time-sensitive.
- Case-level orchestration may fail before biology fails.

### Clinical Risk
- RNA vaccine benefit may be highly setting-dependent.
- Combination therapy makes attribution of effect difficult.

### Claims Risk
- Overstating the maturity of the field creates a strategic blind spot.
- "Already Phase 3" language is too broad for the category and leads to planning mistakes.

## Risk Mitigations

- use narrow, clearly defined clinical settings first;
- keep current-generation execution anchored in conventional mRNA;
- treat saRNA and circRNA as structured future workstreams;
- keep AlphaFold-like tools in a bounded supporting role;
- track turnaround, failure modes and per-case economics from day one;
- separate exploratory science from operational platform promises.

## Success Criteria

### Near-term success
- reproducible design pipeline from tumor/normal data to ranked antigen set;
- RNA design workbench that produces multiple traceable construct candidates;
- manufacturing handoff package with explicit constraints and provenance;
- expert review workflow with auditability.

### Mid-term success
- prospective evidence that the platform can repeatedly generate administrable individualized products in a clinically meaningful timeframe;
- measurable immunogenicity and operational feasibility;
- clear understanding of which disease settings benefit most.

### Long-term success
- modality-agnostic RNA platform where conventional mRNA, saRNA and circRNA are design choices inside one system rather than separate disconnected programs.

## Final Recommendation
Правильная версия этого проекта выглядит так:

- не как one-shot "full recipe" персонализированной RNA-вакцины;
- не как ставка на один алгоритм или одну delivery-технологию;
- а как modular personalized neoantigen RNA platform with staged technical evolution.

Практический baseline сегодня:

1. Keep current execution anchored in conventional individualized mRNA.
2. Build conservative genomics upstream and differentiated ranking downstream.
3. Treat delivery as a real bottleneck, not as solved plumbing.
4. Use AlphaFold/AF3 only as a bounded supportive layer.
5. Put saRNA and circRNA in the roadmap as next-generation platform options.

Итоговая формула:

**Personalized neoantigen RNA platform = sequencing and annotation + antigen intelligence + RNA architecture design + delivery/manufacturing handoff + clinical evidence loop + multi-generation technology roadmap.**

## Immediate Next Actions
1. Зафиксировать baseline modality как conventional mRNA, а saRNA/circRNA перевести в explicit roadmap section.
2. Сформировать reference architecture для end-to-end case flow: sample intake -> molecular profiling -> ranking -> construct design -> manufacturing handoff -> follow-up.
3. Разделить evidence table на three buckets: validated today, active clinical development, long-horizon forecast.
4. Убрать из дальнейших версий документа protocol-level manufacturing specifics и оставить только platform-relevant constraints.
5. Если потребуется operational expansion, вынести отдельно reference doc по computational stack и отдельно explanation doc по platform roadmap.