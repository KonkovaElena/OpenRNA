import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
 *    handoff release requestor must differ from the review signer.
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

function buildWebAuthnSignature(challengeId: string, printedName: string, meaning: string) {
  const assertionPrefix = createHmac("sha256", "openrna-audit-hmac-default-key")
    .update(`webauthn:${challengeId}`)
    .digest("hex")
    .slice(0, 16);

  return {
    printedName,
    meaning,
    stepUpAuth: {
      method: "webauthn" as const,
      challengeId,
      webAuthnAssertion: `webauthn:${challengeId}:${assertionPrefix}`,
    },
  };
}

function buildInvalidWebAuthnSignature(challengeId: string, printedName: string, meaning: string) {
  return {
    printedName,
    meaning,
    stepUpAuth: {
      method: "webauthn" as const,
      challengeId,
      webAuthnAssertion: `webauthn:${challengeId}:invalid-signature`,
    },
  };
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
  await t.test("review outcome accepts and persists step-up signature evidence", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);
    const packetId = await advanceThroughReview(app, rec.caseId);

    const reviewRes = await request(app).post(`/api/cases/${rec.caseId}/review-outcomes`).send({
      packetId,
      reviewerId: "dr-reviewer-001",
      reviewerRole: "molecular-pathologist",
      reviewDisposition: "approved",
      rationale: "All QC metrics within specification.",
      signature: buildWebAuthnSignature(
        "challenge-compliance-review-signature",
        "Dr. Reviewer",
        "Board approval for final QA release",
      ),
    });

    assert.strictEqual(reviewRes.status, 201, `Review failed: ${JSON.stringify(reviewRes.body)}`);
    assert.ok(reviewRes.body.reviewOutcome.signature);
    assert.strictEqual(reviewRes.body.reviewOutcome.signature.signedBy, "dr-reviewer-001");
    assert.strictEqual(reviewRes.body.reviewOutcome.signature.stepUpMethod, "webauthn");
  });

  await t.test("review outcome rejects approved disposition without signature evidence", async () => {
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

    assert.strictEqual(reviewRes.status, 400);
    assert.strictEqual(reviewRes.body.code, "signature_required");
  });

  await t.test("review outcome rejects malformed step-up signature evidence", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);
    const packetId = await advanceThroughReview(app, rec.caseId);

    const reviewRes = await request(app).post(`/api/cases/${rec.caseId}/review-outcomes`).send({
      packetId,
      reviewerId: "dr-reviewer-002",
      reviewerRole: "molecular-pathologist",
      reviewDisposition: "approved",
      rationale: "Attempt with malformed signature evidence.",
      signature: buildInvalidWebAuthnSignature(
        "challenge-compliance-review-invalid",
        "Dr. Reviewer Invalid",
        "Board approval for final QA release",
      ),
    });

    assert.strictEqual(reviewRes.status, 403);
    assert.strictEqual(reviewRes.body.code, "step_up_auth_required");
  });

  await t.test("qa release rejects malformed step-up signature evidence", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({ consentTracker, rbacAllowAll: true });

    const rec = await createReadyCase(app);
    const packetId = await advanceThroughReview(app, rec.caseId);

    const reviewRes = await request(app).post(`/api/cases/${rec.caseId}/review-outcomes`).send({
      packetId,
      reviewerId: "dr-reviewer-003",
      reviewerRole: "molecular-pathologist",
      reviewDisposition: "approved",
      rationale: "Valid board approval before QA malformed-path test.",
      signature: buildWebAuthnSignature(
        "challenge-compliance-review-valid-before-qa-invalid",
        "Dr. Reviewer Valid",
        "Board approval for final QA release",
      ),
    });
    assert.strictEqual(reviewRes.status, 201, `Review failed: ${JSON.stringify(reviewRes.body)}`);

    const reviewId = reviewRes.body.reviewOutcome.reviewId;
    const qaReleaseRes = await request(app).post(`/api/cases/${rec.caseId}/qa-releases`).send({
      reviewId,
      qaReviewerId: "qa-reviewer-invalid",
      qaReviewerRole: "quality-assurance",
      rationale: "Attempt QA release with malformed signature evidence.",
      signature: buildInvalidWebAuthnSignature(
        "challenge-compliance-qa-invalid",
        "QA Reviewer Invalid",
        "Final QA release authorization",
      ),
    });

    assert.strictEqual(qaReleaseRes.status, 403);
    assert.strictEqual(qaReleaseRes.body.code, "step_up_auth_required");
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
      signature: buildWebAuthnSignature(
        "challenge-compliance-review-approved",
        "Dr. Reviewer Alpha",
        "Board approval for final QA release",
      ),
    });
    assert.strictEqual(reviewRes.status, 201, `Review failed: ${JSON.stringify(reviewRes.body)}`);
    const reviewId = reviewRes.body.reviewOutcome.reviewId;

    const qaReleaseRes = await request(app).post(`/api/cases/${caseId}/qa-releases`).send({
      reviewId,
      qaReviewerId: "qa-reviewer-beta",
      qaReviewerRole: "quality-assurance",
      rationale: "Independent QA release for manufacturing handoff.",
      signature: buildWebAuthnSignature(
        "challenge-compliance-qa-release",
        "QA Reviewer Beta",
        "Final QA release authorization",
      ),
    });
    assert.strictEqual(qaReleaseRes.status, 201, `QA release failed: ${JSON.stringify(qaReleaseRes.body)}`);
    const qaReleaseId = qaReleaseRes.body.qaRelease.qaReleaseId;

    return { app, caseId, reviewId, qaReleaseId };
  }

  await t.test("rejects handoff when requestedBy === reviewerId (same person)", async () => {
    const { app, caseId, reviewId, qaReleaseId } = await buildApprovedCase();

    const res = await request(app).post(`/api/cases/${caseId}/handoff-packets`).send({
      reviewId,
      qaReleaseId,
      handoffTarget: "manufacturing-site-A",
      requestedBy: "dr-reviewer-alpha", // same as reviewer — must be rejected
      turnaroundDays: 14,
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, "dual_authorization_required");
  });

  await t.test("allows handoff when requestedBy is independent (different person)", async () => {
    const { app, caseId, reviewId, qaReleaseId } = await buildApprovedCase();

    const res = await request(app).post(`/api/cases/${caseId}/handoff-packets`).send({
      reviewId,
      qaReleaseId,
      handoffTarget: "manufacturing-site-A",
      requestedBy: "qa-manager-beta", // different person
      turnaroundDays: 14,
    });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.handoff);
  });
});
