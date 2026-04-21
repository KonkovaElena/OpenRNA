---
title: "OpenRNA Intended Use"
status: "active"
version: "1.0.0"
last_updated: "2026-04-21"
tags: [intended-use, regulatory, clinical-boundary]
---

# OpenRNA Intended Use

## Intended Use Statement

OpenRNA is a software control plane for research, translational, and investigational operations around personalized neoantigen RNA vaccine workflows. It is intended to coordinate case intake, consent-aware provenance, reference bundle selection, workflow submission and run tracking, multi-tool HLA consensus, QC evaluation, expert review packets, independent final release authorization, manufacturing handoff packets, and follow-up outcome recording.

## Intended Users

- Bioinformatics and workflow operators
- Molecular tumor board and translational-review participants
- Quality and manufacturing release personnel
- Engineering, validation, and integration teams

## Intended Operating Context

- Closed-system deployments operated by known users
- Preclinical, translational, or investigational settings
- Site-owned authentication, authorization, retention, and validation controls

## Primary Outputs

- Auditable case records and lifecycle transitions
- Workflow, HLA, and QC records
- Review outcomes and independent final release authorizations
- Manufacturing handoff packets and downstream traceability views
- FHIR-oriented export bundles for integration use

## Not Intended For

- Autonomous diagnosis, treatment selection, or clinical decision-making
- Direct patient-facing medical device use
- Unsupervised manufacturing release without site procedures
- Claiming full 21 CFR Part 11 compliance or validated clinical deployment out of the box

## Boundary

OpenRNA provides engineering seams for regulated workflows, but site-specific identity proofing, electronic signature controls, validation evidence, and quality-system procedures remain required before clinical or commercial use.