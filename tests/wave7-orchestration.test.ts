import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { MemoryCaseStore, buildEvidenceLineage } from "../src/store";

import { InMemoryWorkflowOrchestrator } from "../src/adapters/InMemoryWorkflowOrchestrator";
import type { IWorkflowRunner, WorkflowRunRequest } from "../src/ports/IWorkflowRunner";
import type {
  DerivedArtifactSemanticType,
  RunArtifact,
  WellKnownWorkflowName,
  WorkflowRunRecord,
} from "../src/types";
import {
  wellKnownWorkflowNames,
  workflowArtifactContract,
  workflowDependencies,
} from "../src/types";

// ─── FakeWorkflowRunner ─────────────────────────────────────────────

class FakeWorkflowRunner implements IWorkflowRunner {
  private runs = new Map<string, WorkflowRunRecord>();
  public startedOrder: string[] = [];

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
    this.startedOrder.push(input.workflowName);
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

  completeRun(
    runId: string,
    derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>,
  ): Promise<WorkflowRunRecord> {
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

// ─── FailingWorkflowRunner: always fails startRun for a given workflow ─────

class FailingWorkflowRunner extends FakeWorkflowRunner {
  constructor(private failOn: string) {
    super();
  }
  override startRun(input: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    if (input.workflowName === this.failOn) {
      return Promise.reject(new Error(`Simulated failure for ${this.failOn}`));
    }
    return super.startRun(input);
  }
}

// ─── HTTP Helpers ───────────────────────────────────────────────────

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-wave7",
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
    sampleId: `${sampleType.toLowerCase()}-wave7`,
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

// ─── 7.A: Well-known workflow names ─────────────────────────────────

test("Wave 7.A: well-known workflow names", async (t) => {
  await t.test("wellKnownWorkflowNames contains the expected 6 workflows", () => {
    assert.deepStrictEqual(
      [...wellKnownWorkflowNames],
      ["dna-qc", "somatic-calling", "annotation", "expression-support", "hla-typing", "combined-evidence"],
    );
  });

  await t.test("every well-known workflow has an artifact contract", () => {
    for (const wf of wellKnownWorkflowNames) {
      assert.ok(
        Array.isArray(workflowArtifactContract[wf]),
        `Missing artifact contract for ${wf}`,
      );
      assert.ok(
        workflowArtifactContract[wf].length > 0,
        `Empty artifact contract for ${wf}`,
      );
    }
  });

  await t.test("every well-known workflow has a dependency entry", () => {
    for (const wf of wellKnownWorkflowNames) {
      assert.ok(
        Array.isArray(workflowDependencies[wf]),
        `Missing dependency entry for ${wf}`,
      );
    }
  });

  await t.test("workflowDependencies forms a valid DAG (no cycles)", () => {
    // Verify topological sort is possible: traverse and detect cycles
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function dfs(node: string): boolean {
      if (visiting.has(node)) return false; // cycle
      if (visited.has(node)) return true;
      visiting.add(node);
      const deps = (workflowDependencies as Record<string, readonly string[]>)[node] ?? [];
      for (const dep of deps) {
        if (!dfs(dep)) return false;
      }
      visiting.delete(node);
      visited.add(node);
      return true;
    }

    for (const wf of wellKnownWorkflowNames) {
      assert.ok(dfs(wf), `Cycle detected involving ${wf}`);
    }
  });

  await t.test("dna-qc has no dependencies (root workflow)", () => {
    assert.deepStrictEqual([...workflowDependencies["dna-qc"]], []);
  });

  await t.test("combined-evidence depends on annotation, expression-support, and hla-typing", () => {
    const deps = [...workflowDependencies["combined-evidence"]];
    assert.ok(deps.includes("annotation"));
    assert.ok(deps.includes("expression-support"));
    assert.ok(deps.includes("hla-typing"));
  });

  await t.test("somatic-calling depends on dna-qc", () => {
    assert.ok(workflowDependencies["somatic-calling"].includes("dna-qc"));
  });
});

// ─── 7.B: Orchestrator plan() ───────────────────────────────────────

test("Wave 7.B: orchestrator plan — topological ordering", async (t) => {
  const runner = new FakeWorkflowRunner();
  const orchestrator = new InMemoryWorkflowOrchestrator(runner, "GRCh38-2026a", "standard");

  await t.test("plan() includes all 6 workflows when no filter given", () => {
    const plan = orchestrator.plan("case-1");
    assert.equal(plan.caseId, "case-1");
    assert.equal(plan.steps.length, 6);
    const names = plan.steps.map((s) => s.workflowName);
    for (const wf of wellKnownWorkflowNames) {
      assert.ok(names.includes(wf), `Missing ${wf} in plan`);
    }
  });

  await t.test("plan() respects dependency ordering: dna-qc before somatic-calling", () => {
    const plan = orchestrator.plan("case-1");
    const names = plan.steps.map((s) => s.workflowName);
    assert.ok(names.indexOf("dna-qc") < names.indexOf("somatic-calling"));
  });

  await t.test("plan() respects dependency ordering: somatic-calling before annotation", () => {
    const plan = orchestrator.plan("case-1");
    const names = plan.steps.map((s) => s.workflowName);
    assert.ok(names.indexOf("somatic-calling") < names.indexOf("annotation"));
  });

  await t.test("plan() respects dependency ordering: all 3 deps before combined-evidence", () => {
    const plan = orchestrator.plan("case-1");
    const names = plan.steps.map((s) => s.workflowName);
    const ceIdx = names.indexOf("combined-evidence");
    assert.ok(names.indexOf("annotation") < ceIdx);
    assert.ok(names.indexOf("expression-support") < ceIdx);
    assert.ok(names.indexOf("hla-typing") < ceIdx);
  });

  await t.test("plan() with subset filter only includes requested workflows", () => {
    const plan = orchestrator.plan("case-2", ["dna-qc", "somatic-calling"]);
    assert.equal(plan.steps.length, 2);
    const names = plan.steps.map((s) => s.workflowName);
    assert.deepStrictEqual(names, ["dna-qc", "somatic-calling"]);
  });

  await t.test("plan() steps include correct dependsOn arrays", () => {
    const plan = orchestrator.plan("case-1");
    const ceStep = plan.steps.find((s) => s.workflowName === "combined-evidence");
    assert.ok(ceStep);
    assert.ok(ceStep.dependsOn.includes("annotation"));
    assert.ok(ceStep.dependsOn.includes("expression-support"));
    assert.ok(ceStep.dependsOn.includes("hla-typing"));

    const dnaQcStep = plan.steps.find((s) => s.workflowName === "dna-qc");
    assert.ok(dnaQcStep);
    assert.deepStrictEqual(dnaQcStep.dependsOn, []);
  });
});

// ─── 7.B: Orchestrator execute() ────────────────────────────────────

test("Wave 7.B: orchestrator execute — all workflows succeed", async (t) => {
  const runner = new FakeWorkflowRunner();
  const orchestrator = new InMemoryWorkflowOrchestrator(runner, "GRCh38-2026a", "standard");

  await t.test("execute() completes all 6 workflows", async () => {
    const plan = orchestrator.plan("case-exec-1");
    const result = await orchestrator.execute(plan);
    assert.equal(result.caseId, "case-exec-1");
    assert.equal(result.overallStatus, "COMPLETED");
    assert.equal(result.results.length, 6);
    for (const r of result.results) {
      assert.equal(r.status, "COMPLETED", `Expected ${r.workflowName} to be COMPLETED`);
      assert.ok(r.runId.startsWith("run_"), `Expected valid runId for ${r.workflowName}`);
    }
  });

  await t.test("runner received runs in topological order", () => {
    const order = runner.startedOrder;
    assert.ok(order.indexOf("dna-qc") < order.indexOf("somatic-calling"));
    assert.ok(order.indexOf("somatic-calling") < order.indexOf("annotation"));
    assert.ok(order.indexOf("annotation") < order.indexOf("combined-evidence"));
    assert.ok(order.indexOf("expression-support") < order.indexOf("combined-evidence"));
    assert.ok(order.indexOf("hla-typing") < order.indexOf("combined-evidence"));
  });
});

test("Wave 7.B: orchestrator execute — failure cascades to skip", async (t) => {
  await t.test("dna-qc failure skips downstream somatic-calling, annotation, combined-evidence", async () => {
    const runner = new FailingWorkflowRunner("dna-qc");
    const orchestrator = new InMemoryWorkflowOrchestrator(runner, "GRCh38-2026a", "standard");
    const plan = orchestrator.plan("case-fail-1");
    const result = await orchestrator.execute(plan);

    assert.equal(result.overallStatus, "PARTIAL");
    const statusMap = new Map(result.results.map((r) => [r.workflowName, r.status]));
    assert.equal(statusMap.get("dna-qc"), "FAILED");
    assert.equal(statusMap.get("somatic-calling"), "SKIPPED");
    assert.equal(statusMap.get("annotation"), "SKIPPED");
    // expression-support and hla-typing are independent
    assert.equal(statusMap.get("expression-support"), "COMPLETED");
    assert.equal(statusMap.get("hla-typing"), "COMPLETED");
    // combined-evidence depends on annotation (skipped) so it too is skipped
    assert.equal(statusMap.get("combined-evidence"), "SKIPPED");
  });

  await t.test("annotation failure skips only combined-evidence", async () => {
    const runner = new FailingWorkflowRunner("annotation");
    const orchestrator = new InMemoryWorkflowOrchestrator(runner, "GRCh38-2026a", "standard");
    const plan = orchestrator.plan("case-fail-2");
    const result = await orchestrator.execute(plan);

    assert.equal(result.overallStatus, "PARTIAL");
    const statusMap = new Map(result.results.map((r) => [r.workflowName, r.status]));
    assert.equal(statusMap.get("dna-qc"), "COMPLETED");
    assert.equal(statusMap.get("somatic-calling"), "COMPLETED");
    assert.equal(statusMap.get("annotation"), "FAILED");
    assert.equal(statusMap.get("expression-support"), "COMPLETED");
    assert.equal(statusMap.get("hla-typing"), "COMPLETED");
    assert.equal(statusMap.get("combined-evidence"), "SKIPPED");
  });

  await t.test("subset plan with only dna-qc: failure => FAILED overall", async () => {
    const runner = new FailingWorkflowRunner("dna-qc");
    const orchestrator = new InMemoryWorkflowOrchestrator(runner, "GRCh38-2026a", "standard");
    const plan = orchestrator.plan("case-fail-3", ["dna-qc"]);
    const result = await orchestrator.execute(plan);

    assert.equal(result.overallStatus, "FAILED");
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, "FAILED");
    assert.ok(result.results[0].failureReason);
  });
});

// ─── 7.C: Evidence lineage — unit tests for buildEvidenceLineage ────

test("Wave 7.C: buildEvidenceLineage with dependency chain", async (t) => {
  const dnaQcRun: WorkflowRunRecord = {
    runId: "run-dna-qc",
    caseId: "case-1",
    requestId: "req-1",
    workflowName: "dna-qc",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
    status: "COMPLETED",
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T01:00:00Z",
  };

  const somaticRun: WorkflowRunRecord = {
    runId: "run-somatic",
    caseId: "case-1",
    requestId: "req-2",
    workflowName: "somatic-calling",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
    status: "COMPLETED",
    startedAt: "2026-01-01T01:00:00Z",
    completedAt: "2026-01-01T02:00:00Z",
  };

  const annotationRun: WorkflowRunRecord = {
    runId: "run-annotation",
    caseId: "case-1",
    requestId: "req-3",
    workflowName: "annotation",
    referenceBundleId: "GRCh38-2026a",
    executionProfile: "standard",
    status: "COMPLETED",
    startedAt: "2026-01-01T02:00:00Z",
    completedAt: "2026-01-01T03:00:00Z",
  };

  const artifacts: RunArtifact[] = [
    {
      artifactId: "art-qc-1",
      runId: "run-dna-qc",
      artifactClass: "DERIVED" as const,
      semanticType: "qc-summary-json",
      artifactHash: "sha256:qc1",
      producingStep: "dna-qc",
      registeredAt: "2026-01-01T01:00:00Z",
    },
    {
      artifactId: "art-vcf-1",
      runId: "run-somatic",
      artifactClass: "DERIVED" as const,
      semanticType: "somatic-vcf",
      artifactHash: "sha256:vcf1",
      producingStep: "somatic-calling",
      registeredAt: "2026-01-01T02:00:00Z",
    },
    {
      artifactId: "art-ann-1",
      runId: "run-annotation",
      artifactClass: "DERIVED" as const,
      semanticType: "annotated-vcf",
      artifactHash: "sha256:ann1",
      producingStep: "annotation",
      registeredAt: "2026-01-01T03:00:00Z",
    },
  ];

  await t.test("builds edges from dna-qc to somatic-calling", () => {
    const lineage = buildEvidenceLineage([dnaQcRun, somaticRun], artifacts.slice(0, 2));
    const edge = lineage.edges.find(
      (e) => e.producerWorkflow === "dna-qc" && e.consumerWorkflow === "somatic-calling",
    );
    assert.ok(edge, "should have edge from dna-qc to somatic-calling");
    assert.equal(edge.producerRunId, "run-dna-qc");
    assert.equal(edge.consumerRunId, "run-somatic");
    assert.equal(edge.semanticType, "qc-summary-json");
    assert.equal(edge.artifactId, "art-qc-1");
  });

  await t.test("builds full chain: dna-qc → somatic → annotation", () => {
    const lineage = buildEvidenceLineage([dnaQcRun, somaticRun, annotationRun], artifacts);
    // dna-qc → somatic-calling (qc-summary-json)
    const edge1 = lineage.edges.find(
      (e) => e.producerWorkflow === "dna-qc" && e.consumerWorkflow === "somatic-calling",
    );
    assert.ok(edge1);
    // somatic-calling → annotation (somatic-vcf)
    const edge2 = lineage.edges.find(
      (e) => e.producerWorkflow === "somatic-calling" && e.consumerWorkflow === "annotation",
    );
    assert.ok(edge2);
    assert.equal(edge2.semanticType, "somatic-vcf");
  });

  await t.test("identifies roots correctly (dna-qc has no upstream)", () => {
    const lineage = buildEvidenceLineage([dnaQcRun, somaticRun, annotationRun], artifacts);
    assert.ok(lineage.roots.includes("run-dna-qc"));
    assert.ok(!lineage.roots.includes("run-somatic"));
    assert.ok(!lineage.roots.includes("run-annotation"));
  });

  await t.test("identifies terminal correctly (annotation has no downstream)", () => {
    const lineage = buildEvidenceLineage([dnaQcRun, somaticRun, annotationRun], artifacts);
    assert.ok(lineage.terminal.includes("run-annotation"));
    assert.ok(!lineage.terminal.includes("run-dna-qc"));
  });

  await t.test("returns empty edges for single non-dependent workflow", () => {
    const customRun: WorkflowRunRecord = {
      runId: "run-custom",
      caseId: "case-2",
      requestId: "req-c",
      workflowName: "custom-v1",
      referenceBundleId: "GRCh38",
      executionProfile: "standard",
      status: "COMPLETED",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T01:00:00Z",
    };
    const customArtifacts: RunArtifact[] = [{
      artifactId: "art-c-1",
      runId: "run-custom",
      artifactClass: "DERIVED" as const,
      semanticType: "somatic-vcf",
      artifactHash: "sha256:c1",
      producingStep: "custom-step",
      registeredAt: "2026-01-01T01:00:00Z",
    }];
    const lineage = buildEvidenceLineage([customRun], customArtifacts);
    assert.equal(lineage.edges.length, 0);
    assert.deepStrictEqual(lineage.roots, ["run-custom"]);
    assert.deepStrictEqual(lineage.terminal, ["run-custom"]);
  });

  await t.test("returns empty edges for independent parallel workflows", () => {
    const hlaRun: WorkflowRunRecord = {
      runId: "run-hla",
      caseId: "case-3",
      requestId: "req-h",
      workflowName: "hla-typing",
      referenceBundleId: "GRCh38",
      executionProfile: "standard",
      status: "COMPLETED",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T01:00:00Z",
    };
    const exprRun: WorkflowRunRecord = {
      runId: "run-expr",
      caseId: "case-3",
      requestId: "req-e",
      workflowName: "expression-support",
      referenceBundleId: "GRCh38",
      executionProfile: "standard",
      status: "COMPLETED",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T01:00:00Z",
    };
    const lineage = buildEvidenceLineage([hlaRun, exprRun], []);
    assert.equal(lineage.edges.length, 0, "parallel workflows with no dep chain have no edges");
  });
});

// ─── 7.C: Evidence lineage in board packet via HTTP ─────────────────

test("Wave 7.C: board packet with single workflow has no evidence lineage", async (t) => {
  const app = createApp();

  await t.test("board packet omits evidenceLineage when only one non-well-known workflow exists", async () => {
    const createRes = await request(app).post("/api/cases").send(buildCaseInput());
    assert.equal(createRes.status, 201, "case creation");
    const caseId = String(createRes.body.case.caseId);

    const samples = [
      buildSample("TUMOR_DNA", "WES"),
      buildSample("NORMAL_DNA", "WES"),
      buildSample("TUMOR_RNA", "RNA_SEQ"),
    ];
    for (const s of samples) {
      const sRes = await request(app).post(`/api/cases/${caseId}/samples`).send(s);
      assert.equal(sRes.status, 200, `sample ${s.sampleId}`);
    }
    for (const s of samples) {
      const aRes = await request(app).post(`/api/cases/${caseId}/artifacts`).send(buildSourceArtifact(s));
      assert.equal(aRes.status, 200, `artifact for ${s.sampleId}`);
    }

    const wfRes = await request(app).post(`/api/cases/${caseId}/workflows`).send({
      workflowName: "custom-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "standard",
    });
    assert.equal(wfRes.status, 200, "workflow request");

    const runId = "run-custom-lineage-1";
    const startRes = await request(app)
      .post(`/api/cases/${caseId}/runs/${runId}/start`)
      .send({});
    assert.equal(startRes.status, 200, "start run");

    const completeRes = await request(app)
      .post(`/api/cases/${caseId}/runs/${runId}/complete`)
      .send({
        derivedArtifacts: [
          { semanticType: "somatic-vcf", artifactHash: "sha256:custom-vcf", producingStep: "custom-v1" },
        ],
      });
    assert.equal(completeRes.status, 200, "complete run");

    const hlaRes = await request(app).post(`/api/cases/${caseId}/hla-consensus`).send({
      alleles: ["A*02:01"],
      perToolEvidence: [{ toolName: "optitype", alleles: ["A*02:01"], confidence: 0.95 }],
      confidenceScore: 0.95,
      referenceVersion: "IMGT/HLA 3.55.0",
    });
    assert.equal(hlaRes.status, 200, "hla consensus");

    const qcRes = await request(app).post(`/api/cases/${caseId}/runs/${runId}/qc`).send({
      results: [{ metric: "tumor_purity", value: 0.55, threshold: 0.20, pass: true }],
    });
    assert.equal(qcRes.status, 200, "qc gate");

    const packetRes = await request(app)
      .post(`/api/cases/${caseId}/board-packets`)
      .send({ correlationId: "corr-no-lineage" });
    assert.equal(packetRes.status, 201, "board packet");

    const snapshot = packetRes.body.packet.snapshot;
    assert.equal(snapshot.evidenceLineage, undefined, "No dependency edges → no lineage");
  });
});
