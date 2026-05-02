import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { MemoryCaseStore } from "../src/store";
import { InMemoryConsentTracker } from "../src/adapters/InMemoryConsentTracker";
import type {
  CaseRecord,
  WorkflowRunRecord,
  RunArtifact,
  HlaConsensusRecord,
  QcGateRecord,
} from "../src/types";

function buildCaseInput(consentStatus: "complete" | "missing" = "complete") {
  return {
    caseProfile: {
      patientKey: `pt-${consentStatus}`,
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus,
      boardRoute: "solid-tumor-board",
    },
  };
}

const sampleSet = [
  {
    sampleId: "sample-tumor-dna",
    sampleType: "TUMOR_DNA",
    assayType: "WES",
    accessionId: "acc-1",
    sourceSite: "site-001",
  },
  {
    sampleId: "sample-normal-dna",
    sampleType: "NORMAL_DNA",
    assayType: "WES",
    accessionId: "acc-2",
    sourceSite: "site-001",
  },
  {
    sampleId: "sample-tumor-rna",
    sampleType: "TUMOR_RNA",
    assayType: "RNA_SEQ",
    accessionId: "acc-3",
    sourceSite: "site-001",
  },
] as const;

const artifactSet = [
  {
    sampleId: "sample-tumor-dna",
    semanticType: "tumor-dna-fastq",
    schemaVersion: 1,
    artifactHash: "sha256:artifact-1",
  },
  {
    sampleId: "sample-normal-dna",
    semanticType: "normal-dna-fastq",
    schemaVersion: 1,
    artifactHash: "sha256:artifact-2",
  },
  {
    sampleId: "sample-tumor-rna",
    semanticType: "tumor-rna-fastq",
    schemaVersion: 1,
    artifactHash: "sha256:artifact-3",
  },
] as const;

async function registerReadyInputs(
  app: ReturnType<typeof createApp>,
  caseId: string,
): Promise<void> {
  for (const sample of sampleSet) {
    const response = await request(app)
      .post(`/api/cases/${caseId}/samples`)
      .send(sample);
    assert.notStrictEqual(response.status, 403);
  }

  for (const artifact of artifactSet) {
    const response = await request(app)
      .post(`/api/cases/${caseId}/artifacts`)
      .send(artifact);
    assert.notStrictEqual(response.status, 403);
  }
}

async function seedRevisionRequestedCase(): Promise<{
  app: ReturnType<typeof createApp>;
  caseId: string;
}> {
  const store = new MemoryCaseStore();
  const consentTracker = new InMemoryConsentTracker();
  const correlationId = "corr-revision";
  const created = await store.createCase(
    buildCaseInput("complete"),
    correlationId,
  );
  const caseId = created.caseId;

  for (const sample of sampleSet) {
    await store.registerSample(caseId, sample, correlationId);
  }

  for (const artifact of artifactSet) {
    await store.registerArtifact(caseId, artifact, correlationId);
  }

  await store.requestWorkflow(
    caseId,
    {
      workflowName: "somatic-variant-calling",
      referenceBundleId: "GRCh38-2026a-seeded",
      executionProfile: "default",
      idempotencyKey: "seed-request",
    },
    correlationId,
  );

  const requested = await store.getCase(caseId);
  const requestId = requested.workflowRequests[0]?.requestId;
  assert.ok(requestId);

  const startedAt = new Date().toISOString();
  const startedRun: WorkflowRunRecord = {
    runId: "run-revision-001",
    caseId,
    requestId,
    status: "RUNNING",
    workflowName: "somatic-variant-calling",
    referenceBundleId: "GRCh38-2026a-seeded",
    executionProfile: "default",
    startedAt,
  };
  await store.startWorkflowRun(caseId, startedRun, correlationId);

  const completedAt = new Date().toISOString();
  const derivedArtifacts: RunArtifact[] = [
    {
      artifactId: "art-revision-001",
      runId: startedRun.runId,
      artifactClass: "DERIVED",
      semanticType: "somatic-vcf",
      artifactHash: "sha256:derived-1",
      producingStep: "variant-calling",
      registeredAt: completedAt,
    },
  ];
  await store.completeWorkflowRun(
    caseId,
    {
      ...startedRun,
      status: "COMPLETED",
      completedAt,
    },
    derivedArtifacts,
    correlationId,
  );

  const hlaConsensus: HlaConsensusRecord = {
    caseId,
    alleles: ["HLA-A*01:01", "HLA-B*08:01"],
    perToolEvidence: [
      {
        toolName: "optitype",
        alleles: ["HLA-A*01:01", "HLA-B*08:01"],
        confidence: 0.99,
      },
    ],
    confidenceScore: 0.99,
    operatorReviewThreshold: 0,
    unresolvedDisagreementCount: 0,
    manualReviewRequired: false,
    referenceVersion: "IPD-IMGT/HLA 3.55.0",
    producedAt: completedAt,
  };
  await store.recordHlaConsensus(caseId, hlaConsensus, correlationId);

  const qcGate: QcGateRecord = {
    runId: startedRun.runId,
    outcome: "PASSED",
    results: [
      {
        metric: "callable_region_coverage",
        value: 120,
        threshold: 80,
        pass: true,
      },
    ],
    evaluatedAt: completedAt,
  };
  await store.recordQcGate(caseId, startedRun.runId, qcGate, correlationId);

  const packet = await store.generateBoardPacket(caseId, correlationId);
  await store.recordReviewOutcome(
    caseId,
    {
      packetId: packet.packet.packetId,
      reviewerId: "reviewer-1",
      reviewDisposition: "revision-requested",
      rationale: "Additional variant review required.",
    },
    correlationId,
  );

  await consentTracker.recordConsent(caseId, {
    type: "granted",
    timestamp: new Date().toISOString(),
    scope: "genomic-analysis",
    version: "1.0",
  });

  const app = createApp({ store, consentTracker, rbacAllowAll: true });
  return { app, caseId };
}

test("Lifecycle controls", async (t) => {
  await t.test("POST /consent synchronizes case readiness", async () => {
    const consentTracker = new InMemoryConsentTracker();
    const app = createApp({
      consentTracker,
      consentGateEnabled: false,
      rbacAllowAll: true,
    });

    const createResponse = await request(app)
      .post("/api/cases")
      .send(buildCaseInput("missing"));
    assert.strictEqual(createResponse.status, 201);
    const caseRecord = createResponse.body.case as CaseRecord;

    await registerReadyInputs(app, caseRecord.caseId);

    const beforeGrant = await request(app).get(
      `/api/cases/${caseRecord.caseId}`,
    );
    assert.strictEqual(beforeGrant.status, 200);
    assert.strictEqual(beforeGrant.body.case.status, "AWAITING_CONSENT");

    const grantResponse = await request(app)
      .post(`/api/cases/${caseRecord.caseId}/consent`)
      .send({ type: "granted", scope: "genomic-analysis", version: "1.0" });
    assert.strictEqual(grantResponse.status, 201);
    assert.strictEqual(grantResponse.body.case.status, "READY_FOR_WORKFLOW");
    assert.strictEqual(
      grantResponse.body.case.caseProfile.consentStatus,
      "complete",
    );

    const withdrawResponse = await request(app)
      .post(`/api/cases/${caseRecord.caseId}/consent`)
      .send({ type: "withdrawn", scope: "genomic-analysis", version: "1.0" });
    assert.strictEqual(withdrawResponse.status, 201);
    // Consent withdrawal transitions the case to the absorbing protective CONSENT_WITHDRAWN state.
    assert.strictEqual(withdrawResponse.body.case.status, "CONSENT_WITHDRAWN");
    assert.strictEqual(
      withdrawResponse.body.case.caseProfile.consentStatus,
      "withdrawn",
    );
  });

  await t.test(
    "POST /restart-from-revision returns the case to READY_FOR_WORKFLOW",
    async () => {
      const { app, caseId } = await seedRevisionRequestedCase();

      const beforeRestart = await request(app).get(`/api/cases/${caseId}`);
      assert.strictEqual(beforeRestart.status, 200);
      assert.strictEqual(beforeRestart.body.case.status, "REVISION_REQUESTED");

      const restartResponse = await request(app)
        .post(`/api/cases/${caseId}/restart-from-revision`)
        .send({});
      assert.strictEqual(restartResponse.status, 200);
      assert.strictEqual(
        restartResponse.body.case.status,
        "READY_FOR_WORKFLOW",
      );

      const bundleResponse = await request(app)
        .post("/api/reference-bundles")
        .send({
          bundleId: "GRCh38-2026a-seeded",
          genomeAssembly: "GRCh38",
          annotationVersion: "GENCODE v45",
          knownSitesVersion: "dbSNP 157",
          hlaDatabaseVersion: "IMGT/HLA 3.56.0",
          frozenAt: "2026-03-01T00:00:00.000Z",
        });
      assert.strictEqual(bundleResponse.status, 201);

      const workflowResponse = await request(app)
        .post(`/api/cases/${caseId}/workflows`)
        .send({
          workflowName: "somatic-variant-calling",
          referenceBundleId: "GRCh38-2026a-seeded",
          executionProfile: "default",
          idempotencyKey: "restart-request-1",
        });
      assert.strictEqual(workflowResponse.status, 200);
      assert.strictEqual(workflowResponse.body.case.workflowRequests.length, 2);
    },
  );

  await t.test(
    "POST /restart-from-revision rejects when consent is not active",
    async () => {
      const { app, caseId } = await seedRevisionRequestedCase();

      const withdraw = await request(app)
        .post(`/api/cases/${caseId}/consent`)
        .send({ type: "withdrawn", scope: "genomic-analysis", version: "1.0" });
      assert.strictEqual(withdraw.status, 201);

      const restartResponse = await request(app)
        .post(`/api/cases/${caseId}/restart-from-revision`)
        .send({});
      assert.strictEqual(restartResponse.status, 403);
      assert.strictEqual(restartResponse.body.code, "consent_required");
    },
  );

  await t.test(
    "GET /readyz returns 503 when readinessCheck fails",
    async () => {
      const app = createApp({
        readinessCheck: async () => {
          throw new Error("database unavailable");
        },
        rbacAllowAll: true,
      });

      const response = await request(app).get("/readyz");
      assert.strictEqual(response.status, 503);
      assert.strictEqual(response.body.status, "not_ready");
      assert.match(String(response.body.error), /database unavailable/i);
    },
  );
});
