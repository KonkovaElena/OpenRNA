import { randomUUID } from "node:crypto";
import type { ConsentEvent, IConsentTracker } from "../ports/IConsentTracker";

interface QueryResult<T> {
  rows: T[];
}

interface PostgresQueryable {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

interface ConsentEventRow {
  type: "granted" | "withdrawn" | "renewed";
  timestamp: string | Date;
  scope: string;
  version: string;
  witness_id: string | null;
  notes: string | null;
}

export class PostgresConsentTracker implements IConsentTracker {
  private initialized = false;

  constructor(private readonly db: PostgresQueryable) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'consent_events'
      ) AS exists`,
    );

    if (!result.rows[0]?.exists) {
      throw new Error("Database schema not found. Run migration 003_case_access_and_consent.sql before starting the application.");
    }

    this.initialized = true;
  }

  async recordConsent(caseId: string, event: ConsentEvent): Promise<void> {
    await this.initialize();
    await this.db.query(
      `INSERT INTO consent_events (event_id, case_id, type, timestamp, scope, version, witness_id, notes)
       VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8)`,
      [
        `consent_${randomUUID()}`,
        caseId,
        event.type,
        event.timestamp,
        event.scope,
        event.version,
        event.witnessId ?? null,
        event.notes ?? null,
      ],
    );
  }

  async getConsentHistory(caseId: string): Promise<ConsentEvent[]> {
    await this.initialize();
    const result = await this.db.query<ConsentEventRow>(
      `SELECT type, timestamp, scope, version, witness_id, notes
       FROM consent_events
       WHERE case_id = $1
       ORDER BY timestamp ASC`,
      [caseId],
    );

    return result.rows.map((row) => ({
      type: row.type,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
      scope: row.scope,
      version: row.version,
      witnessId: row.witness_id ?? undefined,
      notes: row.notes ?? undefined,
    }));
  }

  async isConsentActive(caseId: string): Promise<boolean> {
    await this.initialize();
    const result = await this.db.query<{ type: "granted" | "withdrawn" | "renewed" }>(
      `SELECT type
       FROM consent_events
       WHERE case_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [caseId],
    );

    const latest = result.rows[0];
    if (!latest) {
      return false;
    }

    return latest.type === "granted" || latest.type === "renewed";
  }
}
