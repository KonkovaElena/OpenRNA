import { randomUUID } from "node:crypto";
import { InMemoryEventStore } from "./adapters/InMemoryEventStore";
import { ApiError } from "./errors";
import { replayCaseEvents } from "./queries/CaseProjection";
import type { AuditContextInput } from "./store-helpers";
import {
  auditEvent,
  buildEvidenceLineage,
  cloneWorkflowRun,
  deriveCaseStatus,
  emptyStatusCounts,
  hasSameDerivedArtifactsForRun,
  hasSameRunReplayIdentity,
  normalizeAuditContext,
  timelineEvent,
} from "./store-helpers";
import {
  generateBoardPacketForCase,
  generateHandoffPacketForCase,
  recordReviewOutcomeForCase,
} from "./store-review";
import {
  getFullTraceabilityForCase,
  getOutcomeTimelineForCase,
  recordAdministrationForCase,
  recordClinicalFollowUpForCase,
  recordImmuneMonitoringForCase,
} from "./store-outcomes";
import {
  parseConstructDesignInput,
  parseCreateCaseInput,
  parseGenerateHandoffPacketInput,
  parseRecordNeoantigenRankingInput,
  parseRecordAdministrationInput,
  parseRecordClinicalFollowUpInput,
  parseRecordImmuneMonitoringInput,
  parseRecordReviewOutcomeInput,
  parseRegisterArtifactInput,
  parseRegisterSampleInput,
  parseRequestWorkflowInput,
} from "./validation";
import type { IWorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
import type { IEventStore } from "./ports/IEventStore";
import { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";
import type { IStateMachineGuard } from "./ports/IStateMachineGuard";
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
  CaseDomainEventInput,
  CaseDomainEventRecord,
  CaseDomainEventType,
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
  parseRecordNeoantigenRankingInput,
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
export { buildEvidenceLineage };
export type { AuditContextInput } from "./store-helpers";

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
  createCase(rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord>;
  listCases(options?: { limit?: number; offset?: number }): Promise<{ cases: CaseRecord[]; totalCount: number }>;
  getCase(caseId: string): Promise<CaseRecord>;
  registerSample(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord>;
  registerArtifact(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord>;
  requestWorkflow(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord>;
  getOperationsSummary(): Promise<OperationsSummary>;
  // Phase 2: workflow lifecycle
  startWorkflowRun(caseId: string, startedRun: WorkflowRunRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  completeWorkflowRun(caseId: string, completedRun: WorkflowRunRecord, derivedArtifacts: RunArtifact[], correlationId: AuditContextInput): Promise<CaseRecord>;
  cancelWorkflowRun(caseId: string, cancelledRun: WorkflowRunRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  failWorkflowRun(caseId: string, failedRun: WorkflowRunRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  // Phase 2: HLA consensus
  recordHlaConsensus(caseId: string, record: HlaConsensusRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  getHlaConsensus(caseId: string): Promise<HlaConsensusRecord | null>;
  // Phase 2: QC gate
  recordQcGate(caseId: string, runId: string, gate: QcGateRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  getQcGate(caseId: string, runId: string): Promise<QcGateRecord | null>;
  // Phase 2: workflow runs
  getWorkflowRun(caseId: string, runId: string): Promise<WorkflowRunRecord>;
  listWorkflowRuns(caseId: string): Promise<WorkflowRunRecord[]>;
  // Phase 2: expert review packets
  generateBoardPacket(caseId: string, correlationId: AuditContextInput): Promise<BoardPacketGenerationResult>;
  listBoardPackets(caseId: string): Promise<BoardPacketRecord[]>;
  getBoardPacket(caseId: string, packetId: string): Promise<BoardPacketRecord>;
  // Wave 15: review outcome + handoff
  recordReviewOutcome(caseId: string, input: RecordReviewOutcomeInput, correlationId: AuditContextInput): Promise<ReviewOutcomeResult>;
  listReviewOutcomes(caseId: string): Promise<ReviewOutcomeRecord[]>;
  getReviewOutcome(caseId: string, reviewId: string): Promise<ReviewOutcomeRecord>;
  generateHandoffPacket(caseId: string, input: GenerateHandoffPacketInput, correlationId: AuditContextInput): Promise<HandoffPacketGenerationResult>;
  listHandoffPackets(caseId: string): Promise<HandoffPacketRecord[]>;
  getHandoffPacket(caseId: string, handoffId: string): Promise<HandoffPacketRecord>;
  // Wave 8: neoantigen ranking
  recordNeoantigenRanking(caseId: string, ranking: RankingResult, correlationId: AuditContextInput): Promise<CaseRecord>;
  getNeoantigenRanking(caseId: string): Promise<RankingResult | null>;
  // Wave 9: construct design
  recordConstructDesign(caseId: string, constructDesign: ConstructDesignPackage, correlationId: AuditContextInput): Promise<CaseRecord>;
  getConstructDesign(caseId: string): Promise<ConstructDesignPackage | null>;
  // Wave 12: outcomes aggregate integration
  recordAdministration(caseId: string, administration: AdministrationRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  recordImmuneMonitoring(caseId: string, immuneMonitoring: ImmuneMonitoringRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  recordClinicalFollowUp(caseId: string, clinicalFollowUp: ClinicalFollowUpRecord, correlationId: AuditContextInput): Promise<CaseRecord>;
  getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]>;
  getFullTraceability(caseId: string): Promise<FullTraceabilityRecord>;
  // Consent-status synchronization
  syncConsentStatus(caseId: string, consentStatus: ConsentStatus, correlationId: AuditContextInput): Promise<CaseRecord>;
  // Restart from REVISION_REQUESTED
  restartFromRevision(caseId: string, correlationId: AuditContextInput): Promise<CaseRecord>;
}

export class MemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, CaseRecord>();

  constructor(
    private readonly clock: Clock = new SystemClock(),
    private readonly workflowDispatchSink: IWorkflowDispatchSink = new InMemoryWorkflowDispatchSink(),
    initialRecords: readonly CaseRecord[] = [],
    private readonly stateMachineGuard?: IStateMachineGuard,
    private readonly eventStore: IEventStore<CaseDomainEventInput, CaseDomainEventRecord> = new InMemoryEventStore<CaseDomainEventInput>(),
  ) {
    for (const record of initialRecords) {
      this.cases.set(record.caseId, structuredClone(record));
    }
  }

  private createCaseEvent(
    caseId: string,
    type: CaseDomainEventType,
    payload: unknown,
    correlationId: AuditContextInput,
    occurredAt: string = this.clock.nowIso(),
    updatedAt: string = occurredAt,
  ): CaseDomainEventInput {
    const auditContext = normalizeAuditContext(correlationId);

    return {
      eventId: `evt_${randomUUID()}`,
      aggregateId: caseId,
      aggregateType: "case",
      type,
      occurredAt,
      updatedAt,
      correlationId: auditContext.correlationId,
      actorId: auditContext.actorId,
      authMechanism: auditContext.authMechanism,
      payload: structuredClone(payload),
    } as unknown as CaseDomainEventInput;
  }

  private async appendCaseEvent(event: CaseDomainEventInput): Promise<CaseDomainEventRecord> {
    const expectedVersion = await this.eventStore.getLatestVersion(event.aggregateId);
    const [storedEvent] = await this.eventStore.append(event.aggregateId, expectedVersion, [event]);

    return structuredClone(storedEvent as CaseDomainEventRecord);
  }

  private async rebuildCaseProjection(caseId: string): Promise<CaseRecord> {
    const events = await this.eventStore.listByAggregateId(caseId);
    try {
      const replayed = replayCaseEvents(events as readonly CaseDomainEventRecord[]);
      this.cases.set(caseId, replayed);
      return structuredClone(replayed);
    } catch (error) {
      const existing = this.cases.get(caseId);
      if (existing) {
        return structuredClone(existing);
      }

      throw error;
    }
  }

  async listCaseEvents(caseId: string): Promise<CaseDomainEventRecord[]> {
    this.getMutableRecord(caseId);
    return structuredClone(await this.eventStore.listByAggregateId(caseId)) as CaseDomainEventRecord[];
  }

  /**
   * Validate and apply a case status transition.
   * When a guard is configured, rejects disallowed transitions with a 409 error.
   * Falls through transparently when no guard is provided (backward compatible).
   */
  private async applyTransition(record: CaseRecord, nextStatus: CaseStatus, correlationId?: AuditContextInput): Promise<void> {
    if (this.stateMachineGuard && record.status !== nextStatus) {
      const result = await this.stateMachineGuard.validateTransition(record.caseId, record.status, nextStatus);
      if (!result.allowed) {
        throw new ApiError(
          409,
          "invalid_transition",
          result.reason ?? `Transition from ${record.status} to ${nextStatus} is not allowed.`,
          "Check allowed transitions for the current case status.",
        );
      }
    }
    record.status = nextStatus;
  }

  private getReviewMutationContext() {
    return {
      clock: this.clock,
      applyTransition: this.applyTransition.bind(this),
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
      rebuildCaseProjection: this.rebuildCaseProjection.bind(this),
    };
  }

  private getOutcomeMutationContext() {
    return {
      clock: this.clock,
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
      rebuildCaseProjection: this.rebuildCaseProjection.bind(this),
    };
  }

  async createCase(rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
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

    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "case.created",
        {
          createdAt,
          status,
          caseProfile: structuredClone(input.caseProfile),
        },
        correlationId,
        createdAt,
        createdAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
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

  async registerSample(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const input = parseRegisterSampleInput(rawInput);

    if (record.workflowRequests.length > 0) {
      throw new ApiError(409, "invalid_transition", "Samples cannot be changed after workflow request.", "Create a new case version before changing sample provenance.");
    }

    if (record.samples.some((sample) => sample.sampleType === input.sampleType)) {
      throw new ApiError(409, "duplicate_sample_type", "Sample type already registered.", "Submit each required sample type only once in this bootstrap slice.");
    }

    const registeredAt = this.clock.nowIso();
    const sampleRecord: SampleRecord = {
      sampleId: input.sampleId,
      sampleType: input.sampleType,
      assayType: input.assayType,
      accessionId: input.accessionId,
      sourceSite: input.sourceSite,
      registeredAt,
    };
    record.samples.push(sampleRecord);
    record.timeline.push(timelineEvent(this.clock, "sample_registered", `${input.sampleType} provenance was registered.`));
    record.auditEvents.push(
      auditEvent(this.clock, "sample.registered", `${input.sampleType} provenance was registered.`, correlationId),
    );

    const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, false);
    const workflowGateOpened = nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW";
    if (workflowGateOpened) {
      record.timeline.push(
        timelineEvent(this.clock, "workflow_gate_opened", "Required sample trio, source artifacts, and consent gate are complete."),
      );
    }

    await this.applyTransition(record, nextStatus, correlationId);
    record.updatedAt = registeredAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "sample.registered",
        {
          sample: structuredClone(sampleRecord),
          nextStatus,
          workflowGateOpened,
        },
        correlationId,
        registeredAt,
        registeredAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async registerArtifact(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
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
    const workflowGateOpened = nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW";
    if (workflowGateOpened) {
      record.timeline.push(
        timelineEvent(this.clock, "workflow_gate_opened", "Required sample trio, source artifacts, and consent gate are complete."),
      );
    }

    await this.applyTransition(record, nextStatus, correlationId);
    record.updatedAt = registeredAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "artifact.registered",
        {
          artifact: structuredClone(artifact),
          nextStatus,
          workflowGateOpened,
        },
        correlationId,
        registeredAt,
        registeredAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async requestWorkflow(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const input = parseRequestWorkflowInput(rawInput);
    const auditContext = normalizeAuditContext(correlationId);

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
      correlationId: auditContext.correlationId,
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
      correlationId: auditContext.correlationId,
      status: "PENDING",
    });
    const nextStatus = deriveCaseStatus(record.caseProfile.consentStatus, record.samples, record.artifacts, true);
    record.workflowRequests.push(workflowRequest);
    await this.applyTransition(record, nextStatus, correlationId);
    record.timeline.push(
      timelineEvent(this.clock, "workflow_requested", `${input.workflowName} requested with reference bundle ${input.referenceBundleId}.`),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "workflow.requested", `${input.workflowName} workflow was requested.`, correlationId),
    );
    record.updatedAt = requestedAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "workflow.requested",
        {
          request: structuredClone(workflowRequest),
          nextStatus,
        },
        correlationId,
        requestedAt,
        requestedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
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

  async startWorkflowRun(caseId: string, startedRun: WorkflowRunRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
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
    await this.applyTransition(record, "WORKFLOW_RUNNING", correlationId);
    record.timeline.push(timelineEvent(this.clock, "workflow_started", `Workflow run ${run.runId} started.`, startedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.started", `Workflow run ${run.runId} started.`, correlationId, startedAt));
    record.updatedAt = startedAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "workflow.started",
        {
          run: cloneWorkflowRun(run),
          nextStatus: record.status,
        },
        correlationId,
        startedAt,
        startedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async completeWorkflowRun(caseId: string, completedRun: WorkflowRunRecord, derivedArtifacts: RunArtifact[], correlationId: AuditContextInput): Promise<CaseRecord> {
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
    await this.applyTransition(record, "WORKFLOW_COMPLETED", correlationId);

    for (const artifact of derivedArtifacts) {
      record.derivedArtifacts.push(artifact);
      record.auditEvents.push(
        auditEvent(this.clock, "artifact.derived", `Derived artifact ${artifact.semanticType} from run ${completedRun.runId}.`, correlationId, completedAt),
      );
    }

    record.timeline.push(timelineEvent(this.clock, "workflow_completed", `Run ${completedRun.runId} completed with ${derivedArtifacts.length} derived artifacts.`, completedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.completed", `Run ${completedRun.runId} completed.`, correlationId, completedAt));
    record.updatedAt = completedAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "workflow.completed",
        {
          run: cloneWorkflowRun(run),
          derivedArtifacts: structuredClone(derivedArtifacts),
          nextStatus: record.status,
        },
        correlationId,
        completedAt,
        completedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async cancelWorkflowRun(caseId: string, cancelledRun: WorkflowRunRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
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
    await this.applyTransition(record, "WORKFLOW_CANCELLED", correlationId);
    record.timeline.push(timelineEvent(this.clock, "workflow_cancelled", `Run ${cancelledRun.runId} was cancelled.`, completedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.cancelled", `Workflow run ${cancelledRun.runId} was cancelled.`, correlationId, completedAt));
    record.updatedAt = completedAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "workflow.cancelled",
        {
          run: cloneWorkflowRun(run),
          nextStatus: record.status,
        },
        correlationId,
        completedAt,
        completedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async failWorkflowRun(caseId: string, failedRun: WorkflowRunRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
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
    await this.applyTransition(record, "WORKFLOW_FAILED", correlationId);
    record.timeline.push(timelineEvent(this.clock, "workflow_failed", `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`, completedAt));
    record.auditEvents.push(auditEvent(this.clock, "workflow.failed", `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`, correlationId, completedAt));
    record.updatedAt = completedAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "workflow.failed",
        {
          run: cloneWorkflowRun(run),
          nextStatus: record.status,
        },
        correlationId,
        completedAt,
        completedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  // ─── Phase 2: HLA Consensus ───────────────────────────────────────

  async recordHlaConsensus(caseId: string, consensus: HlaConsensusRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const recordedAt = this.clock.nowIso();
    record.hlaConsensus = consensus;
    record.timeline.push(timelineEvent(this.clock, "hla_consensus_produced", `HLA consensus with ${consensus.alleles.length} alleles, confidence ${consensus.confidenceScore}.`, recordedAt));
    record.auditEvents.push(auditEvent(this.clock, "hla.consensus.produced", `HLA consensus produced for case ${caseId}.`, correlationId, recordedAt));
    record.updatedAt = recordedAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "hla.consensus.produced",
        { consensus: structuredClone(consensus) },
        correlationId,
        recordedAt,
        recordedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async getHlaConsensus(caseId: string): Promise<HlaConsensusRecord | null> {
    const record = await this.getCase(caseId);
    return record.hlaConsensus ?? null;
  }

  // ─── Phase 2: QC Gate ─────────────────────────────────────────────

  async recordQcGate(caseId: string, runId: string, gate: QcGateRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    const run = record.workflowRuns.find((r) => r.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }
    if (run.status !== "COMPLETED") {
      throw new ApiError(409, "invalid_transition", "QC can only be evaluated on completed runs.", "Complete the workflow run first.");
    }

    const recordedAt = this.clock.nowIso();
    record.qcGates.push(gate);
    const nextStatus = gate.outcome === "PASSED" || gate.outcome === "WARN" ? "QC_PASSED" : "QC_FAILED";
    await this.applyTransition(record, nextStatus, correlationId);

    record.timeline.push(timelineEvent(this.clock, "qc_evaluated", `QC gate for run ${runId}: ${gate.outcome}.`, recordedAt));
    record.auditEvents.push(auditEvent(this.clock, "qc.evaluated", `QC gate for run ${runId}: ${gate.outcome}. ${gate.results.length} metrics evaluated.`, correlationId, recordedAt));
    record.updatedAt = recordedAt;
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "qc.evaluated",
        {
          runId,
          gate: structuredClone(gate),
          nextStatus,
        },
        correlationId,
        recordedAt,
        recordedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
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

  async generateBoardPacket(caseId: string, correlationId: AuditContextInput): Promise<BoardPacketGenerationResult> {
    return generateBoardPacketForCase(this.getReviewMutationContext(), this.getMutableRecord(caseId), caseId, correlationId);
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

  async recordReviewOutcome(caseId: string, input: RecordReviewOutcomeInput, correlationId: AuditContextInput): Promise<ReviewOutcomeResult> {
    return recordReviewOutcomeForCase(this.getReviewMutationContext(), this.getMutableRecord(caseId), caseId, input, correlationId);
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

  async generateHandoffPacket(caseId: string, input: GenerateHandoffPacketInput, correlationId: AuditContextInput): Promise<HandoffPacketGenerationResult> {
    return generateHandoffPacketForCase(this.getReviewMutationContext(), this.getMutableRecord(caseId), caseId, input, correlationId);
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

  async recordNeoantigenRanking(caseId: string, ranking: RankingResult, correlationId: AuditContextInput): Promise<CaseRecord> {
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
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "neoantigen.ranking.recorded",
        { ranking: structuredClone(ranking) },
        correlationId,
        ranking.rankedAt,
        record.updatedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async getNeoantigenRanking(caseId: string): Promise<RankingResult | null> {
    const record = await this.getCase(caseId);
    return record.neoantigenRanking ?? null;
  }

  async recordConstructDesign(caseId: string, constructDesign: ConstructDesignPackage, correlationId: AuditContextInput): Promise<CaseRecord> {
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
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "construct.design.recorded",
        { constructDesign: structuredClone(constructDesign) },
        correlationId,
        constructDesign.designedAt,
        record.updatedAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async getConstructDesign(caseId: string): Promise<ConstructDesignPackage | null> {
    const record = await this.getCase(caseId);
    return record.constructDesign ?? null;
  }

  async recordAdministration(caseId: string, administration: AdministrationRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
    return recordAdministrationForCase(this.getOutcomeMutationContext(), this.getMutableRecord(caseId), caseId, administration, correlationId);
  }

  async recordImmuneMonitoring(caseId: string, immuneMonitoring: ImmuneMonitoringRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
    return recordImmuneMonitoringForCase(this.getOutcomeMutationContext(), this.getMutableRecord(caseId), caseId, immuneMonitoring, correlationId);
  }

  async recordClinicalFollowUp(caseId: string, clinicalFollowUp: ClinicalFollowUpRecord, correlationId: AuditContextInput): Promise<CaseRecord> {
    return recordClinicalFollowUpForCase(this.getOutcomeMutationContext(), this.getMutableRecord(caseId), caseId, clinicalFollowUp, correlationId);
  }

  async getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]> {
    return getOutcomeTimelineForCase(await this.getCase(caseId));
  }

  async getFullTraceability(caseId: string): Promise<FullTraceabilityRecord> {
    return getFullTraceabilityForCase(await this.getCase(caseId));
  }

  async syncConsentStatus(caseId: string, consentStatus: ConsentStatus, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    record.caseProfile = { ...record.caseProfile, consentStatus };
    const nextStatus = deriveCaseStatus(consentStatus, record.samples, record.artifacts, record.workflowRequests.length > 0);
    await this.applyTransition(record, nextStatus, correlationId);
    record.timeline.push(
      timelineEvent(this.clock, "consent_updated", `Consent status synchronized to '${consentStatus}'.`),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "consent.updated", `Consent status changed to '${consentStatus}'.`, correlationId),
    );
    record.updatedAt = this.clock.nowIso();
    await this.appendCaseEvent(
      this.createCaseEvent(caseId, "consent.updated" as unknown as CaseDomainEventType, { consentStatus }, correlationId),
    );
    return this.rebuildCaseProjection(caseId);
  }

  async restartFromRevision(caseId: string, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    if (record.status !== "REVISION_REQUESTED") {
      throw new ApiError(
        409,
        "invalid_transition",
        `restartFromRevision requires REVISION_REQUESTED status, current: ${record.status}.`,
        "Only cases in REVISION_REQUESTED status can be restarted.",
      );
    }
    await this.applyTransition(record, "READY_FOR_WORKFLOW", correlationId);
    record.timeline.push(
      timelineEvent(this.clock, "revision_restarted", "Case restarted from board revision for a new workflow cycle."),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "revision.restarted", "Pipeline restarted after board revision request.", correlationId),
    );
    record.updatedAt = this.clock.nowIso();
    await this.appendCaseEvent(
      this.createCaseEvent(caseId, "revision.restarted" as unknown as CaseDomainEventType, {}, correlationId),
    );
    return this.rebuildCaseProjection(caseId);
  }
}
