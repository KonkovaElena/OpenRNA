import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newDb } from "pg-mem";
import request from "supertest";
import { InMemoryOutcomeRegistry } from "../src/adapters/InMemoryOutcomeRegistry.js";
import { PostgresCaseStore } from "../src/adapters/PostgresCaseStore.js";
import type { IOutcomeRegistry } from "../src/ports/IOutcomeRegistry.js";
import { createApp } from "../src/app.js";
import { MemoryCaseStore, type CaseStore } from "../src/store.js";
import { buildFullTraceability } from "../src/traceability.js";
import type {
  AdministrationRecord,
  ClinicalFollowUpRecord,
  ConstructDesignPackage,
  FullTraceabilityRecord,
  ImmuneMonitoringRecord,
  NeoantigenCandidate,
  OutcomeTimelineEntry,
  RankingResult,
} from "../src/types.js";

async function createPgCaseStore() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const migrationSql = readFileSync(join(__dirname, "..", "src", "migrations", "001_full_schema.sql"), "utf8");
  await pool.query(migrationSql.replace(/^BEGIN;/m, "").replace(/^COMMIT;/m, ""));

  const store = new PostgresCaseStore(pool);
  await store.initialize();
  return { pool, store };
}

function buildRanking(caseId: string): RankingResult {
  return {
    caseId,
    rankedCandidates: [
      {
        candidateId: "neo-alpha",
        rank: 1,
        compositeScore: 0.92,
        featureWeights: { bindingAffinity: 0.3, expression: 0.25, clonality: 0.2, manufacturability: 0.15, tolerance: 0.1 },
        featureScores: { bindingAffinity: 0.95, expression: 0.88, clonality: 0.9, manufacturability: 0.85, tolerance: 0.8 },
        uncertaintyContribution: 0.03,
        explanation: "Strong binding and high expression",
      },
      {
        candidateId: "neo-beta",
        rank: 2,
        compositeScore: 0.74,
        featureWeights: { bindingAffinity: 0.3, expression: 0.25, clonality: 0.2, manufacturability: 0.15, tolerance: 0.1 },
        featureScores: { bindingAffinity: 0.7, expression: 0.65, clonality: 0.8, manufacturability: 0.75, tolerance: 0.85 },
        uncertaintyContribution: 0.08,
        explanation: "Moderate binding and expression",
      },
    ],
    ensembleMethod: "weighted-sum",
    confidenceInterval: { lower: 0.68, upper: 0.96 },
    rankedAt: "2026-03-29T10:00:00.000Z",
  };
}

function buildConstruct(caseId: string): ConstructDesignPackage {
  return {
    constructId: "ctor-trace-001",
    caseId,
    version: 1,
    deliveryModality: "conventional-mrna",
    sequence: "AUGGCCGCCGAAUAA",
    designRationale: "Top ranked candidates converted into a tandem minigene construct.",
    candidateIds: ["neo-alpha", "neo-beta"],
    codonOptimization: { algorithm: "LinearDesign", gcContentPercent: 53.2, caiScore: 0.88 },
    manufacturabilityChecks: [{ checkName: "sequence_length", pass: true, detail: "Sequence length within bounds", severity: "info" }],
    designedAt: "2026-03-29T11:00:00.000Z",
  };
}

function buildAdministration(caseId: string): AdministrationRecord {
  return {
    administrationId: "admin-001",
    caseId,
    constructId: "ctor-trace-001",
    constructVersion: 1,
    administeredAt: "2026-03-29T12:00:00.000Z",
    route: "intramuscular",
    doseMicrograms: 100,
    batchId: "batch-001",
  };
}

function buildImmuneMonitoring(caseId: string): ImmuneMonitoringRecord {
  return {
    monitoringId: "immune-001",
    caseId,
    constructId: "ctor-trace-001",
    constructVersion: 1,
    collectedAt: "2026-03-29T13:00:00.000Z",
    assayType: "ELISpot",
    biomarker: "IFN-gamma spot count",
    value: 145,
    unit: "spots/1e6 PBMC",
    baselineDelta: 122,
  };
}

function buildClinicalFollowUp(caseId: string): ClinicalFollowUpRecord {
  return {
    followUpId: "follow-001",
    caseId,
    constructId: "ctor-trace-001",
    constructVersion: 1,
    evaluatedAt: "2026-03-29T14:00:00.000Z",
    responseCategory: "PR",
    progressionFreeDays: 180,
  };
}

function buildCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    caseProfile: {
      patientKey: "pt-outcome-http-001",
      indication: "melanoma",
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
    sampleId: `${sampleType.toLowerCase()}-outcome-001`,
    sampleType,
    assayType,
    accessionId: `acc-${sampleType.toLowerCase()}-outcome-001`,
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

function buildRankedCandidates() {
  return buildRanking("placeholder-case").rankedCandidates.map(
    ({ candidateId, rank, compositeScore, featureWeights, featureScores, uncertaintyContribution, explanation }) => ({
      candidateId,
      rank,
      compositeScore,
      featureWeights,
      featureScores,
      uncertaintyContribution,
      explanation,
    }),
  );
}

function buildRankingCandidate(overrides: Partial<NeoantigenCandidate> & { candidateId: string }): NeoantigenCandidate {
  const { candidateId, ...remainingOverrides } = overrides;
  return {
    candidateId,
    peptideSequence: "YLQPRTFLL",
    hlaAllele: "HLA-A*02:01",
    bindingAffinity: { ic50nM: 50, percentileRank: 1.0 },
    expressionSupport: { tpm: 30, variantAlleleFraction: 0.3 },
    clonality: { vaf: 0.4, isClonal: true },
    manufacturability: { gcContent: 0.5, selfFoldingRisk: "low" },
    selfSimilarity: { closestSelfPeptide: "YLQPKTFLL", editDistance: 2, toleranceRisk: "low" },
    uncertaintyScore: 0.1,
    ...remainingOverrides,
  };
}

function findLastMatching<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (predicate(item)) {
      return item;
    }
  }
  return undefined;
}

function withHeaders<T extends { set(name: string, value: string): T }>(requestBuilder: T, headers: Record<string, string> = {}): T {
  let decorated = requestBuilder;
  for (const [name, value] of Object.entries(headers)) {
    decorated = decorated.set(name, value);
  }
  return decorated;
}

async function createReviewReadyCase(app: ReturnType<typeof createApp>, headers: Record<string, string> = {}): Promise<string> {
  const createResponse = await withHeaders(request(app).post("/api/cases"), headers).send(buildCaseInput());
  assert.equal(createResponse.status, 201);
  const caseId = String(createResponse.body.case.caseId);

  const samples = [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];

  for (const sample of samples) {
    const sampleResponse = await withHeaders(request(app).post(`/api/cases/${caseId}/samples`), headers).send(sample);
    assert.equal(sampleResponse.status, 200);
  }

  for (const sample of samples) {
    const artifactResponse = await withHeaders(
      request(app).post(`/api/cases/${caseId}/artifacts`),
      headers,
    )
      .send(buildSourceArtifact(sample));
    assert.equal(artifactResponse.status, 200);
  }

  const workflowResponse = await withHeaders(request(app).post(`/api/cases/${caseId}/workflows`), headers).send({
    workflowName: "neoantigen-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
  });
  assert.equal(workflowResponse.status, 200);

  const runId = `run-outcome-${Date.now()}`;
  const startResponse = await withHeaders(
    request(app).post(`/api/cases/${caseId}/runs/${runId}/start`),
    headers,
  )
    .send({ runId });
  assert.equal(startResponse.status, 200);

  const completeResponse = await withHeaders(
    request(app).post(`/api/cases/${caseId}/runs/${runId}/complete`),
    headers,
  )
    .send({
      derivedArtifacts: [
        { semanticType: "somatic-vcf", artifactHash: "sha256:derived-outcome", producingStep: "variant-calling" },
      ],
    });
  assert.equal(completeResponse.status, 200);

  const hlaResponse = await withHeaders(
    request(app).post(`/api/cases/${caseId}/hla-consensus`),
    headers,
  )
    .send({
      alleles: ["HLA-A*02:01", "HLA-B*07:02"],
      perToolEvidence: [
        { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 },
      ],
      confidenceScore: 0.95,
      referenceVersion: "IMGT/HLA 3.55.0",
    });
  assert.equal(hlaResponse.status, 200);

  const qcResponse = await withHeaders(
    request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`),
    headers,
  )
    .send({
      results: [
        { metric: "tumor_purity", value: 0.65, threshold: 0.2, pass: true, notes: "Clean" },
      ],
    });
  assert.equal(qcResponse.status, 200);

  return caseId;
}

async function createOutcomeReadyHttpCase(
  app: ReturnType<typeof createApp>,
): Promise<{ caseId: string; constructId: string; constructVersion: number }> {
  const caseId = await createReviewReadyCase(app);

  const rankingResponse = await request(app)
    .post(`/api/cases/${caseId}/neoantigen-ranking`)
    .set("x-correlation-id", "corr-wave13-rank")
    .send({
      candidates: [
        buildRankingCandidate({
          candidateId: "neo-alpha",
          bindingAffinity: { ic50nM: 5, percentileRank: 0.1 },
          expressionSupport: { tpm: 80, variantAlleleFraction: 0.5 },
        }),
        buildRankingCandidate({
          candidateId: "neo-beta",
          bindingAffinity: { ic50nM: 120, percentileRank: 1.8 },
          expressionSupport: { tpm: 25, variantAlleleFraction: 0.22 },
          uncertaintyScore: 0.2,
        }),
      ],
    });
  assert.equal(rankingResponse.status, 201);

  const constructResponse = await request(app)
    .post(`/api/cases/${caseId}/construct-design`)
    .send({ rankedCandidates: rankingResponse.body.ranking.rankedCandidates });
  assert.equal(constructResponse.status, 201);

  return {
    caseId,
    constructId: String(constructResponse.body.constructDesign.constructId),
    constructVersion: Number(constructResponse.body.constructDesign.version),
  };
}

async function createBoardPacketReadyHttpCase(
  app: ReturnType<typeof createApp>,
): Promise<{ caseId: string; constructId: string; constructVersion: number; packetId: string }> {
  const { caseId, constructId, constructVersion } = await createOutcomeReadyHttpCase(app);
  const packetResponse = await request(app)
    .post(`/api/cases/${caseId}/board-packets`)
    .send({});
  assert.equal(packetResponse.status, 201);

  return {
    caseId,
    constructId,
    constructVersion,
    packetId: String(packetResponse.body.packet.packetId),
  };
}

function buildReviewOutcomeInput(packetId: string, overrides: Record<string, unknown> = {}) {
  return {
    packetId,
    reviewerId: "board-md-001",
    reviewerRole: "medical-oncologist",
    reviewDisposition: "approved",
    rationale: "Board approved the current construct for bounded manufacturing handoff.",
    comments: "Proceed under existing trial governance.",
    ...overrides,
  };
}

function buildHandoffPacketInput(reviewId: string, overrides: Record<string, unknown> = {}) {
  return {
    reviewId,
    handoffTarget: "gmp-partner-a",
    requestedBy: "ops@example.org",
    turnaroundDays: 14,
    notes: "Maintain frozen chain-of-custody controls.",
    ...overrides,
  };
}

describe("Wave 10.A вЂ” Outcome registry types and port", () => {
  it("Outcome records link case and construct identity", () => {
    const administration = buildAdministration("case-outcome-001");
    assert.equal(administration.caseId, "case-outcome-001");
    assert.equal(administration.constructId, "ctor-trace-001");
    assert.equal(administration.constructVersion, 1);
    assert.equal(administration.route, "intramuscular");
  });

  it("IOutcomeRegistry exposes record and timeline methods", () => {
    const registry: IOutcomeRegistry = {
      recordAdministration: async (record) => ({
        entryId: "entry-a",
        caseId: record.caseId,
        constructId: record.constructId,
        constructVersion: record.constructVersion,
        entryType: "administration",
        occurredAt: record.administeredAt,
        administration: record,
      }),
      recordImmuneMonitoring: async (record) => ({
        entryId: "entry-i",
        caseId: record.caseId,
        constructId: record.constructId,
        constructVersion: record.constructVersion,
        entryType: "immune-monitoring",
        occurredAt: record.collectedAt,
        immuneMonitoring: record,
      }),
      recordClinicalFollowUp: async (record) => ({
        entryId: "entry-c",
        caseId: record.caseId,
        constructId: record.constructId,
        constructVersion: record.constructVersion,
        entryType: "clinical-follow-up",
        occurredAt: record.evaluatedAt,
        clinicalFollowUp: record,
      }),
      getOutcomeTimeline: async (_caseId) => [],
    };

    assert.equal(typeof registry.recordAdministration, "function");
    assert.equal(typeof registry.recordImmuneMonitoring, "function");
    assert.equal(typeof registry.recordClinicalFollowUp, "function");
    assert.equal(typeof registry.getOutcomeTimeline, "function");
  });
});

describe("Wave 10.B вЂ” InMemoryOutcomeRegistry", () => {
  it("stores append-only outcome entries in chronological order", async () => {
    const registry = new InMemoryOutcomeRegistry();
    await registry.recordClinicalFollowUp(buildClinicalFollowUp("case-outcome-002"));
    await registry.recordAdministration(buildAdministration("case-outcome-002"));
    await registry.recordImmuneMonitoring(buildImmuneMonitoring("case-outcome-002"));

    const timeline = await registry.getOutcomeTimeline("case-outcome-002");
    assert.equal(timeline.length, 3);
    assert.deepEqual(
      timeline.map((entry) => entry.entryType),
      ["administration", "immune-monitoring", "clinical-follow-up"],
    );
  });

  it("isolates timelines by caseId", async () => {
    const registry = new InMemoryOutcomeRegistry();
    await registry.recordAdministration(buildAdministration("case-alpha"));
    await registry.recordAdministration(buildAdministration("case-beta"));

    const alphaTimeline = await registry.getOutcomeTimeline("case-alpha");
    const betaTimeline = await registry.getOutcomeTimeline("case-beta");
    assert.equal(alphaTimeline.length, 1);
    assert.equal(betaTimeline.length, 1);
    assert.equal(alphaTimeline[0].caseId, "case-alpha");
    assert.equal(betaTimeline[0].caseId, "case-beta");
  });
});

describe("Wave 10.C вЂ” Full traceability join", () => {
  async function buildCaseAndTimeline(): Promise<{ traceability: FullTraceabilityRecord; timeline: OutcomeTimelineEntry[] }> {
    const store = new MemoryCaseStore();
    const caseRecord = await store.createCase({
      caseProfile: {
        patientKey: "pt-outcome-001",
        indication: "melanoma",
        siteId: "site-001",
        protocolVersion: "2026.1",
        consentStatus: "complete",
        boardRoute: "solid-tumor-board",
      },
    }, "corr-outcome-create");

    await store.recordNeoantigenRanking(caseRecord.caseId, buildRanking(caseRecord.caseId), "corr-outcome-rank");
    await store.recordConstructDesign(caseRecord.caseId, buildConstruct(caseRecord.caseId), "corr-outcome-construct");

    const registry = new InMemoryOutcomeRegistry();
    await registry.recordAdministration(buildAdministration(caseRecord.caseId));
    await registry.recordImmuneMonitoring(buildImmuneMonitoring(caseRecord.caseId));
    await registry.recordClinicalFollowUp(buildClinicalFollowUp(caseRecord.caseId));

    const updatedCase = await store.getCase(caseRecord.caseId);
    const timeline = await registry.getOutcomeTimeline(caseRecord.caseId);
    return {
      traceability: buildFullTraceability(updatedCase, timeline),
      timeline,
    };
  }

  it("links ranked candidates to construct and downstream outcomes without ambiguity", async () => {
    const { traceability, timeline } = await buildCaseAndTimeline();
    assert.equal(traceability.caseId, timeline[0].caseId);
    assert.deepEqual(traceability.rankedCandidateIds, ["neo-alpha", "neo-beta"]);
    assert.equal(traceability.constructId, "ctor-trace-001");
    assert.equal(traceability.constructVersion, 1);
    assert.equal(traceability.administrations.length, 1);
    assert.equal(traceability.immuneMonitoringRecords.length, 1);
    assert.equal(traceability.clinicalFollowUpRecords.length, 1);
    assert.deepEqual(
      traceability.timeline.map((entry) => entry.entryType),
      ["administration", "immune-monitoring", "clinical-follow-up"],
    );
  });

  it("rejects outcome entries that reference a different construct version", async () => {
    const store = new MemoryCaseStore();
    const caseRecord = await store.createCase({
      caseProfile: {
        patientKey: "pt-outcome-002",
        indication: "melanoma",
        siteId: "site-001",
        protocolVersion: "2026.1",
        consentStatus: "complete",
      },
    }, "corr-outcome-create-2");
    await store.recordNeoantigenRanking(caseRecord.caseId, buildRanking(caseRecord.caseId), "corr-outcome-rank-2");
    await store.recordConstructDesign(caseRecord.caseId, buildConstruct(caseRecord.caseId), "corr-outcome-construct-2");

    const updatedCase = await store.getCase(caseRecord.caseId);
    const timeline: OutcomeTimelineEntry[] = [
      {
        entryId: "entry-mismatch",
        caseId: caseRecord.caseId,
        constructId: "ctor-trace-001",
        constructVersion: 2,
        entryType: "administration",
        occurredAt: "2026-03-29T12:00:00.000Z",
        administration: {
          ...buildAdministration(caseRecord.caseId),
          constructVersion: 2,
        },
      },
    ];

    assert.throws(
      () => buildFullTraceability(updatedCase, timeline),
      /stored construct design/i,
    );
  });
});

describe("Wave 12 вЂ” Outcome aggregate integration", () => {
  async function buildStoredOutcomeCase(store: MemoryCaseStore | PostgresCaseStore): Promise<string> {
    const caseRecord = await store.createCase({
      caseProfile: {
        patientKey: "pt-wave12-001",
        indication: "melanoma",
        siteId: "site-001",
        protocolVersion: "2026.1",
        consentStatus: "complete",
        boardRoute: "solid-tumor-board",
      },
    }, "corr-wave12-create");

    await store.recordNeoantigenRanking(caseRecord.caseId, buildRanking(caseRecord.caseId), "corr-wave12-rank");
    await store.recordConstructDesign(caseRecord.caseId, buildConstruct(caseRecord.caseId), "corr-wave12-construct");
    await store.recordAdministration(caseRecord.caseId, buildAdministration(caseRecord.caseId), "corr-wave12-admin");
    await store.recordImmuneMonitoring(caseRecord.caseId, buildImmuneMonitoring(caseRecord.caseId), "corr-wave12-immune");
    await store.recordClinicalFollowUp(caseRecord.caseId, buildClinicalFollowUp(caseRecord.caseId), "corr-wave12-follow");

    return caseRecord.caseId;
  }

  it("stores outcome timeline entries and appends audit provenance on the case aggregate", async () => {
    const store = new MemoryCaseStore();
    const caseId = await buildStoredOutcomeCase(store);
    const updatedCase = await store.getCase(caseId);

    assert.equal(updatedCase.outcomeTimeline.length, 3);
    assert.deepEqual(
      updatedCase.outcomeTimeline.map((entry) => entry.entryType),
      ["administration", "immune-monitoring", "clinical-follow-up"],
    );

    const latestAudit = updatedCase.auditEvents[updatedCase.auditEvents.length - 1];
    assert.equal(latestAudit.type, "outcome.recorded");
    assert.equal(latestAudit.correlationId, "corr-wave12-follow");
    assert.equal(latestAudit.occurredAt, "2026-03-29T14:00:00.000Z");

    const latestTimeline = updatedCase.timeline[updatedCase.timeline.length - 1];
    assert.equal(latestTimeline.type, "clinical_follow_up_recorded");
    assert.equal(latestTimeline.at, "2026-03-29T14:00:00.000Z");
  });

  it("getFullTraceability uses the stored case outcome timeline", async () => {
    const store = new MemoryCaseStore();
    const caseId = await buildStoredOutcomeCase(store);

    const traceability = await store.getFullTraceability(caseId);
    assert.equal(traceability.caseId, caseId);
    assert.equal(traceability.timeline.length, 3);
    assert.equal(traceability.administrations[0].administrationId, "admin-001");
    assert.equal(traceability.immuneMonitoringRecords[0].monitoringId, "immune-001");
    assert.equal(traceability.clinicalFollowUpRecords[0].followUpId, "follow-001");
  });

  it("PostgresCaseStore persists outcome timeline and traceability across reload", async () => {
    const { pool, store } = await createPgCaseStore();

    try {
      const caseId = await buildStoredOutcomeCase(store);
      const reloadedStore = new PostgresCaseStore(pool);
      await reloadedStore.initialize();

      const reloadedCase = await reloadedStore.getCase(caseId);
      assert.equal(reloadedCase.outcomeTimeline.length, 3);
      assert.equal(reloadedCase.outcomeTimeline[0].entryType, "administration");

      const traceability = await reloadedStore.getFullTraceability(caseId);
      assert.equal(traceability.timeline.length, 3);
      assert.equal(traceability.constructId, "ctor-trace-001");
    } finally {
      await pool.end();
    }
  });
});

describe("Wave 13 вЂ” Outcome HTTP surfaces", () => {
  it("POST /api/cases/:caseId/neoantigen-ranking enables downstream traceability without direct store mutation", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const caseId = await createReviewReadyCase(app);

    const rankingResponse = await request(app)
      .post(`/api/cases/${caseId}/neoantigen-ranking`)
      .set("x-correlation-id", "corr-http-ranking")
      .send({
        candidates: [
          buildRankingCandidate({
            candidateId: "neo-alpha",
            bindingAffinity: { ic50nM: 5, percentileRank: 0.1 },
            expressionSupport: { tpm: 80, variantAlleleFraction: 0.5 },
          }),
          buildRankingCandidate({
            candidateId: "neo-beta",
            bindingAffinity: { ic50nM: 120, percentileRank: 1.8 },
            expressionSupport: { tpm: 25, variantAlleleFraction: 0.22 },
            uncertaintyScore: 0.2,
          }),
        ],
      });

    assert.equal(rankingResponse.status, 201);
    assert.equal(rankingResponse.body.ranking.caseId, caseId);
    assert.equal(rankingResponse.body.ranking.rankedCandidates.length, 2);
    assert.equal(rankingResponse.body.case.neoantigenRanking.rankedCandidates.length, 2);

    const constructResponse = await request(app)
      .post(`/api/cases/${caseId}/construct-design`)
      .send({ rankedCandidates: rankingResponse.body.ranking.rankedCandidates });
    assert.equal(constructResponse.status, 201);

    const traceabilityResponse = await request(app).get(`/api/cases/${caseId}/traceability`);
    assert.equal(traceabilityResponse.status, 200);
    assert.equal(traceabilityResponse.body.traceability.caseId, caseId);
    assert.deepEqual(traceabilityResponse.body.traceability.rankedCandidateIds, ["neo-alpha", "neo-beta"]);

    const storedCase = await store.getCase(caseId);
    assert.equal(storedCase.auditEvents.at(-2)?.type, "candidate.rank-generated");
    assert.equal(storedCase.auditEvents.at(-2)?.correlationId, "corr-http-ranking");
  });

  it("authenticated HLA and ranking writes preserve principal metadata in audit trail and event journal", async () => {
    const store = new MemoryCaseStore();
    const authHeaders = { "x-api-key": "svc-secret" };
    const app = createApp({
      store,
      apiKey: "svc-secret",
      apiKeyPrincipalId: "svc:board-orchestrator",
      rbacAllowAll: true, consentGateEnabled: false,
    });
    const caseId = await createReviewReadyCase(app, authHeaders);

    const hlaResponse = await withHeaders(request(app).post(`/api/cases/${caseId}/hla-consensus`), {
      ...authHeaders,
      "x-correlation-id": "corr-auth-hla",
    }).send({
      alleles: ["HLA-A*02:01", "HLA-B*07:02"],
      perToolEvidence: [
        { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.97 },
      ],
      confidenceScore: 0.97,
      referenceVersion: "IMGT/HLA 3.55.0",
    });
    assert.equal(hlaResponse.status, 200);

    const rankingResponse = await withHeaders(request(app).post(`/api/cases/${caseId}/neoantigen-ranking`), {
      ...authHeaders,
      "x-correlation-id": "corr-auth-rank",
    }).send({
      candidates: [
        buildRankingCandidate({
          candidateId: "neo-auth-alpha",
          bindingAffinity: { ic50nM: 4, percentileRank: 0.08 },
          expressionSupport: { tpm: 88, variantAlleleFraction: 0.52 },
        }),
        buildRankingCandidate({
          candidateId: "neo-auth-beta",
          bindingAffinity: { ic50nM: 140, percentileRank: 2.1 },
          expressionSupport: { tpm: 22, variantAlleleFraction: 0.19 },
          uncertaintyScore: 0.22,
        }),
      ],
    });
    assert.equal(rankingResponse.status, 201);

    const storedCase = await store.getCase(caseId);
    const latestHlaAudit = findLastMatching(storedCase.auditEvents, (event) => event.type === "hla.consensus.produced");
    assert.ok(latestHlaAudit, "expected HLA audit event");
    assert.equal(latestHlaAudit?.correlationId, "corr-auth-hla");
    assert.equal(latestHlaAudit?.actorId, "svc:board-orchestrator");
    assert.equal(latestHlaAudit?.authMechanism, "api-key");

    const latestRankingAudit = findLastMatching(storedCase.auditEvents, (event) => event.type === "candidate.rank-generated");
    assert.ok(latestRankingAudit, "expected ranking audit event");
    assert.equal(latestRankingAudit?.correlationId, "corr-auth-rank");
    assert.equal(latestRankingAudit?.actorId, "svc:board-orchestrator");
    assert.equal(latestRankingAudit?.authMechanism, "api-key");

    const caseEvents = await store.listCaseEvents(caseId);
    const latestHlaEvent = findLastMatching(caseEvents, (event) => event.type === "hla.consensus.produced");
    assert.ok(latestHlaEvent, "expected HLA journal event");
    assert.equal(latestHlaEvent?.correlationId, "corr-auth-hla");
    assert.equal(latestHlaEvent?.actorId, "svc:board-orchestrator");
    assert.equal(latestHlaEvent?.authMechanism, "api-key");

    const latestRankingEvent = findLastMatching(caseEvents, (event) => event.type === "neoantigen.ranking.recorded");
    assert.ok(latestRankingEvent, "expected ranking journal event");
    assert.equal(latestRankingEvent?.correlationId, "corr-auth-rank");
    assert.equal(latestRankingEvent?.actorId, "svc:board-orchestrator");
    assert.equal(latestRankingEvent?.authMechanism, "api-key");
  });

  it("POST outcome routes record entries and preserve correlation ids", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId, constructId, constructVersion } = await createOutcomeReadyHttpCase(app);

    const administration = {
      ...buildAdministration(caseId),
      constructId,
      constructVersion,
    };
    const administrationResponse = await request(app)
      .post(`/api/cases/${caseId}/outcomes/administration`)
      .set("x-correlation-id", "corr-http-admin")
      .send({
        administrationId: administration.administrationId,
        constructId: administration.constructId,
        constructVersion: administration.constructVersion,
        administeredAt: administration.administeredAt,
        route: administration.route,
        doseMicrograms: administration.doseMicrograms,
        batchId: administration.batchId,
        notes: administration.notes,
      });

    assert.equal(administrationResponse.status, 201);
    assert.equal(administrationResponse.body.administration.administrationId, administration.administrationId);
    assert.equal(administrationResponse.body.case.outcomeTimeline.length, 1);

    const immuneMonitoring = {
      ...buildImmuneMonitoring(caseId),
      constructId,
      constructVersion,
    };
    const immuneResponse = await request(app)
      .post(`/api/cases/${caseId}/outcomes/immune-monitoring`)
      .send({
        monitoringId: immuneMonitoring.monitoringId,
        constructId: immuneMonitoring.constructId,
        constructVersion: immuneMonitoring.constructVersion,
        collectedAt: immuneMonitoring.collectedAt,
        assayType: immuneMonitoring.assayType,
        biomarker: immuneMonitoring.biomarker,
        value: immuneMonitoring.value,
        unit: immuneMonitoring.unit,
        baselineDelta: immuneMonitoring.baselineDelta,
        notes: immuneMonitoring.notes,
      });

    assert.equal(immuneResponse.status, 201);
    assert.equal(immuneResponse.body.immuneMonitoring.monitoringId, immuneMonitoring.monitoringId);

    const followUp = {
      ...buildClinicalFollowUp(caseId),
      constructId,
      constructVersion,
    };
    const followResponse = await request(app)
      .post(`/api/cases/${caseId}/outcomes/clinical-follow-up`)
      .send({
        followUpId: followUp.followUpId,
        constructId: followUp.constructId,
        constructVersion: followUp.constructVersion,
        evaluatedAt: followUp.evaluatedAt,
        responseCategory: followUp.responseCategory,
        progressionFreeDays: followUp.progressionFreeDays,
        overallSurvivalDays: followUp.overallSurvivalDays,
        notes: followUp.notes,
      });

    assert.equal(followResponse.status, 201);
    assert.equal(followResponse.body.clinicalFollowUp.followUpId, followUp.followUpId);

    const storedCase = await store.getCase(caseId);
    assert.deepEqual(
      storedCase.outcomeTimeline.map((entry) => entry.entryType),
      ["administration", "immune-monitoring", "clinical-follow-up"],
    );
    assert.equal(storedCase.auditEvents[storedCase.auditEvents.length - 3].correlationId, "corr-http-admin");
  });

  it("GET /api/cases/:caseId/outcomes returns the stored timeline and meta", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId, constructId, constructVersion } = await createOutcomeReadyHttpCase(app);

    await store.recordAdministration(caseId, { ...buildAdministration(caseId), constructId, constructVersion }, "corr-outcomes-read");
    await store.recordImmuneMonitoring(caseId, { ...buildImmuneMonitoring(caseId), constructId, constructVersion }, "corr-outcomes-read");

    const response = await request(app).get(`/api/cases/${caseId}/outcomes`);

    assert.equal(response.status, 200);
    assert.equal(response.body.meta.totalEntries, 2);
    assert.deepEqual(
      response.body.timeline.map((entry: { entryType: string }) => entry.entryType),
      ["administration", "immune-monitoring"],
    );
  });

  it("GET /api/cases/:caseId/outcomes returns an empty list when no outcomes exist yet", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId } = await createOutcomeReadyHttpCase(app);

    const response = await request(app).get(`/api/cases/${caseId}/outcomes`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.timeline, []);
    assert.equal(response.body.meta.totalEntries, 0);
  });

  it("GET /api/cases/:caseId/traceability returns the stored full traceability join", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId, constructId, constructVersion } = await createOutcomeReadyHttpCase(app);

    await store.recordAdministration(caseId, { ...buildAdministration(caseId), constructId, constructVersion }, "corr-traceability-admin");
    await store.recordImmuneMonitoring(caseId, { ...buildImmuneMonitoring(caseId), constructId, constructVersion }, "corr-traceability-immune");
    await store.recordClinicalFollowUp(caseId, { ...buildClinicalFollowUp(caseId), constructId, constructVersion }, "corr-traceability-follow");

    const response = await request(app).get(`/api/cases/${caseId}/traceability`);

    assert.equal(response.status, 200);
    assert.equal(response.body.traceability.caseId, caseId);
    assert.equal(response.body.traceability.timeline.length, 3);
    assert.equal(response.body.traceability.constructId, constructId);
  });

  it("GET /api/cases/:caseId/traceability returns an operator-facing readiness error when ranking is missing", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const caseId = await createReviewReadyCase(app);

    const constructResponse = await request(app)
      .post(`/api/cases/${caseId}/construct-design`)
      .send({ rankedCandidates: buildRankedCandidates() });
    assert.equal(constructResponse.status, 201);

    const response = await request(app).get(`/api/cases/${caseId}/traceability`);

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "traceability_not_ready");
  });
});

describe("Wave 15 вЂ” Review outcome and manufacturing handoff", () => {
  it("POST /api/cases/:caseId/review-outcomes records an approved review outcome for a board packet", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId, packetId } = await createBoardPacketReadyHttpCase(app);

    const response = await request(app)
      .post(`/api/cases/${caseId}/review-outcomes`)
      .set("x-correlation-id", "corr-wave15-review")
      .send(buildReviewOutcomeInput(packetId));

    assert.equal(response.status, 201);
    assert.equal(response.body.reviewOutcome.caseId, caseId);
    assert.equal(response.body.reviewOutcome.packetId, packetId);
    assert.equal(response.body.reviewOutcome.reviewDisposition, "approved");
    assert.equal(response.body.case.status, "APPROVED_FOR_HANDOFF");
    assert.equal(response.headers["x-correlation-id"], "corr-wave15-review");

    const storedCase = await store.getCase(caseId) as unknown as {
      reviewOutcomes: Array<{ reviewId: string; packetId: string }>;
      auditEvents: Array<{ type: string; correlationId: string }>;
      timeline: Array<{ type: string }>;
    };
    assert.equal(storedCase.reviewOutcomes.length, 1);
    assert.equal(storedCase.reviewOutcomes[0].packetId, packetId);
    assert.equal(storedCase.auditEvents.at(-1)?.type, "review.outcome.recorded");
    assert.equal(storedCase.auditEvents.at(-1)?.correlationId, "corr-wave15-review");
    assert.equal(storedCase.timeline.at(-1)?.type, "review_outcome_recorded");
  });

  it("POST /api/cases/:caseId/review-outcomes is idempotent for exact replay and rejects conflicting replay", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId, packetId } = await createBoardPacketReadyHttpCase(app);
    const body = buildReviewOutcomeInput(packetId);

    const firstResponse = await request(app)
      .post(`/api/cases/${caseId}/review-outcomes`)
      .send(body);
    const secondResponse = await request(app)
      .post(`/api/cases/${caseId}/review-outcomes`)
      .send(body);
    const conflictingResponse = await request(app)
      .post(`/api/cases/${caseId}/review-outcomes`)
      .send(buildReviewOutcomeInput(packetId, { rationale: "Conflicting rationale" }));

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 200);
    assert.equal(secondResponse.body.reviewOutcome.reviewId, firstResponse.body.reviewOutcome.reviewId);
    assert.equal(secondResponse.body.meta.created, false);
    assert.equal(conflictingResponse.status, 409);
    assert.equal(conflictingResponse.body.code, "review_outcome_already_recorded");
  });

  it("POST /api/cases/:caseId/handoff-packets creates a bounded handoff packet from an approved review", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId, constructId, packetId } = await createBoardPacketReadyHttpCase(app);

    const reviewResponse = await request(app)
      .post(`/api/cases/${caseId}/review-outcomes`)
      .send(buildReviewOutcomeInput(packetId));
    assert.equal(reviewResponse.status, 201);
    const reviewId = String(reviewResponse.body.reviewOutcome.reviewId);

    const handoffResponse = await request(app)
      .post(`/api/cases/${caseId}/handoff-packets`)
      .set("x-correlation-id", "corr-wave15-handoff")
      .send(buildHandoffPacketInput(reviewId));

    assert.equal(handoffResponse.status, 201);
    assert.equal(handoffResponse.body.handoff.caseId, caseId);
    assert.equal(handoffResponse.body.handoff.reviewId, reviewId);
    assert.equal(handoffResponse.body.handoff.packetId, packetId);
    assert.equal(handoffResponse.body.handoff.handoffTarget, "gmp-partner-a");
    assert.equal(handoffResponse.body.handoff.snapshot.reviewOutcome.reviewDisposition, "approved");
    assert.equal(handoffResponse.body.handoff.snapshot.constructDesign.constructId, constructId);
    assert.equal(handoffResponse.body.case.status, "HANDOFF_PENDING");
    assert.equal(handoffResponse.headers["x-correlation-id"], "corr-wave15-handoff");

    const handoffId = String(handoffResponse.body.handoff.handoffId);
    const listResponse = await request(app).get(`/api/cases/${caseId}/handoff-packets`);
    const getResponse = await request(app).get(`/api/cases/${caseId}/handoff-packets/${handoffId}`);
    const traceabilityResponse = await request(app).get(`/api/cases/${caseId}/traceability`);

    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.meta.totalHandoffs, 1);
    assert.equal(listResponse.body.handoffs[0].handoffId, handoffId);
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.handoff.handoffId, handoffId);
    assert.equal(traceabilityResponse.status, 200);
    assert.equal(traceabilityResponse.body.traceability.reviewOutcomes.length, 1);
    assert.equal(traceabilityResponse.body.traceability.handoffPackets.length, 1);
  });

  it("POST /api/cases/:caseId/handoff-packets rejects non-approved review outcomes", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
    const { caseId, packetId } = await createBoardPacketReadyHttpCase(app);

    const reviewResponse = await request(app)
      .post(`/api/cases/${caseId}/review-outcomes`)
      .send(buildReviewOutcomeInput(packetId, {
        reviewDisposition: "revision-requested",
        rationale: "Need an updated payload before approval.",
      }));
    assert.equal(reviewResponse.status, 201);

    const handoffResponse = await request(app)
      .post(`/api/cases/${caseId}/handoff-packets`)
      .send(buildHandoffPacketInput(String(reviewResponse.body.reviewOutcome.reviewId)));

    assert.equal(handoffResponse.status, 409);
    assert.equal(handoffResponse.body.code, "review_outcome_not_approved");
  });

  it("PostgresCaseStore persists review outcomes and handoff packets across reload", async () => {
    const { pool, store } = await createPgCaseStore();

    try {
      const app = createApp({ store , rbacAllowAll: true, consentGateEnabled: false });
      const { caseId, packetId } = await createBoardPacketReadyHttpCase(app);

      const reviewResponse = await request(app)
        .post(`/api/cases/${caseId}/review-outcomes`)
        .send(buildReviewOutcomeInput(packetId));
      assert.equal(reviewResponse.status, 201);
      const reviewId = String(reviewResponse.body.reviewOutcome.reviewId);

      const handoffResponse = await request(app)
        .post(`/api/cases/${caseId}/handoff-packets`)
        .send(buildHandoffPacketInput(reviewId));
      assert.equal(handoffResponse.status, 201);
      const handoffId = String(handoffResponse.body.handoff.handoffId);

      const reloadedStore = new PostgresCaseStore(pool);
      await reloadedStore.initialize();

      const reloadedCase = await reloadedStore.getCase(caseId) as unknown as {
        reviewOutcomes: Array<{ reviewId: string }>;
        handoffPackets: Array<{ handoffId: string }>;
      };
      assert.equal(reloadedCase.reviewOutcomes.length, 1);
      assert.equal(reloadedCase.reviewOutcomes[0].reviewId, reviewId);
      assert.equal(reloadedCase.handoffPackets.length, 1);
      assert.equal(reloadedCase.handoffPackets[0].handoffId, handoffId);

      const traceability = await reloadedStore.getFullTraceability(caseId) as unknown as {
        reviewOutcomes: Array<{ reviewId: string }>;
        handoffPackets: Array<{ handoffId: string }>;
      };
      assert.equal(traceability.reviewOutcomes.length, 1);
      assert.equal(traceability.handoffPackets.length, 1);
    } finally {
      await pool.end();
    }
  });
});