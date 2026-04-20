import test from "node:test";
import assert from "node:assert/strict";
import { MemoryCaseStore } from "../src/store.js";
import { replayCaseEvents } from "../src/queries/CaseProjection.js";
import { buildFullTraceability } from "../src/traceability.js";
import type {
  AdministrationRecord,
  AuditContext,
  ClinicalFollowUpRecord,
  ConstructDesignPackage,
  HlaConsensusRecord,
  ImmuneMonitoringRecord,
  QcGateRecord,
  RankingResult,
  RunArtifact,
  WorkflowRunRecord,
} from "../src/types.js";

function buildAuditContext(correlationId: string): AuditContext {
  return {
    correlationId,
    actorId: "user:event-journal",
    authMechanism: "jwt-bearer",
  };
}

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-event-journal-001",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  };
}

function buildSample(sampleType: string, assayType: string) {
  return {
    sampleId: `${sampleType.toLowerCase()}-event-journal`,
    sampleType,
    assayType,
    accessionId: `acc-${sampleType.toLowerCase()}-event-journal`,
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
    artifactHash: `sha256:${sample.sampleId}-source`,
    storageUri: `artifact://${sample.sampleId}-source`,
    mediaType: "application/gzip",
  };
}

function buildRanking(caseId: string): RankingResult {
  return {
    caseId,
    rankedCandidates: [
      {
        candidateId: "neo-alpha",
        rank: 1,
        compositeScore: 0.91,
        featureWeights: {
          bindingAffinity: 0.3,
          expression: 0.25,
          clonality: 0.2,
          manufacturability: 0.15,
          tolerance: 0.1,
        },
        featureScores: {
          bindingAffinity: 0.95,
          expression: 0.89,
          clonality: 0.88,
          manufacturability: 0.84,
          tolerance: 0.8,
        },
        uncertaintyContribution: 0.04,
        explanation: "Top candidate with strong composite profile.",
      },
      {
        candidateId: "neo-beta",
        rank: 2,
        compositeScore: 0.77,
        featureWeights: {
          bindingAffinity: 0.3,
          expression: 0.25,
          clonality: 0.2,
          manufacturability: 0.15,
          tolerance: 0.1,
        },
        featureScores: {
          bindingAffinity: 0.78,
          expression: 0.73,
          clonality: 0.76,
          manufacturability: 0.79,
          tolerance: 0.82,
        },
        uncertaintyContribution: 0.07,
        explanation: "Second candidate with balanced manufacturability.",
      },
    ],
    ensembleMethod: "weighted-sum",
    confidenceInterval: { lower: 0.71, upper: 0.96 },
    rankedAt: "2026-04-02T09:30:00.000Z",
  };
}

function buildConstruct(caseId: string): ConstructDesignPackage {
  return {
    constructId: "ctor-event-journal-001",
    caseId,
    version: 1,
    deliveryModality: "conventional-mrna",
    sequence: "AUGGCCGCCGAAUAA",
    designRationale: "Top ranked epitopes assembled into a tandem minigene construct.",
    candidateIds: ["neo-alpha", "neo-beta"],
    codonOptimization: {
      algorithm: "LinearDesign",
      gcContentPercent: 53.1,
      caiScore: 0.87,
    },
    manufacturabilityChecks: [
      {
        checkName: "sequence_length",
        pass: true,
        detail: "Sequence length is within manufacturing bounds.",
        severity: "info",
      },
    ],
    designedAt: "2026-04-02T09:45:00.000Z",
  };
}

function buildAdministration(caseId: string): AdministrationRecord {
  return {
    administrationId: "administration-event-journal-001",
    caseId,
    constructId: "ctor-event-journal-001",
    constructVersion: 1,
    administeredAt: "2026-04-02T10:00:00.000Z",
    route: "intramuscular",
    doseMicrograms: 100,
    batchId: "batch-event-journal-001",
  };
}

function buildImmuneMonitoring(caseId: string): ImmuneMonitoringRecord {
  return {
    monitoringId: "immune-event-journal-001",
    caseId,
    constructId: "ctor-event-journal-001",
    constructVersion: 1,
    collectedAt: "2026-04-02T10:30:00.000Z",
    assayType: "ELISpot",
    biomarker: "IFN-gamma spot count",
    value: 140,
    unit: "spots/1e6 PBMC",
    baselineDelta: 120,
  };
}

function buildClinicalFollowUp(caseId: string): ClinicalFollowUpRecord {
  return {
    followUpId: "follow-up-event-journal-001",
    caseId,
    constructId: "ctor-event-journal-001",
    constructVersion: 1,
    evaluatedAt: "2026-04-02T11:00:00.000Z",
    responseCategory: "PR",
    progressionFreeDays: 180,
  };
}

function buildHlaConsensus(caseId: string): HlaConsensusRecord {
  return {
    caseId,
    alleles: ["HLA-A*02:01", "HLA-B*07:02"],
    perToolEvidence: [
      {
        toolName: "arcasHLA",
        alleles: ["HLA-A*02:01", "HLA-B*07:02"],
        confidence: 0.94,
      },
    ],
    confidenceScore: 0.93,
    referenceVersion: "IPD-IMGT/HLA-3.57.0",
    producedAt: "2026-04-02T12:35:00.000Z",
    disagreements: [],
  };
}

function buildQcGate(runId: string): QcGateRecord {
  return {
    runId,
    outcome: "PASSED",
    evaluatedAt: "2026-04-02T12:40:00.000Z",
    results: [
      {
        metric: "tumor_normal_pairing",
        metricCategory: "tumor_normal_pairing",
        value: 1,
        threshold: 1,
        pass: true,
        notes: "Tumor/normal pairing confirmed.",
      },
    ],
  };
}

async function createRequestedCase(store: MemoryCaseStore, auditContext: AuditContext) {
  const created = await store.createCase(buildCaseInput(), auditContext);
  const caseId = created.caseId;
  const samples = [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];

  for (const sample of samples) {
    await store.registerSample(caseId, sample, auditContext);
    await store.registerArtifact(caseId, buildSourceArtifact(sample), auditContext);
  }

  const requested = await store.requestWorkflow(
    caseId,
    {
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
    },
    auditContext,
  );

  const requestId = requested.workflowRequests[0]?.requestId;
  assert.ok(requestId, "workflow request should exist before run start");

  return { caseId, requestId };
}

function buildStartedRun(caseId: string, requestId: string, runId: string): WorkflowRunRecord {
  return {
    runId,
    caseId,
    requestId,
    status: "RUNNING",
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
    acceptedAt: "2026-04-02T12:00:00.000Z",
    startedAt: "2026-04-02T12:01:00.000Z",
  };
}

function buildCompletedRun(startedRun: WorkflowRunRecord): WorkflowRunRecord {
  return {
    ...startedRun,
    status: "COMPLETED",
    completedAt: "2026-04-02T12:30:00.000Z",
    terminalMetadata: {
      durationMs: 1740000,
      executorVersion: "1.0.0-test",
    },
  };
}

test("event journal appends sequential events and replays intake-to-request state", async () => {
  const store = new MemoryCaseStore();
  const auditContext = buildAuditContext("corr-event-journal-intake");

  const created = await store.createCase(buildCaseInput(), auditContext);
  const caseId = created.caseId;

  const samples = [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];

  for (const sample of samples) {
    await store.registerSample(caseId, sample, auditContext);
  }

  for (const sample of samples) {
    await store.registerArtifact(caseId, buildSourceArtifact(sample), auditContext);
  }

  await store.requestWorkflow(
    caseId,
    {
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
      requestedBy: "operator@example.org",
    },
    auditContext,
  );

  const live = await store.getCase(caseId);
  const events = await store.listCaseEvents(caseId);
  const replayed = replayCaseEvents(events);

  assert.deepEqual(
    events.map((event) => [event.version, event.type]),
    [
      [1, "case.created"],
      [2, "sample.registered"],
      [3, "sample.registered"],
      [4, "sample.registered"],
      [5, "artifact.registered"],
      [6, "artifact.registered"],
      [7, "artifact.registered"],
      [8, "workflow.requested"],
    ],
  );
  assert.equal(events[0]?.actorId, "user:event-journal");
  assert.equal(events[0]?.authMechanism, "jwt-bearer");
  assert.deepEqual(replayed, live);
});

test("event journal replays workflow runs and derived artifacts exactly", async () => {
  const store = new MemoryCaseStore();
  const auditContext = buildAuditContext("corr-event-journal-workflow");

  const created = await store.createCase(buildCaseInput(), auditContext);
  const caseId = created.caseId;
  const samples = [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];

  for (const sample of samples) {
    await store.registerSample(caseId, sample, auditContext);
    await store.registerArtifact(caseId, buildSourceArtifact(sample), auditContext);
  }

  const requested = await store.requestWorkflow(
    caseId,
    {
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
    },
    auditContext,
  );

  const requestId = requested.workflowRequests[0]?.requestId;
  assert.ok(requestId, "workflow request should exist before run start");

  const startedRun: WorkflowRunRecord = {
    runId: "run-event-journal-001",
    caseId,
    requestId,
    status: "RUNNING",
    workflowName: "somatic-dna-rna-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "local-dev",
    acceptedAt: "2026-04-02T12:00:00.000Z",
    startedAt: "2026-04-02T12:01:00.000Z",
  };

  await store.startWorkflowRun(caseId, startedRun, auditContext);

  const completedRun: WorkflowRunRecord = {
    ...startedRun,
    status: "COMPLETED",
    completedAt: "2026-04-02T12:30:00.000Z",
    terminalMetadata: {
      durationMs: 1740000,
      executorVersion: "1.0.0-test",
    },
  };

  const derivedArtifacts: RunArtifact[] = [
    {
      artifactId: "derived-event-journal-001",
      runId: startedRun.runId,
      artifactClass: "DERIVED",
      semanticType: "somatic-vcf",
      artifactHash: "sha256:derived-event-journal-001",
      producingStep: "mutect2",
      registeredAt: completedRun.completedAt!,
    },
  ];

  await store.completeWorkflowRun(caseId, completedRun, derivedArtifacts, auditContext);

  const live = await store.getCase(caseId);
  const events = await store.listCaseEvents(caseId);
  const replayed = replayCaseEvents(events);

  assert.deepEqual(replayed.workflowRuns, live.workflowRuns);
  assert.deepEqual(replayed.derivedArtifacts, live.derivedArtifacts);
  assert.deepEqual(replayed, live);
});

test("event journal replay can rebuild full traceability", async () => {
  const store = new MemoryCaseStore();
  const auditContext = buildAuditContext("corr-event-journal-traceability");
  const created = await store.createCase(buildCaseInput(), auditContext);
  const caseId = created.caseId;

  await store.recordNeoantigenRanking(caseId, buildRanking(caseId), auditContext);
  await store.recordConstructDesign(caseId, buildConstruct(caseId), auditContext);
  await store.recordAdministration(caseId, buildAdministration(caseId), auditContext);
  await store.recordImmuneMonitoring(caseId, buildImmuneMonitoring(caseId), auditContext);
  await store.recordClinicalFollowUp(caseId, buildClinicalFollowUp(caseId), auditContext);

  const events = await store.listCaseEvents(caseId);
  const replayed = replayCaseEvents(events);
  const replayedTraceability = buildFullTraceability(replayed, replayed.outcomeTimeline);
  const liveTraceability = await store.getFullTraceability(caseId);

  assert.deepEqual(replayedTraceability, liveTraceability);
});

test("event journal replays cancelled and failed workflow runs exactly", async () => {
  const store = new MemoryCaseStore();
  const auditContext = buildAuditContext("corr-event-journal-terminal-runs");

  const cancelledCase = await createRequestedCase(store, auditContext);
  const cancelledStartedRun = buildStartedRun(cancelledCase.caseId, cancelledCase.requestId, "run-event-journal-cancelled");
  await store.startWorkflowRun(cancelledCase.caseId, cancelledStartedRun, auditContext);
  await store.cancelWorkflowRun(
    cancelledCase.caseId,
    {
      ...cancelledStartedRun,
      status: "CANCELLED",
      completedAt: "2026-04-02T12:10:00.000Z",
    },
    auditContext,
  );

  const cancelledLive = await store.getCase(cancelledCase.caseId);
  const cancelledEvents = await store.listCaseEvents(cancelledCase.caseId);
  const cancelledReplayed = replayCaseEvents(cancelledEvents);

  assert.strictEqual(cancelledEvents.at(-1)?.type, "workflow.cancelled");
  assert.deepEqual(cancelledReplayed, cancelledLive);

  const failedCase = await createRequestedCase(store, auditContext);
  const failedStartedRun = buildStartedRun(failedCase.caseId, failedCase.requestId, "run-event-journal-failed");
  await store.startWorkflowRun(failedCase.caseId, failedStartedRun, auditContext);
  await store.failWorkflowRun(
    failedCase.caseId,
    {
      ...failedStartedRun,
      status: "FAILED",
      completedAt: "2026-04-02T12:12:00.000Z",
      failureReason: "Executor crashed",
      failureCategory: "executor_error",
    },
    auditContext,
  );

  const failedLive = await store.getCase(failedCase.caseId);
  const failedEvents = await store.listCaseEvents(failedCase.caseId);
  const failedReplayed = replayCaseEvents(failedEvents);

  assert.strictEqual(failedEvents.at(-1)?.type, "workflow.failed");
  assert.deepEqual(failedReplayed, failedLive);
});

test("event journal replays board review and handoff state exactly", async () => {
  const store = new MemoryCaseStore();
  const auditContext = buildAuditContext("corr-event-journal-review-handoff");
  const { caseId, requestId } = await createRequestedCase(store, auditContext);
  const startedRun = buildStartedRun(caseId, requestId, "run-event-journal-review");
  const completedRun = buildCompletedRun(startedRun);
  const derivedArtifacts: RunArtifact[] = [
    {
      artifactId: "derived-event-journal-review-001",
      runId: startedRun.runId,
      artifactClass: "DERIVED",
      semanticType: "somatic-vcf",
      artifactHash: "sha256:derived-event-journal-review-001",
      producingStep: "mutect2",
      registeredAt: completedRun.completedAt!,
    },
  ];

  await store.startWorkflowRun(caseId, startedRun, auditContext);
  await store.completeWorkflowRun(caseId, completedRun, derivedArtifacts, auditContext);
  await store.recordHlaConsensus(caseId, buildHlaConsensus(caseId), auditContext);
  await store.recordQcGate(caseId, startedRun.runId, buildQcGate(startedRun.runId), auditContext);
  await store.recordConstructDesign(caseId, buildConstruct(caseId), auditContext);

  const boardPacketResult = await store.generateBoardPacket(caseId, auditContext);
  const reviewOutcomeResult = await store.recordReviewOutcome(
    caseId,
    {
      packetId: boardPacketResult.packet.packetId,
      reviewerId: "board-chair",
      reviewerRole: "chair",
      reviewDisposition: "approved",
      rationale: "Evidence bundle is sufficient for manufacturing handoff.",
      comments: "Proceed to GMP handoff.",
    },
    auditContext,
  );
  await store.generateHandoffPacket(
    caseId,
    {
      reviewId: reviewOutcomeResult.reviewOutcome.reviewId,
      handoffTarget: "gmp-site-alpha",
      requestedBy: "oncology-board",
      turnaroundDays: 14,
      notes: "Release after QA packet review.",
    },
    auditContext,
  );

  const live = await store.getCase(caseId);
  const events = await store.listCaseEvents(caseId);
  const replayed = replayCaseEvents(events);

  assert.deepEqual(events.slice(-3).map((event) => event.type), [
    "board.packet.generated",
    "review.outcome.recorded",
    "handoff.packet.generated",
  ]);
  assert.deepEqual(replayed.boardPackets, live.boardPackets);
  assert.deepEqual(replayed.reviewOutcomes, live.reviewOutcomes);
  assert.deepEqual(replayed.handoffPackets, live.handoffPackets);
  assert.deepEqual(replayed, live);
});