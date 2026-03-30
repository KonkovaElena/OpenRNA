import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import { buildFullTraceability } from "./traceability";
import {
  parseConstructDesignInput,
  parseCreateCaseInput,
  parseGenerateHandoffPacketInput,
  parseRecordAdministrationInput,
  parseRecordClinicalFollowUpInput,
  parseRecordImmuneMonitoringInput,
  parseRecordReviewOutcomeInput,
  parseRegisterArtifactInput,
  parseRegisterSampleInput,
  parseRequestWorkflowInput,
} from "./validation";
import type { IWorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
import { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";
import type {
  AdministrationRecord,
  AssayType,
  ArtifactRecord,
  BoardPacketGenerationResult,
  BoardPacketRecord,
  BoardPacketSnapshot,
  CaseRecord,
  CaseAuditEventRecord,
  CaseAuditEventType,
  CaseStatus,
  ConstructDesignPackage,
  ConsentStatus,
  DerivedArtifactSemanticType,
  EvidenceLineageEdge,
  EvidenceLineageGraph,
  FullTraceabilityRecord,
  GenerateHandoffPacketInput,
  HandoffPacketGenerationResult,
  HandoffPacketRecord,
  HandoffPacketSnapshot,
  HlaConsensusRecord,
  ImmuneMonitoringRecord,
  OperationsSummary,
  OutcomeTimelineEntry,
  QcGateRecord,
  RankingResult,
  ReferenceBundleManifest,
  RecordReviewOutcomeInput,
  RetrievalProvenance,
  ReviewOutcomeRecord,
  ReviewOutcomeResult,
  RunArtifact,
  SampleRecord,
  SampleType,
  TimelineEvent,
  WorkflowDispatchRecord,
  WorkflowRequestRecord,
  WorkflowRunManifest,
  WorkflowRunRecord,
  ClinicalFollowUpRecord,
} from "./types";
import {
  assayTypes,
  caseStatuses,
  consentStatuses,
  isCompatibleSourceArtifactSemanticType,
  sampleTypes,
  workflowDependencies,
} from "./types";

export {
  parseActivateModalityInput,
  parseCompleteWorkflowRunInput,
  parseConstructDesignInput,
  parseCreateCaseInput,
  parseEvaluateQcGateInput,
  parseFailWorkflowRunInput,
  parseGenerateHandoffPacketInput,
  parseRecordAdministrationInput,
  parseRecordClinicalFollowUpInput,
  parseRecordHlaConsensusInput,
  parseRecordImmuneMonitoringInput,
  parseRecordReviewOutcomeInput,
  parseRegisterArtifactInput,
  parseRegisterBundleInput,
  parseRegisterSampleInput,
  parseRequestWorkflowInput,
  parseStartWorkflowRunInput,
  parseWorkflowOutputManifest,
  parseWorkflowRunManifest,
} from "./validation";

export interface ReconstructedRun extends WorkflowRunRecord {
  derivedArtifacts: ReadonlyArray<Pick<RunArtifact, "semanticType" | "artifactHash" | "producingStep">>;
}

export function reconstructRunFromManifest(
  manifest: WorkflowRunManifest,
  terminalEvidence: {
    runId: string;
    caseId: string;
    requestId: string;
    status: "COMPLETED" | "FAILED";
    completedAt?: string;
    failureReason?: string;
    derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>;
  },
): ReconstructedRun {
  return {
    runId: terminalEvidence.runId,
    caseId: terminalEvidence.caseId,
    requestId: terminalEvidence.requestId,
    status: terminalEvidence.status,
    workflowName: manifest.workflowName,
    referenceBundleId: manifest.pinnedReferenceBundle.bundleId,
    executionProfile: manifest.configProfile,
    acceptedAt: manifest.acceptedAt,
    completedAt: terminalEvidence.completedAt,
    failureReason: terminalEvidence.failureReason,
    manifest: structuredClone(manifest),
    derivedArtifacts: terminalEvidence.derivedArtifacts ?? [],
  };
}

const requiredSampleTypes: ReadonlySet<SampleType> = new Set(["TUMOR_DNA", "NORMAL_DNA", "TUMOR_RNA"]);

export interface Clock {
  nowIso(): string;
}

export class SystemClock implements Clock {
  nowIso(): string {
    return new Date().toISOString();
  }
}

export type { IWorkflowDispatchSink as WorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
export { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";

export interface CaseStore {
  createCase(rawInput: unknown, correlationId: string): Promise<CaseRecord>;
  listCases(options?: { limit?: number; offset?: number }): Promise<{ cases: CaseRecord[]; totalCount: number }>;
  getCase(caseId: string): Promise<CaseRecord>;
  registerSample(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord>;
  registerArtifact(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord>;
  requestWorkflow(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord>;
  getOperationsSummary(): Promise<OperationsSummary>;
  // Phase 2: workflow lifecycle
  startWorkflowRun(caseId: string, startedRun: WorkflowRunRecord, correlationId: string): Promise<CaseRecord>;
  completeWorkflowRun(caseId: string, completedRun: WorkflowRunRecord, derivedArtifacts: RunArtifact[], correlationId: string): Promise<CaseRecord>;
  cancelWorkflowRun(caseId: string, cancelledRun: WorkflowRunRecord, correlationId: string): Promise<CaseRecord>;
  failWorkflowRun(caseId: string, failedRun: WorkflowRunRecord, correlationId: string): Promise<CaseRecord>;
  // Phase 2: HLA consensus
  recordHlaConsensus(caseId: string, record: HlaConsensusRecord, correlationId: string): Promise<CaseRecord>;
  getHlaConsensus(caseId: string): Promise<HlaConsensusRecord | null>;
  // Phase 2: QC gate
  recordQcGate(caseId: string, runId: string, gate: QcGateRecord, correlationId: string): Promise<CaseRecord>;
  getQcGate(caseId: string, runId: string): Promise<QcGateRecord | null>;
  // Phase 2: workflow runs
  getWorkflowRun(caseId: string, runId: string): Promise<WorkflowRunRecord>;
  listWorkflowRuns(caseId: string): Promise<WorkflowRunRecord[]>;
  // Phase 2: expert review packets
  generateBoardPacket(caseId: string, correlationId: string): Promise<BoardPacketGenerationResult>;
  listBoardPackets(caseId: string): Promise<BoardPacketRecord[]>;
  getBoardPacket(caseId: string, packetId: string): Promise<BoardPacketRecord>;
  // Wave 15: review outcome + handoff
  recordReviewOutcome(caseId: string, input: RecordReviewOutcomeInput, correlationId: string): Promise<ReviewOutcomeResult>;
  listReviewOutcomes(caseId: string): Promise<ReviewOutcomeRecord[]>;
  getReviewOutcome(caseId: string, reviewId: string): Promise<ReviewOutcomeRecord>;
  generateHandoffPacket(caseId: string, input: GenerateHandoffPacketInput, correlationId: string): Promise<HandoffPacketGenerationResult>;
  listHandoffPackets(caseId: string): Promise<HandoffPacketRecord[]>;
  getHandoffPacket(caseId: string, handoffId: string): Promise<HandoffPacketRecord>;
  // Wave 8: neoantigen ranking
  recordNeoantigenRanking(caseId: string, ranking: RankingResult, correlationId: string): Promise<CaseRecord>;
  getNeoantigenRanking(caseId: string): Promise<RankingResult | null>;
  // Wave 9: construct design
  recordConstructDesign(caseId: string, constructDesign: ConstructDesignPackage, correlationId: string): Promise<CaseRecord>;
  getConstructDesign(caseId: string): Promise<ConstructDesignPackage | null>;
  // Wave 12: outcomes aggregate integration
  recordAdministration(caseId: string, administration: AdministrationRecord, correlationId: string): Promise<CaseRecord>;
  recordImmuneMonitoring(caseId: string, immuneMonitoring: ImmuneMonitoringRecord, correlationId: string): Promise<CaseRecord>;
  recordClinicalFollowUp(caseId: string, clinicalFollowUp: ClinicalFollowUpRecord, correlationId: string): Promise<CaseRecord>;
  getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]>;
  getFullTraceability(caseId: string): Promise<FullTraceabilityRecord>;
}

function timelineEvent(clock: Clock, type: string, detail: string, at: string = clock.nowIso()): TimelineEvent {
  return { at, type, detail };
}

function auditEvent(
  clock: Clock,
  type: CaseAuditEventType,
  detail: string,
  correlationId: string,
  occurredAt: string = clock.nowIso(),
): CaseAuditEventRecord {
  return {
    eventId: `event_${randomUUID()}`,
    type,
    detail,
    correlationId,
    occurredAt,
  };
}

function emptyStatusCounts(): Record<CaseStatus, number> {
  return Object.fromEntries(caseStatuses.map((status) => [status, 0])) as Record<CaseStatus, number>;
}

function hasRequiredSamples(samples: SampleRecord[]): boolean {
  const seen = new Set(samples.map((sample) => sample.sampleType));
  for (const sampleType of requiredSampleTypes) {
    if (!seen.has(sampleType)) {
      return false;
    }
  }

  return true;
}

function hasRequiredSourceArtifacts(samples: SampleRecord[], artifacts: ArtifactRecord[]): boolean {
  for (const sampleType of requiredSampleTypes) {
    const sample = samples.find((candidate) => candidate.sampleType === sampleType);
    if (!sample) {
      return false;
    }

    const hasCompatibleSourceArtifact = artifacts.some(
      (artifact) =>
        artifact.artifactClass === "SOURCE" &&
        artifact.sampleId === sample.sampleId &&
        isCompatibleSourceArtifactSemanticType(sample.sampleType, artifact.semanticType),
    );

    if (!hasCompatibleSourceArtifact) {
      return false;
    }
  }

  return true;
}

function deriveCaseStatus(
  consentStatus: ConsentStatus,
  samples: SampleRecord[],
  artifacts: ArtifactRecord[],
  hasWorkflowRequest: boolean,
): CaseStatus {
  if (hasWorkflowRequest) {
    return "WORKFLOW_REQUESTED";
  }

  if (consentStatus === "missing") {
    return "AWAITING_CONSENT";
  }

  if (hasRequiredSamples(samples) && hasRequiredSourceArtifacts(samples, artifacts)) {
    return "READY_FOR_WORKFLOW";
  }

  return "INTAKING";
}

function computePacketHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function cloneWorkflowRun(run: WorkflowRunRecord): WorkflowRunRecord {
  return structuredClone(run);
}

function sortOutcomeTimeline(entries: OutcomeTimelineEntry[]): void {
  entries.sort((left, right) => {
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime !== 0 ? byTime : left.entryId.localeCompare(right.entryId);
  });
}

function stableReviewOutcomeSignature(value: RecordReviewOutcomeInput): string {
  return JSON.stringify({
    packetId: value.packetId,
    reviewerId: value.reviewerId,
    reviewerRole: value.reviewerRole ?? null,
    reviewDisposition: value.reviewDisposition,
    rationale: value.rationale,
    comments: value.comments ?? null,
  });
}

function stableHandoffPacketSignature(value: GenerateHandoffPacketInput): string {
  return JSON.stringify({
    reviewId: value.reviewId,
    handoffTarget: value.handoffTarget,
    requestedBy: value.requestedBy,
    turnaroundDays: value.turnaroundDays,
    notes: value.notes ?? null,
  });
}

function normalizeTraceabilityError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  if (error instanceof Error) {
    if (
      error.message === "Neoantigen ranking is required to build full traceability."
      || error.message === "Construct design is required to build full traceability."
    ) {
      throw new ApiError(
        409,
        "traceability_not_ready",
        error.message,
        "Record both neoantigen ranking and construct design before requesting full traceability.",
      );
    }

    throw new ApiError(
      409,
      "traceability_invalid",
      error.message,
      "Repair the stored ranking, construct design, or outcome timeline before requesting full traceability.",
    );
  }

  throw new ApiError(
    500,
    "internal_error",
    "Traceability evaluation failed unexpectedly.",
    "Retry the request or inspect server logs.",
  );
}

function hasSameRunReplayIdentity(existingRun: WorkflowRunRecord, nextRun: WorkflowRunRecord): boolean {
  return (
    existingRun.runId === nextRun.runId &&
    existingRun.caseId === nextRun.caseId &&
    existingRun.requestId === nextRun.requestId &&
    existingRun.workflowName === nextRun.workflowName &&
    existingRun.referenceBundleId === nextRun.referenceBundleId &&
    existingRun.executionProfile === nextRun.executionProfile &&
    JSON.stringify(existingRun.manifest ?? null) === JSON.stringify(nextRun.manifest ?? null)
  );
}

function stableDerivedArtifactSignature(
  artifact: Pick<RunArtifact, "semanticType" | "artifactHash" | "producingStep">,
): string {
  return `${artifact.semanticType}::${artifact.artifactHash}::${artifact.producingStep}`;
}

function hasSameDerivedArtifactsForRun(existingArtifacts: RunArtifact[], nextArtifacts: RunArtifact[]): boolean {
  if (existingArtifacts.length !== nextArtifacts.length) {
    return false;
  }

  return existingArtifacts.every((artifact, index) => {
    const nextArtifact = nextArtifacts[index];
    return Boolean(nextArtifact) && stableDerivedArtifactSignature(artifact) === stableDerivedArtifactSignature(nextArtifact);
  });
}

/**
 * Builds an evidence lineage graph from completed workflow runs and their derived artifacts.
 * Edges represent "run A produced artifact X which was consumed by run B" relationships,
 * inferred from the workflowDependencies contract and artifact semantic types.
 */
export function buildEvidenceLineage(
  completedRuns: WorkflowRunRecord[],
  derivedArtifacts: RunArtifact[],
): EvidenceLineageGraph {
  const edges: EvidenceLineageEdge[] = [];
  const runsByWorkflow = new Map<string, WorkflowRunRecord>();
  for (const run of completedRuns) {
    runsByWorkflow.set(run.workflowName, run);
  }

  const artifactsByRun = new Map<string, RunArtifact[]>();
  for (const art of derivedArtifacts) {
    const arr = artifactsByRun.get(art.runId) ?? [];
    arr.push(art);
    artifactsByRun.set(art.runId, arr);
  }

  // For each completed run, check if its workflow's dependencies were also completed.
  // If so, link the upstream run's artifacts to this downstream run.
  for (const run of completedRuns) {
    const wfName = run.workflowName;
    const wfDeps = (workflowDependencies as Record<string, readonly string[]>)[wfName];
    if (!wfDeps) continue;

    for (const depName of wfDeps) {
      const upstreamRun = runsByWorkflow.get(depName);
      if (!upstreamRun) continue;

      const upstreamArtifacts = artifactsByRun.get(upstreamRun.runId) ?? [];
      for (const art of upstreamArtifacts) {
        edges.push({
          producerRunId: upstreamRun.runId,
          producerWorkflow: depName,
          artifactId: art.artifactId,
          semanticType: art.semanticType,
          consumerRunId: run.runId,
          consumerWorkflow: wfName,
        });
      }
    }
  }

  const allProducers = new Set(edges.map((e) => e.producerRunId));
  const allConsumers = new Set(edges.map((e) => e.consumerRunId));
  const allRunIds = completedRuns.map((r) => r.runId);

  const roots = allRunIds.filter((id) => !allConsumers.has(id));
  const terminal = allRunIds.filter((id) => !allProducers.has(id));

  return { edges, roots, terminal };
}

export class MemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, CaseRecord>();

  constructor(
    private readonly clock: Clock = new SystemClock(),
    private readonly workflowDispatchSink: IWorkflowDispatchSink = new InMemoryWorkflowDispatchSink(),
    initialRecords: readonly CaseRecord[] = [],
  ) {
    for (const record of initialRecords) {
      this.cases.set(record.caseId, structuredClone(record));
    }
  }

  async createCase(rawInput: unknown, correlationId: string): Promise<CaseRecord> {
    const input = parseCreateCaseInput(rawInput);
    const createdAt = this.clock.nowIso();
    const caseId = `case_${randomUUID()}`;
    const status = deriveCaseStatus(input.caseProfile.consentStatus, [], [], false);
    const timeline: TimelineEvent[] = [timelineEvent(this.clock, "case_created", "Human oncology case was created.")];

    if (status === "AWAITING_CONSENT") {
      timeline.push(timelineEvent(this.clock, "consent_missing", "Case is waiting for required consent artifacts."));
    }

    const record: CaseRecord = {
      caseId,
      status,
      createdAt,
      updatedAt: createdAt,
      caseProfile: input.caseProfile,
      samples: [],
      artifacts: [],
      workflowRequests: [],
      timeline,
      auditEvents: [],
      workflowRuns: [],
      derivedArtifacts: [],
      qcGates: [],
      boardPackets: [],
      reviewOutcomes: [],
      handoffPackets: [],
      outcomeTimeline: [],
    };

    record.auditEvents.push(auditEvent(this.clock, "case.created", "Human oncology case was created.", correlationId));

    this.cases.set(caseId, record);
    return structuredClone(record);
  }

  async listCases(options?: { limit?: number; offset?: number }): Promise<{ cases: CaseRecord[]; totalCount: number }> {
    const all = [...this.cases.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => structuredClone(record));
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return { cases: all.slice(offset, offset + limit), totalCount: all.length };
  }

  async getCase(caseId: string): Promise<CaseRecord> {
    return structuredClone(this.getMutableRecord(caseId));
  }

  private getMutableRecord(caseId: string): CaseRecord {
    const record = this.cases.get(caseId);
    if (!record) {
      throw new ApiError(404, "case_not_found", "Case was not found.", "Use a valid caseId from the case list endpoint.");
    }

    return record;
  }

  async registerSample(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const input = parseRegisterSampleInput(rawInput);

    if (record.workflowRequests.length > 0) {
      throw new ApiError(409, "invalid_transition", "Samples cannot be changed after workflow request.", "Create a new case version before changing sample provenance.");
    }

    if (record.samples.some((sample) => sample.sampleType === input.sampleType)) {
      throw new ApiError(409, "duplicate_sample_type", "Sample type already registered.", "Submit each required sample type only once in this bootstrap slice.");
    }

    const registeredAt = this.clock.nowIso();
    record.samples.push({
      sampleId: input.sampleId,
      sampleType: input.sampleType,
      assayType: input.assayType,
      accessionId: input.accessionId,
      sourceSite: input.sourceSite,
      registeredAt,
    });
    record.timeline.push(timelineEvent(this.clock, "sample_registered", `${input.sampleType} provenance was registered.`));
    record.auditEvents.push(
      auditEvent(this.clock, "sample.registered", `${input.sampleType} provenance was registered.`, correlationId),
    );

    const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, false);
    if (nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW") {
      record.timeline.push(
        timelineEvent(this.clock, "workflow_gate_opened", "Required sample trio, source artifacts, and consent gate are complete."),
      );
    }

    record.status = nextStatus;
    record.updatedAt = registeredAt;
    return structuredClone(record);
  }

  async registerArtifact(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const input = parseRegisterArtifactInput(rawInput);

    if (record.workflowRequests.length > 0) {
      throw new ApiError(409, "invalid_transition", "Artifacts cannot be changed after workflow request.", "Create a new case version before changing artifact provenance.");
    }

    const sample = record.samples.find((candidate) => candidate.sampleId === input.sampleId);

    if (!sample) {
      throw new ApiError(409, "missing_sample_provenance", "Artifact references an unknown sample.", "Register the sample provenance before attaching a source artifact.");
    }

    if (!isCompatibleSourceArtifactSemanticType(sample.sampleType, input.semanticType)) {
      throw new ApiError(
        409,
        "artifact_semantic_type_mismatch",
        "Source artifact semantic type is incompatible with the referenced sample type.",
        "Use the canonical source artifact semantic type for the referenced sample.",
      );
    }

    if (record.artifacts.some((artifact) => artifact.sampleId === input.sampleId && artifact.semanticType === input.semanticType && artifact.artifactHash === input.artifactHash)) {
      throw new ApiError(409, "duplicate_artifact", "Artifact is already registered for this sample.", "Submit each source artifact only once per sample and semantic type in this bootstrap slice.");
    }

    const registeredAt = this.clock.nowIso();
    const artifact: ArtifactRecord = {
      artifactId: `artifact_${randomUUID()}`,
      artifactClass: "SOURCE",
      sampleId: input.sampleId,
      semanticType: input.semanticType,
      schemaVersion: input.schemaVersion,
      artifactHash: input.artifactHash,
      storageUri: input.storageUri,
      mediaType: input.mediaType,
      registeredAt,
    };

    record.artifacts.push(artifact);
    record.timeline.push(timelineEvent(this.clock, "artifact_registered", `${input.semanticType} source artifact was cataloged.`));
    record.auditEvents.push(
      auditEvent(this.clock, "artifact.registered", `${input.semanticType} source artifact was cataloged.`, correlationId),
    );
    const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, false);
    if (nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW") {
      record.timeline.push(
        timelineEvent(this.clock, "workflow_gate_opened", "Required sample trio, source artifacts, and consent gate are complete."),
      );
    }

    record.status = nextStatus;
    record.updatedAt = registeredAt;
    return structuredClone(record);
  }

  async requestWorkflow(caseId: string, rawInput: unknown, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const input = parseRequestWorkflowInput(rawInput);

    if (input.idempotencyKey) {
      const existingRequest = record.workflowRequests.find(
        (workflowRequest) => workflowRequest.idempotencyKey === input.idempotencyKey,
      );

      if (existingRequest) {
        if (
          existingRequest.workflowName !== input.workflowName ||
          existingRequest.referenceBundleId !== input.referenceBundleId ||
          existingRequest.executionProfile !== input.executionProfile
        ) {
          throw new ApiError(
            409,
            "idempotency_mismatch",
            "Idempotency key was already used with a different payload.",
            "Use a new idempotency key for a different workflow request.",
          );
        }

        return structuredClone(record);
      }
    }

    if (record.status !== "READY_FOR_WORKFLOW") {
      throw new ApiError(
        409,
        "invalid_transition",
        "Case is not ready for workflow request.",
        "Complete consent and register tumor DNA, normal DNA, tumor RNA, and their source artifacts before requesting a workflow.",
      );
    }

    const requestedAt = this.clock.nowIso();
    const workflowRequest: WorkflowRequestRecord = {
      requestId: `run_${randomUUID()}`,
      workflowName: input.workflowName,
      referenceBundleId: input.referenceBundleId,
      executionProfile: input.executionProfile,
      requestedBy: input.requestedBy,
      requestedAt,
      idempotencyKey: input.idempotencyKey,
      correlationId,
    };

    // Dispatch to sink BEFORE mutating aggregate — if sink throws,
    // case state stays clean and the same idempotency key can be retried.
    await this.workflowDispatchSink.recordWorkflowRequested({
      dispatchId: `dispatch_${randomUUID()}`,
      caseId: record.caseId,
      requestId: workflowRequest.requestId,
      workflowName: workflowRequest.workflowName,
      referenceBundleId: workflowRequest.referenceBundleId,
      executionProfile: workflowRequest.executionProfile,
      requestedBy: workflowRequest.requestedBy,
      requestedAt: workflowRequest.requestedAt,
      idempotencyKey: workflowRequest.idempotencyKey,
      correlationId,
      status: "PENDING",
    });
    record.workflowRequests.push(workflowRequest);
    record.status = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, true);
    record.timeline.push(
      timelineEvent(this.clock, "workflow_requested", `${input.workflowName} requested with reference bundle ${input.referenceBundleId}.`),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "workflow.requested", `${input.workflowName} workflow was requested.`, correlationId),
    );
    record.updatedAt = requestedAt;
    return structuredClone(record);
  }

  async getOperationsSummary(): Promise<OperationsSummary> {
    const statusCounts = emptyStatusCounts();

    for (const record of this.cases.values()) {
      statusCounts[record.status] += 1;
    }

    return {
      totalCases: this.cases.size,
      statusCounts,
      awaitingConsentCount: statusCounts.AWAITING_CONSENT,
      readyForWorkflowCount: statusCounts.READY_FOR_WORKFLOW,
      workflowRequestedCount: statusCounts.WORKFLOW_REQUESTED,
    };
  }

  // ─── Phase 2: Workflow Run Lifecycle ──────────────────────────────

  private getMutableWorkflowRun(record: CaseRecord, runId: string): WorkflowRunRecord {
    const run = record.workflowRuns.find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }

    return run;
  }

  private replaceWorkflowRun(target: WorkflowRunRecord, next: WorkflowRunRecord): void {
    Object.assign(target, cloneWorkflowRun(next));
  }

  async startWorkflowRun(caseId: string, startedRun: WorkflowRunRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const request = record.workflowRequests[record.workflowRequests.length - 1];
    if (!request) {
      throw new ApiError(409, "invalid_transition", "Case must have a workflow request before starting a run.", "Request a workflow before starting a run.");
    }
    if (startedRun.caseId !== caseId) {
      throw new ApiError(409, "invalid_transition", "Workflow run caseId does not match the target case.", "Use a run created for this case.");
    }
    if (startedRun.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Started workflow run must be in RUNNING status.", "Start the workflow run before persisting it.");
    }

    const existingRun = record.workflowRuns.find((candidate) => candidate.runId === startedRun.runId);
    if (existingRun) {
      if (!hasSameRunReplayIdentity(existingRun, startedRun)) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Workflow run replay payload does not match the persisted run.",
          "Replay start only with the original run identity fields.",
        );
      }

      if (existingRun.status === "RUNNING") {
        return structuredClone(record);
      }

      throw new ApiError(
        409,
        "invalid_transition",
        "Terminal workflow runs cannot be started again.",
        "Create a new workflow request instead of replaying start on a terminal run.",
      );
    }

    if (record.status !== "WORKFLOW_REQUESTED") {
      throw new ApiError(409, "invalid_transition", "Case must be in WORKFLOW_REQUESTED status to start a run.", "Request a workflow before starting a run.");
    }

    const nowIso = this.clock.nowIso();
    const run = cloneWorkflowRun({
      ...startedRun,
      requestId: startedRun.requestId || request.requestId,
      workflowName: startedRun.workflowName || request.workflowName,
      referenceBundleId: startedRun.referenceBundleId || request.referenceBundleId,
      executionProfile: startedRun.executionProfile || request.executionProfile,
      acceptedAt: startedRun.acceptedAt ?? nowIso,
      startedAt: startedRun.startedAt ?? nowIso,
    });
    const startedAt = run.startedAt ?? nowIso;
    run.startedAt = startedAt;

    record.workflowRuns.push(run);
    record.status = "WORKFLOW_RUNNING";
    record.timeline.push(timelineEvent(this.clock, "workflow_started", `Workflow run ${run.runId} started.`, startedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.started", `Workflow run ${run.runId} started.`, correlationId, startedAt));
    record.updatedAt = startedAt;
    return structuredClone(record);
  }

  async completeWorkflowRun(caseId: string, completedRun: WorkflowRunRecord, derivedArtifacts: RunArtifact[], correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const run = this.getMutableWorkflowRun(record, completedRun.runId);
    if (completedRun.status !== "COMPLETED") {
      throw new ApiError(409, "invalid_transition", "Completed workflow run must be in COMPLETED status.", "Complete the workflow run before persisting terminal state.");
    }

    if (run.status === "COMPLETED") {
      const existingDerivedArtifacts = record.derivedArtifacts.filter((artifact) => artifact.runId === completedRun.runId);
      if (!hasSameDerivedArtifactsForRun(existingDerivedArtifacts, derivedArtifacts)) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Workflow completion replay emitted a different derived artifact set.",
          "Replay completion only with the original derived artifact payload.",
        );
      }

      return structuredClone(record);
    }

    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be completed.", "Check run status.");
    }

    const completedAt = completedRun.completedAt ?? this.clock.nowIso();
    this.replaceWorkflowRun(run, {
      ...completedRun,
      caseId,
      completedAt,
    });
    record.status = "WORKFLOW_COMPLETED";

    for (const artifact of derivedArtifacts) {
      record.derivedArtifacts.push(artifact);
      record.auditEvents.push(
        auditEvent(this.clock, "artifact.derived", `Derived artifact ${artifact.semanticType} from run ${completedRun.runId}.`, correlationId, completedAt),
      );
    }

    record.timeline.push(timelineEvent(this.clock, "workflow_completed", `Run ${completedRun.runId} completed with ${derivedArtifacts.length} derived artifacts.`, completedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.completed", `Run ${completedRun.runId} completed.`, correlationId, completedAt));
    record.updatedAt = completedAt;
    return structuredClone(record);
  }

  async cancelWorkflowRun(caseId: string, cancelledRun: WorkflowRunRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const run = this.getMutableWorkflowRun(record, cancelledRun.runId);
    if (cancelledRun.status !== "CANCELLED") {
      throw new ApiError(409, "invalid_transition", "Cancelled workflow run must be in CANCELLED status.", "Cancel the workflow run before persisting terminal state.");
    }

    if (run.status === "CANCELLED") {
      return structuredClone(record);
    }

    if (run.status !== "RUNNING" && run.status !== "PENDING") {
      throw new ApiError(409, "invalid_transition", "Only running or pending workflows can be cancelled.", "Check run status.");
    }

    const completedAt = cancelledRun.completedAt ?? this.clock.nowIso();
    this.replaceWorkflowRun(run, {
      ...cancelledRun,
      caseId,
      completedAt,
    });
    record.status = "WORKFLOW_CANCELLED";
    record.timeline.push(timelineEvent(this.clock, "workflow_cancelled", `Run ${cancelledRun.runId} was cancelled.`, completedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.cancelled", `Workflow run ${cancelledRun.runId} was cancelled.`, correlationId, completedAt));
    record.updatedAt = completedAt;
    return structuredClone(record);
  }

  async failWorkflowRun(caseId: string, failedRun: WorkflowRunRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const run = this.getMutableWorkflowRun(record, failedRun.runId);
    if (failedRun.status !== "FAILED") {
      throw new ApiError(409, "invalid_transition", "Failed workflow run must be in FAILED status.", "Fail the workflow run before persisting terminal state.");
    }

    if (run.status === "FAILED") {
      if ((run.failureReason ?? failedRun.failureReason ?? "") !== (failedRun.failureReason ?? "")) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Workflow failure replay reason does not match the persisted terminal failure.",
          "Replay failure only with the original failure reason.",
        );
      }
      if ((run.failureCategory ?? failedRun.failureCategory ?? "unknown") !== (failedRun.failureCategory ?? "unknown")) {
        throw new ApiError(
          409,
          "invalid_transition",
          "Workflow failure replay category does not match the persisted terminal failure.",
          "Replay failure only with the original failure category.",
        );
      }

      return structuredClone(record);
    }

    if (run.status !== "RUNNING") {
      throw new ApiError(409, "invalid_transition", "Only running workflows can be failed.", "Check run status.");
    }

    const completedAt = failedRun.completedAt ?? this.clock.nowIso();
    this.replaceWorkflowRun(run, {
      ...failedRun,
      caseId,
      completedAt,
    });
    record.status = "WORKFLOW_FAILED";
    record.timeline.push(timelineEvent(this.clock, "workflow_failed", `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`, completedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.failed", `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`, correlationId, completedAt));
    record.updatedAt = completedAt;
    return structuredClone(record);
  }

  // ─── Phase 2: HLA Consensus ───────────────────────────────────────

  async recordHlaConsensus(caseId: string, consensus: HlaConsensusRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    record.hlaConsensus = consensus;
    record.timeline.push(timelineEvent(this.clock, "hla_consensus_produced", `HLA consensus with ${consensus.alleles.length} alleles, confidence ${consensus.confidenceScore}.`));
    record.auditEvents.push(auditEvent(this.clock, "hla.consensus.produced", `HLA consensus produced for case ${caseId}.`, correlationId));
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  async getHlaConsensus(caseId: string): Promise<HlaConsensusRecord | null> {
    const record = await this.getCase(caseId);
    return record.hlaConsensus ?? null;
  }

  // ─── Phase 2: QC Gate ─────────────────────────────────────────────

  async recordQcGate(caseId: string, runId: string, gate: QcGateRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const run = record.workflowRuns.find((r) => r.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }
    if (run.status !== "COMPLETED") {
      throw new ApiError(409, "invalid_transition", "QC can only be evaluated on completed runs.", "Complete the workflow run first.");
    }

    record.qcGates.push(gate);
    if (gate.outcome === "PASSED" || gate.outcome === "WARN") {
      record.status = "QC_PASSED";
    } else {
      record.status = "QC_FAILED";
    }

    record.timeline.push(timelineEvent(this.clock, "qc_evaluated", `QC gate for run ${runId}: ${gate.outcome}.`));
    record.auditEvents.push(auditEvent(this.clock, "qc.evaluated", `QC gate for run ${runId}: ${gate.outcome}. ${gate.results.length} metrics evaluated.`, correlationId));
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  async getQcGate(caseId: string, runId: string): Promise<QcGateRecord | null> {
    const record = await this.getCase(caseId);
    return record.qcGates.find((g) => g.runId === runId) ?? null;
  }

  // ─── Phase 2: Workflow Run Queries ────────────────────────────────

  async getWorkflowRun(caseId: string, runId: string): Promise<WorkflowRunRecord> {
    const record = await this.getCase(caseId);
    const run = record.workflowRuns.find((r) => r.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found.", "Use a valid runId.");
    }
    return run;
  }

  async listWorkflowRuns(caseId: string): Promise<WorkflowRunRecord[]> {
    const record = await this.getCase(caseId);
    return record.workflowRuns;
  }

  async generateBoardPacket(caseId: string, correlationId: string): Promise<BoardPacketGenerationResult> {
    const record = this.getMutableRecord(caseId);
    const boardRoute = record.caseProfile.boardRoute;

    if (!boardRoute) {
      throw new ApiError(
        409,
        "review_route_not_configured",
        "Case is missing a configured multidisciplinary review route.",
        "Set caseProfile.boardRoute before generating a board packet.",
      );
    }

    const latestQcGate = record.qcGates[record.qcGates.length - 1];
    const completedRuns = record.workflowRuns.filter((run) => run.status === "COMPLETED");
    const pinnedReferenceBundles = [
      ...new Map(
        completedRuns
          .map((run) => run.pinnedReferenceBundle)
          .filter((bundle): bundle is ReferenceBundleManifest => Boolean(bundle))
          .map((bundle) => [bundle.bundleId, structuredClone(bundle)]),
      ).values(),
    ];

    if (!record.hlaConsensus || !latestQcGate || latestQcGate.outcome === "FAILED" || completedRuns.length === 0 || record.derivedArtifacts.length === 0) {
      throw new ApiError(
        409,
        "board_packet_not_ready",
        "Case does not yet have the evidence required for board packet generation.",
        "Complete workflow execution, HLA consensus, and a passing QC gate before generating a board packet.",
      );
    }

    const snapshot: BoardPacketSnapshot = {
      caseSummary: {
        caseId: record.caseId,
        status: "QC_PASSED",
        indication: record.caseProfile.indication,
        siteId: record.caseProfile.siteId,
        protocolVersion: record.caseProfile.protocolVersion,
        boardRoute,
      },
      workflowRuns: structuredClone(completedRuns),
      pinnedReferenceBundles,
      derivedArtifacts: structuredClone(record.derivedArtifacts),
      hlaConsensus: structuredClone(record.hlaConsensus),
      latestQcGate: structuredClone(latestQcGate),
      hlaToolBreakdown: record.hlaConsensus.perToolEvidence.length > 0
        ? structuredClone(record.hlaConsensus.perToolEvidence)
        : undefined,
      hlaDisagreements: record.hlaConsensus.disagreements,
      bundleRetrievalProvenance: (() => {
        const provs = pinnedReferenceBundles
          .map((b) => b.retrievalProvenance)
          .filter((p): p is RetrievalProvenance => Boolean(p));
        return provs.length > 0 ? provs : undefined;
      })(),
      evidenceLineage: (() => {
        const lineage = buildEvidenceLineage(completedRuns, record.derivedArtifacts);
        return lineage.edges.length > 0 ? lineage : undefined;
      })(),
      neoantigenRanking: record.neoantigenRanking
        ? structuredClone(record.neoantigenRanking)
        : undefined,
      constructDesign: record.constructDesign
        ? structuredClone(record.constructDesign)
        : undefined,
    };

    const packetHash = computePacketHash(snapshot);
    const existingPacket = record.boardPackets.find((packet) => packet.packetHash === packetHash);
    if (existingPacket) {
      return {
        case: structuredClone(record),
        packet: structuredClone(existingPacket),
        created: false,
      };
    }

    const createdAt = this.clock.nowIso();
    const packet: BoardPacketRecord = {
      packetId: `packet_${randomUUID()}`,
      caseId,
      artifactClass: "BOARD_PACKET",
      boardRoute,
      version: record.boardPackets.length + 1,
      schemaVersion: 1,
      packetHash,
      createdAt,
      snapshot,
    };

    record.boardPackets.push(packet);
    record.status = "AWAITING_REVIEW";
    record.timeline.push(timelineEvent(this.clock, "board_packet_generated", `Board packet ${packet.packetId} generated for ${boardRoute}.`));
    record.auditEvents.push(
      auditEvent(this.clock, "board.packet.generated", `Board packet ${packet.packetId} generated for ${boardRoute}.`, correlationId),
    );
    record.updatedAt = createdAt;

    return {
      case: structuredClone(record),
      packet: structuredClone(packet),
      created: true,
    };
  }

  async listBoardPackets(caseId: string): Promise<BoardPacketRecord[]> {
    const record = await this.getCase(caseId);
    return record.boardPackets;
  }

  async getBoardPacket(caseId: string, packetId: string): Promise<BoardPacketRecord> {
    const record = await this.getCase(caseId);
    const packet = record.boardPackets.find((candidate) => candidate.packetId === packetId);
    if (!packet) {
      throw new ApiError(404, "board_packet_not_found", "Board packet was not found for this case.", "Use a valid packetId from the board packet list endpoint.");
    }

    return packet;
  }

  // ─── Wave 15: Review Outcome + Manufacturing Handoff ────────────

  async recordReviewOutcome(caseId: string, input: RecordReviewOutcomeInput, correlationId: string): Promise<ReviewOutcomeResult> {
    const record = this.getMutableRecord(caseId);
    const packet = record.boardPackets.find((candidate) => candidate.packetId === input.packetId);
    if (!packet) {
      throw new ApiError(404, "board_packet_not_found", "Board packet was not found for this case.", "Use a valid packetId from the board packet list endpoint.");
    }

    const existingOutcome = record.reviewOutcomes.find((candidate) => candidate.packetId === input.packetId);
    if (existingOutcome) {
      if (stableReviewOutcomeSignature(existingOutcome) === stableReviewOutcomeSignature(input)) {
        return {
          case: structuredClone(record),
          reviewOutcome: structuredClone(existingOutcome),
          created: false,
        };
      }

      throw new ApiError(
        409,
        "review_outcome_already_recorded",
        "A review outcome is already recorded for this board packet.",
        "Reuse the stored review outcome or generate a new board packet revision before recording a different decision.",
      );
    }

    const reviewedAt = this.clock.nowIso();
    const reviewOutcome: ReviewOutcomeRecord = {
      reviewId: `review_${randomUUID()}`,
      caseId,
      packetId: packet.packetId,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
      reviewDisposition: input.reviewDisposition,
      rationale: input.rationale,
      comments: input.comments,
      reviewedAt,
    };

    record.reviewOutcomes.push(reviewOutcome);
    record.status = input.reviewDisposition === "approved"
      ? "APPROVED_FOR_HANDOFF"
      : input.reviewDisposition === "rejected"
        ? "REVIEW_REJECTED"
        : "REVISION_REQUESTED";
    record.timeline.push(
      timelineEvent(
        this.clock,
        "review_outcome_recorded",
        `Recorded ${input.reviewDisposition} review outcome ${reviewOutcome.reviewId} for packet ${packet.packetId}.`,
        reviewedAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "review.outcome.recorded",
        `Recorded ${input.reviewDisposition} review outcome ${reviewOutcome.reviewId} for packet ${packet.packetId}.`,
        correlationId,
        reviewedAt,
      ),
    );
    record.updatedAt = reviewedAt;

    return {
      case: structuredClone(record),
      reviewOutcome: structuredClone(reviewOutcome),
      created: true,
    };
  }

  async listReviewOutcomes(caseId: string): Promise<ReviewOutcomeRecord[]> {
    const record = await this.getCase(caseId);
    return structuredClone(record.reviewOutcomes);
  }

  async getReviewOutcome(caseId: string, reviewId: string): Promise<ReviewOutcomeRecord> {
    const record = await this.getCase(caseId);
    const reviewOutcome = record.reviewOutcomes.find((candidate) => candidate.reviewId === reviewId);
    if (!reviewOutcome) {
      throw new ApiError(404, "review_outcome_not_found", "Review outcome was not found for this case.", "Use a valid reviewId from the review outcome list endpoint.");
    }

    return structuredClone(reviewOutcome);
  }

  async generateHandoffPacket(caseId: string, input: GenerateHandoffPacketInput, correlationId: string): Promise<HandoffPacketGenerationResult> {
    const record = this.getMutableRecord(caseId);
    const reviewOutcome = record.reviewOutcomes.find((candidate) => candidate.reviewId === input.reviewId);
    if (!reviewOutcome) {
      throw new ApiError(404, "review_outcome_not_found", "Review outcome was not found for this case.", "Use a valid reviewId from the review outcome list endpoint.");
    }

    if (reviewOutcome.reviewDisposition !== "approved") {
      throw new ApiError(
        409,
        "review_outcome_not_approved",
        "Only approved review outcomes can emit a manufacturing handoff packet.",
        "Record an approved review outcome before generating a handoff packet.",
      );
    }

    const boardPacket = record.boardPackets.find((candidate) => candidate.packetId === reviewOutcome.packetId);
    if (!boardPacket) {
      throw new ApiError(404, "board_packet_not_found", "Board packet was not found for this case.", "Use a valid packetId from the board packet list endpoint.");
    }

    if (!record.constructDesign) {
      throw new ApiError(
        409,
        "construct_design_required",
        "Manufacturing handoff requires a stored construct design.",
        "Generate and persist a construct design before creating a handoff packet.",
      );
    }

    const snapshot: HandoffPacketSnapshot = {
      caseSummary: {
        caseId: record.caseId,
        status: record.status,
        indication: record.caseProfile.indication,
        siteId: record.caseProfile.siteId,
        protocolVersion: record.caseProfile.protocolVersion,
        boardRoute: boardPacket.boardRoute,
      },
      boardPacket: {
        packetId: boardPacket.packetId,
        boardRoute: boardPacket.boardRoute,
        version: boardPacket.version,
        packetHash: boardPacket.packetHash,
        createdAt: boardPacket.createdAt,
      },
      reviewOutcome: structuredClone(reviewOutcome),
      constructDesign: structuredClone(record.constructDesign),
      handoffTarget: input.handoffTarget,
      requestedBy: input.requestedBy,
      turnaroundDays: input.turnaroundDays,
      notes: input.notes,
    };

    const packetHash = computePacketHash(snapshot);
    const existingPacket = record.handoffPackets.find((candidate) => candidate.packetHash === packetHash);
    if (existingPacket) {
      return {
        case: structuredClone(record),
        handoff: structuredClone(existingPacket),
        created: false,
      };
    }

    const createdAt = this.clock.nowIso();
    const handoff: HandoffPacketRecord = {
      handoffId: `handoff_${randomUUID()}`,
      caseId,
      reviewId: reviewOutcome.reviewId,
      packetId: boardPacket.packetId,
      artifactClass: "HANDOFF_PACKET",
      constructId: record.constructDesign.constructId,
      constructVersion: record.constructDesign.version,
      handoffTarget: input.handoffTarget,
      schemaVersion: 1,
      packetHash,
      createdAt,
      snapshot,
    };

    record.handoffPackets.push(handoff);
    record.status = "HANDOFF_PENDING";
    record.timeline.push(
      timelineEvent(
        this.clock,
        "handoff_packet_generated",
        `Generated manufacturing handoff packet ${handoff.handoffId} for ${input.handoffTarget}.`,
        createdAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "handoff.packet.generated",
        `Generated manufacturing handoff packet ${handoff.handoffId} for ${input.handoffTarget}.`,
        correlationId,
        createdAt,
      ),
    );
    record.updatedAt = createdAt;

    return {
      case: structuredClone(record),
      handoff: structuredClone(handoff),
      created: true,
    };
  }

  async listHandoffPackets(caseId: string): Promise<HandoffPacketRecord[]> {
    const record = await this.getCase(caseId);
    return structuredClone(record.handoffPackets);
  }

  async getHandoffPacket(caseId: string, handoffId: string): Promise<HandoffPacketRecord> {
    const record = await this.getCase(caseId);
    const handoff = record.handoffPackets.find((candidate) => candidate.handoffId === handoffId);
    if (!handoff) {
      throw new ApiError(404, "handoff_packet_not_found", "Handoff packet was not found for this case.", "Use a valid handoffId from the handoff packet list endpoint.");
    }

    return structuredClone(handoff);
  }

  // ─── Wave 8: Neoantigen Ranking ────────────────────────────────────

  async recordNeoantigenRanking(caseId: string, ranking: RankingResult, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    record.neoantigenRanking = structuredClone(ranking);
    record.timeline.push(
      timelineEvent(
        this.clock,
        "candidate_rank_generated",
        `Generated neoantigen ranking with ${ranking.rankedCandidates.length} ranked candidates using ${ranking.ensembleMethod}.`,
        ranking.rankedAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "candidate.rank-generated",
        `Generated neoantigen ranking with ${ranking.rankedCandidates.length} ranked candidates using ${ranking.ensembleMethod}.`,
        correlationId,
        ranking.rankedAt,
      ),
    );
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  async getNeoantigenRanking(caseId: string): Promise<RankingResult | null> {
    const record = await this.getCase(caseId);
    return record.neoantigenRanking ?? null;
  }

  async recordConstructDesign(caseId: string, constructDesign: ConstructDesignPackage, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    record.constructDesign = structuredClone(constructDesign);
    record.timeline.push(
      timelineEvent(
        this.clock,
        "payload_generated",
        `Generated construct ${constructDesign.constructId} for ${constructDesign.deliveryModality} with ${constructDesign.candidateIds.length} candidate epitopes.`,
        constructDesign.designedAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "payload.generated",
        `Generated construct ${constructDesign.constructId} for ${constructDesign.deliveryModality} with ${constructDesign.candidateIds.length} candidate epitopes.`,
        correlationId,
        constructDesign.designedAt,
      ),
    );
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  async getConstructDesign(caseId: string): Promise<ConstructDesignPackage | null> {
    const record = await this.getCase(caseId);
    return record.constructDesign ?? null;
  }

  private assertOutcomeConstruct(record: CaseRecord, caseId: string, constructId: string, constructVersion: number): void {
    if (!record.constructDesign) {
      throw new ApiError(
        409,
        "construct_design_required",
        "Outcome events require a stored construct design.",
        "Generate and persist a construct design before recording outcomes.",
      );
    }

    if (record.constructDesign.caseId !== caseId) {
      throw new ApiError(409, "invalid_transition", "Construct design caseId does not match the outcome target case.", "Use the construct design linked to this case.");
    }

    if (record.constructDesign.constructId !== constructId || record.constructDesign.version !== constructVersion) {
      throw new ApiError(
        409,
        "construct_mismatch",
        "Outcome event does not match the stored construct design identity.",
        "Record outcomes only against the stored constructId and constructVersion.",
      );
    }
  }

  private appendOutcomeEntry(record: CaseRecord, entry: OutcomeTimelineEntry): void {
    record.outcomeTimeline.push(structuredClone(entry));
    sortOutcomeTimeline(record.outcomeTimeline);
  }

  async recordAdministration(caseId: string, administration: AdministrationRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    if (administration.caseId !== caseId) {
      throw new ApiError(409, "invalid_transition", "Administration record caseId does not match the target case.", "Use an administration record for the target case.");
    }

    this.assertOutcomeConstruct(record, caseId, administration.constructId, administration.constructVersion);

    const entry: OutcomeTimelineEntry = {
      entryId: `outcome_${randomUUID()}`,
      caseId,
      constructId: administration.constructId,
      constructVersion: administration.constructVersion,
      entryType: "administration",
      occurredAt: administration.administeredAt,
      administration: structuredClone(administration),
    };

    this.appendOutcomeEntry(record, entry);
    record.timeline.push(
      timelineEvent(
        this.clock,
        "construct_administered",
        `Recorded construct administration ${administration.administrationId} via ${administration.route}.`,
        administration.administeredAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "outcome.recorded",
        `Recorded administration outcome ${administration.administrationId} for construct ${administration.constructId}.`,
        correlationId,
        administration.administeredAt,
      ),
    );
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  async recordImmuneMonitoring(caseId: string, immuneMonitoring: ImmuneMonitoringRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    if (immuneMonitoring.caseId !== caseId) {
      throw new ApiError(409, "invalid_transition", "Immune monitoring record caseId does not match the target case.", "Use an immune monitoring record for the target case.");
    }

    this.assertOutcomeConstruct(record, caseId, immuneMonitoring.constructId, immuneMonitoring.constructVersion);

    const entry: OutcomeTimelineEntry = {
      entryId: `outcome_${randomUUID()}`,
      caseId,
      constructId: immuneMonitoring.constructId,
      constructVersion: immuneMonitoring.constructVersion,
      entryType: "immune-monitoring",
      occurredAt: immuneMonitoring.collectedAt,
      immuneMonitoring: structuredClone(immuneMonitoring),
    };

    this.appendOutcomeEntry(record, entry);
    record.timeline.push(
      timelineEvent(
        this.clock,
        "immune_monitoring_recorded",
        `Recorded immune monitoring ${immuneMonitoring.monitoringId} for biomarker ${immuneMonitoring.biomarker}.`,
        immuneMonitoring.collectedAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "outcome.recorded",
        `Recorded immune monitoring outcome ${immuneMonitoring.monitoringId} for construct ${immuneMonitoring.constructId}.`,
        correlationId,
        immuneMonitoring.collectedAt,
      ),
    );
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  async recordClinicalFollowUp(caseId: string, clinicalFollowUp: ClinicalFollowUpRecord, correlationId: string): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    if (clinicalFollowUp.caseId !== caseId) {
      throw new ApiError(409, "invalid_transition", "Clinical follow-up record caseId does not match the target case.", "Use a clinical follow-up record for the target case.");
    }

    this.assertOutcomeConstruct(record, caseId, clinicalFollowUp.constructId, clinicalFollowUp.constructVersion);

    const entry: OutcomeTimelineEntry = {
      entryId: `outcome_${randomUUID()}`,
      caseId,
      constructId: clinicalFollowUp.constructId,
      constructVersion: clinicalFollowUp.constructVersion,
      entryType: "clinical-follow-up",
      occurredAt: clinicalFollowUp.evaluatedAt,
      clinicalFollowUp: structuredClone(clinicalFollowUp),
    };

    this.appendOutcomeEntry(record, entry);
    record.timeline.push(
      timelineEvent(
        this.clock,
        "clinical_follow_up_recorded",
        `Recorded clinical follow-up ${clinicalFollowUp.followUpId} with response ${clinicalFollowUp.responseCategory}.`,
        clinicalFollowUp.evaluatedAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "outcome.recorded",
        `Recorded clinical follow-up outcome ${clinicalFollowUp.followUpId} for construct ${clinicalFollowUp.constructId}.`,
        correlationId,
        clinicalFollowUp.evaluatedAt,
      ),
    );
    record.updatedAt = this.clock.nowIso();
    return structuredClone(record);
  }

  async getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]> {
    const record = await this.getCase(caseId);
    return structuredClone(record.outcomeTimeline);
  }

  async getFullTraceability(caseId: string): Promise<FullTraceabilityRecord> {
    const record = await this.getCase(caseId);
    try {
      return buildFullTraceability(record, record.outcomeTimeline);
    } catch (error) {
      normalizeTraceabilityError(error);
    }
  }
}
