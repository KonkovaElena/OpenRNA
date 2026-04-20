import { InMemoryWorkflowDispatchSink } from "./InMemoryWorkflowDispatchSink";
import { DEFAULT_ANONYMOUS_ACTOR_ID } from "../audit-context";
import type { IWorkflowDispatchSink } from "../ports/IWorkflowDispatchSink";
import type {
  AdministrationRecord,
  ArtifactRecord,
  BoardPacketRecord,
  BoardPacketSnapshot,
  CaseAuditEventRecord,
  CaseProfile,
  CaseRecord,
  CaseStatus,
  ClinicalFollowUpRecord,
  ConstructDesignPackage,
  GenerateHandoffPacketInput,
  HandoffPacketGenerationResult,
  HandoffPacketRecord,
  HandoffPacketSnapshot,
  HlaConsensusRecord,
  HlaDisagreementRecord,
  ImmuneMonitoringRecord,
  OperationsSummary,
  OutcomeTimelineEntry,
  QcGateRecord,
  RankingResult,
  RecordReviewOutcomeInput,
  RunArtifact,
  ReviewOutcomeRecord,
  ReviewOutcomeResult,
  SampleRecord,
  TimelineEvent,
  WorkflowRequestRecord,
  WorkflowRunRecord,
  WorkflowTerminalMetadata,
  WorkflowRunManifest,
  ReferenceBundleManifest,
} from "../types";
import { MemoryCaseStore, SystemClock, type AuditContextInput, type CaseStore, type Clock } from "../store";

interface QueryResult<T> {
  rows: T[];
}

interface PostgresCaseStoreQueryable {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

interface PostgresCaseStoreClient extends PostgresCaseStoreQueryable {
  release(): void;
}

interface PostgresCaseStorePool extends PostgresCaseStoreQueryable {
  connect(): Promise<PostgresCaseStoreClient>;
  end(): Promise<void>;
}

interface StatusCountRow {
  status: CaseStatus;
  count: string | number;
}

const caseStatuses: readonly CaseStatus[] = [
  "INTAKING",
  "AWAITING_CONSENT",
  "READY_FOR_WORKFLOW",
  "WORKFLOW_REQUESTED",
  "WORKFLOW_RUNNING",
  "WORKFLOW_COMPLETED",
  "WORKFLOW_CANCELLED",
  "WORKFLOW_FAILED",
  "QC_PASSED",
  "QC_FAILED",
  "AWAITING_REVIEW",
  "APPROVED_FOR_HANDOFF",
  "REVISION_REQUESTED",
  "REVIEW_REJECTED",
  "HANDOFF_PENDING",
];

// ── JSONB / timestamp helpers ────────────────────────────────────────

function parseJsonb<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function jsonOrNull(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function emptyStatusCounts(): Record<CaseStatus, number> {
  return Object.fromEntries(caseStatuses.map((s) => [s, 0])) as Record<CaseStatus, number>;
}

// ── Row → domain mappers ─────────────────────────────────────────────

function mapSampleRow(r: Record<string, unknown>): SampleRecord {
  return {
    sampleId: String(r.sample_id),
    sampleType: String(r.sample_type) as SampleRecord["sampleType"],
    assayType: String(r.assay_type) as SampleRecord["assayType"],
    accessionId: String(r.accession_id),
    sourceSite: String(r.source_site),
    registeredAt: toIso(r.registered_at),
  };
}

function mapArtifactRow(r: Record<string, unknown>): ArtifactRecord {
  return {
    artifactId: String(r.artifact_id),
    artifactClass: String(r.artifact_class) as ArtifactRecord["artifactClass"],
    sampleId: String(r.sample_id),
    semanticType: String(r.semantic_type) as ArtifactRecord["semanticType"],
    schemaVersion: Number(r.schema_version),
    artifactHash: String(r.artifact_hash),
    storageUri: r.storage_uri != null ? String(r.storage_uri) : undefined,
    mediaType: r.media_type != null ? String(r.media_type) : undefined,
    registeredAt: toIso(r.registered_at),
  };
}

function mapWorkflowRequestRow(r: Record<string, unknown>): WorkflowRequestRecord {
  return {
    requestId: String(r.request_id),
    workflowName: String(r.workflow_name),
    referenceBundleId: String(r.reference_bundle_id),
    executionProfile: String(r.execution_profile),
    requestedBy: r.requested_by != null ? String(r.requested_by) : undefined,
    requestedAt: toIso(r.requested_at),
    idempotencyKey: r.idempotency_key != null ? String(r.idempotency_key) : undefined,
    correlationId: r.correlation_id != null ? String(r.correlation_id) : undefined,
  };
}

function mapWorkflowRunRow(r: Record<string, unknown>): WorkflowRunRecord {
  return {
    runId: String(r.run_id),
    caseId: String(r.case_id),
    requestId: String(r.request_id),
    status: String(r.status) as WorkflowRunRecord["status"],
    workflowName: String(r.workflow_name),
    referenceBundleId: String(r.reference_bundle_id),
    pinnedReferenceBundle: r.pinned_reference_bundle != null ? parseJsonb<ReferenceBundleManifest>(r.pinned_reference_bundle) : undefined,
    executionProfile: String(r.execution_profile),
    acceptedAt: r.accepted_at != null ? toIso(r.accepted_at) : undefined,
    startedAt: r.started_at != null ? toIso(r.started_at) : undefined,
    completedAt: r.completed_at != null ? toIso(r.completed_at) : undefined,
    failureReason: r.failure_reason != null ? String(r.failure_reason) : undefined,
    failureCategory: r.failure_category != null ? String(r.failure_category) as WorkflowRunRecord["failureCategory"] : undefined,
    terminalMetadata: r.terminal_metadata != null ? parseJsonb<WorkflowTerminalMetadata>(r.terminal_metadata) : undefined,
    manifest: r.manifest != null ? parseJsonb<WorkflowRunManifest>(r.manifest) : undefined,
  };
}

function mapRunArtifactRow(r: Record<string, unknown>): RunArtifact {
  return {
    artifactId: String(r.artifact_id),
    runId: String(r.run_id),
    artifactClass: "DERIVED",
    semanticType: String(r.semantic_type) as RunArtifact["semanticType"],
    artifactHash: String(r.artifact_hash),
    producingStep: String(r.producing_step),
    registeredAt: toIso(r.registered_at),
  };
}

function mapAuditEventRow(r: Record<string, unknown>): CaseAuditEventRecord {
  return {
    eventId: String(r.event_id),
    type: String(r.event_type) as CaseAuditEventRecord["type"],
    detail: String(r.detail),
    correlationId: String(r.correlation_id),
    actorId: r.actor_id != null ? String(r.actor_id) : DEFAULT_ANONYMOUS_ACTOR_ID,
    authMechanism: r.auth_mechanism != null
      ? String(r.auth_mechanism) as CaseAuditEventRecord["authMechanism"]
      : "anonymous",
    occurredAt: toIso(r.occurred_at),
  };
}

function mapTimelineRow(r: Record<string, unknown>): TimelineEvent {
  return {
    at: toIso(r.at),
    type: String(r.event_type),
    detail: String(r.detail),
  };
}

function mapHlaConsensusRow(r: Record<string, unknown>): HlaConsensusRecord {
  return {
    caseId: String(r.case_id),
    alleles: parseJsonb<string[]>(r.alleles),
    perToolEvidence: parseJsonb<HlaConsensusRecord["perToolEvidence"]>(r.per_tool_evidence),
    confidenceScore: Number(r.confidence_score),
    tieBreakNotes: r.tie_break_notes != null ? String(r.tie_break_notes) : undefined,
    referenceVersion: String(r.reference_version),
    producedAt: toIso(r.produced_at),
    disagreements: r.disagreements != null ? parseJsonb<HlaDisagreementRecord[]>(r.disagreements) : undefined,
    confidenceDecomposition: r.confidence_decomposition != null ? parseJsonb<Record<string, number>>(r.confidence_decomposition) : undefined,
  };
}

function mapQcGateRow(r: Record<string, unknown>): QcGateRecord {
  return {
    runId: String(r.run_id),
    outcome: String(r.outcome) as QcGateRecord["outcome"],
    results: parseJsonb<QcGateRecord["results"]>(r.results),
    evaluatedAt: toIso(r.evaluated_at),
  };
}

function mapBoardPacketRow(r: Record<string, unknown>): BoardPacketRecord {
  return {
    packetId: String(r.packet_id),
    caseId: String(r.case_id),
    artifactClass: "BOARD_PACKET",
    boardRoute: String(r.board_route),
    version: Number(r.version),
    schemaVersion: Number(r.schema_version),
    packetHash: String(r.packet_hash),
    createdAt: toIso(r.created_at),
    snapshot: parseJsonb<BoardPacketSnapshot>(r.snapshot),
  };
}

function mapReviewOutcomeRow(r: Record<string, unknown>): ReviewOutcomeRecord {
  return {
    reviewId: String(r.review_id),
    caseId: String(r.case_id),
    packetId: String(r.packet_id),
    reviewerId: String(r.reviewer_id),
    reviewerRole: r.reviewer_role != null ? String(r.reviewer_role) : undefined,
    reviewDisposition: String(r.review_disposition) as ReviewOutcomeRecord["reviewDisposition"],
    rationale: String(r.rationale),
    comments: r.comments != null ? String(r.comments) : undefined,
    reviewedAt: toIso(r.reviewed_at),
  };
}

function mapHandoffPacketRow(r: Record<string, unknown>): HandoffPacketRecord {
  return {
    handoffId: String(r.handoff_id),
    caseId: String(r.case_id),
    reviewId: String(r.review_id),
    packetId: String(r.packet_id),
    artifactClass: "HANDOFF_PACKET",
    constructId: String(r.construct_id),
    constructVersion: Number(r.construct_version),
    handoffTarget: String(r.handoff_target),
    schemaVersion: Number(r.schema_version),
    packetHash: String(r.packet_hash),
    createdAt: toIso(r.created_at),
    snapshot: parseJsonb<HandoffPacketSnapshot>(r.snapshot),
  };
}

function mapOutcomeTimelineRow(r: Record<string, unknown>): OutcomeTimelineEntry {
  const entryType = String(r.entry_type);
  const base = {
    entryId: String(r.entry_id),
    caseId: String(r.case_id),
    constructId: String(r.construct_id),
    constructVersion: Number(r.construct_version),
    occurredAt: toIso(r.occurred_at),
  };

  if (entryType === "administration") {
    return {
      ...base,
      entryType,
      administration: parseJsonb<AdministrationRecord>(r.payload),
    };
  }

  if (entryType === "immune-monitoring") {
    return {
      ...base,
      entryType,
      immuneMonitoring: parseJsonb<ImmuneMonitoringRecord>(r.payload),
    };
  }

  if (entryType === "clinical-follow-up") {
    return {
      ...base,
      entryType,
      clinicalFollowUp: parseJsonb<ClinicalFollowUpRecord>(r.payload),
    };
  }

  throw new Error(`Unknown outcome timeline entry_type: ${entryType}`);
}

// ── Store implementation ─────────────────────────────────────────────

export class PostgresCaseStore implements CaseStore {
  private initialized = false;

  constructor(
    private readonly pool: PostgresCaseStorePool,
    private readonly clock: Clock = new SystemClock(),
    private readonly workflowDispatchSink: IWorkflowDispatchSink = new InMemoryWorkflowDispatchSink(),
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const exists = await this.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'cases' LIMIT 1`,
    );
    if (!exists.rows[0]) {
      throw new Error("Database schema not found. Run migration 001_full_schema.sql before starting the application.");
    }
    this.initialized = true;
  }

  async createCase(rawInput: unknown, correlationId: Parameters<MemoryCaseStore["createCase"]>[1]): Promise<CaseRecord> {
    await this.initialize();
    const store = this.createMemoryStore();
    const record = await store.createCase(rawInput, correlationId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.saveCaseRecord(client, record);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return record;
  }

  async listCases(options?: { limit?: number; offset?: number }): Promise<{ cases: CaseRecord[]; totalCount: number }> {
    await this.initialize();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const countResult = await this.pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM cases`);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);
    const result = await this.pool.query<{ case_id: string }>(
      `SELECT case_id FROM cases ORDER BY created_at ASC, case_id ASC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const records: CaseRecord[] = [];
    for (const row of result.rows) {
      const record = await this.loadCaseRecord(this.pool, String(row.case_id));
      if (record) records.push(record);
    }
    return { cases: records, totalCount };
  }

  async getCase(caseId: string): Promise<CaseRecord> {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getCase(caseId);
  }

  async registerSample(caseId: string, rawInput: unknown, correlationId: Parameters<MemoryCaseStore["registerSample"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.registerSample(caseId, rawInput, correlationId));
  }

  async registerArtifact(caseId: string, rawInput: unknown, correlationId: Parameters<MemoryCaseStore["registerArtifact"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.registerArtifact(caseId, rawInput, correlationId));
  }

  async requestWorkflow(caseId: string, rawInput: unknown, correlationId: Parameters<MemoryCaseStore["requestWorkflow"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.requestWorkflow(caseId, rawInput, correlationId));
  }

  async getOperationsSummary(): Promise<OperationsSummary> {
    await this.initialize();
    const statusCounts = emptyStatusCounts();
    const result = await this.pool.query<StatusCountRow>(
      `SELECT status, COUNT(*)::int AS count FROM cases GROUP BY status`,
    );
    for (const row of result.rows) {
      statusCounts[row.status] = Number(row.count);
    }
    const totalCases = Object.values(statusCounts).reduce((sum, c) => sum + c, 0);
    return {
      totalCases,
      statusCounts,
      awaitingConsentCount: statusCounts.AWAITING_CONSENT,
      readyForWorkflowCount: statusCounts.READY_FOR_WORKFLOW,
      workflowRequestedCount: statusCounts.WORKFLOW_REQUESTED,
    };
  }

  async startWorkflowRun(caseId: string, startedRun: Parameters<MemoryCaseStore["startWorkflowRun"]>[1], correlationId: Parameters<MemoryCaseStore["startWorkflowRun"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.startWorkflowRun(caseId, startedRun, correlationId));
  }

  async completeWorkflowRun(caseId: string, completedRun: Parameters<MemoryCaseStore["completeWorkflowRun"]>[1], derivedArtifacts: Parameters<MemoryCaseStore["completeWorkflowRun"]>[2], correlationId: Parameters<MemoryCaseStore["completeWorkflowRun"]>[3]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.completeWorkflowRun(caseId, completedRun, derivedArtifacts, correlationId));
  }

  async cancelWorkflowRun(caseId: string, cancelledRun: Parameters<MemoryCaseStore["cancelWorkflowRun"]>[1], correlationId: Parameters<MemoryCaseStore["cancelWorkflowRun"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.cancelWorkflowRun(caseId, cancelledRun, correlationId));
  }

  async failWorkflowRun(caseId: string, failedRun: Parameters<MemoryCaseStore["failWorkflowRun"]>[1], correlationId: Parameters<MemoryCaseStore["failWorkflowRun"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.failWorkflowRun(caseId, failedRun, correlationId));
  }

  async recordHlaConsensus(caseId: string, record: Parameters<MemoryCaseStore["recordHlaConsensus"]>[1], correlationId: Parameters<MemoryCaseStore["recordHlaConsensus"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.recordHlaConsensus(caseId, record, correlationId));
  }

  async getHlaConsensus(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getHlaConsensus(caseId);
  }

  async recordQcGate(caseId: string, runId: string, gate: Parameters<MemoryCaseStore["recordQcGate"]>[2], correlationId: Parameters<MemoryCaseStore["recordQcGate"]>[3]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.recordQcGate(caseId, runId, gate, correlationId));
  }

  async getQcGate(caseId: string, runId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getQcGate(caseId, runId);
  }

  async getWorkflowRun(caseId: string, runId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getWorkflowRun(caseId, runId);
  }

  async listWorkflowRuns(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.listWorkflowRuns(caseId);
  }

  async generateBoardPacket(caseId: string, correlationId: Parameters<MemoryCaseStore["generateBoardPacket"]>[1]) {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const store = await this.createMemoryStoreForCase(caseId, client, true);
      const result = await store.generateBoardPacket(caseId, correlationId);
      await this.saveCaseRecord(client, result.case);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listBoardPackets(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.listBoardPackets(caseId);
  }

  async getBoardPacket(caseId: string, packetId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getBoardPacket(caseId, packetId);
  }

  async recordReviewOutcome(caseId: string, input: RecordReviewOutcomeInput, correlationId: Parameters<MemoryCaseStore["recordReviewOutcome"]>[2]): Promise<ReviewOutcomeResult> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const store = await this.createMemoryStoreForCase(caseId, client, true);
      const result = await store.recordReviewOutcome(caseId, input, correlationId);
      await this.saveCaseRecord(client, result.case);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listReviewOutcomes(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.listReviewOutcomes(caseId);
  }

  async getReviewOutcome(caseId: string, reviewId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getReviewOutcome(caseId, reviewId);
  }

  async generateHandoffPacket(caseId: string, input: GenerateHandoffPacketInput, correlationId: Parameters<MemoryCaseStore["generateHandoffPacket"]>[2]): Promise<HandoffPacketGenerationResult> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const store = await this.createMemoryStoreForCase(caseId, client, true);
      const result = await store.generateHandoffPacket(caseId, input, correlationId);
      await this.saveCaseRecord(client, result.case);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listHandoffPackets(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.listHandoffPackets(caseId);
  }

  async getHandoffPacket(caseId: string, handoffId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getHandoffPacket(caseId, handoffId);
  }

  async recordNeoantigenRanking(caseId: string, ranking: Parameters<MemoryCaseStore["recordNeoantigenRanking"]>[1], correlationId: Parameters<MemoryCaseStore["recordNeoantigenRanking"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.recordNeoantigenRanking(caseId, ranking, correlationId));
  }

  async getNeoantigenRanking(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getNeoantigenRanking(caseId);
  }

  async recordConstructDesign(caseId: string, constructDesign: ConstructDesignPackage, correlationId: Parameters<MemoryCaseStore["recordConstructDesign"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.recordConstructDesign(caseId, constructDesign, correlationId));
  }

  async getConstructDesign(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getConstructDesign(caseId);
  }

  async recordAdministration(caseId: string, administration: Parameters<MemoryCaseStore["recordAdministration"]>[1], correlationId: Parameters<MemoryCaseStore["recordAdministration"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.recordAdministration(caseId, administration, correlationId));
  }

  async recordImmuneMonitoring(caseId: string, immuneMonitoring: Parameters<MemoryCaseStore["recordImmuneMonitoring"]>[1], correlationId: Parameters<MemoryCaseStore["recordImmuneMonitoring"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.recordImmuneMonitoring(caseId, immuneMonitoring, correlationId));
  }

  async recordClinicalFollowUp(caseId: string, clinicalFollowUp: Parameters<MemoryCaseStore["recordClinicalFollowUp"]>[1], correlationId: Parameters<MemoryCaseStore["recordClinicalFollowUp"]>[2]): Promise<CaseRecord> {
    return this.mutateCase(caseId, (store) => store.recordClinicalFollowUp(caseId, clinicalFollowUp, correlationId));
  }

  async getOutcomeTimeline(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getOutcomeTimeline(caseId);
  }

  async getFullTraceability(caseId: string) {
    await this.initialize();
    const store = await this.createMemoryStoreForCase(caseId);
    return store.getFullTraceability(caseId);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private createMemoryStore(records: readonly CaseRecord[] = []): MemoryCaseStore {
    return new MemoryCaseStore(this.clock, this.workflowDispatchSink, records);
  }

  private async createMemoryStoreForCase(
    caseId: string,
    queryable: PostgresCaseStoreQueryable = this.pool,
    forUpdate = false,
  ): Promise<MemoryCaseStore> {
    const record = await this.loadCaseRecord(queryable, caseId, forUpdate);
    return this.createMemoryStore(record ? [record] : []);
  }

  private async loadCaseRecord(
    queryable: PostgresCaseStoreQueryable,
    caseId: string,
    forUpdate = false,
  ): Promise<CaseRecord | null> {
    const lock = forUpdate ? " FOR UPDATE" : "";
    const caseResult = await queryable.query<Record<string, unknown>>(
      `SELECT case_id, status, created_at, updated_at, case_profile, neoantigen_ranking, construct_design FROM cases WHERE case_id = $1${lock}`,
      [caseId],
    );
    if (!caseResult.rows[0]) return null;
    const c = caseResult.rows[0];

    const samplesR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM samples WHERE case_id = $1 ORDER BY registered_at`, [caseId]);
    const artifactsR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM artifacts WHERE case_id = $1 ORDER BY registered_at`, [caseId]);
    const requestsR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM workflow_requests WHERE case_id = $1 ORDER BY requested_at`, [caseId]);
    const runsR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM workflow_runs WHERE case_id = $1 ORDER BY started_at NULLS LAST`, [caseId]);
    const runArtsR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM run_artifacts WHERE case_id = $1 ORDER BY registered_at`, [caseId]);
    const auditsR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM audit_events WHERE case_id = $1 ORDER BY occurred_at`, [caseId]);
    const timelineR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM timeline_events WHERE case_id = $1 ORDER BY at`, [caseId]);
    const outcomesR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM outcome_timeline WHERE case_id = $1 ORDER BY occurred_at, entry_id`, [caseId]);
    const hlaR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM hla_consensus WHERE case_id = $1`, [caseId]);
    const qcR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM qc_gates WHERE case_id = $1`, [caseId]);
    const packetsR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM board_packets WHERE case_id = $1 ORDER BY created_at`, [caseId]);
    const reviewOutcomesR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM review_outcomes WHERE case_id = $1 ORDER BY reviewed_at`, [caseId]);
    const handoffPacketsR = await queryable.query<Record<string, unknown>>(
      `SELECT * FROM handoff_packets WHERE case_id = $1 ORDER BY created_at`, [caseId]);

    return {
      caseId: String(c.case_id),
      status: String(c.status) as CaseStatus,
      createdAt: toIso(c.created_at),
      updatedAt: toIso(c.updated_at),
      caseProfile: parseJsonb<CaseProfile>(c.case_profile),
      samples: samplesR.rows.map(mapSampleRow),
      artifacts: artifactsR.rows.map(mapArtifactRow),
      workflowRequests: requestsR.rows.map(mapWorkflowRequestRow),
      timeline: timelineR.rows.map(mapTimelineRow),
      auditEvents: auditsR.rows.map(mapAuditEventRow),
      workflowRuns: runsR.rows.map(mapWorkflowRunRow),
      derivedArtifacts: runArtsR.rows.map(mapRunArtifactRow),
      hlaConsensus: hlaR.rows[0] ? mapHlaConsensusRow(hlaR.rows[0]) : undefined,
      qcGates: qcR.rows.map(mapQcGateRow),
      boardPackets: packetsR.rows.map(mapBoardPacketRow),
      reviewOutcomes: reviewOutcomesR.rows.map(mapReviewOutcomeRow),
      handoffPackets: handoffPacketsR.rows.map(mapHandoffPacketRow),
      neoantigenRanking: c.neoantigen_ranking != null ? parseJsonb<RankingResult>(c.neoantigen_ranking) : undefined,
      constructDesign: c.construct_design != null ? parseJsonb<ConstructDesignPackage>(c.construct_design) : undefined,
      outcomeTimeline: outcomesR.rows.map(mapOutcomeTimelineRow),
    };
  }

  private async saveCaseRecord(queryable: PostgresCaseStoreQueryable, record: CaseRecord): Promise<void> {
    const id = record.caseId;

    // Delete children in FK-safe order (leaves first)
    await queryable.query(`DELETE FROM handoff_packets WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM review_outcomes WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM board_packets WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM outcome_timeline WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM qc_gates WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM run_artifacts WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM hla_consensus WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM workflow_runs WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM workflow_requests WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM timeline_events WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM audit_events WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM artifacts WHERE case_id = $1`, [id]);
    await queryable.query(`DELETE FROM samples WHERE case_id = $1`, [id]);

    // Upsert case row
    await queryable.query(
      `INSERT INTO cases (case_id, status, created_at, updated_at, case_profile, neoantigen_ranking, construct_design)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (case_id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at,
         case_profile = EXCLUDED.case_profile,
         neoantigen_ranking = EXCLUDED.neoantigen_ranking,
         construct_design = EXCLUDED.construct_design`,
      [
        id,
        record.status,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record.caseProfile),
        jsonOrNull(record.neoantigenRanking),
        jsonOrNull(record.constructDesign),
      ],
    );

    // Insert samples
    for (const s of record.samples) {
      await queryable.query(
        `INSERT INTO samples (sample_id, case_id, sample_type, assay_type, accession_id, source_site, registered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [s.sampleId, id, s.sampleType, s.assayType, s.accessionId, s.sourceSite, s.registeredAt],
      );
    }

    // Insert artifacts
    for (const a of record.artifacts) {
      await queryable.query(
        `INSERT INTO artifacts (artifact_id, case_id, artifact_class, sample_id, semantic_type, schema_version, artifact_hash, storage_uri, media_type, registered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [a.artifactId, id, a.artifactClass, a.sampleId, a.semanticType, a.schemaVersion, a.artifactHash, a.storageUri ?? null, a.mediaType ?? null, a.registeredAt],
      );
    }

    // Insert workflow requests
    for (const w of record.workflowRequests) {
      await queryable.query(
        `INSERT INTO workflow_requests (request_id, case_id, workflow_name, reference_bundle_id, execution_profile, requested_by, requested_at, idempotency_key, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [w.requestId, id, w.workflowName, w.referenceBundleId, w.executionProfile, w.requestedBy ?? null, w.requestedAt, w.idempotencyKey ?? null, w.correlationId ?? null],
      );
    }

    // Insert workflow runs
    for (const r of record.workflowRuns) {
      await queryable.query(
        `INSERT INTO workflow_runs (run_id, case_id, request_id, status, workflow_name, reference_bundle_id, pinned_reference_bundle, execution_profile, accepted_at, started_at, completed_at, failure_reason, failure_category, terminal_metadata, manifest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [r.runId, id, r.requestId, r.status, r.workflowName, r.referenceBundleId,
         jsonOrNull(r.pinnedReferenceBundle), r.executionProfile,
         r.acceptedAt ?? null, r.startedAt ?? null, r.completedAt ?? null,
         r.failureReason ?? null, r.failureCategory ?? null,
         jsonOrNull(r.terminalMetadata), jsonOrNull(r.manifest)],
      );
    }

    // Insert run artifacts (derived)
    for (const a of record.derivedArtifacts) {
      await queryable.query(
        `INSERT INTO run_artifacts (artifact_id, run_id, case_id, artifact_class, semantic_type, artifact_hash, producing_step, registered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [a.artifactId, a.runId, id, a.artifactClass, a.semanticType, a.artifactHash, a.producingStep, a.registeredAt],
      );
    }

    // Insert audit events
    for (const e of record.auditEvents) {
      await queryable.query(
        `INSERT INTO audit_events (event_id, case_id, event_type, detail, correlation_id, actor_id, auth_mechanism, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [e.eventId, id, e.type, e.detail, e.correlationId, e.actorId, e.authMechanism, e.occurredAt],
      );
    }

    // Insert timeline events
    for (const t of record.timeline) {
      await queryable.query(
        `INSERT INTO timeline_events (case_id, at, event_type, detail)
         VALUES ($1,$2,$3,$4)`,
        [id, t.at, t.type, t.detail],
      );
    }

    // Insert HLA consensus
    if (record.hlaConsensus) {
      const h = record.hlaConsensus;
      await queryable.query(
        `INSERT INTO hla_consensus (case_id, alleles, per_tool_evidence, confidence_score, tie_break_notes, reference_version, produced_at, disagreements, confidence_decomposition)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, JSON.stringify(h.alleles), JSON.stringify(h.perToolEvidence), h.confidenceScore, h.tieBreakNotes ?? null, h.referenceVersion, h.producedAt, h.disagreements ? JSON.stringify(h.disagreements) : null, h.confidenceDecomposition ? JSON.stringify(h.confidenceDecomposition) : null],
      );
    }

    // Insert QC gates
    for (const q of record.qcGates) {
      await queryable.query(
        `INSERT INTO qc_gates (case_id, run_id, outcome, results, evaluated_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, q.runId, q.outcome, JSON.stringify(q.results), q.evaluatedAt],
      );
    }

    // Insert board packets
    for (const p of record.boardPackets) {
      await queryable.query(
        `INSERT INTO board_packets (packet_id, case_id, artifact_class, board_route, version, schema_version, packet_hash, created_at, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.packetId, id, p.artifactClass, p.boardRoute, p.version, p.schemaVersion, p.packetHash, p.createdAt, JSON.stringify(p.snapshot)],
      );
    }

    for (const reviewOutcome of record.reviewOutcomes) {
      await queryable.query(
        `INSERT INTO review_outcomes (review_id, case_id, packet_id, reviewer_id, reviewer_role, review_disposition, rationale, comments, reviewed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          reviewOutcome.reviewId,
          id,
          reviewOutcome.packetId,
          reviewOutcome.reviewerId,
          reviewOutcome.reviewerRole ?? null,
          reviewOutcome.reviewDisposition,
          reviewOutcome.rationale,
          reviewOutcome.comments ?? null,
          reviewOutcome.reviewedAt,
        ],
      );
    }

    for (const handoff of record.handoffPackets) {
      await queryable.query(
        `INSERT INTO handoff_packets (handoff_id, case_id, review_id, packet_id, artifact_class, construct_id, construct_version, handoff_target, schema_version, packet_hash, created_at, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          handoff.handoffId,
          id,
          handoff.reviewId,
          handoff.packetId,
          handoff.artifactClass,
          handoff.constructId,
          handoff.constructVersion,
          handoff.handoffTarget,
          handoff.schemaVersion,
          handoff.packetHash,
          handoff.createdAt,
          JSON.stringify(handoff.snapshot),
        ],
      );
    }

    for (const outcome of record.outcomeTimeline) {
      const payload = outcome.entryType === "administration"
        ? outcome.administration
        : outcome.entryType === "immune-monitoring"
          ? outcome.immuneMonitoring
          : outcome.clinicalFollowUp;

      await queryable.query(
        `INSERT INTO outcome_timeline (entry_id, case_id, construct_id, construct_version, entry_type, occurred_at, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          outcome.entryId,
          id,
          outcome.constructId,
          outcome.constructVersion,
          outcome.entryType,
          outcome.occurredAt,
          JSON.stringify(payload),
        ],
      );
    }
  }

  private async mutateCase(
    caseId: string,
    mutation: (store: MemoryCaseStore) => Promise<CaseRecord>,
  ): Promise<CaseRecord> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const store = await this.createMemoryStoreForCase(caseId, client, true);
      const nextRecord = await mutation(store);
      await this.saveCaseRecord(client, nextRecord);
      await client.query("COMMIT");
      return nextRecord;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}