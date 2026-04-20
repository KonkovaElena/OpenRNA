import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { PostgresWorkflowRunner } from "../src/adapters/PostgresWorkflowRunner";
import type { WorkflowRunRequest } from "../src/ports/IWorkflowRunner";

// ── Helpers ──────────────────────────────────────────────────────────

function createPgPool() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const migrationSql = readFileSync(
    join(__dirname, "..", "src", "migrations", "001_full_schema.sql"),
    "utf-8",
  )
    .replace(/BEGIN;/g, "")
    .replace(/COMMIT;/g, "");

  // pg-mem requires synchronous execution via its internal adapter
  const client = (db as any).adapters.createPg().Client;
  const c = new client();
  c.query(migrationSql);

  // Seed a parent case row (FK requirement for workflow_runs.case_id)
  c.query(`
    INSERT INTO cases (case_id, status, created_at, updated_at, case_profile)
    VALUES ('case-001', 'OPEN', NOW(), NOW(), '{"patientKey":"pt-001"}'::jsonb)
  `);

  return pool;
}

function buildRequest(overrides?: Partial<WorkflowRunRequest>): WorkflowRunRequest {
  return {
    runId: "run-001",
    caseId: "case-001",
    requestId: "req-001",
    workflowName: "somatic-pipeline",
    referenceBundleId: "rb-grch38",
    executionProfile: "high-mem",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

test("PostgresWorkflowRunner: full lifecycle (start → complete)", async () => {
  const pool = createPgPool();
  const runner = new PostgresWorkflowRunner(pool);

  // startRun
  const started = await runner.startRun(buildRequest());
  assert.equal(started.runId, "run-001");
  assert.equal(started.caseId, "case-001");
  assert.equal(started.status, "RUNNING");
  assert.equal(started.workflowName, "somatic-pipeline");
  assert.equal(started.referenceBundleId, "rb-grch38");
  assert.equal(started.executionProfile, "high-mem");
  assert.ok(started.acceptedAt);
  assert.ok(started.startedAt);

  // getRun
  const fetched = await runner.getRun("run-001");
  assert.equal(fetched.runId, "run-001");
  assert.equal(fetched.status, "RUNNING");

  // listRunsByCaseId
  const runs = await runner.listRunsByCaseId("case-001");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, "run-001");

  // completeRun
  const completed = await runner.completeRun("run-001");
  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.completedAt);
});

test("PostgresWorkflowRunner: failRun", async () => {
  const pool = createPgPool();
  const runner = new PostgresWorkflowRunner(pool);

  await runner.startRun(buildRequest());
  const failed = await runner.failRun("run-001", "Pipeline crashed", "infrastructure_error");
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failureReason, "Pipeline crashed");
  assert.equal(failed.failureCategory, "infrastructure_error");
  assert.ok(failed.completedAt);
});

test("PostgresWorkflowRunner: cancelRun", async () => {
  const pool = createPgPool();
  const runner = new PostgresWorkflowRunner(pool);

  await runner.startRun(buildRequest());
  const cancelled = await runner.cancelRun("run-001");
  assert.equal(cancelled.status, "CANCELLED");
  assert.ok(cancelled.completedAt);
});

test("PostgresWorkflowRunner: startRun idempotent replay", async () => {
  const pool = createPgPool();
  const runner = new PostgresWorkflowRunner(pool);

  const first = await runner.startRun(buildRequest());
  const replay = await runner.startRun(buildRequest());
  assert.equal(replay.runId, first.runId);
  assert.equal(replay.status, "RUNNING");
});

test("PostgresWorkflowRunner: startRun replay mismatch throws 409", async () => {
  const pool = createPgPool();
  const runner = new PostgresWorkflowRunner(pool);

  await runner.startRun(buildRequest());
  await assert.rejects(
    () => runner.startRun(buildRequest({ workflowName: "different-wf" })),
    (err: any) => err.statusCode === 409,
  );
});

test("PostgresWorkflowRunner: getRun not found throws 404", async () => {
  const pool = createPgPool();
  const runner = new PostgresWorkflowRunner(pool);

  await assert.rejects(
    () => runner.getRun("nonexistent"),
    (err: any) => err.statusCode === 404,
  );
});

test("PostgresWorkflowRunner: startRun with manifest persists manifest", async () => {
  const pool = createPgPool();
  const runner = new PostgresWorkflowRunner(pool);

  const manifest = {
    manifestVersion: 1,
    executorKind: "nextflow",
    workflowName: "somatic-pipeline",
    workflowRevision: "3.2.1",
    configProfile: "standard",
    submissionIntent: "production",
    acceptedAt: "2026-03-29T00:00:00.000Z",
    inputArtifactSet: [{ artifactId: "art-1", semanticType: "tumor-fastq", artifactHash: "sha256:abc" }],
    pinnedReferenceBundle: { bundleId: "rb-grch38", genomeAssembly: "GRCh38", assets: [] },
    sampleSnapshot: { sampleId: "sample-001", sampleType: "tumor", assayType: "WES" },
  };
  const started = await runner.startRun(buildRequest({ manifest }));
  assert.deepStrictEqual(started.manifest, manifest);

  const fetched = await runner.getRun("run-001");
  assert.deepStrictEqual(fetched.manifest, manifest);
});
