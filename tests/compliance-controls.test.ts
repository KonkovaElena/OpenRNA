import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { InMemoryConsentTracker } from "../src/adapters/InMemoryConsentTracker";
import type { CaseRecord } from "../src/types";

/**
 * Compliance controls test suite — verifies three critical regulatory interlocks:
 *
 * 1. Consent Interlock (21 CFR Part 11 / ICH E6 §4.8):
 *    POST /workflows must reject when consent is not active.
 *
 * 2. Part 11 §11.50 Signature Manifestation:
 *    review outcomes accept and persist a linked electronic signature.
 *
 * 3. Two-Person Release Control (EU GMP Annex 16 / 21 CFR 211.22):
 *    final releaser must differ from the review signer, and handoff is blocked until release.
 */

function buildCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    caseProfile: {
      patientKey: "pt-compliance-001",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
      ...overrides,
    },
  };
}

function buildBundleInput(bundleId = "GRCh38-compliance") {
  return {
    bundleId,
    genomeAssembly: "GRCh38",
    annotationVersion: "GENCODE v45",
    knownSitesVersion: "dbSNP 157",
    hlaDatabaseVersion: "IMGT/HLA 3.56.0",
    frozenAt: "2026-03-01T00:00:00.000Z",
  };
}

const sampleSet = [
  { sampleId: "s-tumor-dna", sampleType: "TUMOR_DNA", assayType: "WES", accessionId: "acc-1", sourceSite: "site-001" },
  { sampleId: "s-normal-dna", sampleType: "NORMAL_DNA", assayType: "WES", accessionId: "acc-2", sourceSite: "site-001" },
  { sampleId: "s-tumor-rna", sampleType: "TUMOR_RNA", assayType: "RNA_SEQ", accessionId: "acc-3", sourceSite: "site-001" },
];

const artifactSet = [
  { sampleId: "s-tumor-dna", semanticType: "tumor-dna-fastq", schemaVersion: 1, artifactHash: "sha256:aaa" },
  { sampleId: "s-normal-dna", semanticType: "normal-dna-fastq", schemaVersion: 1, artifactHash: "sha256:bbb" },
  { sampleId: "s-tumor-rna", semanticType: "tumor-rna-fastq", schemaVersion: 1, artifactHash: "sha256:ccc" },
];

async function createReadyCase(app: ReturnType<typeof createApp>, caseInputOverrides: Record<string, unknown> = {}): Promise<CaseRecord> {
  const createRes = await request(app).post("/api/cases").send(buildCaseInput(caseInputOverrides));
  assert.strictEqual(createRes.status, 201, `Case creation failed: ${JSON.stringify(createRes.body)}`);
  const caseId = createRes.body.case.caseId;

  const consentRes = await request(app)
    .post(`/api/cases/${caseId}/consent`)
    .send({ type: "granted", scope: "genomic-analysis", version: "1.0" });
  assert.strictEqual(consentRes.status, 201, `Consent grant failed: ${JSON.stringify(consentRes.body)}`);

  for (const sample of sampleSet) {
    const response = await request(app).post(`/api/cases/${caseId}/samples`).send(sample);
    assert.notStrictEqual(response.status, 403, `Sample registration forbidden: ${JSON.stringify(response.body)}`);
  }
  for (const artifact of artifactSet) {
    const response = await request(app).post(`/api/cases/${caseId}/artifacts`).send(artifact);
    assert.notStrictEqual(response.status, 403, `Artifact registration forbidden: ${JSON.stringify(response.body)}`);
  }

  const getRes = await request(app).get(`/api/cases/${caseId}`);
  return getRes.body.case;
}

// ─── 1. Consent Interlock ──────────────────────────────────────────

test("Consent Interlock", async (t) => {
  await t.test("POST /workflows rejects when consent is not active", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);

    await request(app)
      .post(`/api/cases/${rec.caseId}/consent`)
      .send({ type: "withdrawn", scope: "genomic-analysis", version: "1.0" });

    // Register a reference bundle
    const bundleRes = await request(app).post("/api/reference-bundles").send(buildBundleInput());
    assert.strictEqual(bundleRes.status, 201, `Bundle registration failed: ${JSON.stringify(bundleRes.body)}`);

    // Attempt workflow without consent — must be rejected
    const res = await request(app)
      .post(`/api/cases/${rec.caseId}/workflows`)
      .send({
        workflowName: "somatic-variant-calling",
        referenceBundleId: "GRCh38-compliance",
        executionProfile: "default",
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, "consent_required");
  });

  await t.test("POST /workflows succeeds when consent is active", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);

    // Grant consent
    await request(app)
      .post(`/api/cases/${rec.caseId}/consent`)
      .send({ type: "granted", scope: "genomic-analysis", version: "1.0" });

    // Register a reference bundle
    await request(app).post("/api/reference-bundles").send(buildBundleInput());

    const res = await request(app)
      .post(`/api/cases/${rec.caseId}/workflows`)
      .send({
        workflowName: "somatic-variant-calling",
        referenceBundleId: "GRCh38-compliance",
        executionProfile: "default",
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.case);
  });

  await t.test("POST /workflows rejects after consent withdrawn", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);

    // Grant then withdraw
    await request(app)
      .post(`/api/cases/${rec.caseId}/consent`)
      .send({ type: "granted", scope: "genomic-analysis", version: "1.0" });
    await request(app)
      .post(`/api/cases/${rec.caseId}/consent`)
      .send({ type: "withdrawn", scope: "genomic-analysis", version: "1.0" });

    await request(app).post("/api/reference-bundles").send(buildBundleInput());

    const res = await request(app)
      .post(`/api/cases/${rec.caseId}/workflows`)
      .send({
        workflowName: "somatic-variant-calling",
        referenceBundleId: "GRCh38-compliance",
        executionProfile: "default",
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, "consent_required");
  });
});

// ─── 2. Part 11 §11.50 Signature Manifestation ─────────────────────

// Helper: advance case through full pipeline to AWAITING_REVIEW
async function advanceThroughReview(app: ReturnType<typeof createApp>, caseId: string) {
  // Consent
  await request(app).post(`/api/cases/${caseId}/consent`).send({
    type: "granted", scope: "genomic-analysis", version: "1.0",
  });
  // Bundle
  await request(app).post("/api/reference-bundles").send(buildBundleInput());
  // Workflow request
  await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "somatic-variant-calling", referenceBundleId: "GRCh38-compliance", executionProfile: "default",
  });
  // Start + complete run (runId is caller-provided, per platform convention)
  const runId = `run-compliance-${Date.now()}`;
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/start`).send({});
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/complete`).send({
    derivedArtifacts: [{ semanticType: "somatic-vcf", artifactHash: "sha256:d1", producingStep: "mutect2" }],
  });
  // HLA consensus
  await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["HLA-A*01:01", "HLA-B*08:01"],
    perToolEvidence: [{ toolName: "optitype", alleles: ["HLA-A*01:01", "HLA-B*08:01"], confidence: 0.99 }],
    confidenceScore: 0.99, referenceVersion: "IPD-IMGT/HLA 3.55.0",
  });
  // QC gate
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`).send({
    results: [{ metric: "callable_region_coverage", metricCategory: "callable_region_coverage", value: 120, threshold: 80, pass: true }],
  });
  // Board packet
  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`).send({});
  assert.strictEqual(packetRes.status, 201, `Board packet creation failed: ${JSON.stringify(packetRes.body)}`);
  return packetRes.body.packet.packetId as string;
}

test("Part 11 Signature Manifestation", async (t) => {
  await t.test("review outcome accepts and persists signature manifestation", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);
    const packetId = await advanceThroughReview(app, rec.caseId);

    const signatureManifestation = {
      meaning: "review" as const,
      signedBy: "dr-reviewer-001",
      signedAt: new Date().toISOString(),
      signatureHash: "abc123def456",
      signatureMethod: "hmac-sha256",
    };

    const reviewRes = await request(app).post(`/api/cases/${rec.caseId}/review-outcomes`).send({
      packetId,
      reviewerId: "dr-reviewer-001",
      reviewerRole: "molecular-pathologist",
      reviewDisposition: "approved",
      rationale: "All QC metrics within specification.",
      signatureManifestation,
    });

    assert.strictEqual(reviewRes.status, 201, `Review failed: ${JSON.stringify(reviewRes.body)}`);
    assert.ok(reviewRes.body.reviewOutcome.signatureManifestation);
    assert.strictEqual(reviewRes.body.reviewOutcome.signatureManifestation.meaning, "review");
    assert.strictEqual(reviewRes.body.reviewOutcome.signatureManifestation.signedBy, "dr-reviewer-001");
  });

  await t.test("review outcome works without signature (backward compat)", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);
    const packetId = await advanceThroughReview(app, rec.caseId);

    const reviewRes = await request(app).post(`/api/cases/${rec.caseId}/review-outcomes`).send({
      packetId,
      reviewerId: "dr-reviewer-001",
      reviewDisposition: "approved",
      rationale: "Approved after board discussion.",
    });

    assert.strictEqual(reviewRes.status, 201);
    assert.strictEqual(reviewRes.body.reviewOutcome.signatureManifestation, undefined);
  });

  await t.test("final release accepts and persists release signature manifestation", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);
    const packetId = await advanceThroughReview(app, rec.caseId);

    const reviewRes = await request(app).post(`/api/cases/${rec.caseId}/review-outcomes`).send({
      packetId,
      reviewerId: "dr-reviewer-001",
      reviewerRole: "molecular-pathologist",
      reviewDisposition: "approved",
      rationale: "Board approved after discussion.",
    });
    assert.strictEqual(reviewRes.status, 201);

    const releaseRes = await request(app).post(`/api/cases/${rec.caseId}/final-releases`).send({
      reviewId: reviewRes.body.reviewOutcome.reviewId,
      releaserId: "qp-001",
      releaserRole: "quality-person",
      rationale: "Independent quality release authorization.",
      signatureManifestation: {
        meaning: "release",
        signedBy: "qp-001",
        signedAt: new Date().toISOString(),
        signatureHash: "release-abc123",
        signatureMethod: "hmac-sha256",
      },
    });

    assert.strictEqual(releaseRes.status, 201, `Release failed: ${JSON.stringify(releaseRes.body)}`);
    assert.ok(releaseRes.body.finalRelease);
    assert.strictEqual(releaseRes.body.finalRelease.meaning ?? releaseRes.body.finalRelease.signatureManifestation.meaning, "release");
    assert.strictEqual(releaseRes.body.reviewOutcome.finalRelease.signatureManifestation.signedBy, "qp-001");
  });
});

// ─── 3. Two-Person Release Control ─────────────────────────────────

test("Two-Person Release Control", async (t) => {
  // Helper: build a case through to approved review
  async function buildApprovedCase() {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);
    const caseId = rec.caseId;
    const packetId = await advanceThroughReview(app, caseId);

    // Construct design (needed for handoff)
    await request(app).post(`/api/cases/${caseId}/construct-design`).send({
      rankedCandidates: [{
        candidateId: "neo-1", rank: 1, compositeScore: 0.95,
        featureWeights: { binding: 0.5, expression: 0.5 },
        featureScores: { binding: 0.9, expression: 1.0 },
        uncertaintyContribution: 0.05,
        explanation: "Top candidate by composite score.",
      }],
    });

    const reviewRes = await request(app).post(`/api/cases/${caseId}/review-outcomes`).send({
      packetId,
      reviewerId: "dr-reviewer-alpha",
      reviewerRole: "molecular-pathologist",
      reviewDisposition: "approved",
      rationale: "Board approval consensus.",
    });
    assert.strictEqual(reviewRes.status, 201, `Review failed: ${JSON.stringify(reviewRes.body)}`);
    const reviewId = reviewRes.body.reviewOutcome.reviewId;

    return { app, caseId, reviewId };
  }

  await t.test("rejects handoff when requestedBy === reviewerId (same person)", async () => {
    const { app, caseId, reviewId } = await buildApprovedCase();

    const releaseRes = await request(app).post(`/api/cases/${caseId}/final-releases`).send({
      reviewId,
      releaserId: "dr-reviewer-alpha",
      releaserRole: "quality-person",
      rationale: "Attempted self-release.",
    });

    assert.strictEqual(releaseRes.status, 403);
    assert.strictEqual(releaseRes.body.code, "dual_authorization_required");
  });

  await t.test("rejects handoff before final release authorization", async () => {
    const { app, caseId, reviewId } = await buildApprovedCase();

    const res = await request(app).post(`/api/cases/${caseId}/handoff-packets`).send({
      reviewId,
      handoffTarget: "manufacturing-site-A",
      requestedBy: "qa-manager-beta",
      turnaroundDays: 14,
    });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, "final_release_required");
  });

  await t.test("allows handoff after independent final release authorization", async () => {
    const { app, caseId, reviewId } = await buildApprovedCase();

    const releaseRes = await request(app).post(`/api/cases/${caseId}/final-releases`).send({
      reviewId,
      releaserId: "qa-manager-beta",
      releaserRole: "quality-person",
      rationale: "Independent final release.",
    });
    assert.strictEqual(releaseRes.status, 201, `Release failed: ${JSON.stringify(releaseRes.body)}`);

    const res = await request(app).post(`/api/cases/${caseId}/handoff-packets`).send({
      reviewId,
      handoffTarget: "manufacturing-site-A",
      requestedBy: "qa-manager-beta",
      turnaroundDays: 14,
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.handoff);
  });
});
