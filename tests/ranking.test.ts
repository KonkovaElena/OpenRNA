import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { NeoantigenCandidate, RankingResult, RankingRationale, DerivedArtifactSemanticType } from "../src/types.js";
import type { INeoantigenRankingEngine } from "../src/ports/INeoantigenRankingEngine.js";
import { InMemoryNeoantigenRankingEngine } from "../src/adapters/InMemoryNeoantigenRankingEngine.js";
import { MemoryCaseStore } from "../src/store.js";
import { createApp } from "../src/app.js";
import type { IWorkflowRunner, WorkflowRunRequest } from "../src/ports/IWorkflowRunner.js";
import type { WorkflowRunRecord } from "../src/types.js";

// в”Ђв”Ђв”Ђ 8.A: Ranking types and port contract в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

describe("Wave 8.A вЂ” Neoantigen ranking types", () => {
  const candidate: NeoantigenCandidate = {
    candidateId: "neo-001",
    peptideSequence: "YLQPRTFLL",
    hlaAllele: "HLA-A*02:01",
    bindingAffinity: { ic50nM: 12.5, percentileRank: 0.3 },
    expressionSupport: { tpm: 45.2, variantAlleleFraction: 0.35 },
    clonality: { vaf: 0.42, isClonal: true },
    manufacturability: { gcContent: 0.55, selfFoldingRisk: "low" },
    selfSimilarity: { closestSelfPeptide: "YLQPKTFLL", editDistance: 1, toleranceRisk: "medium" },
    uncertaintyScore: 0.15,
  };

  it("NeoantigenCandidate carries all required evidence fields", () => {
    assert.equal(candidate.peptideSequence, "YLQPRTFLL");
    assert.equal(candidate.hlaAllele, "HLA-A*02:01");
    assert.equal(candidate.bindingAffinity.ic50nM, 12.5);
    assert.equal(candidate.expressionSupport.tpm, 45.2);
    assert.equal(candidate.clonality.vaf, 0.42);
    assert.equal(candidate.manufacturability.selfFoldingRisk, "low");
    assert.equal(candidate.selfSimilarity.toleranceRisk, "medium");
    assert.equal(candidate.uncertaintyScore, 0.15);
  });

  it("RankingResult carries ranked candidates with rationale and confidence", () => {
    const rationale: RankingRationale = {
      candidateId: "neo-001",
      rank: 1,
      compositeScore: 0.87,
      featureWeights: { bindingAffinity: 0.3, expression: 0.25, clonality: 0.2, manufacturability: 0.15, tolerance: 0.1 },
      featureScores: { bindingAffinity: 0.95, expression: 0.8, clonality: 0.85, manufacturability: 0.9, tolerance: 0.7 },
      uncertaintyContribution: 0.05,
      explanation: "Strong binding + high expression; moderate tolerance risk",
    };

    const result: RankingResult = {
      caseId: "case-001",
      rankedCandidates: [rationale],
      ensembleMethod: "weighted-sum",
      confidenceInterval: { lower: 0.72, upper: 0.95 },
      rankedAt: "2026-03-27T12:00:00Z",
    };

    assert.equal(result.rankedCandidates.length, 1);
    assert.equal(result.rankedCandidates[0].rank, 1);
    assert.equal(result.ensembleMethod, "weighted-sum");
    assert.equal(result.confidenceInterval.lower, 0.72);
  });

  it("INeoantigenRankingEngine port defines rank method signature", () => {
    // Compile-time contract: an adapter must have rank()
    const fakeEngine: INeoantigenRankingEngine = {
      rank: async (_caseId: string, _candidates: NeoantigenCandidate[]): Promise<RankingResult> => {
        return {
          caseId: _caseId,
          rankedCandidates: [],
          ensembleMethod: "weighted-sum",
          confidenceInterval: { lower: 0, upper: 0 },
          rankedAt: new Date().toISOString(),
        };
      },
    };
    assert.ok(fakeEngine.rank, "rank method must exist");
  });
});

// в”Ђв”Ђв”Ђ 8.B: In-memory ranking adapter в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function buildCandidate(overrides: Partial<NeoantigenCandidate> & { candidateId: string }): NeoantigenCandidate {
  return {
    peptideSequence: "YLQPRTFLL",
    hlaAllele: "HLA-A*02:01",
    bindingAffinity: { ic50nM: 50, percentileRank: 1.0 },
    expressionSupport: { tpm: 30, variantAlleleFraction: 0.3 },
    clonality: { vaf: 0.4, isClonal: true },
    manufacturability: { gcContent: 0.5, selfFoldingRisk: "low" },
    selfSimilarity: { closestSelfPeptide: "YLQPKTFLL", editDistance: 2, toleranceRisk: "low" },
    uncertaintyScore: 0.1,
    ...overrides,
  };
}

describe("Wave 8.B вЂ” InMemoryNeoantigenRankingEngine", () => {
  const engine = new InMemoryNeoantigenRankingEngine();

  it("ranks candidates by composite score descending", async () => {
    const strong = buildCandidate({
      candidateId: "neo-strong",
      bindingAffinity: { ic50nM: 5, percentileRank: 0.1 },
      expressionSupport: { tpm: 80, variantAlleleFraction: 0.5 },
    });
    const weak = buildCandidate({
      candidateId: "neo-weak",
      bindingAffinity: { ic50nM: 500, percentileRank: 5.0 },
      expressionSupport: { tpm: 5, variantAlleleFraction: 0.05 },
    });
    const result = await engine.rank("case-001", [weak, strong]);
    assert.equal(result.rankedCandidates[0].candidateId, "neo-strong");
    assert.equal(result.rankedCandidates[1].candidateId, "neo-weak");
    assert.equal(result.rankedCandidates[0].rank, 1);
    assert.equal(result.rankedCandidates[1].rank, 2);
  });

  it("composite score is between 0 and 1", async () => {
    const c = buildCandidate({ candidateId: "neo-mid" });
    const result = await engine.rank("case-002", [c]);
    const score = result.rankedCandidates[0].compositeScore;
    assert.ok(score >= 0 && score <= 1, `score ${score} not in [0, 1]`);
  });

  it("feature weights sum to 1", async () => {
    const c = buildCandidate({ candidateId: "neo-w" });
    const result = await engine.rank("case-003", [c]);
    const weights = result.rankedCandidates[0].featureWeights;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `weights sum ${sum} != 1`);
  });

  it("higher uncertainty score increases uncertainty contribution", async () => {
    const lowUnc = buildCandidate({ candidateId: "neo-low-unc", uncertaintyScore: 0.05 });
    const highUnc = buildCandidate({ candidateId: "neo-high-unc", uncertaintyScore: 0.9 });
    const result = await engine.rank("case-004", [lowUnc, highUnc]);
    const lowRat = result.rankedCandidates.find(r => r.candidateId === "neo-low-unc")!;
    const highRat = result.rankedCandidates.find(r => r.candidateId === "neo-high-unc")!;
    assert.ok(highRat.uncertaintyContribution > lowRat.uncertaintyContribution);
  });

  it("confidence interval narrows with more candidates", async () => {
    const one = await engine.rank("case-005", [buildCandidate({ candidateId: "a" })]);
    const many = await engine.rank("case-006", [
      buildCandidate({ candidateId: "a" }),
      buildCandidate({ candidateId: "b" }),
      buildCandidate({ candidateId: "c" }),
      buildCandidate({ candidateId: "d" }),
      buildCandidate({ candidateId: "e" }),
    ]);
    const oneWidth = one.confidenceInterval.upper - one.confidenceInterval.lower;
    const manyWidth = many.confidenceInterval.upper - many.confidenceInterval.lower;
    assert.ok(manyWidth <= oneWidth, `many-width ${manyWidth} > one-width ${oneWidth}`);
  });

  it("empty candidates produces empty ranking", async () => {
    const result = await engine.rank("case-007", []);
    assert.equal(result.rankedCandidates.length, 0);
    assert.equal(result.caseId, "case-007");
  });

  it("ensembleMethod is weighted-sum", async () => {
    const result = await engine.rank("case-008", [buildCandidate({ candidateId: "x" })]);
    assert.equal(result.ensembleMethod, "weighted-sum");
  });

  it("each rationale has a non-empty explanation", async () => {
    const result = await engine.rank("case-009", [
      buildCandidate({ candidateId: "a" }),
      buildCandidate({ candidateId: "b" }),
    ]);
    for (const r of result.rankedCandidates) {
      assert.ok(r.explanation.length > 0, `empty explanation for ${r.candidateId}`);
    }
  });
});

// в”Ђв”Ђв”Ђ 8.C: Board packet wiring в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

class FakeWorkflowRunner implements IWorkflowRunner {
  private runs = new Map<string, WorkflowRunRecord>();
  startRun(input: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    const rec: WorkflowRunRecord = {
      runId: input.runId, caseId: input.caseId, requestId: input.requestId,
      status: "RUNNING", workflowName: input.workflowName,
      referenceBundleId: input.referenceBundleId, executionProfile: input.executionProfile,
      startedAt: new Date().toISOString(),
    };
    this.runs.set(input.runId, rec);
    return Promise.resolve(rec);
  }
  getRun(runId: string): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`not found: ${runId}`);
    return Promise.resolve(r);
  }
  listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]> {
    return Promise.resolve([...this.runs.values()].filter((r) => r.caseId === caseId));
  }
  completeRun(runId: string, _derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId)!;
    r.status = "COMPLETED";
    r.completedAt = new Date().toISOString();
    return Promise.resolve(r);
  }
  failRun(runId: string, _reason: string): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId)!;
    r.status = "FAILED";
    r.completedAt = new Date().toISOString();
    return Promise.resolve(r);
  }
  cancelRun(runId: string): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId)!;
    r.status = "CANCELLED";
    r.completedAt = new Date().toISOString();
    return Promise.resolve(r);
  }
}

function buildRanking(caseId: string): RankingResult {
  return {
    caseId,
    rankedCandidates: [
      {
        candidateId: "neo-top",
        rank: 1,
        compositeScore: 0.92,
        featureWeights: { bindingAffinity: 0.3, expression: 0.25, clonality: 0.2, manufacturability: 0.15, tolerance: 0.1 },
        featureScores: { bindingAffinity: 0.95, expression: 0.88, clonality: 0.9, manufacturability: 0.85, tolerance: 0.8 },
        uncertaintyContribution: 0.03,
        explanation: "Strong binding affinity at 5nM; high expression support",
      },
      {
        candidateId: "neo-second",
        rank: 2,
        compositeScore: 0.74,
        featureWeights: { bindingAffinity: 0.3, expression: 0.25, clonality: 0.2, manufacturability: 0.15, tolerance: 0.1 },
        featureScores: { bindingAffinity: 0.7, expression: 0.65, clonality: 0.8, manufacturability: 0.75, tolerance: 0.85 },
        uncertaintyContribution: 0.08,
        explanation: "Moderate binding; moderate expression",
      },
    ],
    ensembleMethod: "weighted-sum",
    confidenceInterval: { lower: 0.68, upper: 0.96 },
    rankedAt: "2026-03-27T14:00:00Z",
  };
}

async function createReviewReadyCaseForRanking(app: ReturnType<typeof createApp>): Promise<string> {
  const createRes = await request(app).post("/api/cases").send({
    caseProfile: {
      patientKey: "PAT-RANK-001",
      indication: "melanoma",
      siteId: "SITE-A",
      protocolVersion: "1.0",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  });
  const caseId = String(createRes.body.case.caseId);

  const samples = [
    { sampleId: "tumor-dna-rank", sampleType: "TUMOR_DNA", assayType: "WES", accessionId: "acc-tumor-dna", sourceSite: "SITE-A" },
    { sampleId: "normal-dna-rank", sampleType: "NORMAL_DNA", assayType: "WES", accessionId: "acc-normal-dna", sourceSite: "SITE-A" },
    { sampleId: "tumor-rna-rank", sampleType: "TUMOR_RNA", assayType: "RNA_SEQ", accessionId: "acc-tumor-rna", sourceSite: "SITE-A" },
  ];
  for (const sample of samples) {
    await request(app).post(`/api/cases/${caseId}/samples`).send(sample);
  }

  const semanticTypeBySampleType: Record<string, string> = {
    TUMOR_DNA: "tumor-dna-fastq",
    NORMAL_DNA: "normal-dna-fastq",
    TUMOR_RNA: "tumor-rna-fastq",
  };
  for (const sample of samples) {
    await request(app).post(`/api/cases/${caseId}/artifacts`).send({
      sampleId: sample.sampleId,
      semanticType: semanticTypeBySampleType[sample.sampleType] ?? "tumor-dna-fastq",
      schemaVersion: 1,
      artifactHash: `sha256:${sample.sampleId}`,
      storageUri: `s3://bucket/${sample.sampleId}.fastq.gz`,
    });
  }

  await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "neoantigen-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
  });

  const runId = `run-rank-${Date.now()}`;
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/start`).send({ runId });
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/complete`).send({
    derivedArtifacts: [
      { semanticType: "somatic-vcf" as DerivedArtifactSemanticType, artifactHash: "sha256:derived-rank", producingStep: "variant-calling" },
    ],
  });
  await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["HLA-A*02:01", "HLA-B*07:02"],
    perToolEvidence: [{ toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 }],
    confidenceScore: 0.95,
    referenceVersion: "IMGT/HLA 3.55.0",
  });
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`).send({
    results: [{ metric: "tumor_purity", value: 0.65, threshold: 0.2, pass: true, notes: "Clean" }],
  });

  return caseId;
}

describe("Wave 8.C вЂ” Ranking in board packets", () => {
  it("store records and retrieves neoantigen ranking", async () => {
    const store = new MemoryCaseStore();
    const caseRec = await store.createCase({
      caseProfile: {
        patientKey: "PAT-STORE-001",
        indication: "melanoma",
        protocolVersion: "1.0",
        siteId: "SITE-A",
        consentStatus: "complete",
      },
    }, "corr-8c-1");
    const ranking = buildRanking(caseRec.caseId);
    const updated = await store.recordNeoantigenRanking(caseRec.caseId, ranking, "corr-test");
    assert.ok(updated.neoantigenRanking, "ranking should be on record");
    assert.equal(updated.neoantigenRanking!.rankedCandidates.length, 2);

    const retrieved = await store.getNeoantigenRanking(caseRec.caseId);
    assert.ok(retrieved, "should retrieve ranking");
    assert.equal(retrieved!.caseId, caseRec.caseId);
    assert.equal(retrieved!.rankedCandidates[0].candidateId, "neo-top");
  });

  it("recordNeoantigenRanking appends provenance trail entries", async () => {
    const store = new MemoryCaseStore();
    const caseRec = await store.createCase({
      caseProfile: {
        patientKey: "PAT-STORE-003",
        indication: "melanoma",
        protocolVersion: "1.0",
        siteId: "SITE-C",
        consentStatus: "complete",
      },
    }, "corr-8c-3");

    const ranking = buildRanking(caseRec.caseId);
    const updated = await store.recordNeoantigenRanking(caseRec.caseId, ranking, "corr-rank-provenance");

    const latestAudit = updated.auditEvents[updated.auditEvents.length - 1];
    assert.equal(latestAudit.type, "candidate.rank-generated");
    assert.equal(latestAudit.correlationId, "corr-rank-provenance");
    assert.equal(latestAudit.occurredAt, ranking.rankedAt);
    assert.match(latestAudit.detail, /2 ranked candidates/i);

    const latestTimeline = updated.timeline[updated.timeline.length - 1];
    assert.equal(latestTimeline.type, "candidate_rank_generated");
    assert.equal(latestTimeline.at, ranking.rankedAt);
    assert.match(latestTimeline.detail, /weighted-sum/i);
  });

  it("getNeoantigenRanking returns null when no ranking recorded", async () => {
    const store = new MemoryCaseStore();
    const caseRec = await store.createCase({
      caseProfile: {
        patientKey: "PAT-STORE-002",
        indication: "lung",
        protocolVersion: "1.0",
        siteId: "SITE-B",
        consentStatus: "complete",
      },
    }, "corr-8c-2");
    const result = await store.getNeoantigenRanking(caseRec.caseId);
    assert.equal(result, null);
  });

  it("board packet includes ranking when present", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store, workflowRunner: new FakeWorkflowRunner() , rbacAllowAll: true, consentGateEnabled: false });
    const caseId = await createReviewReadyCaseForRanking(app);

    // Record ranking directly on the store
    const ranking = buildRanking(caseId);
    await store.recordNeoantigenRanking(caseId, ranking, "corr-board");

    // Generate board packet via API
    const genRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
    assert.equal(genRes.status, 201, `Expected 201 but got ${genRes.status}: ${JSON.stringify(genRes.body)}`);
    const packetId = genRes.body.packet.packetId;

    // Retrieve full board packet
    const getRes = await request(app).get(`/api/cases/${caseId}/board-packets/${packetId}`);
    assert.equal(getRes.status, 200);
    const snapshot = getRes.body.packet.snapshot;
    assert.ok(snapshot.neoantigenRanking, "board packet should include ranking");
    assert.equal(snapshot.neoantigenRanking.rankedCandidates.length, 2);
    assert.equal(snapshot.neoantigenRanking.rankedCandidates[0].candidateId, "neo-top");
    assert.equal(snapshot.neoantigenRanking.ensembleMethod, "weighted-sum");
    assert.ok(snapshot.neoantigenRanking.confidenceInterval.lower < snapshot.neoantigenRanking.confidenceInterval.upper);
  });

  it("board packet omits ranking when not recorded", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store, workflowRunner: new FakeWorkflowRunner() , rbacAllowAll: true, consentGateEnabled: false });
    const caseId = await createReviewReadyCaseForRanking(app);

    // Generate board packet WITHOUT ranking
    const genRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
    assert.equal(genRes.status, 201, `Expected 201 but got ${genRes.status}: ${JSON.stringify(genRes.body)}`);
    const packetId = genRes.body.packet.packetId;

    const getRes = await request(app).get(`/api/cases/${caseId}/board-packets/${packetId}`);
    assert.equal(getRes.status, 200);
    const snapshot = getRes.body.packet.snapshot;
    assert.equal(snapshot.neoantigenRanking, undefined, "no ranking recorded в†’ omitted from packet");
  });

  it("ranking evidence decomposition shows per-candidate feature scores", async () => {
    const store = new MemoryCaseStore();
    const app = createApp({ store, workflowRunner: new FakeWorkflowRunner() , rbacAllowAll: true, consentGateEnabled: false });
    const caseId = await createReviewReadyCaseForRanking(app);

    const ranking = buildRanking(caseId);
    await store.recordNeoantigenRanking(caseId, ranking, "corr-decomp");

    const genRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
    const packetId = genRes.body.packet.packetId;
    const getRes = await request(app).get(`/api/cases/${caseId}/board-packets/${packetId}`);
    const candidates = getRes.body.packet.snapshot.neoantigenRanking.rankedCandidates;

    for (const c of candidates) {
      assert.ok(c.featureScores, `${c.candidateId} missing featureScores`);
      assert.ok(c.featureWeights, `${c.candidateId} missing featureWeights`);
      assert.ok(c.explanation.length > 0, `${c.candidateId} missing explanation`);
      assert.ok(typeof c.uncertaintyContribution === "number", `${c.candidateId} missing uncertainty`);
    }
  });
});
