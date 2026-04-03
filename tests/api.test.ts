import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { newDb } from "pg-mem";
import { MemoryCaseStore } from "../src/store";
import { PostgresCaseStore } from "../src/adapters/PostgresCaseStore";
import { PostgresWorkflowDispatchSink } from "../src/adapters/PostgresWorkflowDispatchSink";

function buildCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    caseProfile: {
      patientKey: "pt-001",
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
    sampleId: `${sampleType.toLowerCase()}-001`,
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
    artifactHash: `sha256:${sampleId}-artifact-001`,
    storageUri: `artifact://${sampleId}-fastq`,
    mediaType: "application/gzip",
    ...overrides,
  };
}

function buildSourceArtifact(sample: { sampleId: string; sampleType: string }) {
  const semanticTypeBySampleType: Record<string, string> = {
    TUMOR_DNA: "tumor-dna-fastq",
    NORMAL_DNA: "normal-dna-fastq",
    TUMOR_RNA: "tumor-rna-fastq",
    FOLLOW_UP: "follow-up-fastq",
  };

  return buildArtifact(sample.sampleId, {
    semanticType: semanticTypeBySampleType[sample.sampleType] ?? "tumor-dna-fastq",
  });
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
    const sampleResponse = await request(app).post(`/api/cases/${caseId}/samples`).send(sample);
    assert.equal(sampleResponse.status, 200);
  }

  let latestCase: unknown;
  for (const sample of samples) {
    const artifactResponse = await request(app)
      .post(`/api/cases/${caseId}/artifacts`)
      .send(buildSourceArtifact(sample));
    assert.equal(artifactResponse.status, 200);
    latestCase = artifactResponse.body.case;
  }

  return latestCase;
}

async function createPostgresDispatchSink() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const sink = new PostgresWorkflowDispatchSink(pool, { tableName: "workflow_dispatches" });
  await sink.initialize();
  return { pool, sink };
}

test("POST /api/cases creates a human oncology case and GET /api/cases lists it", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });

  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.case.status, "INTAKING");
  assert.equal(createResponse.body.case.caseProfile.patientKey, "pt-001");

  const listResponse = await request(app).get("/api/cases");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.meta.totalCases, 1);
  assert.equal(listResponse.body.cases[0].caseId, createResponse.body.case.caseId);
});

test("registering the required sample trio and source artifacts unlocks workflow request and records the run", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  const samples = buildRequiredSampleInputs();
  let latestSampleResponse;
  for (const sample of samples) {
    latestSampleResponse = await request(app).post(`/api/cases/${caseId}/samples`).send(sample);
    assert.equal(latestSampleResponse.status, 200);
  }

  assert.equal(latestSampleResponse?.body.case.status, "INTAKING");

  const blockedWorkflowResponse = await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
    requestedBy: "operator@example.org",
  });
  assert.equal(blockedWorkflowResponse.status, 409);
  assert.equal(blockedWorkflowResponse.body.code, "invalid_transition");

  let latestArtifactResponse;
  for (const sample of samples) {
    latestArtifactResponse = await request(app)
      .post(`/api/cases/${caseId}/artifacts`)
      .send(buildSourceArtifact(sample));
    assert.equal(latestArtifactResponse.status, 200);
  }

  assert.equal(latestArtifactResponse?.body.case.status, "READY_FOR_WORKFLOW");

  const workflowResponse = await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
    requestedBy: "operator@example.org",
  });
  assert.equal(workflowResponse.status, 200);
  assert.equal(workflowResponse.body.case.status, "WORKFLOW_REQUESTED");
  assert.equal(workflowResponse.body.case.workflowRequests.length, 1);

  const summaryResponse = await request(app).get("/api/operations/summary");
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary.statusCounts.WORKFLOW_REQUESTED, 1);
});

test("workflow request is blocked when consent is missing even if samples are present", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app)
    .post("/api/cases")
    .send(buildCaseInput({ consentStatus: "missing" }));
  const caseId = String(createResponse.body.case.caseId);
  assert.equal(createResponse.body.case.status, "AWAITING_CONSENT");

  const samples = buildRequiredSampleInputs();
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
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
  });
  assert.equal(workflowResponse.status, 409);
  assert.equal(workflowResponse.body.code, "invalid_transition");
});

test("repeating a workflow request with the same idempotency key does not create a duplicate run", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  await registerWorkflowReadyInputs(app, caseId);

  const workflowPayload = {
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
    requestedBy: "operator@example.org",
  };

  const firstWorkflowResponse = await request(app)
    .post(`/api/cases/${caseId}/workflows`)
    .set("x-idempotency-key", "workflow-submit-001")
    .send(workflowPayload);
  assert.equal(firstWorkflowResponse.status, 200);
  assert.equal(firstWorkflowResponse.body.case.workflowRequests.length, 1);

  const secondWorkflowResponse = await request(app)
    .post(`/api/cases/${caseId}/workflows`)
    .set("x-idempotency-key", "workflow-submit-001")
    .send(workflowPayload);
  assert.equal(secondWorkflowResponse.status, 200);
  assert.equal(secondWorkflowResponse.body.case.workflowRequests.length, 1);
  assert.equal(
    secondWorkflowResponse.body.case.workflowRequests[0].requestId,
    firstWorkflowResponse.body.case.workflowRequests[0].requestId,
  );
});

test("registering a source artifact adds it to the case catalog and emits a machine-readable audit event", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app)
    .post("/api/cases")
    .set("x-correlation-id", "corr-case-create-001")
    .send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  const sampleResponse = await request(app)
    .post(`/api/cases/${caseId}/samples`)
    .set("x-correlation-id", "corr-sample-register-001")
    .send(buildSample("TUMOR_DNA", "WES"));
  assert.equal(sampleResponse.status, 200);

  const artifactResponse = await request(app)
    .post(`/api/cases/${caseId}/artifacts`)
    .set("x-correlation-id", "corr-artifact-register-001")
    .send(buildArtifact("tumor_dna-001"));
  assert.equal(artifactResponse.status, 200);
  assert.equal(artifactResponse.body.case.artifacts.length, 1);
  assert.equal(artifactResponse.body.case.artifacts[0].sampleId, "tumor_dna-001");
  assert.equal(artifactResponse.body.case.artifacts[0].semanticType, "tumor-dna-fastq");
  assert.equal(artifactResponse.body.case.artifacts[0].artifactClass, "SOURCE");

  const auditEventTypes = artifactResponse.body.case.auditEvents.map((event: { type: string }) => event.type);
  assert.deepEqual(auditEventTypes, ["case.created", "sample.registered", "artifact.registered"]);
  assert.equal(
    artifactResponse.body.case.auditEvents[2].correlationId,
    "corr-artifact-register-001",
  );
});

test("artifact registration is rejected when the referenced sample provenance is missing", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  const artifactResponse = await request(app)
    .post(`/api/cases/${caseId}/artifacts`)
    .send(buildArtifact("missing-sample"));
  assert.equal(artifactResponse.status, 409);
  assert.equal(artifactResponse.body.code, "missing_sample_provenance");
});

test("idempotency key reuse with different payload is rejected as a mismatch", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  await registerWorkflowReadyInputs(app, caseId);

  await request(app)
    .post(`/api/cases/${caseId}/workflows`)
    .set("x-idempotency-key", "workflow-key-dup")
    .send({
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
    });

  const mismatchResponse = await request(app)
    .post(`/api/cases/${caseId}/workflows`)
    .set("x-idempotency-key", "workflow-key-dup")
    .send({
      workflowName: "different-workflow",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
    });

  assert.equal(mismatchResponse.status, 409);
  assert.equal(mismatchResponse.body.code, "idempotency_mismatch");
});

test("workflow request records carry the correlation ID from the HTTP boundary", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  await registerWorkflowReadyInputs(app, caseId);

  const workflowResponse = await request(app)
    .post(`/api/cases/${caseId}/workflows`)
    .set("x-correlation-id", "corr-wf-001")
    .send({
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
    });

  assert.equal(workflowResponse.status, 200);
  assert.equal(
    workflowResponse.body.case.workflowRequests[0].correlationId,
    "corr-wf-001",
  );
});

test("sink failure during workflow dispatch does not corrupt case state and allows retry", async () => {
  let sinkCallCount = 0;
  const failingOnFirstCallSink = {
    async recordWorkflowRequested() {
      sinkCallCount++;
      if (sinkCallCount === 1) {
        throw new Error("Simulated sink failure");
      }
    },
  };

  const { MemoryCaseStore } = await import("../src/store.js");
  const store = new MemoryCaseStore(undefined, failingOnFirstCallSink);
  const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });

  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  await registerWorkflowReadyInputs(app, caseId);

  const failedResponse = await request(app)
    .post(`/api/cases/${caseId}/workflows`)
    .set("x-idempotency-key", "retry-key-001")
    .send({
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
    });
  assert.equal(failedResponse.status, 500);

  const caseAfterFailure = await request(app).get(`/api/cases/${caseId}`);
  assert.equal(caseAfterFailure.body.case.status, "READY_FOR_WORKFLOW");
  assert.equal(caseAfterFailure.body.case.workflowRequests.length, 0);

  const retryResponse = await request(app)
    .post(`/api/cases/${caseId}/workflows`)
    .set("x-idempotency-key", "retry-key-001")
    .send({
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
    });
  assert.equal(retryResponse.status, 200);
  assert.equal(retryResponse.body.case.status, "WORKFLOW_REQUESTED");
  assert.equal(retryResponse.body.case.workflowRequests.length, 1);
});

test("workflow request persists a durable dispatch record when using the Postgres-backed sink", async () => {
  const { pool, sink } = await createPostgresDispatchSink();
  try {
    const store = new MemoryCaseStore(undefined, sink);
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });

    const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
    const caseId = String(createResponse.body.case.caseId);

    await registerWorkflowReadyInputs(app, caseId);

    const workflowResponse = await request(app)
      .post(`/api/cases/${caseId}/workflows`)
      .set("x-idempotency-key", "pg-dispatch-001")
      .set("x-correlation-id", "corr-pg-dispatch-001")
      .send({
        workflowName: "somatic-dna-rna-v1",
        referenceBundleId: "GRCh38-2026a",
        executionProfile: "local-dev",
        requestedBy: "operator@example.org",
      });

    assert.equal(workflowResponse.status, 200);

    const dispatches = await sink.listDispatches();
    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0].caseId, caseId);
    assert.equal(dispatches[0].idempotencyKey, "pg-dispatch-001");
    assert.equal(dispatches[0].correlationId, "corr-pg-dispatch-001");
    assert.equal(dispatches[0].status, "PENDING");
  } finally {
    await pool.end();
  }
});

test("Postgres-backed case storage persists workflow-ready case state across a fresh app instance", async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  // Create normalized schema
  const migrationSql = readFileSync(
    join(__dirname, "..", "src", "migrations", "001_full_schema.sql"),
    "utf8",
  );
  await pool.query(migrationSql.replace(/^BEGIN;/m, "").replace(/^COMMIT;/m, ""));

  try {
    const firstStore = new PostgresCaseStore(pool);
    await firstStore.initialize();
    const firstApp = createApp({ store: firstStore , rbacAllowAll: true, consentGateEnabled: false });

    const createResponse = await request(firstApp).post("/api/cases").send(buildCaseInput());
    const caseId = String(createResponse.body.case.caseId);

    await registerWorkflowReadyInputs(firstApp, caseId);

    const workflowResponse = await request(firstApp)
      .post(`/api/cases/${caseId}/workflows`)
      .set("x-idempotency-key", "pg-case-store-001")
      .send({
        workflowName: "somatic-dna-rna-v1",
        referenceBundleId: "GRCh38-2026a",
        executionProfile: "local-dev",
        requestedBy: "operator@example.org",
      });

    assert.equal(workflowResponse.status, 200);
    assert.equal(workflowResponse.body.case.status, "WORKFLOW_REQUESTED");

    const secondStore = new PostgresCaseStore(pool);
    await secondStore.initialize();
    const secondApp = createApp({ store: secondStore , rbacAllowAll: true, consentGateEnabled: false });

    const persistedCaseResponse = await request(secondApp).get(`/api/cases/${caseId}`);
    assert.equal(persistedCaseResponse.status, 200);
    assert.equal(persistedCaseResponse.body.case.status, "WORKFLOW_REQUESTED");
    assert.equal(persistedCaseResponse.body.case.workflowRequests.length, 1);
    assert.equal(persistedCaseResponse.body.case.samples.length, 3);
    assert.equal(persistedCaseResponse.body.case.artifacts.length, 3);

    const summaryResponse = await request(secondApp).get("/api/operations/summary");
    assert.equal(summaryResponse.status, 200);
    assert.equal(summaryResponse.body.summary.totalCases, 1);
    assert.equal(summaryResponse.body.summary.statusCounts.WORKFLOW_REQUESTED, 1);
  } finally {
    await pool.end();
  }
});

test("returned case records are immutable snapshots that do not affect stored state", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const createResponse = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createResponse.body.case.caseId);

  await request(app)
    .post(`/api/cases/${caseId}/samples`)
    .send(buildSample("TUMOR_DNA", "WES"));

  const firstGet = await request(app).get(`/api/cases/${caseId}`);
  assert.equal(firstGet.body.case.samples.length, 1);

  // Mutate the returned object вЂ” should not affect stored state
  firstGet.body.case.samples.push({ sampleId: "injected", sampleType: "FOLLOW_UP" });

  const secondGet = await request(app).get(`/api/cases/${caseId}`);
  assert.equal(secondGet.body.case.samples.length, 1, "Stored case must not be affected by client-side mutation of a returned snapshot");
});

test("invalid requests return the documented operator-facing error contract", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });
  const response = await request(app).post("/api/cases").send({
    caseProfile: {
      patientKey: "",
      indication: "melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
    },
  });

  assert.equal(response.status, 400);
  assert.equal(typeof response.body.code, "string");
  assert.equal(typeof response.body.message, "string");
  assert.equal(typeof response.body.nextStep, "string");
  assert.equal(typeof response.body.correlationId, "string");
});