import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { MemoryCaseStore } from "../src/store";
import { InMemoryReferenceBundleRegistry } from "../src/adapters/InMemoryReferenceBundleRegistry";
import { InMemoryHlaConsensusProvider } from "../src/adapters/InMemoryHlaConsensusProvider";
import type { IWorkflowRunner, WorkflowRunRequest } from "../src/ports/IWorkflowRunner";
import type {
  DerivedArtifactSemanticType,
  HlaDisagreementRecord,
  ReferenceBundleManifest,
  WorkflowRunRecord,
} from "../src/types";
import { parseRegisterBundleInput } from "../src/store";

// ─── Helpers ────────────────────────────────────────────────────────

function buildCaseInput(overrides: Record<string, unknown> = {}) {
  return {
    caseProfile: {
      patientKey: "pt-wave6",
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
    sampleId: `${sampleType.toLowerCase()}-wave6`,
    sampleType,
    assayType,
    accessionId: `acc-${sampleType.toLowerCase()}`,
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
    semanticType: semanticTypeBySampleType[sample.sampleType] ?? "source-fastq",
    schemaVersion: 1,
    artifactHash: `sha256:${sample.sampleId}-hash`,
    storageUri: `artifact://${sample.sampleId}-fastq`,
    mediaType: "application/gzip",
  };
}

class FakeWorkflowRunner implements IWorkflowRunner {
  private runs = new Map<string, WorkflowRunRecord>();

  startRun(input: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    const rec: WorkflowRunRecord = {
      runId: input.runId,
      caseId: input.caseId,
      requestId: input.requestId,
      status: "RUNNING",
      workflowName: input.workflowName,
      referenceBundleId: input.referenceBundleId,
      executionProfile: input.executionProfile,
      startedAt: new Date().toISOString(),
    };
    this.runs.set(input.runId, rec);
    return Promise.resolve(rec);
  }
  getRun(runId: string): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Run ${runId} not found`);
    return Promise.resolve(r);
  }
  listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]> {
    return Promise.resolve([...this.runs.values()].filter((r) => r.caseId === caseId));
  }
  completeRun(runId: string, derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Run ${runId} not found`);
    r.status = "COMPLETED";
    r.completedAt = new Date().toISOString();
    return Promise.resolve(r);
  }
  failRun(runId: string, reason: string): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Run ${runId} not found`);
    r.status = "FAILED";
    r.completedAt = new Date().toISOString();
    return Promise.resolve(r);
  }
  cancelRun(runId: string): Promise<WorkflowRunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Run ${runId} not found`);
    r.status = "CANCELLED";
    r.completedAt = new Date().toISOString();
    return Promise.resolve(r);
  }
}

async function createReviewReadyCase(app: ReturnType<typeof createApp>, caseId?: string): Promise<string> {
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  assert.equal(createRes.status, 201);
  const id = String(createRes.body.case.caseId);

  const samples = [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];
  for (const sample of samples) {
    await request(app).post(`/api/cases/${id}/samples`).send(sample);
  }
  for (const sample of samples) {
    await request(app).post(`/api/cases/${id}/artifacts`).send(buildSourceArtifact(sample));
  }

  await request(app).post(`/api/cases/${id}/workflows`).send({
    workflowName: "neoantigen-v1",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
  });

  const caseAfterReq = await request(app).get(`/api/cases/${id}`);
  const latestRequest = caseAfterReq.body.case.workflowRequests.at(-1);
  const runId = `run-wave6-${Date.now()}`;

  await request(app)
    .post(`/api/cases/${id}/runs/${runId}/start`)
    .send({ runId, manifest: undefined });

  const derivedArtifacts: Array<{
    semanticType: DerivedArtifactSemanticType;
    artifactHash: string;
    producingStep: string;
  }> = [
    { semanticType: "somatic-vcf", artifactHash: "sha256:derived1", producingStep: "variant-calling" },
  ];

  await request(app)
    .post(`/api/cases/${id}/runs/${runId}/complete`)
    .send({ derivedArtifacts });

  await request(app)
    .post(`/api/cases/${id}/hla-consensus`)
    .send({
      alleles: ["HLA-A*02:01", "HLA-B*07:02"],
      perToolEvidence: [
        { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 },
      ],
      confidenceScore: 0.95,
      referenceVersion: "IMGT/HLA 3.55.0",
    });

  await request(app)
    .post(`/api/cases/${id}/runs/${runId}/qc`)
    .send({
      results: [
        { metric: "tumor_purity", value: 0.65, threshold: 0.2, pass: true, notes: "Clean" },
      ],
    });

  return id;
}

// ─── 6.A: Rich reference bundle model ───────────────────────────────

test("6.A registerBundle registers a new bundle via POST /api/reference-bundles", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const bundle = {
    bundleId: "GRCh38-custom",
    genomeAssembly: "GRCh38",
    annotationVersion: "GENCODE v45",
    knownSitesVersion: "dbSNP 157",
    hlaDatabaseVersion: "IMGT/HLA 3.56.0",
    frozenAt: "2026-03-01T00:00:00.000Z",
    transcriptSet: "MANE_Select_v2.0",
    callerBundleVersion: "gatk-4.6.1",
    pipelineRevision: "rev-2026a",
  };

  const res = await request(app).post("/api/reference-bundles").send(bundle);
  assert.equal(res.status, 201);
  assert.equal(res.body.bundle.bundleId, "GRCh38-custom");
  assert.equal(res.body.bundle.transcriptSet, "MANE_Select_v2.0");
  assert.equal(res.body.bundle.callerBundleVersion, "gatk-4.6.1");
  assert.equal(res.body.bundle.pipelineRevision, "rev-2026a");
});

test("6.A registerBundle with retrievalProvenance stores provenance", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const bundle = {
    bundleId: "GRCh38-provenance",
    genomeAssembly: "GRCh38",
    annotationVersion: "GENCODE v45",
    knownSitesVersion: "dbSNP 157",
    hlaDatabaseVersion: "IMGT/HLA 3.56.0",
    frozenAt: "2026-03-01T00:00:00.000Z",
    retrievalProvenance: {
      uri: "s3://ref-bundles/GRCh38-provenance.tar.gz",
      retrievedAt: "2026-03-01T12:00:00.000Z",
      integrityHash: "sha256:abc123",
    },
  };

  const res = await request(app).post("/api/reference-bundles").send(bundle);
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.bundle.retrievalProvenance, bundle.retrievalProvenance);
});

test("6.A registerBundle rejects duplicate bundleId", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  // GRCh38-2026a is a default bundle
  const duplicate = {
    bundleId: "GRCh38-2026a",
    genomeAssembly: "GRCh38",
    annotationVersion: "GENCODE v44",
    knownSitesVersion: "dbSNP 156",
    hlaDatabaseVersion: "IMGT/HLA 3.55.0",
    frozenAt: "2026-01-15T00:00:00.000Z",
  };

  const res = await request(app).post("/api/reference-bundles").send(duplicate);
  assert.equal(res.status, 500); // Internal error from adapter
});

test("6.A registerBundle validates required fields", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const res = await request(app).post("/api/reference-bundles").send({ bundleId: "incomplete" });
  assert.ok(res.status >= 400 && res.status < 500);
});

test("6.A registered bundle appears in GET /api/reference-bundles", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  await request(app).post("/api/reference-bundles").send({
    bundleId: "GRCh38-new",
    genomeAssembly: "GRCh38",
    annotationVersion: "GENCODE v45",
    knownSitesVersion: "dbSNP 157",
    hlaDatabaseVersion: "IMGT/HLA 3.56.0",
    frozenAt: "2026-03-01T00:00:00.000Z",
  });

  const listRes = await request(app).get("/api/reference-bundles");
  assert.equal(listRes.status, 200);
  const ids = listRes.body.bundles.map((b: { bundleId: string }) => b.bundleId);
  assert.ok(ids.includes("GRCh38-new"));
  assert.ok(ids.includes("GRCh38-2026a")); // default still there
});

test("6.A parseRegisterBundleInput rejects extra fields (strict mode)", () => {
  assert.throws(
    () =>
      parseRegisterBundleInput({
        bundleId: "test",
        genomeAssembly: "GRCh38",
        annotationVersion: "v44",
        knownSitesVersion: "v156",
        hlaDatabaseVersion: "v3.55",
        frozenAt: "2026-01-01",
        unexpectedField: "surprise",
      }),
    (err: Error) => err.message.includes("Unrecognized"),
  );
});

test("6.A ReferenceBundleManifest new optional fields default to undefined", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const getRes = await request(app).get("/api/reference-bundles/GRCh38-2026a");
  assert.equal(getRes.status, 200);
  // Default bundles don't have the new fields
  assert.equal(getRes.body.bundle.transcriptSet, undefined);
  assert.equal(getRes.body.bundle.callerBundleVersion, undefined);
  assert.equal(getRes.body.bundle.pipelineRevision, undefined);
  assert.equal(getRes.body.bundle.retrievalProvenance, undefined);
});

// ─── 6.B: Multi-tool HLA evidence ───────────────────────────────────

test("6.B consensus with single tool produces no disagreements", async () => {
  const provider = new InMemoryHlaConsensusProvider();
  const result = await provider.produceConsensus(
    "case-single",
    [{ toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 }],
    "IMGT/HLA 3.55.0",
  );

  assert.equal(result.disagreements, undefined);
  assert.deepEqual(result.confidenceDecomposition, { OptiType: 0.95 });
});

test("6.B consensus with two agreeing tools has no disagreements", async () => {
  const provider = new InMemoryHlaConsensusProvider();
  const result = await provider.produceConsensus(
    "case-agree",
    [
      { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 },
      { toolName: "HLA-HD", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.92 },
    ],
    "IMGT/HLA 3.55.0",
  );

  assert.equal(result.disagreements, undefined);
  assert.deepEqual(result.confidenceDecomposition, { OptiType: 0.95, "HLA-HD": 0.92 });
});

test("6.B consensus with two disagreeing tools detects disagreement", async () => {
  const provider = new InMemoryHlaConsensusProvider();
  const result = await provider.produceConsensus(
    "case-disagree",
    [
      { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 },
      { toolName: "HLA-HD", alleles: ["HLA-A*02:01", "HLA-B*08:01"], confidence: 0.88 },
    ],
    "IMGT/HLA 3.55.0",
  );

  assert.ok(result.disagreements);
  assert.equal(result.disagreements.length, 1);
  assert.equal(result.disagreements[0].locus, "HLA-B");
  assert.equal(result.disagreements[0].toolA, "OptiType");
  assert.equal(result.disagreements[0].toolAAllele, "HLA-B*07:02");
  assert.equal(result.disagreements[0].toolB, "HLA-HD");
  assert.equal(result.disagreements[0].toolBAllele, "HLA-B*08:01");
  assert.equal(result.disagreements[0].resolution, "unresolved");
});

test("6.B three-tool majority resolves disagreements", async () => {
  const provider = new InMemoryHlaConsensusProvider();
  const result = await provider.produceConsensus(
    "case-majority",
    [
      { toolName: "OptiType", alleles: ["HLA-A*02:01"], confidence: 0.95 },
      { toolName: "HLA-HD", alleles: ["HLA-A*03:01"], confidence: 0.88 },
      { toolName: "xHLA", alleles: ["HLA-A*02:01"], confidence: 0.91 },
    ],
    "IMGT/HLA 3.55.0",
  );

  assert.ok(result.disagreements);
  // HLA-HD disagrees with both OptiType and xHLA
  const disagreements = result.disagreements.filter((d) => d.locus === "HLA-A");
  assert.ok(disagreements.length >= 1);
  // With 3 tools, majority should be resolvable
  const resolved = disagreements.filter((d) => d.resolution === "majority");
  assert.ok(resolved.length >= 1, "At least one disagreement resolved by majority");
});

test("6.B confidenceDecomposition reflects per-tool confidence", async () => {
  const provider = new InMemoryHlaConsensusProvider();
  const result = await provider.produceConsensus(
    "case-decomp",
    [
      { toolName: "OptiType", alleles: ["HLA-A*02:01"], confidence: 0.95 },
      { toolName: "HLA-HD", alleles: ["HLA-A*02:01"], confidence: 0.80 },
      { toolName: "xHLA", alleles: ["HLA-A*02:01"], confidence: 0.88 },
    ],
    "IMGT/HLA 3.55.0",
  );

  assert.deepEqual(result.confidenceDecomposition, {
    OptiType: 0.95,
    "HLA-HD": 0.80,
    xHLA: 0.88,
  });
  // Average confidence check
  assert.ok(Math.abs(result.confidenceScore - 0.877) < 0.01);
});

test("6.B consensus via HTTP roundtrip preserves disagreements", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  // Record multi-tool consensus with disagreement via HTTP
  const hlRes = await request(app)
    .post(`/api/cases/${caseId}/hla-consensus`)
    .send({
      alleles: ["HLA-A*02:01", "HLA-B*07:02", "HLA-B*08:01"],
      perToolEvidence: [
        { toolName: "OptiType", alleles: ["HLA-A*02:01", "HLA-B*07:02"], confidence: 0.95 },
        { toolName: "HLA-HD", alleles: ["HLA-A*02:01", "HLA-B*08:01"], confidence: 0.88 },
      ],
      confidenceScore: 0.915,
      referenceVersion: "IMGT/HLA 3.55.0",
    });
  assert.equal(hlRes.status, 200);

  const getRes = await request(app).get(`/api/cases/${caseId}/hla-consensus`);
  assert.equal(getRes.status, 200);
  assert.ok(getRes.body.consensus.perToolEvidence.length >= 2);
});

// ─── 6.C: Board packet bundle & HLA audit ───────────────────────────

test("6.C board packet includes hlaToolBreakdown when evidence exists", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
  assert.equal(packetRes.status, 201);

  const snapshot = packetRes.body.packet.snapshot;
  assert.ok(snapshot.hlaToolBreakdown);
  assert.ok(Array.isArray(snapshot.hlaToolBreakdown));
  assert.ok(snapshot.hlaToolBreakdown.length >= 1);
  assert.equal(snapshot.hlaToolBreakdown[0].toolName, "OptiType");
});

test("6.C board packet hlaDisagreements is undefined when tools agree", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
  assert.equal(packetRes.status, 201);

  const snapshot = packetRes.body.packet.snapshot;
  // createReviewReadyCase uses single tool → no disagreements
  assert.equal(snapshot.hlaDisagreements, undefined);
});

test("6.C board packet bundleRetrievalProvenance is undefined when bundles lack provenance", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
  assert.equal(packetRes.status, 201);

  const snapshot = packetRes.body.packet.snapshot;
  // Default GRCh38-2026a bundle has no retrievalProvenance
  assert.equal(snapshot.bundleRetrievalProvenance, undefined);
});

test("6.C board packet includes bundleRetrievalProvenance when bundle has provenance", async () => {
  const registry = new InMemoryReferenceBundleRegistry();
  await registry.registerBundle({
    bundleId: "GRCh38-prov",
    genomeAssembly: "GRCh38",
    annotationVersion: "GENCODE v44",
    knownSitesVersion: "dbSNP 156",
    hlaDatabaseVersion: "IMGT/HLA 3.55.0",
    frozenAt: "2026-01-15T00:00:00.000Z",
    retrievalProvenance: {
      uri: "s3://ref-bundles/GRCh38-prov.tar.gz",
      retrievedAt: "2026-01-15T12:00:00.000Z",
      integrityHash: "sha256:provhash",
    },
  });

  const app = createApp({
    workflowRunner: new FakeWorkflowRunner(),
    referenceBundleRegistry: registry,
  });

  // Create case and use the provenance-enabled bundle
  const createRes = await request(app).post("/api/cases").send(buildCaseInput());
  const caseId = String(createRes.body.case.caseId);

  const samples = [
    buildSample("TUMOR_DNA", "WES"),
    buildSample("NORMAL_DNA", "WES"),
    buildSample("TUMOR_RNA", "RNA_SEQ"),
  ];
  for (const s of samples) {
    await request(app).post(`/api/cases/${caseId}/samples`).send(s);
  }
  for (const s of samples) {
    await request(app).post(`/api/cases/${caseId}/artifacts`).send(buildSourceArtifact(s));
  }

  await request(app).post(`/api/cases/${caseId}/workflows`).send({
    workflowName: "neoantigen-v1",
    referenceBundleId: "GRCh38-prov",
    executionProfile: "standard",
  });

  const runId = `run-prov-${Date.now()}`;
  await request(app).post(`/api/cases/${caseId}/runs/${runId}/start`).send({ runId });

  await request(app).post(`/api/cases/${caseId}/runs/${runId}/complete`).send({
    derivedArtifacts: [
      { semanticType: "somatic-vcf", artifactHash: "sha256:d1", producingStep: "vc" },
    ],
  });

  await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
    alleles: ["HLA-A*02:01"],
    perToolEvidence: [{ toolName: "OptiType", alleles: ["HLA-A*02:01"], confidence: 0.95 }],
    confidenceScore: 0.95,
    referenceVersion: "IMGT/HLA 3.55.0",
  });

  await request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`).send({
    results: [{ metric: "tumor_purity", value: 0.65, threshold: 0.2, pass: true }],
  });

  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
  assert.equal(packetRes.status, 201);

  const snapshot = packetRes.body.packet.snapshot;
  assert.ok(snapshot.bundleRetrievalProvenance);
  assert.equal(snapshot.bundleRetrievalProvenance.length, 1);
  assert.equal(snapshot.bundleRetrievalProvenance[0].uri, "s3://ref-bundles/GRCh38-prov.tar.gz");
  assert.equal(snapshot.bundleRetrievalProvenance[0].integrityHash, "sha256:provhash");
});

test("6.C existing board packet tests still pass (backward compat check)", async () => {
  const app = createApp({ workflowRunner: new FakeWorkflowRunner() });
  const caseId = await createReviewReadyCase(app);

  const packetRes = await request(app).post(`/api/cases/${caseId}/board-packets`);
  assert.equal(packetRes.status, 201);

  const snapshot = packetRes.body.packet.snapshot;
  // Core fields from pre-Wave 6 still present
  assert.ok(snapshot.caseSummary);
  assert.ok(snapshot.workflowRuns);
  assert.ok(snapshot.pinnedReferenceBundles);
  assert.ok(snapshot.derivedArtifacts);
  assert.ok(snapshot.hlaConsensus);
  assert.ok(snapshot.latestQcGate);
});

// ─── Adapter unit tests ─────────────────────────────────────────────

test("InMemoryReferenceBundleRegistry registerBundle stores and retrieves", async () => {
  const registry = new InMemoryReferenceBundleRegistry([]);
  const bundle: ReferenceBundleManifest = {
    bundleId: "test-bundle",
    genomeAssembly: "GRCh38",
    annotationVersion: "v44",
    knownSitesVersion: "v156",
    hlaDatabaseVersion: "v3.55",
    frozenAt: "2026-01-01",
    transcriptSet: "MANE_Select",
    retrievalProvenance: {
      uri: "s3://test",
      retrievedAt: "2026-01-01T00:00:00Z",
      integrityHash: "sha256:test",
    },
  };

  const result = await registry.registerBundle(bundle);
  assert.deepEqual(result, bundle);

  const fetched = await registry.getBundle("test-bundle");
  assert.deepEqual(fetched, bundle);

  const list = await registry.listBundles();
  assert.equal(list.length, 1);
});

test("InMemoryReferenceBundleRegistry registerBundle rejects duplicate", async () => {
  const registry = new InMemoryReferenceBundleRegistry();
  // GRCh38-2026a is a default bundle
  await assert.rejects(
    () =>
      registry.registerBundle({
        bundleId: "GRCh38-2026a",
        genomeAssembly: "GRCh38",
        annotationVersion: "v44",
        knownSitesVersion: "v156",
        hlaDatabaseVersion: "v3.55",
        frozenAt: "2026-01-01",
      }),
    /already registered/,
  );
});

test("InMemoryHlaConsensusProvider detects no disagreements with empty input", async () => {
  const provider = new InMemoryHlaConsensusProvider();
  const result = await provider.produceConsensus("empty", [], "v3.55");
  assert.equal(result.disagreements, undefined);
  assert.equal(result.confidenceDecomposition, undefined);
  assert.equal(result.alleles.length, 0);
});
