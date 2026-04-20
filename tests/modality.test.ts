import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { ApiError } from "../src/errors.js";
import { InMemoryModalityRegistry } from "../src/adapters/InMemoryModalityRegistry.js";
import { createApp } from "../src/app.js";
import { MemoryCaseStore } from "../src/store.js";
import type { IModalityRegistry } from "../src/ports/IModalityRegistry.js";
import type { RankingRationale } from "../src/types.js";
import type { IWorkflowRunner, WorkflowRunRequest } from "../src/ports/IWorkflowRunner.js";
import type { WorkflowRunRecord } from "../src/types.js";

function buildCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    caseProfile: {
      patientKey: "pt-modality-001",
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
    sampleId: `${sampleType.toLowerCase()}-modality-001`,
    sampleType,
    assayType,
    accessionId: `acc-${sampleType.toLowerCase()}-modality-001`,
    sourceSite: "site-001",
  };
}

function buildSourceArtifact(sample: { sampleId: string; sampleType: string }) {
  const semanticTypeBySampleType: Record<string, string> = {
    TUMOR_DNA: "tumor-dna-fastq",
    NORMAL_DNA: "normal-dna-fastq",
    TUMOR_RNA: "tumor-rna-fastq",
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

  async completeRun(runId: string): Promise<WorkflowRunRecord> {
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

  const runId = `run-modality-${Date.now()}`;
  const startResponse = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/start`)
    .send({ runId });
  assert.equal(startResponse.status, 200);

  const completeResponse = await request(app)
    .post(`/api/cases/${caseId}/runs/${runId}/complete`)
    .send({
      derivedArtifacts: [
        { semanticType: "somatic-vcf", artifactHash: "sha256:derived-modality", producingStep: "variant-calling" },
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
      results: [{ metric: "tumor_purity", value: 0.65, threshold: 0.2, pass: true, notes: "Clean" }],
    });
  assert.equal(qcResponse.status, 200);

  return caseId;
}

describe("Wave 11.A — Horizon modality registry", () => {
  it("tracks default availability and maturity for supported modalities", async () => {
    const registry = new InMemoryModalityRegistry();
    const conventional = await registry.getModality("conventional-mrna");
    const sarna = await registry.getModality("saRNA");
    const circrna = await registry.getModality("circRNA");

    assert.equal(conventional.maturityLevel, "validated");
    assert.equal(conventional.isEnabled, true);
    assert.equal(sarna.maturityLevel, "preclinical");
    assert.equal(sarna.isEnabled, false);
    assert.equal(circrna.maturityLevel, "research");
    assert.equal(circrna.isEnabled, false);
  });

  it("activates a non-default modality with an explicit reason", async () => {
    const registry = new InMemoryModalityRegistry();
    const activated = await registry.activateModality("saRNA", "Investigational protocol approval");

    assert.equal(activated.isEnabled, true);
    assert.equal(activated.activationReason, "Investigational protocol approval");
    assert.ok(activated.activatedAt, "activatedAt should be recorded");
  });

  it("IModalityRegistry exposes lookup, activation, listing, and gate assertion", () => {
    const registry: IModalityRegistry = new InMemoryModalityRegistry();
    assert.equal(typeof registry.getModality, "function");
    assert.equal(typeof registry.listModalities, "function");
    assert.equal(typeof registry.activateModality, "function");
    assert.equal(typeof registry.assertModalityAvailable, "function");
  });

  it("blocks horizon modalities by default and allows conventional mRNA", async () => {
    const registry = new InMemoryModalityRegistry();

    await registry.assertModalityAvailable("conventional-mrna");
    await assert.rejects(
      () => registry.assertModalityAvailable("circRNA"),
      (error: unknown) => error instanceof ApiError && error.code === "modality_not_enabled",
    );
  });
});

describe("Wave 14 — Modality governance HTTP", () => {
  it("GET /api/modalities returns the current modality catalog", async () => {
    const app = createApp();

    const response = await request(app).get("/api/modalities");
    const byModality = new Map<string, { modality: string; isEnabled: boolean }>(
      response.body.modalities?.map((item: { modality: string; isEnabled: boolean }) => [item.modality, item]),
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.modalities.length, 3);
    assert.equal(byModality.get("conventional-mrna")?.isEnabled, true);
    assert.equal(byModality.get("saRNA")?.isEnabled, false);
    assert.equal(byModality.get("circRNA")?.isEnabled, false);
  });

  it("GET /api/modalities/:modality returns a single modality", async () => {
    const app = createApp();

    const response = await request(app).get("/api/modalities/saRNA");

    assert.equal(response.status, 200);
    assert.equal(response.body.modality.modality, "saRNA");
    assert.equal(response.body.modality.maturityLevel, "preclinical");
  });

  it("GET /api/modalities/:modality returns 404 for an unknown modality", async () => {
    const app = createApp();

    const response = await request(app).get("/api/modalities/unknown-modality");

    assert.equal(response.status, 404);
    assert.equal(response.body.code, "modality_not_found");
  });

  it("POST /api/modalities/:modality/activate enables a horizon modality with evidence", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/modalities/saRNA/activate")
      .send({ activationReason: "Investigational protocol approval" });

    assert.equal(response.status, 200);
    assert.equal(response.body.modality.modality, "saRNA");
    assert.equal(response.body.modality.isEnabled, true);
    assert.equal(response.body.modality.activationReason, "Investigational protocol approval");
    assert.ok(response.body.modality.activatedAt);
  });

  it("POST /api/modalities/:modality/activate validates activation evidence", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/modalities/saRNA/activate")
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_input");
  });

  it("POST /api/modalities/:modality/activate is idempotent for already-enabled modalities", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/modalities/conventional-mrna/activate")
      .send({ activationReason: "Validated standard of care" });

    assert.equal(response.status, 200);
    assert.equal(response.body.modality.modality, "conventional-mrna");
    assert.equal(response.body.modality.isEnabled, true);
  });

  it("GET /api/modalities reflects activation state changes", async () => {
    const app = createApp();

    await request(app)
      .post("/api/modalities/saRNA/activate")
      .send({ activationReason: "Investigational protocol approval" });

    const response = await request(app).get("/api/modalities");
    const sarna = response.body.modalities.find((item: { modality: string }) => item.modality === "saRNA");

    assert.equal(response.status, 200);
    assert.ok(sarna);
    assert.equal(sarna.isEnabled, true);
  });

  it("activated modalities are honored by construct design over HTTP", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store, workflowRunner: new FakeWorkflowRunner(), rbacAllowAll: true, consentGateEnabled: false });
    const caseId = await createReviewReadyCase(app);

    const activateResponse = await request(app)
      .post("/api/modalities/saRNA/activate")
      .send({ activationReason: "Wave 14 HTTP enablement" });
    assert.equal(activateResponse.status, 200);

    const constructResponse = await request(app)
      .post(`/api/cases/${caseId}/construct-design`)
      .send({ rankedCandidates: buildRankedCandidates(), deliveryModality: "saRNA" });

    assert.equal(constructResponse.status, 201);
    assert.equal(constructResponse.body.constructDesign.deliveryModality, "saRNA");
  });

  it("activation responses echo the correlation id", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/modalities/saRNA/activate")
      .set("x-correlation-id", "corr-wave14-activation")
      .send({ activationReason: "Correlation audit" });

    assert.equal(response.status, 200);
    assert.equal(response.headers["x-correlation-id"], "corr-wave14-activation");
  });
});