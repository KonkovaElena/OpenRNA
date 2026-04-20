import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { InMemoryReferenceBundleRegistry } from "../src/adapters/InMemoryReferenceBundleRegistry";

// ─── Helpers ────────────────────────────────────────────────────────

function buildCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    caseProfile: {
      patientKey: "pt-phase2",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
      ...overrides,
    },
  };
}

function buildSample(sampleType: string, assayType: string) {
  return {
    sampleId: `${sampleType.toLowerCase()}-phase2`,
    sampleType,
    assayType,
    accessionId: `acc-${sampleType.toLowerCase()}`,
    sourceSite: "site-001",
  };
}

function buildArtifact(sampleId: string, overrides: Record<string, unknown> = {}) {
  return {
    sampleId,
    semanticType: "tumor-dna-fastq",
    schemaVersion: 1,
    artifactHash: `sha256:${sampleId}-artifact-phase2`,
    storageUri: `artifact://${sampleId}-fastq`,
    mediaType: "application/gzip",
    ...overrides,
  };
}

function buildRequiredSampleInputs() {
  return [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];
}

async function registerWorkflowReadyInputs(app: ReturnType<typeof createApp>, caseId: string) {
  const samples = buildRequiredSampleInputs();

  for (const sample of samples) {
    const sampleRes = await request(app).post(`/api/cases/${caseId}/samples`).send(sample);
    assert.equal(sampleRes.status, 200);
  }

  for (const sample of samples) {
    const artifactRes = await request(app)
      .post(`/api/cases/${caseId}/artifacts`)
      .send(buildArtifact(sample.sampleId));
    assert.equal(artifactRes.status, 200);
  }
}

/** Bring a case all the way from INTAKING to WORKFLOW_REQUESTED. */
async function createCaseAtWorkflowRequested(app: ReturnType<typeof createApp>) {
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  await registerWorkflowReadyInputs(app, caseId);

  await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
    requestedBy: "operator@example.org",
  });

  return caseId;
}

/** Advance to WORKFLOW_RUNNING and return caseId + runId. */
async function createCaseWithRunningWorkflow(app: ReturnType<typeof createApp>) {
  const caseId = await createCaseAtWorkflowRequested(app);
  const runId = "run-001";

  const startRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/start`)
    .send({});
  assert.equal(startRes.status, 200);
  return { caseId, runId };
}

/** Advance to WORKFLOW_COMPLETED and return caseId + runId. */
async function createCaseWithCompletedWorkflow(app: ReturnType<typeof createApp>) {
  const { caseId, runId } = await createCaseWithRunningWorkflow(app);

  const completeRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .send({
      derivedArtifacts: [
        { semanticType: "somatic-vcf", artifactHash: "sha256:abc123", producingStep: "mutect2" },
      ],
    });
  assert.equal(completeRes.status, 200);
  return { caseId, runId };
}

/** Advance to a review-ready case with HLA consensus and QC evidence. */
async function createReviewReadyCase(app: ReturnType<typeof createApp>, caseOverrides: Record<string, unknown> = {}) {
  const createRes = await request(app).post("/api/cases").send(buildCaseInput(caseOverrides));
  const caseId = String(createRes.body.case.caseId);

  await registerWorkflowReadyInputs(app, caseId);

  await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
    requestedBy: "operator@example.org",
  });

  const runId = "review-run-001";
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/start`).send({});
  await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .send({
      derivedArtifacts: [
        { semanticType: "somatic-vcf", artifactHash: "sha256:review-vcf", producingStep: "mutect2" },
      ],
    });

  await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["HLA-A*02:01", "HLA-B*07:02"],
    perToolEvidence: [
      { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.98 },
    ],
    confidenceScore: 0.98,
    referenceVersion: "IMGT/HLA 3.55.0",
  });

  await request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`).send({
    results: [{ metric: "tumor_purity", value: 0.55, threshold: 0.20, pass: true }],
  });

  return { caseId, runId };
}

// ─── Workflow Run Lifecycle ─────────────────────────────────────────

test("starting a workflow run advances the case from WORKFLOW_REQUESTED to WORKFLOW_RUNNING", async () => {
  const app = createApp();
  const caseId = await createCaseAtWorkflowRequested(app);

  const startRes = await request(app)
    .post(`/api/cases/${caseId}/runs/run-001/start`)
    .send({});

  assert.equal(startRes.status, 200);
  assert.equal(startRes.body.case.status, "WORKFLOW_RUNNING");
  assert.equal(startRes.body.case.workflowRuns.length, 1);
  assert.equal(startRes.body.case.workflowRuns[0].runId, "run-001");
  assert.equal(startRes.body.case.workflowRuns[0].status, "RUNNING");
});

test("completing a workflow run produces WORKFLOW_COMPLETED status and records derived artifacts", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithRunningWorkflow(app);

  const completeRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .send({
      derivedArtifacts: [
        { semanticType: "somatic-vcf", artifactHash: "sha256:vcf001", producingStep: "mutect2" },
        { semanticType: "filtered-maf", artifactHash: "sha256:maf001", producingStep: "oncotator" },
      ],
    });

  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.case.status, "WORKFLOW_COMPLETED");
  assert.equal(completeRes.body.case.derivedArtifacts.length, 2);
  assert.equal(completeRes.body.case.derivedArtifacts[0].semanticType, "somatic-vcf");
  assert.equal(completeRes.body.case.derivedArtifacts[0].artifactClass, "DERIVED");
  assert.ok(completeRes.body.case.derivedArtifacts[0].artifactId, "artifactId should be generated");
  assert.ok(completeRes.body.case.derivedArtifacts[0].registeredAt, "registeredAt should be set");
});

test("failing a workflow run produces WORKFLOW_FAILED status and records the reason", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithRunningWorkflow(app);

  const failRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/fail`)
    .send({ reason: "OutOfMemoryError in alignment step" });

  assert.equal(failRes.status, 200);
  assert.equal(failRes.body.case.status, "WORKFLOW_FAILED");
  const failedRun = failRes.body.case.workflowRuns.find(
    (r: { runId: string }) => r.runId === runId,
  );
  assert.equal(failedRun.status, "FAILED");
  assert.equal(failedRun.failureReason, "OutOfMemoryError in alignment step");
});

test("listing and getting workflow runs returns the correct data", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithRunningWorkflow(app);

  const listRes = await request(app).get(`/api/cases/${caseId}/runs`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.runs.length, 1);
  assert.equal(listRes.body.meta.totalRuns, 1);

  const getRes = await request(app).get(`/api/cases/${caseId}/runs/${runId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.run.runId, runId);
  assert.equal(getRes.body.run.status, "RUNNING");
});

test("starting a run on a case that is not WORKFLOW_REQUESTED returns 409", async () => {
  const app = createApp();
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  const startRes = await request(app)
    .post(`/api/cases/${caseId}/runs/run-001/start`)
    .send({});

  assert.equal(startRes.status, 409);
  assert.equal(startRes.body.code, "invalid_transition");
});

test("completing a run that is not RUNNING returns 409", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithCompletedWorkflow(app);

  const completeAgain = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .send({ derivedArtifacts: [] });

  assert.equal(completeAgain.status, 409);
  assert.equal(completeAgain.body.code, "invalid_transition");
});

test("failing a run that does not exist returns 404", async () => {
  const app = createApp();
  const caseId = await createCaseAtWorkflowRequested(app);

  // Start a run first
  await request(app).post(`/api/cases/${caseId}/runs/run-001/start`).send({});

  const failRes = await request(app)
    .post(`/api/cases/${caseId}/runs/nonexistent/fail`)
    .send({ reason: "doesn't matter" });

  assert.equal(failRes.status, 404);
  assert.equal(failRes.body.code, "run_not_found");
});

// ─── HLA Consensus ─────────────────────────────────────────────────

test("recording HLA consensus stores the allele calls and tool evidence on the case", async () => {
  const app = createApp();
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  const consensusRes = await request(app)
    .post(`/api/cases/${caseId}/hla-consensus`)
    .send({
      alleles: ["HLA-A*02:01", "HLA-A*03:01", "HLA-B*07:02", "HLA-B*44:02"],
      perToolEvidence: [
        {
          toolName: "OptiType",
          alleles: ["HLA-A*02:01", "HLA-A*03:01", "HLA-B*07:02", "HLA-B*44:02"],
          confidence: 0.97,
        },
        {
          toolName: "HLA-LA",
          alleles: ["HLA-A*02:01", "HLA-A*03:01", "HLA-B*07:02", "HLA-B*44:02"],
          confidence: 0.95,
        },
      ],
      confidenceScore: 0.96,
      referenceVersion: "IMGT/HLA 3.55.0",
    });

  assert.equal(consensusRes.status, 200);
  assert.equal(consensusRes.body.case.hlaConsensus.alleles.length, 4);
  assert.equal(consensusRes.body.case.hlaConsensus.confidenceScore, 0.96);
  assert.equal(consensusRes.body.case.hlaConsensus.perToolEvidence.length, 2);
  assert.ok(consensusRes.body.case.hlaConsensus.producedAt);

  // Audit trail
  const auditTypes = consensusRes.body.case.auditEvents.map((e: { type: string }) => e.type);
  assert.ok(auditTypes.includes("hla.consensus.produced"));
});

test("retrieving HLA consensus for an existing case returns the stored record", async () => {
  const app = createApp();
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["HLA-A*02:01"],
    perToolEvidence: [{ toolName: "OptiType", alleles: ["HLA-A*02:01"], confidence: 0.99 }],
    confidenceScore: 0.99,
    referenceVersion: "IMGT/HLA 3.55.0",
  });

  const getRes = await request(app).get(`/api/cases/${caseId}/hla-consensus`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.consensus.alleles[0], "HLA-A*02:01");
});

test("retrieving HLA consensus when none recorded returns 404", async () => {
  const app = createApp();
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  const getRes = await request(app).get(`/api/cases/${caseId}/hla-consensus`);
  assert.equal(getRes.status, 404);
  assert.equal(getRes.body.code, "not_found");
});

test("HLA consensus with invalid input returns 400", async () => {
  const app = createApp();
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  const badRes = await request(app)
    .post(`/api/cases/${caseId}/hla-consensus`)
    .send({ alleles: [] });

  assert.equal(badRes.status, 400);
  assert.equal(badRes.body.code, "invalid_input");
});

// ─── QC Gate ────────────────────────────────────────────────────────

test("evaluating QC on a completed run records the gate and transitions case to QC_PASSED", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithCompletedWorkflow(app);

  const qcRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/qc`)
    .send({
      results: [
        { metric: "contamination_fraction", value: 0.002, threshold: 0.05, pass: true },
        { metric: "mean_coverage", value: 85.3, threshold: 30.0, pass: true },
        { metric: "tumor_purity", value: 0.62, threshold: 0.20, pass: true },
      ],
    });

  assert.equal(qcRes.status, 200);
  assert.equal(qcRes.body.case.status, "QC_PASSED");
  assert.equal(qcRes.body.case.qcGates.length, 1);
  assert.equal(qcRes.body.case.qcGates[0].outcome, "PASSED");
  assert.equal(qcRes.body.case.qcGates[0].results.length, 3);

  const auditTypes = qcRes.body.case.auditEvents.map((e: { type: string }) => e.type);
  assert.ok(auditTypes.includes("qc.evaluated"));
});

test("evaluating QC with any failing metric transitions case to QC_FAILED", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithCompletedWorkflow(app);

  const qcRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/qc`)
    .send({
      results: [
        { metric: "contamination_fraction", value: 0.12, threshold: 0.05, pass: false, notes: "Exceeds threshold" },
        { metric: "mean_coverage", value: 85.3, threshold: 30.0, pass: true },
      ],
    });

  assert.equal(qcRes.status, 200);
  assert.equal(qcRes.body.case.status, "QC_FAILED");
  assert.equal(qcRes.body.case.qcGates[0].outcome, "FAILED");
});

test("retrieving QC gate for a specific run returns the recorded result", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithCompletedWorkflow(app);

  await request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`).send({
    results: [{ metric: "coverage", value: 100, threshold: 30, pass: true }],
  });

  const getRes = await request(app).get(`/api/cases/${caseId}/runs/${runId}/qc`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.gate.runId, runId);
  assert.equal(getRes.body.gate.outcome, "PASSED");
});

test("QC gate on a non-completed run returns 409", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithRunningWorkflow(app);

  const qcRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/qc`)
    .send({
      results: [{ metric: "coverage", value: 100, threshold: 30, pass: true }],
    });

  assert.equal(qcRes.status, 409);
  assert.equal(qcRes.body.code, "invalid_transition");
});

test("QC gate with no results returns 400", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithCompletedWorkflow(app);

  const qcRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/qc`)
    .send({ results: [] });

  assert.equal(qcRes.status, 400);
  assert.equal(qcRes.body.code, "invalid_input");
});

// ─── Reference Bundle Registry ──────────────────────────────────────

test("listing reference bundles returns the default pre-loaded catalog", async () => {
  const app = createApp();

  const listRes = await request(app).get("/api/reference-bundles");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.bundles.length, 2);
  assert.equal(listRes.body.meta.totalBundles, 2);

  const ids = listRes.body.bundles.map((b: { bundleId: string }) => b.bundleId);
  assert.ok(ids.includes("GRCh38-2026a"));
  assert.ok(ids.includes("GRCh37-legacy"));
});

test("getting a specific reference bundle returns its manifest", async () => {
  const app = createApp();

  const getRes = await request(app).get("/api/reference-bundles/GRCh38-2026a");
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.bundle.genomeAssembly, "GRCh38");
  assert.equal(getRes.body.bundle.annotationVersion, "GENCODE v44");
});

test("getting a non-existent reference bundle returns 404", async () => {
  const app = createApp();

  const getRes = await request(app).get("/api/reference-bundles/nonexistent");
  assert.equal(getRes.status, 404);
  assert.equal(getRes.body.code, "not_found");
});

test("requesting a workflow with an unknown reference bundle returns 404 and leaves the case unchanged", async () => {
  const app = createApp();
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  await registerWorkflowReadyInputs(app, caseId);

  const workflowRes = await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "unknown-bundle",
    executionProfile: "local-dev",
    requestedBy: "operator@example.org",
  });

  assert.equal(workflowRes.status, 404);
  assert.equal(workflowRes.body.code, "reference_bundle_not_found");

  const caseRes = await request(app).get(`/api/cases/${caseId}`);
  assert.equal(caseRes.status, 200);
  assert.equal(caseRes.body.case.status, "READY_FOR_WORKFLOW");
  assert.equal(caseRes.body.case.workflowRequests.length, 0);
});

test("starting a workflow run pins the requested reference bundle to the run", async () => {
  const referenceBundleRegistry = new InMemoryReferenceBundleRegistry();
  const app = createApp({ referenceBundleRegistry });
  const caseId = await createCaseAtWorkflowRequested(app);
  const runId = "run-pin-001";

  const startRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/start`)
    .send({});

  assert.equal(startRes.status, 200);
  assert.equal(referenceBundleRegistry.getPinnedBundle(runId), "GRCh38-2026a");
});

// ─── End-to-End Lineage ─────────────────────────────────────────────

test("full workflow lifecycle: request → start → complete → QC PASS traces full audit lineage", async () => {
  const app = createApp();

  // 1. Create case, register samples, request workflow
  const caseId = await createCaseAtWorkflowRequested(app);

  // 2. Start workflow run
  const runId = "lineage-run-001";
  const startRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/start`)
    .set("x-correlation-id", "corr-start-001")
    .send({});
  assert.equal(startRes.body.case.status, "WORKFLOW_RUNNING");

  // 3. Complete workflow run with derived artifacts
  const completeRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .set("x-correlation-id", "corr-complete-001")
    .send({
      derivedArtifacts: [
        { semanticType: "somatic-vcf", artifactHash: "sha256:lineage-vcf", producingStep: "mutect2" },
        { semanticType: "hla-calls", artifactHash: "sha256:lineage-hla", producingStep: "optitype" },
      ],
    });
  assert.equal(completeRes.body.case.status, "WORKFLOW_COMPLETED");
  assert.equal(completeRes.body.case.derivedArtifacts.length, 2);

  // 4. Evaluate QC gate
  const qcRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/qc`)
    .set("x-correlation-id", "corr-qc-001")
    .send({
      results: [
        { metric: "contamination_fraction", value: 0.001, threshold: 0.05, pass: true },
        { metric: "mean_coverage", value: 92.1, threshold: 30.0, pass: true },
      ],
    });
  assert.equal(qcRes.body.case.status, "QC_PASSED");

  // 5. Verify full audit trail
  const finalCase = await request(app).get(`/api/cases/${caseId}`);
  const auditTypes = finalCase.body.case.auditEvents.map((e: { type: string }) => e.type);

  assert.ok(auditTypes.includes("case.created"));
  assert.ok(auditTypes.includes("sample.registered"));
  assert.ok(auditTypes.includes("workflow.requested"));
  assert.ok(auditTypes.includes("workflow.started"));
  assert.ok(auditTypes.includes("workflow.completed"));
  assert.ok(auditTypes.includes("artifact.derived"));
  assert.ok(auditTypes.includes("qc.evaluated"));

  // Timeline should capture each transition
  assert.ok(finalCase.body.case.timeline.length >= 7, "Timeline should have at least 7 entries");
});

test("HLA consensus + QC in full workflow produces complete provenance chain", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithCompletedWorkflow(app);

  // Record HLA consensus
  await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["HLA-A*02:01", "HLA-B*07:02"],
    perToolEvidence: [
      { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.98 },
    ],
    confidenceScore: 0.98,
    referenceVersion: "IMGT/HLA 3.55.0",
  });

  // Evaluate QC
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`).send({
    results: [{ metric: "tumor_purity", value: 0.55, threshold: 0.20, pass: true }],
  });

  // Verify everything is on the case
  const finalCase = await request(app).get(`/api/cases/${caseId}`);
  assert.ok(finalCase.body.case.hlaConsensus);
  assert.equal(finalCase.body.case.hlaConsensus.alleles.length, 2);
  assert.equal(finalCase.body.case.qcGates.length, 1);
  assert.equal(finalCase.body.case.status, "QC_PASSED");
  assert.equal(finalCase.body.case.derivedArtifacts.length, 1);

  // Verify audit events include HLA and QC
  const auditTypes = finalCase.body.case.auditEvents.map((e: { type: string }) => e.type);
  assert.ok(auditTypes.includes("hla.consensus.produced"));
  assert.ok(auditTypes.includes("qc.evaluated"));
});

// ─── Board Packet Generation ───────────────────────────────────────

test("generating a board packet creates a versioned review packet from current case evidence", async () => {
  const app = createApp();
  const { caseId } = await createReviewReadyCase(app);

  const packetRes = await request(app)
    .post(`/api/cases/${caseId}/board-packets`)
    .set("x-correlation-id", "corr-board-packet-001")
    .send({});

  assert.equal(packetRes.status, 201);
  assert.equal(packetRes.body.packet.caseId, caseId);
  assert.equal(packetRes.body.packet.artifactClass, "BOARD_PACKET");
  assert.equal(packetRes.body.packet.boardRoute, "solid-tumor-board");
  assert.match(packetRes.body.packet.packetHash, /^sha256:/);
  assert.equal(packetRes.body.packet.snapshot.hlaConsensus.alleles.length, 2);
  assert.equal(packetRes.body.packet.snapshot.latestQcGate.outcome, "PASSED");
  assert.equal(packetRes.body.packet.snapshot.derivedArtifacts.length, 1);
  assert.equal(packetRes.body.case.boardPackets.length, 1);

  const auditTypes = packetRes.body.case.auditEvents.map((e: { type: string }) => e.type);
  assert.ok(auditTypes.includes("board.packet.generated"));
  assert.equal(packetRes.body.case.auditEvents.at(-1)?.correlationId, "corr-board-packet-001");
});

test("generating the same board packet twice without case changes reuses the existing packet", async () => {
  const app = createApp();
  const { caseId } = await createReviewReadyCase(app);

  const firstRes = await request(app).post(`/api/cases/${caseId}/board-packets`).send({});
  const secondRes = await request(app).post(`/api/cases/${caseId}/board-packets`).send({});

  assert.equal(firstRes.status, 201);
  assert.equal(secondRes.status, 200);
  assert.equal(secondRes.body.packet.packetId, firstRes.body.packet.packetId);
  assert.equal(secondRes.body.packet.packetHash, firstRes.body.packet.packetHash);
  assert.equal(secondRes.body.case.boardPackets.length, 1);
});

test("board packet generation is blocked until review evidence is complete", async () => {
  const app = createApp();
  const { caseId } = await createCaseWithCompletedWorkflow(app);

  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`).send({});

  assert.equal(packetRes.status, 409);
  assert.equal(packetRes.body.code, "board_packet_not_ready");

  const caseRes = await request(app).get(`/api/cases/${caseId}`);
  assert.equal(caseRes.body.case.boardPackets.length, 0);
});

test("board packet generation requires a configured multidisciplinary review route", async () => {
  const app = createApp();
  const { caseId } = await createReviewReadyCase(app, { boardRoute: undefined });

  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`).send({});

  assert.equal(packetRes.status, 409);
  assert.equal(packetRes.body.code, "review_route_not_configured");
});

test("listing and fetching board packets returns the stored review packet", async () => {
  const app = createApp();
  const { caseId } = await createReviewReadyCase(app);

  const createPacketRes = await request(app).post(`/api/cases/${caseId}/board-packets`).send({});
  const packetId = String(createPacketRes.body.packet.packetId);

  const listRes = await request(app).get(`/api/cases/${caseId}/board-packets`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.meta.totalPackets, 1);
  assert.equal(listRes.body.packets[0].packetId, packetId);

  const getRes = await request(app).get(`/api/cases/${caseId}/board-packets/${packetId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.packet.packetId, packetId);
  assert.equal(getRes.body.packet.snapshot.caseSummary.caseId, caseId);
});

// ─── Error Paths ────────────────────────────────────────────────────

test("workflow operations on a non-existent case return 404", async () => {
  const app = createApp();

  const startRes = await request(app)
    .post("/api/cases/nonexistent/runs/run-001/start")
    .send({});
  assert.equal(startRes.status, 404);

  const listRes = await request(app).get("/api/cases/nonexistent/runs");
  assert.equal(listRes.status, 404);
});

test("fail workflow run input validation rejects missing reason", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithRunningWorkflow(app);

  const failRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/fail`)
    .send({});

  assert.equal(failRes.status, 400);
  assert.equal(failRes.body.code, "invalid_input");
});

test("complete workflow run with empty body still succeeds (no derived artifacts)", async () => {
  const app = createApp();
  const { caseId, runId } = await createCaseWithRunningWorkflow(app);

  const completeRes = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .send({});

  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.case.status, "WORKFLOW_COMPLETED");
  assert.equal(completeRes.body.case.derivedArtifacts.length, 0);
});

test("root endpoint lists all Phase 2 API routes", async () => {
  const app = createApp();
  const rootRes = await request(app).get("/");
  assert.equal(rootRes.status, 200);

  const api: string[] = rootRes.body.api;
  assert.ok(api.includes("POST /api/cases/:caseId/runs/:runId/start"));
  assert.ok(api.includes("POST /api/cases/:caseId/runs/:runId/complete"));
  assert.ok(api.includes("POST /api/cases/:caseId/runs/:runId/fail"));
  assert.ok(api.includes("GET /api/cases/:caseId/runs"));
  assert.ok(api.includes("GET /api/cases/:caseId/runs/:runId"));
  assert.ok(api.includes("POST /api/cases/:caseId/hla-consensus"));
  assert.ok(api.includes("GET /api/cases/:caseId/hla-consensus"));
  assert.ok(api.includes("POST /api/cases/:caseId/runs/:runId/qc"));
  assert.ok(api.includes("GET /api/cases/:caseId/runs/:runId/qc"));
  assert.ok(api.includes("POST /api/cases/:caseId/board-packets"));
  assert.ok(api.includes("GET /api/cases/:caseId/board-packets"));
  assert.ok(api.includes("GET /api/cases/:caseId/board-packets/:packetId"));
  assert.ok(api.includes("GET /api/reference-bundles"));
  assert.ok(api.includes("GET /api/reference-bundles/:bundleId"));
});
