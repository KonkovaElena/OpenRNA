import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PollingSupervisor } from "../src/supervision/PollingSupervisor";
import { NextflowWorkflowRunner } from "../src/adapters/NextflowWorkflowRunner";
import type { INextflowClient } from "../src/ports/INextflowClient";
import type { NextflowPollResult, WorkflowRunManifest } from "../src/types";
import type { WorkflowRunRequest } from "../src/ports/IWorkflowRunner";

function buildManifest(): WorkflowRunManifest {
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
  };
}

function buildRequest(runId: string): WorkflowRunRequest {
  return {
    runId,
    caseId: "case-poll-001",
    requestId: `req-${runId}`,
    workflowName: "somatic-pipeline",
    referenceBundleId: "rb-grch38",
    executionProfile: "standard",
    manifest: buildManifest(),
  };
}

describe("PollingSupervisor", () => {
  let pollResults: Map<string, NextflowPollResult>;
  let client: INextflowClient;
  let runner: NextflowWorkflowRunner;

  beforeEach(() => {
    pollResults = new Map();
    client = {
      submit: async () => ({ sessionId: "nf-sess", runName: "run_name" }),
      poll: async (sessionId) => pollResults.get(sessionId) ?? { sessionId, runName: "run_name", state: "running" as const },
      cancel: async () => {},
    };
    runner = new NextflowWorkflowRunner(client);
  });

  it("tick transitions a completed run and fires onTransition", async () => {
    await runner.startRun(buildRequest("run-1"));
    pollResults.set("nf-sess", {
      sessionId: "nf-sess",
      runName: "run_name",
      state: "completed",
      exitCode: 0,
      durationMs: 10000,
    });

    const transitions: Array<[string, string]> = [];
    const supervisor = new PollingSupervisor(runner, {
      onTransition: (id, status) => transitions.push([id, status]),
    });

    await supervisor.tick();
    assert.deepEqual(transitions, [["run-1", "COMPLETED"]]);
    const record = await runner.getRun("run-1");
    assert.equal(record.status, "COMPLETED");
  });

  it("tick does not fire onTransition when run stays RUNNING", async () => {
    await runner.startRun(buildRequest("run-2"));
    // Default poll returns "running"

    const transitions: Array<[string, string]> = [];
    const supervisor = new PollingSupervisor(runner, {
      onTransition: (id, status) => transitions.push([id, status]),
    });

    await supervisor.tick();
    assert.equal(transitions.length, 0);
  });

  it("tick handles multiple runs independently", async () => {
    // Use separate clients so each run gets its own session ID
    let submitCount = 0;
    client = {
      submit: async () => {
        submitCount++;
        return { sessionId: `sess-${submitCount}`, runName: `name-${submitCount}` };
      },
      poll: async (sessionId) => pollResults.get(sessionId) ?? { sessionId, runName: "x", state: "running" as const },
      cancel: async () => {},
    };
    runner = new NextflowWorkflowRunner(client);

    await runner.startRun(buildRequest("run-a"));
    await runner.startRun(buildRequest("run-b"));

    pollResults.set("sess-1", { sessionId: "sess-1", runName: "name-1", state: "completed", exitCode: 0, durationMs: 5000 });
    // sess-2 stays running (no pollResults entry)

    const transitions: Array<[string, string]> = [];
    const supervisor = new PollingSupervisor(runner, {
      onTransition: (id, status) => transitions.push([id, status]),
    });

    await supervisor.tick();
    assert.deepEqual(transitions, [["run-a", "COMPLETED"]]);
    assert.equal((await runner.getRun("run-a")).status, "COMPLETED");
    assert.equal((await runner.getRun("run-b")).status, "RUNNING");
  });

  it("tick catches errors per run and fires onError", async () => {
    await runner.startRun(buildRequest("run-err"));
    client.poll = async () => { throw new Error("network timeout"); };

    const errors: Array<[string, unknown]> = [];
    const supervisor = new PollingSupervisor(runner, {
      onError: (id, err) => errors.push([id, err]),
    });

    await supervisor.tick();
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], "run-err");
    // Run should still be RUNNING since the poll failed
    assert.equal((await runner.getRun("run-err")).status, "RUNNING");
  });

  it("tick skips terminal runs (not in activeRunIds)", async () => {
    await runner.startRun(buildRequest("run-done"));
    await runner.completeRun("run-done");

    let pollCalls = 0;
    client.poll = async () => { pollCalls++; return { sessionId: "x", runName: "x", state: "completed" } };

    const supervisor = new PollingSupervisor(runner);
    await supervisor.tick();
    assert.equal(pollCalls, 0, "should not poll terminal runs");
  });

  it("start and stop manage the timer lifecycle", async () => {
    const supervisor = new PollingSupervisor(runner, { intervalMs: 100 });
    supervisor.start();
    supervisor.start(); // idempotent
    supervisor.stop();
    supervisor.stop(); // idempotent — no throw
  });
});
