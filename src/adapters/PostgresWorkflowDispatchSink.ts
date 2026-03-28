import type { WorkflowDispatchRecord } from "../types";
import type { IWorkflowDispatchSink } from "../ports/IWorkflowDispatchSink";

interface QueryResult<T> {
  rows: T[];
}

interface WorkflowDispatchClient {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
  release(): void;
}

interface WorkflowDispatchPool {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
  connect(): Promise<WorkflowDispatchClient>;
  end(): Promise<void>;
}

export interface PostgresWorkflowDispatchSinkOptions {
  tableName?: string;
}

interface WorkflowDispatchRow {
  dispatch_id: string;
  case_id: string;
  request_id: string;
  workflow_name: string;
  reference_bundle_id: string;
  execution_profile: string;
  requested_by: string | null;
  requested_at: string | Date;
  idempotency_key: string | null;
  correlation_id: string | null;
  status: WorkflowDispatchRecord["status"];
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteIdentifier(value: string): string {
  if (!isValidIdentifier(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  }

  return `"${value}"`;
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PostgresWorkflowDispatchSink implements IWorkflowDispatchSink {
  private readonly tableName: string;
  private readonly qualifiedTableName: string;
  private initialized = false;

  constructor(
    private readonly pool: WorkflowDispatchPool,
    options: PostgresWorkflowDispatchSinkOptions = {},
  ) {
    this.tableName = options.tableName ?? "workflow_dispatches";
    this.qualifiedTableName = quoteIdentifier(this.tableName);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.qualifiedTableName} (
        dispatch_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        workflow_name TEXT NOT NULL,
        reference_bundle_id TEXT NOT NULL,
        execution_profile TEXT NOT NULL,
        requested_by TEXT NULL,
        requested_at TIMESTAMPTZ NOT NULL,
        idempotency_key TEXT NULL,
        correlation_id TEXT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.tableName}_case_requested_idx`)} ON ${this.qualifiedTableName} (case_id, requested_at)`
    );
    this.initialized = true;
  }

  async recordWorkflowRequested(dispatch: WorkflowDispatchRecord): Promise<void> {
    await this.initialize();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO ${this.qualifiedTableName} (
            dispatch_id,
            case_id,
            request_id,
            workflow_name,
            reference_bundle_id,
            execution_profile,
            requested_by,
            requested_at,
            idempotency_key,
            correlation_id,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11)
        `,
        [
          dispatch.dispatchId,
          dispatch.caseId,
          dispatch.requestId,
          dispatch.workflowName,
          dispatch.referenceBundleId,
          dispatch.executionProfile,
          dispatch.requestedBy ?? null,
          dispatch.requestedAt,
          dispatch.idempotencyKey ?? null,
          dispatch.correlationId ?? null,
          dispatch.status,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listDispatches(): Promise<WorkflowDispatchRecord[]> {
    await this.initialize();

    const result = await this.pool.query<WorkflowDispatchRow>(
      `
        SELECT
          dispatch_id,
          case_id,
          request_id,
          workflow_name,
          reference_bundle_id,
          execution_profile,
          requested_by,
          requested_at,
          idempotency_key,
          correlation_id,
          status
        FROM ${this.qualifiedTableName}
        ORDER BY requested_at ASC, dispatch_id ASC
      `,
    );

    return result.rows.map((row) => ({
      dispatchId: row.dispatch_id,
      caseId: row.case_id,
      requestId: row.request_id,
      workflowName: row.workflow_name,
      referenceBundleId: row.reference_bundle_id,
      executionProfile: row.execution_profile,
      requestedBy: row.requested_by ?? undefined,
      requestedAt: normalizeTimestamp(row.requested_at),
      idempotencyKey: row.idempotency_key ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      status: row.status,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}