/**
 * audit-chain.test.ts
 *
 * Tests for the ALCOA+ audit hash-chain feature:
 *   - computeAuditEventRecordHash determinism
 *   - verifyAuditChainIntegrity pure-function correctness
 *   - MemoryCaseStore.verifyAuditChain (in-memory path)
 *   - PostgresCaseStore.verifyAuditChain (pg-mem Postgres path)
 *   - HTTP GET /api/cases/:caseId/audit-chain/verify endpoint
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newDb } from "pg-mem";
import request from "supertest";
import { createApp } from "../src/app";
import { MemoryCaseStore } from "../src/store";
import { PostgresCaseStore } from "../src/adapters/PostgresCaseStore";
import {
  computeAuditEventRecordHash,
  verifyAuditChainIntegrity,
} from "../src/store-helpers";
import type { CaseAuditEventRecord, CaseRecord } from "../src/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fixedTime = "2026-04-01T10:00:00.000Z";
const fixedClock = { nowIso: () => fixedTime };

function buildCaseInput() {
  return {
    caseProfile: {
      patientKey: "pt-audit-001",
      indication: "metastatic melanoma",
      siteId: "site-001",
      protocolVersion: "2026.1",
      consentStatus: "complete",
      boardRoute: "solid-tumor-board",
    },
  };
}

function buildSampleInput(sampleType: string, assayType: string) {
  return {
    sampleId: `${sampleType.toLowerCase()}-audit-001`,
    sampleType,
    assayType,
    accessionId: `acc-audit-${sampleType.toLowerCase()}`,
    sourceSite: "site-001",
  };
}

/**
 * Constructs a minimal CaseAuditEventRecord for testing.
 */
function makeEvent(
  id: string,
  overrides: Partial<CaseAuditEventRecord> = {},
): CaseAuditEventRecord {
  return {
    eventId: id,
    type: "case.created",
    detail: `Test event ${id}`,
    correlationId: "corr-test",
    actorId: "user-test",
    authMechanism: "jwt-bearer",
    occurredAt: `2026-01-01T00:00:0${id.slice(-1)}.000Z`,
    ...overrides,
  };
}

/**
 * Builds a minimal CaseRecord suitable for MemoryCaseStore initialRecords.
 */
function makeMinimalCaseRecord(
  caseId: string,
  auditEvents: CaseAuditEventRecord[],
): CaseRecord {
  return {
    caseId,
    status: "INTAKING",
    createdAt: fixedTime,
    updatedAt: fixedTime,
    caseProfile: {
      patientKey: "pt-minimal",
      indication: "test",
      siteId: "site-1",
      protocolVersion: "1.0",
      consentStatus: "complete",
      boardRoute: "board-1",
    },
    samples: [],
    artifacts: [],
    workflowRequests: [],
    timeline: [],
    auditEvents,
    workflowRuns: [],
    derivedArtifacts: [],
    qcGates: [],
    boardPackets: [],
    reviewOutcomes: [],
    handoffPackets: [],
    outcomeTimeline: [],
  };
}

async function createPgStoreWithAuditColumns() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  // Run the normalized migration (pg-mem doesn't support BEGIN/COMMIT)
  const migrationSql = readFileSync(
    join(__dirname, "..", "src", "migrations", "001_full_schema.sql"),
    "utf8",
  );
  const cleanSql = migrationSql
    .replace(/^BEGIN;/m, "")
    .replace(/^COMMIT;/m, "");
  await pool.query(cleanSql);

  // Add audit hash-chain columns (migration 004, simplified for pg-mem)
  try {
    await pool.query(`ALTER TABLE audit_events ADD COLUMN record_hash TEXT`);
    await pool.query(`ALTER TABLE audit_events ADD COLUMN prev_hash TEXT`);
  } catch {
    // columns may already exist in this pg-mem instance
  }

  const store = new PostgresCaseStore(pool, fixedClock);
  return { pool, store };
}

// ── 1. computeAuditEventRecordHash determinism ────────────────────────────────

test("computeAuditEventRecordHash is deterministic for same input", () => {
  const event = makeEvent("e1");
  const hash1 = computeAuditEventRecordHash(event);
  const hash2 = computeAuditEventRecordHash(event);
  assert.equal(hash1, hash2, "same input must produce same hash");
  assert.equal(hash1.length, 64, "SHA-256 hex is 64 chars");
});

test("computeAuditEventRecordHash differs for different inputs", () => {
  const event1 = makeEvent("e1", { detail: "alpha" });
  const event2 = makeEvent("e1", { detail: "beta" });
  assert.notEqual(
    computeAuditEventRecordHash(event1),
    computeAuditEventRecordHash(event2),
    "different detail must produce different hash",
  );

  const event3 = makeEvent("e1", { actorId: "actor-A" });
  const event4 = makeEvent("e1", { actorId: "actor-B" });
  assert.notEqual(
    computeAuditEventRecordHash(event3),
    computeAuditEventRecordHash(event4),
    "different actorId must produce different hash",
  );
});

test("computeAuditEventRecordHash ignores recordHash and prevHash fields", () => {
  const base = makeEvent("e1");
  const withHashes = makeEvent("e1", {
    recordHash: "some-hash",
    prevHash: "some-prev",
  });
  assert.equal(
    computeAuditEventRecordHash(base),
    computeAuditEventRecordHash(withHashes),
    "recordHash/prevHash fields must not affect the computed hash",
  );
});

// ── 2. verifyAuditChainIntegrity isolation tests ──────────────────────────────

test("verifyAuditChainIntegrity: empty events array returns valid", () => {
  const result = verifyAuditChainIntegrity([]);
  assert.equal(result.valid, true);
  assert.equal(result.eventCount, 0);
});

test("verifyAuditChainIntegrity: single event without hashes is valid", () => {
  const events = [makeEvent("e1")];
  const result = verifyAuditChainIntegrity(events);
  assert.equal(result.valid, true);
  assert.equal(result.eventCount, 1);
});

test("verifyAuditChainIntegrity: multiple events without hashes are valid", () => {
  const events = [makeEvent("e1"), makeEvent("e2"), makeEvent("e3")];
  const result = verifyAuditChainIntegrity(events);
  assert.equal(result.valid, true);
  assert.equal(result.eventCount, 3);
});

test("verifyAuditChainIntegrity: correct full hash chain (with prevHash) is valid", () => {
  const e1Base = makeEvent("e1");
  const e1Hash = computeAuditEventRecordHash(e1Base);
  const e1: CaseAuditEventRecord = { ...e1Base, recordHash: e1Hash };

  const e2Base = makeEvent("e2");
  const e2Hash = computeAuditEventRecordHash(e2Base);
  const e2: CaseAuditEventRecord = {
    ...e2Base,
    recordHash: e2Hash,
    prevHash: e1Hash,
  };

  const e3Base = makeEvent("e3");
  const e3Hash = computeAuditEventRecordHash(e3Base);
  const e3: CaseAuditEventRecord = {
    ...e3Base,
    recordHash: e3Hash,
    prevHash: e2Hash,
  };

  const result = verifyAuditChainIntegrity([e1, e2, e3]);
  assert.equal(result.valid, true);
  assert.equal(result.eventCount, 3);
  assert.equal(result.firstBreakAt, undefined);
});

test("verifyAuditChainIntegrity: wrong recordHash is detected", () => {
  const e1Base = makeEvent("e1");
  const e1: CaseAuditEventRecord = {
    ...e1Base,
    recordHash: "bad-hash-value-that-will-never-match",
  };

  const result = verifyAuditChainIntegrity([e1]);
  assert.equal(result.valid, false);
  assert.equal(result.firstBreakAt, "e1");
  assert.ok(result.detail?.includes("recordHash mismatch"));
});

test("verifyAuditChainIntegrity: wrong prevHash is detected when prevHash is set", () => {
  const e1Base = makeEvent("e1");
  const e1Hash = computeAuditEventRecordHash(e1Base);
  const e1: CaseAuditEventRecord = { ...e1Base, recordHash: e1Hash };

  const e2Base = makeEvent("e2");
  const e2Hash = computeAuditEventRecordHash(e2Base);
  const e2: CaseAuditEventRecord = {
    ...e2Base,
    recordHash: e2Hash,
    prevHash: "wrong-prev-hash",
  };

  const result = verifyAuditChainIntegrity([e1, e2]);
  assert.equal(result.valid, false);
  assert.equal(result.firstBreakAt, "e2");
  assert.ok(result.detail?.includes("prevHash mismatch"));
});

test("verifyAuditChainIntegrity: genesis event with undefined prevHash is accepted", () => {
  const e1Base = makeEvent("e1");
  const e1Hash = computeAuditEventRecordHash(e1Base);
  const e1: CaseAuditEventRecord = {
    ...e1Base,
    recordHash: e1Hash,
    prevHash: undefined,
  };

  const result = verifyAuditChainIntegrity([e1]);
  assert.equal(result.valid, true);
});

// ── 3. MemoryCaseStore.verifyAuditChain (in-memory path) ─────────────────────

test("MemoryCaseStore.verifyAuditChain: fresh case with multiple mutations returns valid", async () => {
  const store = new MemoryCaseStore(fixedClock);

  const created = await store.createCase(buildCaseInput(), {
    correlationId: "corr-create",
    actorId: "user-test",
    authMechanism: "jwt-bearer",
  });
  const caseId = created.caseId;

  // Two more mutations → produces additional audit events
  await store.registerSample(
    caseId,
    buildSampleInput("TUMOR_DNA", "WES"),
    "corr-sample-1",
  );
  await store.registerSample(
    caseId,
    buildSampleInput("NORMAL_DNA", "WES"),
    "corr-sample-2",
  );

  const result = await store.verifyAuditChain(caseId);
  assert.equal(result.valid, true, "chain should be valid for in-memory events");
  assert.ok(
    result.eventCount >= 3,
    `expected at least 3 audit events, got ${result.eventCount}`,
  );
});

test("MemoryCaseStore.verifyAuditChain: corrupted recordHash is detected", async () => {
  // Build an initial record with a corrupted recordHash on the audit event
  const caseId = "case-chain-corrupt-001";
  const corruptedEvent = makeEvent("event-corrupt-1", {
    type: "case.created",
    recordHash: "deliberately-wrong-hash-value",
    prevHash: undefined,
  });

  const store = new MemoryCaseStore(fixedClock, undefined, [
    makeMinimalCaseRecord(caseId, [corruptedEvent]),
  ]);

  const result = await store.verifyAuditChain(caseId);
  assert.equal(result.valid, false, "corrupted recordHash must be detected");
  assert.equal(
    result.firstBreakAt,
    "event-corrupt-1",
    "firstBreakAt should identify the corrupted event",
  );
});

test("MemoryCaseStore.verifyAuditChain: non-existent case throws 404-style error", async () => {
  const store = new MemoryCaseStore(fixedClock);
  await assert.rejects(
    () => store.verifyAuditChain("case-does-not-exist"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );
});

// ── 4. PostgresCaseStore.verifyAuditChain (pg-mem Postgres path) ──────────────

test("PostgresCaseStore.verifyAuditChain: valid chain after create + mutation", async () => {
  const { pool, store } = await createPgStoreWithAuditColumns();
  try {
    const created = await store.createCase(buildCaseInput(), {
      correlationId: "corr-pg-create",
      actorId: "user-pg",
      authMechanism: "jwt-bearer",
    });
    const caseId = created.caseId;

    // Second mutation adds another audit event
    await store.registerSample(
      caseId,
      buildSampleInput("TUMOR_DNA", "WES"),
      "corr-pg-sample",
    );

    const result = await store.verifyAuditChain(caseId);
    assert.equal(result.valid, true, "Postgres hash chain should be valid");
    assert.ok(
      result.eventCount >= 2,
      `expected at least 2 events, got ${result.eventCount}`,
    );
  } finally {
    await pool.end();
  }
});

test("PostgresCaseStore.verifyAuditChain: record_hash and prev_hash are persisted in DB", async () => {
  const { pool, store } = await createPgStoreWithAuditColumns();
  try {
    const created = await store.createCase(buildCaseInput(), {
      correlationId: "corr-pg-hash-check",
      actorId: "user-pg",
      authMechanism: "jwt-bearer",
    });
    const caseId = created.caseId;

    // Check that record_hash is populated in the database
    const rows = await pool.query(
      "SELECT record_hash, prev_hash FROM audit_events WHERE case_id = $1 ORDER BY occurred_at ASC",
      [caseId],
    );
    assert.ok(rows.rows.length >= 1, "should have at least one audit event row");
    const firstRow = rows.rows[0] as Record<string, unknown>;
    assert.ok(
      typeof firstRow.record_hash === "string" && firstRow.record_hash.length === 64,
      "record_hash should be a 64-char hex string",
    );
    // Genesis event has null prev_hash
    assert.equal(firstRow.prev_hash, null, "first event should have null prev_hash");
  } finally {
    await pool.end();
  }
});

test("PostgresCaseStore.verifyAuditChain: corrupted record_hash in DB is detected", async () => {
  const { pool, store } = await createPgStoreWithAuditColumns();
  try {
    const created = await store.createCase(buildCaseInput(), {
      correlationId: "corr-pg-corrupt",
      actorId: "user-pg",
      authMechanism: "jwt-bearer",
    });
    const caseId = created.caseId;

    // Directly corrupt the record_hash in the database
    await pool.query(
      "UPDATE audit_events SET record_hash = 'deliberately-corrupted-hash' WHERE case_id = $1",
      [caseId],
    );

    const result = await store.verifyAuditChain(caseId);
    assert.equal(result.valid, false, "corrupted record_hash must be detected");
    assert.ok(result.firstBreakAt, "firstBreakAt should be populated");
  } finally {
    await pool.end();
  }
});

// ── 5. HTTP endpoint: GET /api/cases/:caseId/audit-chain/verify ───────────────

test("GET /api/cases/:caseId/audit-chain/verify returns 200 with valid:true for clean chain", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });

  const createRes = await request(app)
    .post("/api/cases")
    .send(buildCaseInput());
  assert.equal(createRes.status, 201, "case should be created");
  const caseId = String(createRes.body.case.caseId);

  const verifyRes = await request(app).get(
    `/api/cases/${caseId}/audit-chain/verify`,
  );
  assert.equal(verifyRes.status, 200, "should return 200 for valid chain");
  assert.equal(verifyRes.body.valid, true, "chain should be valid");
  assert.equal(verifyRes.body.caseId, caseId, "response should include caseId");
  assert.ok(
    typeof verifyRes.body.eventCount === "number" && verifyRes.body.eventCount >= 1,
    "eventCount should be a positive number",
  );
});

test("GET /api/cases/:caseId/audit-chain/verify returns 404 for unknown case", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });

  const verifyRes = await request(app).get(
    "/api/cases/case-does-not-exist-xyz/audit-chain/verify",
  );
  assert.equal(verifyRes.status, 404, "should return 404 for unknown case");
});

test("GET /api/cases/:caseId/audit-chain/verify includes eventCount in response", async () => {
  const app = createApp({ rbacAllowAll: true, consentGateEnabled: false });

  const createRes = await request(app)
    .post("/api/cases")
    .send(buildCaseInput());
  assert.equal(createRes.status, 201);
  const caseId = String(createRes.body.case.caseId);

  // Add a mutation to accumulate more audit events
  await request(app)
    .post(`/api/cases/${caseId}/samples`)
    .send(buildSampleInput("TUMOR_DNA", "WES"));

  const verifyRes = await request(app).get(
    `/api/cases/${caseId}/audit-chain/verify`,
  );
  assert.equal(verifyRes.status, 200);
  assert.ok(
    verifyRes.body.eventCount >= 2,
    `expected at least 2 events, got ${verifyRes.body.eventCount}`,
  );
});
