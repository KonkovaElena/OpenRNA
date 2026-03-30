import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { PostgresCaseStore } from "../src/adapters/PostgresCaseStore";
import { PostgresWorkflowRunner } from "../src/adapters/PostgresWorkflowRunner";
import type { WorkflowRunManifest } from "../src/types";

// ── Helpers ──────────────────────────────────────────────────────────

const fixedTime = "2026-03-29T00:00:00.000Z";
const fixedClock = { nowIso: () => fixedTime };

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

  const client = (db as any).adapters.createPg().Client;
  const c = new client();
  c.query(migrationSql);

  return pool;
}

const manifest: WorkflowRunManifest = {
  manifestVersion: 1,
  executorKind: "nextflow",
  workflowName: "somatic-pipeline",
  workflowRevision: "3.2.1",
  configProfile: "standard",
  submissionIntent: "production",
  acceptedAt: fixedTime,
  inputArtifactSet: [{ artifactId: "art-1", semanticType: "tumor-fastq", artifactHash: "sha256:abc" }],
  pinnedReferenceBundle: { bundleId: "rb-grch38", genomeAssembly: "GRCh38", assets: [] },
  sampleSnapshot: { sampleId: "sample-001", sampleType: "tumor", assayType: "WES" },
};

// ── Tests ────────────────────────────────────────────────────────────

test("Restart proof: case state survives adapter reconstruction", async () => {
  const pool = createPgPool();

  // Phase 1: write state via first adapter instances
  const store1 = new PostgresCaseStore(pool, fixedClock);
  const created = await store1.createCase(
    {
      caseProfile: {
        patientKey: "pt-001",
        indication: "melanoma",
        siteId: "site-001",
        protocolVersion: "2026.1",
        consentStatus: "complete",
        boardRoute: "solid-tumor-board",
      },
    },
    "corr-create",
  );
  const caseId = created.caseId;
  assert.ok(caseId);

  await store1.registerSample(
    caseId,
    { sampleId: "s-001", sampleType: "TUMOR_DNA", assayType: "WES", accessionId: "acc-1", sourceSite: "site-001" },
    "corr-sample",
  );

  // Phase 2: construct NEW adapter instance from same pool (simulates restart)
  const store2 = new PostgresCaseStore(pool, fixedClock);
  const reloaded = await store2.getCase(caseId);

  assert.equal(reloaded.caseId, caseId);
  assert.equal(reloaded.status, created.status);
  assert.equal(reloaded.caseProfile.indication, "melanoma");
  assert.equal(reloaded.samples.length, 1);
  assert.equal(reloaded.samples[0].sampleId, "s-001");
});

test("Restart proof: workflow run state survives adapter reconstruction", async () => {
  const pool = createPgPool();

  // Seed a case row (FK requirement)
  await pool.query(`
    INSERT INTO cases (case_id, status, created_at, updated_at, case_profile)
    VALUES ('case-r', 'OPEN', NOW(), NOW(), '{"patientKey":"pt-r"}'::jsonb)
  `);

  // Phase 1: start and complete a run via first adapter
  const runner1 = new PostgresWorkflowRunner(pool);
  const started = await runner1.startRun({
    runId: "run-r",
    caseId: "case-r",
    requestId: "req-r",
    workflowName: "somatic-pipeline",
    referenceBundleId: "rb-grch38",
    executionProfile: "high-mem",
    manifest,
  });
  assert.equal(started.status, "RUNNING");
  assert.deepStrictEqual(started.manifest, manifest);

  const completed = await runner1.completeRun("run-r");
  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.completedAt);

  // Phase 2: construct NEW adapter instance (simulates restart)
  const runner2 = new PostgresWorkflowRunner(pool);
  const reloaded = await runner2.getRun("run-r");

  assert.equal(reloaded.runId, "run-r");
  assert.equal(reloaded.status, "COMPLETED");
  assert.ok(reloaded.completedAt);
  assert.deepStrictEqual(reloaded.manifest, manifest);
});

test("Restart proof: list runs by caseId survives adapter reconstruction", async () => {
  const pool = createPgPool();

  await pool.query(`
    INSERT INTO cases (case_id, status, created_at, updated_at, case_profile)
    VALUES ('case-l', 'OPEN', NOW(), NOW(), '{"patientKey":"pt-l"}'::jsonb)
  `);

  // Phase 1: start two runs via first adapter
  const runner1 = new PostgresWorkflowRunner(pool);
  await runner1.startRun({
    runId: "run-l1",
    caseId: "case-l",
    requestId: "req-l1",
    workflowName: "somatic-pipeline",
    referenceBundleId: "rb-grch38",
    executionProfile: "high-mem",
  });
  await runner1.startRun({
    runId: "run-l2",
    caseId: "case-l",
    requestId: "req-l2",
    workflowName: "somatic-pipeline",
    referenceBundleId: "rb-grch38",
    executionProfile: "high-mem",
  });

  // Phase 2: list runs from NEW adapter
  const runner2 = new PostgresWorkflowRunner(pool);
  const runs = await runner2.listRunsByCaseId("case-l");
  assert.equal(runs.length, 2);

  const runIds = runs.map((r) => r.runId).sort();
  assert.deepStrictEqual(runIds, ["run-l1", "run-l2"]);
});
