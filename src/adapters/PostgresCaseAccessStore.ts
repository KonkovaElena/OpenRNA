import type { CaseAccessLevel, ICaseAccessStore } from "../ports/ICaseAccessStore";

interface QueryResult<T> {
  rows: T[];
}

interface PostgresQueryable {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

interface AccessRow {
  case_id: string;
}

export class PostgresCaseAccessStore implements ICaseAccessStore {
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
        WHERE table_schema = 'public' AND table_name = 'case_access'
      ) AS exists`,
    );

    if (!result.rows[0]?.exists) {
      throw new Error("Database schema not found. Run migration 003_case_access_and_consent.sql before starting the application.");
    }

    this.initialized = true;
  }

  async setOwner(caseId: string, principalId: string): Promise<void> {
    await this.initialize();
    await this.db.query(
      `INSERT INTO case_access (case_id, principal_id, access_level, granted_at)
       VALUES ($1, $2, 'OWNER', NOW())
       ON CONFLICT (case_id, principal_id, access_level) DO NOTHING`,
      [caseId, principalId],
    );
  }

  async grantAccess(caseId: string, principalId: string, accessLevel: CaseAccessLevel): Promise<void> {
    await this.initialize();
    await this.db.query(
      `INSERT INTO case_access (case_id, principal_id, access_level, granted_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (case_id, principal_id, access_level) DO NOTHING`,
      [caseId, principalId, accessLevel],
    );
  }

  async revokeAccess(caseId: string, principalId: string, accessLevel?: CaseAccessLevel): Promise<void> {
    await this.initialize();
    if (accessLevel) {
      await this.db.query(
        `DELETE FROM case_access
         WHERE case_id = $1 AND principal_id = $2 AND access_level = $3`,
        [caseId, principalId, accessLevel],
      );
      return;
    }

    await this.db.query(
      `DELETE FROM case_access
       WHERE case_id = $1 AND principal_id = $2`,
      [caseId, principalId],
    );
  }

  async canAccess(caseId: string, principalId: string): Promise<boolean> {
    await this.initialize();

    const hasRows = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM case_access WHERE case_id = $1
      ) AS exists`,
      [caseId],
    );

    if (!hasRows.rows[0]?.exists) {
      // Transitional behavior for legacy records without ACL rows.
      return true;
    }

    const match = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM case_access
        WHERE case_id = $1 AND principal_id = $2
      ) AS exists`,
      [caseId, principalId],
    );

    return Boolean(match.rows[0]?.exists);
  }

  async listAccessibleCaseIds(principalId: string): Promise<string[]> {
    await this.initialize();
    const result = await this.db.query<AccessRow>(
      `SELECT DISTINCT case_id
       FROM case_access
       WHERE principal_id = $1`,
      [principalId],
    );

    return result.rows.map((row) => String(row.case_id));
  }
}
