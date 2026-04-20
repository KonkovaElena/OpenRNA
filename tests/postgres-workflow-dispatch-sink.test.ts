import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { PostgresWorkflowDispatchSink } from "../src/adapters/PostgresWorkflowDispatchSink";

test("PostgresWorkflowDispatchSink persists and returns workflow dispatch records", async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  try {
    const sink = new PostgresWorkflowDispatchSink(pool, { tableName: "workflow_dispatches" });
    await sink.initialize();

    await sink.recordWorkflowRequested({
      dispatchId: "dispatch-001",
      caseId: "case-001",
      requestId: "run-001",
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
      requestedBy: "operator@example.org",
      requestedAt: "2026-03-28T12:00:00.000Z",
      idempotencyKey: "dispatch-key-001",
      correlationId: "corr-dispatch-001",
      status: "PENDING",
    });

    const dispatches = await sink.listDispatches();
    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0].dispatchId, "dispatch-001");
    assert.equal(dispatches[0].referenceBundleId, "GRCh38-2026a");
    assert.equal(dispatches[0].status, "PENDING");
  } finally {
    await pool.end();
  }
});