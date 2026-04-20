import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { PostgresCaseStore } from "../src/adapters/PostgresCaseStore";
import type { WorkflowRunRecord, RunArtifact, HlaConsensusRecord, QcGateRecord } from "../src/types";

// ── Helpers ──────────────────────────────────────────────────────────

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-001",
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
    sampleId: `${sampleType.toLowerCase()}-001`,
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
    semanticType: semanticTypeBySampleType[sample.sampleType] ?? "tumor-dna-fastq",
    schemaVersion: 1,
    artifactHash: `sha256:${sample.sampleId}-fastq`,
    storageUri: `gs://bucket/${sample.sampleId}.fq.gz`,
    mediaType: "application/gzip",
  };
}

const fixedTime = "2026-03-28T10:00:00.000Z";
const fixedClock = { nowIso: () => fixedTime };

async function createPgCaseStore() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  // Run the normalized migration
  const migrationSql = readFileSync(
    join(__dirname, "..", "src", "migrations", "001_full_schema.sql"),
    "utf8",
  );
  // pg-mem doesn't support BEGIN/COMMIT, strip them
  const cleanSql = migrationSql
    .replace(/^BEGIN;/m, "")
    .replace(/^COMMIT;/m, "");
  await pool.query(cleanSql);

  const store = new PostgresCaseStore(pool, fixedClock);
  return { pool, store };
}

// ── Tests ────────────────────────────────────────────────────────────

test("PostgresCaseStore (normalized): full lifecycle round-trip", async () => {
  const { pool, store } = await createPgCaseStore();

  try {
    // 1. Create case
    const created = await store.createCase(buildCaseInput(), {
      correlationId: "corr-create",
      actorId: "user-123",
      authMechanism: "jwt-bearer",
    });
    assert.ok(created.caseId, "case has an id");
    assert.equal(created.status, "INTAKING");
    assert.equal(created.caseProfile.indication, "metastatic melanoma");
    assert.equal(created.samples.length, 0);
    assert.equal(created.artifacts.length, 0);
    assert.equal(created.auditEvents[0]?.actorId, "user-123");
    assert.equal(created.auditEvents[0]?.authMechanism, "jwt-bearer");
    const caseId = created.caseId;

    // 2. Register samples
    const samples = [
      buildSample("TUMOR_DNA", "WES"),
      buildSample("NORMAL_DNA", "WES"),
      buildSample("TUMOR_RNA", "RNA_SEQ"),
    ];
    for (const sample of samples) {
      await store.registerSample(caseId, sample, "corr-sample");
    }
    const afterSamples = await store.getCase(caseId);
    assert.equal(afterSamples.samples.length, 3);

    // 3. Register source artifacts
    for (const sample of samples) {
      await store.registerArtifact(caseId, buildSourceArtifact(sample), "corr-artifact");
    }
    const afterArtifacts = await store.getCase(caseId);
    assert.equal(afterArtifacts.artifacts.length, 3);
    assert.equal(afterArtifacts.status, "READY_FOR_WORKFLOW");

    // 4. Request workflow
    await store.requestWorkflow(
      caseId,
      {
        workflowName: "somatic-dna-rna-v1",
        referenceBundleId: "GRCh38-2026a",
        executionProfile: "local-dev",
      },
      "corr-request",
    );
    const afterRequest = await store.getCase(caseId);
    assert.equal(afterRequest.status, "WORKFLOW_REQUESTED");
    assert.equal(afterRequest.workflowRequests.length, 1);

    // 5. Start workflow run
    const runId = "run-001";
    const startedRun: WorkflowRunRecord = {
      runId,
      caseId,
      requestId: afterRequest.workflowRequests[0].requestId,
      status: "RUNNING",
      workflowName: "somatic-dna-rna-v1",
      referenceBundleId: "GRCh38-2026a",
      executionProfile: "local-dev",
      startedAt: fixedTime,
    };
    await store.startWorkflowRun(caseId, startedRun, "corr-start");
    const afterStart = await store.getCase(caseId);
    assert.equal(afterStart.status, "WORKFLOW_RUNNING");
    assert.equal(afterStart.workflowRuns.length, 1);
    assert.equal(afterStart.workflowRuns[0].status, "RUNNING");

    // 6. Complete workflow run
    const completedRun: WorkflowRunRecord = {
      ...startedRun,
      status: "COMPLETED",
      completedAt: fixedTime,
      terminalMetadata: { durationMs: 12000, executorVersion: "1.0.0" },
    };
    const derivedArtifacts: RunArtifact[] = [
      {
        artifactId: "art-somatic-vcf",
        runId,
        artifactClass: "DERIVED",
        semanticType: "somatic-vcf",
        artifactHash: "sha256:vcf-001",
        producingStep: "variant-calling",
        registeredAt: fixedTime,
      },
    ];
    await store.completeWorkflowRun(caseId, completedRun, derivedArtifacts, "corr-complete");
    const afterComplete = await store.getCase(caseId);
    assert.equal(afterComplete.status, "WORKFLOW_COMPLETED");
    assert.equal(afterComplete.workflowRuns[0].status, "COMPLETED");
    assert.equal(afterComplete.derivedArtifacts.length, 1);
    assert.equal(afterComplete.derivedArtifacts[0].semanticType, "somatic-vcf");

    // 7. Record HLA consensus
    const hla: HlaConsensusRecord = {
      caseId,
      alleles: ["A*01:01", "B*07:02"],
      perToolEvidence: [{ toolName: "optitype", alleles: ["A*01:01", "B*07:02"], confidence: 0.99 }],
      confidenceScore: 0.99,
      operatorReviewThreshold: 0,
      unresolvedDisagreementCount: 0,
      manualReviewRequired: false,
      referenceVersion: "IPD-IMGT/HLA 3.54",
      producedAt: fixedTime,
    };
    await store.recordHlaConsensus(caseId, hla, "corr-hla");
    const loadedHla = await store.getHlaConsensus(caseId);
    assert.ok(loadedHla);
    assert.deepEqual(loadedHla.alleles, ["A*01:01", "B*07:02"]);

    // 8. Record QC gate
    const qcGate: QcGateRecord = {
      runId,
      outcome: "PASSED",
      results: [{ metric: "coverage", value: 40, threshold: 30, pass: true }],
      evaluatedAt: fixedTime,
    };
    await store.recordQcGate(caseId, runId, qcGate, "corr-qc");
    const loadedQc = await store.getQcGate(caseId, runId);
    assert.ok(loadedQc);
    assert.equal(loadedQc.outcome, "PASSED");
    const afterQc = await store.getCase(caseId);
    assert.equal(afterQc.status, "QC_PASSED");

    // 9. Generate board packet
    const packetResult = await store.generateBoardPacket(caseId, "corr-board");
    assert.ok(packetResult.packet);
    assert.equal(packetResult.packet.caseId, caseId);
    assert.equal(packetResult.created, true);

    // 10. Final state verification: list and get
    const listed = await store.listCases();
    assert.equal(listed.cases.length, 1);
    assert.equal(listed.cases[0].caseId, caseId);

    const summary = await store.getOperationsSummary();
    assert.equal(summary.totalCases, 1);

    const packets = await store.listBoardPackets(caseId);
    assert.equal(packets.length, 1);

    const runs = await store.listWorkflowRuns(caseId);
    assert.equal(runs.length, 1);
  } finally {
    await pool.end();
  }
});

test("PostgresCaseStore (normalized): getCase returns data persisted in normalized tables", async () => {
  const { pool, store } = await createPgCaseStore();

  try {
    const created = await store.createCase(buildCaseInput(), {
      correlationId: "corr-1",
      actorId: "user-123",
      authMechanism: "jwt-bearer",
    });
    const caseId = created.caseId;

    // Verify the case row exists in the normalized cases table
    const row = await pool.query("SELECT case_id, status, case_profile FROM cases WHERE case_id = $1", [caseId]);
    assert.equal(row.rows.length, 1, "case row exists in normalized cases table");
    assert.equal(row.rows[0].status, "INTAKING");

    const auditRows = await pool.query(
      "SELECT actor_id, auth_mechanism FROM audit_events WHERE case_id = $1 ORDER BY occurred_at",
      [caseId],
    );
    assert.equal(auditRows.rows[0]?.actor_id, "user-123");
    assert.equal(auditRows.rows[0]?.auth_mechanism, "jwt-bearer");

    // Register a sample and check normalized samples table
    await store.registerSample(
      caseId,
      buildSample("TUMOR_DNA", "WES"),
      "corr-sample",
    );
    const sampleRows = await pool.query("SELECT sample_id, sample_type FROM samples WHERE case_id = $1", [caseId]);
    assert.equal(sampleRows.rows.length, 1);
    assert.equal(sampleRows.rows[0].sample_type, "TUMOR_DNA");
  } finally {
    await pool.end();
  }
});
