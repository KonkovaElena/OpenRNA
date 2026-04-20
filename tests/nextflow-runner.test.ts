import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { NextflowWorkflowRunner, mapExitCodeToCategory } from "../src/adapters/NextflowWorkflowRunner";
import type { INextflowClient, NextflowSubmitResult } from "../src/ports/INextflowClient";
import type { NextflowPollResult, WorkflowRunManifest, NextflowTerminalMetadata } from "../src/types";
import type { WorkflowRunRequest } from "../src/ports/IWorkflowRunner";

// ─── Test Fixtures ──────────────────────────────────────────────────

function buildManifest(overrides?: Partial<WorkflowRunManifest>): WorkflowRunManifest {
  return {
    manifestVersion: 1,
    executorKind: "nextflow",
    workflowName: "somatic-pipeline",
    workflowRevision: "3.2.1",
    configProfile: "standard",
    submissionIntent: "production",
    acceptedAt: new Date().toISOString(),
    inputArtifactSet: [{ artifactId: "art-1", semanticType: "tumor-fastq", artifactHash: "sha256:abc" }],
    pinnedReferenceBundle: { bundleId: "rb-grch38", genomeAssembly: "GRCh38", assets: [] },
    sampleSnapshot: { sampleId: "sample-001", sampleType: "tumor", assayType: "WES" },
    ...overrides,
  };
}

function buildRequest(overrides?: Partial<WorkflowRunRequest>): WorkflowRunRequest {
  return {
    runId: "run-nf-001",
    caseId: "case-nf-001",
    requestId: "req-nf-001",
    workflowName: "somatic-pipeline",
    referenceBundleId: "rb-grch38",
    executionProfile: "standard",
    manifest: buildManifest(),
    ...overrides,
  };
}

function createMockClient(overrides?: Partial<INextflowClient>): INextflowClient {
  return {
    submit: overrides?.submit ?? (async () => ({ sessionId: "nf-session-abc", runName: "crazy_turing" })),
    poll: overrides?.poll ?? (async () => ({ sessionId: "nf-session-abc", runName: "crazy_turing", state: "running" as const })),
    cancel: overrides?.cancel ?? (async () => {}),
  };
}

// ─── Adapter Contract Tests ─────────────────────────────────────────

describe("NextflowWorkflowRunner", () => {
  let client: INextflowClient;
  let runner: NextflowWorkflowRunner;

  beforeEach(() => {
    client = createMockClient();
    runner = new NextflowWorkflowRunner(client);
  });

  it("startRun submits to Nextflow and returns a RUNNING record with sessionId metadata", async () => {
    const record = await runner.startRun(buildRequest());
    assert.equal(record.runId, "run-nf-001");
    assert.equal(record.status, "RUNNING");
    assert.equal(record.workflowName, "somatic-pipeline");
    assert.ok(record.acceptedAt);
    assert.ok(record.startedAt);
    assert.ok(record.manifest);
  });

  it("startRun replay returns existing record without re-submitting", async () => {
    let submitCount = 0;
    client = createMockClient({
      submit: async () => { submitCount++; return { sessionId: "nf-session-abc", runName: "crazy_turing" }; },
    });
    runner = new NextflowWorkflowRunner(client);

    await runner.startRun(buildRequest());
    const replay = await runner.startRun(buildRequest());
    assert.equal(replay.status, "RUNNING");
    assert.equal(submitCount, 1, "submit should only be called once");
  });

  it("startRun replay mismatch throws 409", async () => {
    await runner.startRun(buildRequest());
    await assert.rejects(
      () => runner.startRun(buildRequest({ caseId: "different-case" })),
      (err: any) => err.statusCode === 409,
    );
  });

  it("getRun returns the run record", async () => {
    await runner.startRun(buildRequest());
    const record = await runner.getRun("run-nf-001");
    assert.equal(record.runId, "run-nf-001");
  });

  it("getRun throws 404 for unknown runId", async () => {
    await assert.rejects(
      () => runner.getRun("nonexistent"),
      (err: any) => err.statusCode === 404,
    );
  });

  it("cancelRun calls client.cancel and transitions to CANCELLED", async () => {
    let cancelCalled = false;
    client = createMockClient({
      cancel: async () => { cancelCalled = true; },
    });
    runner = new NextflowWorkflowRunner(client);

    await runner.startRun(buildRequest());
    const cancelled = await runner.cancelRun("run-nf-001");
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.completedAt);
    assert.ok(cancelCalled, "client.cancel should have been called");
  });

  it("cancelRun replay on already-cancelled run is idempotent", async () => {
    await runner.startRun(buildRequest());
    await runner.cancelRun("run-nf-001");
    const replay = await runner.cancelRun("run-nf-001");
    assert.equal(replay.status, "CANCELLED");
  });

  it("listRunsByCaseId returns runs for the case", async () => {
    await runner.startRun(buildRequest({ runId: "run-1" }));
    await runner.startRun(buildRequest({ runId: "run-2", requestId: "req-2" }));
    const runs = await runner.listRunsByCaseId("case-nf-001");
    assert.equal(runs.length, 2);
  });

  it("completeRun transitions to COMPLETED", async () => {
    await runner.startRun(buildRequest());
    const completed = await runner.completeRun("run-nf-001");
    assert.equal(completed.status, "COMPLETED");
    assert.ok(completed.completedAt);
  });

  it("failRun transitions to FAILED with reason and category", async () => {
    await runner.startRun(buildRequest());
    const failed = await runner.failRun("run-nf-001", "Pipeline crashed", "pipeline_error");
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.failureReason, "Pipeline crashed");
    assert.equal(failed.failureCategory, "pipeline_error");
  });

  it("failRun without category defaults to unknown", async () => {
    await runner.startRun(buildRequest());
    const failed = await runner.failRun("run-nf-001", "Unknown failure");
    assert.equal(failed.failureCategory, "unknown");
  });

  // ─── Polling Integration ────────────────────────────────────────────

  it("pollAndTransition completes the run when Nextflow reports completed", async () => {
    const completedPoll: NextflowPollResult = {
      sessionId: "nf-session-abc",
      runName: "crazy_turing",
      state: "completed",
      exitCode: 0,
      durationMs: 42000,
      traceUri: "s3://bucket/trace.txt",
      timelineUri: "s3://bucket/timeline.html",
      reportUri: "s3://bucket/report.html",
    };
    client = createMockClient({ poll: async () => completedPoll });
    runner = new NextflowWorkflowRunner(client);

    await runner.startRun(buildRequest());
    const record = await runner.pollAndTransition("run-nf-001");

    assert.equal(record.status, "COMPLETED");
    assert.ok(record.completedAt);
    assert.ok(record.terminalMetadata);
    const meta = record.terminalMetadata as NextflowTerminalMetadata;
    assert.equal(meta.nextflowSessionId, "nf-session-abc");
    assert.equal(meta.nextflowRunName, "crazy_turing");
    assert.equal(meta.durationMs, 42000);
    assert.equal(meta.traceUri, "s3://bucket/trace.txt");
    assert.equal(meta.timelineUri, "s3://bucket/timeline.html");
    assert.equal(meta.reportUri, "s3://bucket/report.html");
  });

  it("pollAndTransition fails the run when Nextflow reports failed", async () => {
    const failedPoll: NextflowPollResult = {
      sessionId: "nf-session-abc",
      runName: "crazy_turing",
      state: "failed",
      exitCode: 1,
      errorMessage: "Process alignment failed with exit code 1",
      durationMs: 5000,
      traceUri: "s3://bucket/trace.txt",
    };
    client = createMockClient({ poll: async () => failedPoll });
    runner = new NextflowWorkflowRunner(client);

    await runner.startRun(buildRequest());
    const record = await runner.pollAndTransition("run-nf-001");

    assert.equal(record.status, "FAILED");
    assert.equal(record.failureCategory, "pipeline_error");
    assert.ok(record.failureReason?.includes("alignment failed"));
    assert.ok(record.terminalMetadata);
  });

  it("pollAndTransition does nothing when Nextflow reports running", async () => {
    client = createMockClient({
      poll: async () => ({ sessionId: "nf-session-abc", runName: "crazy_turing", state: "running" as const }),
    });
    runner = new NextflowWorkflowRunner(client);

    await runner.startRun(buildRequest());
    const record = await runner.pollAndTransition("run-nf-001");
    assert.equal(record.status, "RUNNING");
  });

  it("pollAndTransition on a terminal run returns it unchanged", async () => {
    await runner.startRun(buildRequest());
    await runner.completeRun("run-nf-001");
    const record = await runner.pollAndTransition("run-nf-001");
    assert.equal(record.status, "COMPLETED");
  });

  it("getActiveRunIds returns only non-terminal runs", async () => {
    await runner.startRun(buildRequest({ runId: "run-active" }));
    await runner.startRun(buildRequest({ runId: "run-done", requestId: "req-2" }));
    await runner.completeRun("run-done");
    const active = runner.getActiveRunIds();
    assert.deepEqual(active, ["run-active"]);
  });
});

// ─── Exit Code Mapping ──────────────────────────────────────────────

describe("mapExitCodeToCategory", () => {
  it("maps exit code 0 to unknown (not a failure path)", () => {
    assert.equal(mapExitCodeToCategory(0), "unknown");
  });

  it("maps exit code 1 to pipeline_error", () => {
    assert.equal(mapExitCodeToCategory(1), "pipeline_error");
  });

  it("maps exit code 137 (OOM) to timeout", () => {
    assert.equal(mapExitCodeToCategory(137), "timeout");
  });

  it("maps exit code 143 (SIGTERM) to timeout", () => {
    assert.equal(mapExitCodeToCategory(143), "timeout");
  });

  it("maps exit code 255 to infrastructure_error", () => {
    assert.equal(mapExitCodeToCategory(255), "infrastructure_error");
  });

  it("maps unknown exit codes to pipeline_error", () => {
    assert.equal(mapExitCodeToCategory(42), "pipeline_error");
  });

  it("maps undefined exit code to unknown", () => {
    assert.equal(mapExitCodeToCategory(undefined), "unknown");
  });
});
