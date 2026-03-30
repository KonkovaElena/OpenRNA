import type { Pool, PoolClient } from "pg";
import type {
  WorkflowRunRecord,
  WorkflowFailureCategory,
  DerivedArtifactSemanticType,
} from "../types";
import type { IWorkflowRunner, WorkflowRunRequest } from "../ports/IWorkflowRunner";
import { ApiError } from "../errors";

/**
 * Postgres-backed IWorkflowRunner that persists workflow runs in the
 * normalized `workflow_runs` table (and `run_artifacts` for derived artifacts).
 */
export class PostgresWorkflowRunner implements IWorkflowRunner {
  constructor(private readonly pool: Pool) {}

  // ── Public API ──────────────────────────────────────────────────────

  async startRun(request: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    const client = await this.pool.connect();
    try {
      // Check for existing run (idempotent replay)
      const existing = await client.query(
        `SELECT * FROM workflow_runs WHERE run_id = $1`,
        [request.runId],
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        // Validate replay payload matches
        if (
          row.case_id !== request.caseId ||
          row.request_id !== request.requestId ||
          row.workflow_name !== request.workflowName ||
          row.reference_bundle_id !== request.referenceBundleId ||
          row.execution_profile !== request.executionProfile
        ) {
          throw new ApiError(
            409,
            "invalid_transition",
            "Workflow run replay payload does not match the existing run.",
            "Reuse the existing run only with the original workflow request metadata.",
          );
        }
        if (row.status === "RUNNING" || row.status === "PENDING") {
          return mapRow(row);
        }
        throw new ApiError(
          409,
          "invalid_transition",
          "Terminal workflow runs cannot be started again.",
          "Create a new workflow request instead of replaying start on a terminal run.",
        );
      }

      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO workflow_runs (
          run_id, case_id, request_id, status, workflow_name,
          reference_bundle_id, execution_profile, accepted_at, started_at, manifest
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          request.runId,
          request.caseId,
          request.requestId,
          "RUNNING",
          request.workflowName,
          request.referenceBundleId,
          request.executionProfile,
          now,
          now,
          request.manifest ? JSON.stringify(request.manifest) : null,
        ],
      );

      return {
        runId: request.runId,
        caseId: request.caseId,
        requestId: request.requestId,
        status: "RUNNING",
        workflowName: request.workflowName,
        referenceBundleId: request.referenceBundleId,
        executionProfile: request.executionProfile,
        acceptedAt: now,
        startedAt: now,
        ...(request.manifest ? { manifest: request.manifest } : {}),
      };
    } finally {
      client.release();
    }
  }

  async getRun(runId: string): Promise<WorkflowRunRecord> {
    const { rows } = await this.pool.query(
      `SELECT * FROM workflow_runs WHERE run_id = $1`,
      [runId],
    );
    if (rows.length === 0) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    return mapRow(rows[0]);
  }

  async cancelRun(runId: string): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    if (run.status === "CANCELLED") {
      return run;
    }
    if (run.status !== "RUNNING" && run.status !== "PENDING") {
      throw new ApiError(
        409,
        "invalid_transition",
        "Only running or pending runs can be cancelled.",
        "Check run status first.",
      );
    }
    const now = new Date().toISOString();
    await this.pool.query(
      `UPDATE workflow_runs SET status = $1, completed_at = $2 WHERE run_id = $3`,
      ["CANCELLED", now, runId],
    );
    return { ...run, status: "CANCELLED", completedAt: now };
  }

  async listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM workflow_runs WHERE case_id = $1 ORDER BY accepted_at`,
      [caseId],
    );
    return rows.map(mapRow);
  }

  async completeRun(
    runId: string,
    derivedArtifacts?: Array<{
      semanticType: DerivedArtifactSemanticType;
      artifactHash: string;
      producingStep: string;
    }>,
  ): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    if (run.status === "COMPLETED") {
      return run;
    }
    if (run.status !== "RUNNING") {
      throw new ApiError(
        409,
        "invalid_transition",
        "Only running workflows can be completed.",
        "Check run status first.",
      );
    }
    const now = new Date().toISOString();
    await this.pool.query(
      `UPDATE workflow_runs SET status = $1, completed_at = $2 WHERE run_id = $3`,
      ["COMPLETED", now, runId],
    );
    return { ...run, status: "COMPLETED", completedAt: now };
  }

  async failRun(
    runId: string,
    reason: string,
    failureCategory?: WorkflowFailureCategory,
  ): Promise<WorkflowRunRecord> {
    const run = await this.getRun(runId);
    const category = failureCategory ?? "unknown";

    if (run.status === "FAILED") {
      if ((run.failureReason ?? reason) !== reason) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Workflow failure replay reason does not match the existing terminal failure.",
          "Replay failure only with the original failure reason.",
        );
      }
      return run;
    }
    if (run.status !== "RUNNING") {
      throw new ApiError(
        409,
        "invalid_transition",
        "Only running workflows can be failed.",
        "Check run status first.",
      );
    }
    const now = new Date().toISOString();
    await this.pool.query(
      `UPDATE workflow_runs SET status = $1, completed_at = $2, failure_reason = $3, failure_category = $4 WHERE run_id = $5`,
      ["FAILED", now, reason, category, runId],
    );
    return {
      ...run,
      status: "FAILED",
      completedAt: now,
      failureReason: reason,
      failureCategory: category,
    };
  }
}

// ── Row mapper ────────────────────────────────────────────────────────

function parseJsonb<T>(val: unknown): T | undefined {
  if (val == null) return undefined;
  if (typeof val === "string") return JSON.parse(val) as T;
  return val as T;
}

function toIso(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function mapRow(row: any): WorkflowRunRecord {
  const rec: WorkflowRunRecord = {
    runId: row.run_id,
    caseId: row.case_id,
    requestId: row.request_id,
    status: row.status,
    workflowName: row.workflow_name,
    referenceBundleId: row.reference_bundle_id,
    executionProfile: row.execution_profile,
  };
  if (row.pinned_reference_bundle != null) {
    rec.pinnedReferenceBundle = parseJsonb(row.pinned_reference_bundle);
  }
  if (row.accepted_at != null) rec.acceptedAt = toIso(row.accepted_at);
  if (row.started_at != null) rec.startedAt = toIso(row.started_at);
  if (row.completed_at != null) rec.completedAt = toIso(row.completed_at);
  if (row.failure_reason != null) rec.failureReason = row.failure_reason;
  if (row.failure_category != null) rec.failureCategory = row.failure_category;
  if (row.terminal_metadata != null) {
    rec.terminalMetadata = parseJsonb(row.terminal_metadata);
  }
  if (row.manifest != null) rec.manifest = parseJsonb(row.manifest);
  return rec;
}
