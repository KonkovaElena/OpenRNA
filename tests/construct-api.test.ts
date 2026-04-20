import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { newDb } from "pg-mem";
import { InMemoryConstructDesigner } from "../src/adapters/InMemoryConstructDesigner.js";
import { InMemoryModalityRegistry } from "../src/adapters/InMemoryModalityRegistry.js";
import { createApp } from "../src/app.js";
import { MemoryCaseStore } from "../src/store.js";
import { PostgresCaseStore } from "../src/adapters/PostgresCaseStore.js";
import type { DerivedArtifactSemanticType, RankingRationale } from "../src/types.js";
import type { IWorkflowRunner, WorkflowRunRequest } from "../src/ports/IWorkflowRunner.js";
import type { WorkflowRunRecord } from "../src/types.js";

function buildCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    caseProfile: {
      patientKey: "pt-construct-001",
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
    sampleId: `${sampleType.toLowerCase()}-construct-001`,
    sampleType,
    assayType,
    accessionId: `acc-${sampleType.toLowerCase()}-construct-001`,
    sourceSite: "site-001",
  };
}

function buildSourceArtifact(sample: { sampleId: string; sampleType: string }) {
  const semanticTypeBySampleType: Record<string, string> = {
    TUMOR_DNA: "tumor-dna-fastq",
    NORMAL_DNA: "normal-dna-fastq",
    TUMOR_RNA: "tumor-rna-fastq",
    FOLLOW_UP: "follow-up-fastq",
  };

  return {
    sampleId: sample.sampleId,
    semanticType: semanticTypeBySampleType[sample.sampleType] ?? "tumor-dna-fastq",
    schemaVersion: 1,
    artifactHash: `sha256:${sample.sampleId}`,
    storageUri: `artifact://${sample.sampleId}-fastq`,
    mediaType: "application/gzip",
  };
}

function buildRankedCandidates(): RankingRationale[] {
  return [
    {
      candidateId: "neo-alpha",
      rank: 1,
      compositeScore: 0.88,
      featureWeights: {
        bindingAffinity: 0.3,
        expression: 0.25,
        clonality: 0.2,
        manufacturability: 0.15,
        tolerance: 0.1,
      },
      featureScores: {
        bindingAffinity: 0.92,
        expression: 0.85,
        clonality: 0.9,
        manufacturability: 0.8,
        tolerance: 0.75,
      },
      uncertaintyContribution: 0.05,
      explanation: "Top candidate with strong binding and expression.",
    },
    {
      candidateId: "neo-beta",
      rank: 2,
      compositeScore: 0.72,
      featureWeights: {
        bindingAffinity: 0.3,
        expression: 0.25,
        clonality: 0.2,
        manufacturability: 0.15,
        tolerance: 0.1,
      },
      featureScores: {
        bindingAffinity: 0.78,
        expression: 0.7,
        clonality: 0.65,
        manufacturability: 0.75,
        tolerance: 0.8,
      },
      uncertaintyContribution: 0.08,
      explanation: "Second candidate with moderate scores.",
    },
  ];
}

class FakeWorkflowRunner implements IWorkflowRunner {
  private readonly runs = new Map<string, WorkflowRunRecord>();

  async startRun(input: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    const record: WorkflowRunRecord = {
      runId: input.runId,
      caseId: input.caseId,
      requestId: input.requestId,
      status: "RUNNING",
      workflowName: input.workflowName,
      referenceBundleId: input.referenceBundleId,
      executionProfile: input.executionProfile,
      startedAt: new Date().toISOString(),
    };
    this.runs.set(input.runId, record);
    return record;
  }

  async getRun(runId: string): Promise<WorkflowRunRecord> {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }
    return record;
  }

  async listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]> {
    return [...this.runs.values()].filter((run) => run.caseId === caseId);
  }

  async completeRun(
    runId: string,
    _derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>,
  ): Promise<WorkflowRunRecord> {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }
    record.status = "COMPLETED";
    record.completedAt = new Date().toISOString();
    return record;
  }

  async failRun(runId: string, _reason: string): Promise<WorkflowRunRecord> {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }
    record.status = "FAILED";
    record.completedAt = new Date().toISOString();
    return record;
  }

  async cancelRun(runId: string): Promise<WorkflowRunRecord> {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }
    record.status = "CANCELLED";
    record.completedAt = new Date().toISOString();
    return record;
  }
}

async function createReviewReadyCase(app: ReturnType<typeof createApp>): Promise<string> {
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  assert.equal(createResponse.status, 201);
  const caseId = String(createResponse.body.case.caseId);

  const samples = [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];

  for (const sample of samples) {
    const sampleResponse = await request(app).post(`/api/cases/${caseId}/samples`).send(sample);
    assert.equal(sampleResponse.status, 200);
  }

  for (const sample of samples) {
    const artifactResponse = await request(app)
      .post(`/api/cases/${caseId}/artifacts`)
      .send(buildSourceArtifact(sample));
    assert.equal(artifactResponse.status, 200);
  }

  const workflowResponse = await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "neoantigen-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
  });
  assert.equal(workflowResponse.status, 200);

  const runId = `run-construct-${Date.now()}`;
  const startResponse = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/start`)
    .send({ runId });
  assert.equal(startResponse.status, 200);

  const completeResponse = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .send({
      derivedArtifacts: [
        { semanticType: "somatic-vcf", artifactHash: "sha256:derived-construct", producingStep: "variant-calling" },
      ],
    });
  assert.equal(completeResponse.status, 200);

  const hlaResponse = await request(app)
    .post(`/api/cases/${caseId}/hla-consensus`)
    .send({
      alleles: ["HLA-A*02:01", "HLA-B*07:02"],
      perToolEvidence: [
        { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 },
      ],
      confidenceScore: 0.95,
      referenceVersion: "IMGT/HLA 3.55.0",
    });
  assert.equal(hlaResponse.status, 200);

  const qcResponse = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/qc`)
    .send({
      results: [
        { metric: "tumor_purity", value: 0.65, threshold: 0.2, pass: true, notes: "Clean" },
      ],
    });
  assert.equal(qcResponse.status, 200);

  return caseId;
}

test("POST /api/cases/:caseId/construct-design generates and GET retrieves a construct package", async () => {
  const store = new MemoryCaseStore();
  const app = createApp({ store, workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  const createResponse = await request(app)
    .post(`/api/cases/${caseId}/construct-design`)
    .send({ rankedCandidates: buildRankedCandidates() });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.constructDesign.caseId, caseId);
  assert.equal(createResponse.body.constructDesign.deliveryModality, "conventional-mrna");
  assert.deepEqual(createResponse.body.constructDesign.candidateIds, ["neo-alpha", "neo-beta"]);

  const getResponse = await request(app).get(`/api/cases/${caseId}/construct-design`);
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.constructDesign.constructId, createResponse.body.constructDesign.constructId);
  assert.equal(getResponse.body.constructDesign.version, 1);
});

test("POST /api/cases/:caseId/construct-design records payload provenance on the case", async () => {
  const store = new MemoryCaseStore();
  const app = createApp({ store, workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  const createResponse = await request(app)
    .post(`/api/cases/${caseId}/construct-design`)
    .send({ rankedCandidates: buildRankedCandidates() });

  assert.equal(createResponse.status, 201);

  const storedCase = await store.getCase(caseId);
  const latestAudit = storedCase.auditEvents[storedCase.auditEvents.length - 1];
  assert.equal(latestAudit.type, "payload.generated");
  assert.equal(latestAudit.correlationId, String(createResponse.headers["x-correlation-id"]));
  assert.equal(latestAudit.occurredAt, createResponse.body.constructDesign.designedAt);
  assert.match(latestAudit.detail, /construct/i);

  const latestTimeline = storedCase.timeline[storedCase.timeline.length - 1];
  assert.equal(latestTimeline.type, "payload_generated");
  assert.equal(latestTimeline.at, createResponse.body.constructDesign.designedAt);
  assert.match(latestTimeline.detail, /conventional-mrna/i);
});

test("GET /api/cases/:caseId/construct-design returns 404 when no construct was recorded", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  const getResponse = await request(app).get(`/api/cases/${caseId}/construct-design`);
  assert.equal(getResponse.status, 404);
  assert.equal(getResponse.body.code, "not_found");
});

test("POST /api/cases/:caseId/construct-design rejects saRNA by default", async () => {
  const store = new MemoryCaseStore();
  const app = createApp({ store, workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  const createResponse = await request(app)
    .post(`/api/cases/${caseId}/construct-design`)
    .send({ rankedCandidates: buildRankedCandidates(), deliveryModality: "saRNA" });

  assert.equal(createResponse.status, 409);
  assert.equal(createResponse.body.code, "modality_not_enabled");
});

test("board packet snapshot includes construct design when present", async () => {
  const store = new MemoryCaseStore();
  const modalityRegistry = new InMemoryModalityRegistry();
  await modalityRegistry.activateModality("saRNA", "Wave 11 integration test enablement");
  const app = createApp({
    store,
    workflowRunner: new FakeWorkflowRunner(),
    constructDesigner: new InMemoryConstructDesigner(modalityRegistry),
  });
  const caseId = await createReviewReadyCase(app);

  const constructResponse = await request(app)
    .post(`/api/cases/${caseId}/construct-design`)
    .send({
      rankedCandidates: buildRankedCandidates(),
      deliveryModality: "saRNA",
    });
  assert.equal(constructResponse.status, 201);

  const packetResponse = await request(app).post(`/api/cases/${caseId}/board-packets`);
  assert.equal(packetResponse.status, 201);
  const packetId = String(packetResponse.body.packet.packetId);

  const getPacketResponse = await request(app).get(`/api/cases/${caseId}/board-packets/${packetId}`);
  assert.equal(getPacketResponse.status, 200);
  assert.ok(getPacketResponse.body.packet.snapshot.constructDesign, "board packet should include construct design");
  assert.equal(getPacketResponse.body.packet.snapshot.constructDesign.deliveryModality, "saRNA");
  assert.ok(
    getPacketResponse.body.packet.snapshot.constructDesign.designRationale.includes("neo-alpha"),
    "design rationale should preserve candidate provenance",
  );
});

test("Postgres-backed case storage persists construct design across a fresh app instance", async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const migrationSql = readFileSync(join(__dirname, "..", "src", "migrations", "001_full_schema.sql"), "utf8");
  await pool.query(migrationSql.replace(/^BEGIN;/m, "").replace(/^COMMIT;/m, ""));

  try {
    const firstStore = new PostgresCaseStore(pool);
    await firstStore.initialize();
    const firstApp = createApp({ store: firstStore, workflowRunner: new FakeWorkflowRunner() });
    const caseId = await createReviewReadyCase(firstApp);

    const createResponse = await request(firstApp)
      .post(`/api/cases/${caseId}/construct-design`)
      .send({ rankedCandidates: buildRankedCandidates() });
    assert.equal(createResponse.status, 201);

    const secondStore = new PostgresCaseStore(pool);
    await secondStore.initialize();
    const secondApp = createApp({ store: secondStore, workflowRunner: new FakeWorkflowRunner() });

    const getResponse = await request(secondApp).get(`/api/cases/${caseId}/construct-design`);
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.constructDesign.caseId, caseId);
    assert.deepEqual(getResponse.body.constructDesign.candidateIds, ["neo-alpha", "neo-beta"]);
  } finally {
    await pool.end();
  }
});