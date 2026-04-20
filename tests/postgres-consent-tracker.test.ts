import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { newDb } from "pg-mem";
import { PostgresConsentTracker } from "../src/adapters/PostgresConsentTracker";

function loadSqlMigration(fileName: string): string {
  return readFileSync(path.resolve(__dirname, `../src/migrations/${fileName}`), "utf8");
}

async function insertCase(pool: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, caseId: string): Promise<void> {
  await pool.query(
    `INSERT INTO cases (case_id, status, created_at, updated_at, case_profile)
     VALUES ($1, $2, NOW(), NOW(), $3::jsonb)`,
    [
      caseId,
      "AWAITING_CONSENT",
      JSON.stringify({
        patientKey: `pt-${caseId}`,
        indication: "melanoma",
        siteId: "site-001",
        protocolVersion: "2026.1",
        consentStatus: "missing",
      }),
    ],
  );
}

test("PostgresConsentTracker persists and restores consent state", async () => {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const schema001 = loadSqlMigration("001_full_schema.sql");
  const schema003 = loadSqlMigration("003_case_access_and_consent.sql");
  await pool.query(schema001);
  await pool.query(schema003);

  await insertCase(pool, "case-consent-001");

  const tracker = new PostgresConsentTracker(pool);
  await tracker.initialize();

  await tracker.recordConsent("case-consent-001", {
    type: "granted",
    timestamp: "2026-04-18T00:00:00.000Z",
    scope: "genomic-analysis",
    version: "1.0",
  });

  await tracker.recordConsent("case-consent-001", {
    type: "withdrawn",
    timestamp: "2026-04-18T01:00:00.000Z",
    scope: "genomic-analysis",
    version: "1.0",
    notes: "patient request",
  });

  const history = await tracker.getConsentHistory("case-consent-001");
  assert.equal(history.length, 2);
  assert.equal(history[0]?.type, "granted");
  assert.equal(history[1]?.type, "withdrawn");
  assert.equal(await tracker.isConsentActive("case-consent-001"), false);

  const trackerAfterRestart = new PostgresConsentTracker(pool);
  await trackerAfterRestart.initialize();
  const historyAfterRestart = await trackerAfterRestart.getConsentHistory("case-consent-001");
  assert.equal(historyAfterRestart.length, 2);
  assert.equal(await trackerAfterRestart.isConsentActive("case-consent-001"), false);

  await trackerAfterRestart.recordConsent("case-consent-001", {
    type: "renewed",
    timestamp: "2026-04-18T02:00:00.000Z",
    scope: "genomic-analysis",
    version: "2.0",
  });

  assert.equal(await trackerAfterRestart.isConsentActive("case-consent-001"), true);
  await pool.end();
});
