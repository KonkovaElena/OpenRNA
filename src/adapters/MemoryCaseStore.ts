import { randomUUID } from "node:crypto";
import { ApiError } from "../errors";
import type { ICaseStore } from "../ports/ICaseStore";
import type { IEventStore } from "../ports/IEventStore";
import type { IStateMachineGuard } from "../ports/IStateMachineGuard";
import type { IWorkflowDispatchSink } from "../ports/IWorkflowDispatchSink";
import { replayCaseEvents } from "../queries/CaseProjection";
import type { AuditContextInput } from "../store-helpers";
import {
  auditEvent,
  cloneWorkflowRun,
  deriveCaseStatus,
  emptyStatusCounts,
  hasSameDerivedArtifactsForRun,
  hasSameRunReplayIdentity,
  normalizeAuditContext,
  timelineEvent,
  verifyAuditChainIntegrity,
} from "../store-helpers";
import { recordHlaConsensusForCase, recordQcGateForCase } from "../store-hla-qc";
import {
  getFullTraceabilityForCase,
  getOutcomeTimelineForCase,
  recordAdministrationForCase,
  recordClinicalFollowUpForCase,
  recordImmuneMonitoringForCase,
} from "../store-outcomes";
import {
  authorizeFinalReleaseForCase,
  generateBoardPacketForCase,
  generateHandoffPacketForCase,
  recordReviewOutcomeForCase,
} from "../store-review";
import { registerArtifactForCase, registerSampleForCase } from "../store-sample-artifact";
import {
  cancelWorkflowRunForCase,
  completeWorkflowRunForCase,
  failWorkflowRunForCase,
  requestWorkflowForCase,
  startWorkflowRunForCase,
} from "../store-workflow-lifecycle";
import type {
  AdministrationRecord,
  ArtifactRecord,
  AuditChainVerificationResult,
  AuthorizeFinalReleaseInput,
  BoardPacketGenerationResult,
  BoardPacketRecord,
  CaseDomainEventInput,
  CaseDomainEventRecord,
  CaseDomainEventType,
  CaseRecord,
  CaseStatus,
  ClinicalFollowUpRecord,
  ConsentStatus,
  ConstructDesignPackage,
  DerivedArtifactSemanticType,
  FinalReleaseAuthorizationResult,
  FullTraceabilityRecord,
  GenerateHandoffPacketInput,
  HandoffPacketGenerationResult,
  HandoffPacketRecord,
  HlaConsensusRecord,
  ImmuneMonitoringRecord,
  OperationsSummary,
  OutcomeTimelineEntry,
  QcGateRecord,
  RankingResult,
  RecordReviewOutcomeInput,
  ReviewOutcomeRecord,
  ReviewOutcomeResult,
  RunArtifact,
  SampleRecord,
  TimelineEvent,
  WorkflowRequestRecord,
  WorkflowRunManifest,
  WorkflowRunRecord,
} from "../types";
import { isCompatibleSourceArtifactSemanticType } from "../types";
import {
  parseCreateCaseInput,
  parseRegisterArtifactInput,
  parseRegisterSampleInput,
  parseRequestWorkflowInput,
} from "../validation";
import { InMemoryEventStore } from "./InMemoryEventStore";
import { InMemoryWorkflowDispatchSink } from "./InMemoryWorkflowDispatchSink";

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
    derivedArtifacts?: Array<{
      semanticType: DerivedArtifactSemanticType;
      artifactHash: string;
      producingStep: string;
    }>;
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

export class MemoryCaseStore implements ICaseStore {
  private readonly cases = new Map<string, CaseRecord>();

  constructor(
    private readonly clock: Clock = new SystemClock(),
    private readonly workflowDispatchSink: IWorkflowDispatchSink = new InMemoryWorkflowDispatchSink(),
    initialRecords: readonly CaseRecord[] = [],
    private readonly stateMachineGuard?: IStateMachineGuard,
    private readonly eventStore: IEventStore<
      CaseDomainEventInput,
      CaseDomainEventRecord
    > = new InMemoryEventStore<CaseDomainEventInput>(),
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
  private async applyTransition(
    record: CaseRecord,
    nextStatus: CaseStatus,
    _correlationId?: AuditContextInput,
  ): Promise<void> {
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

  private getWorkflowMutationContext() {
    return {
      clock: this.clock,
      applyTransition: this.applyTransition.bind(this),
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
      workflowDispatchSink: this.workflowDispatchSink,
      stateMachineGuard: this.stateMachineGuard,
    };
  }

  private getSampleArtifactMutationContext() {
    return {
      clock: this.clock,
      applyTransition: this.applyTransition.bind(this),
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
    };
  }

  private getHlaQcMutationContext() {
    return {
      clock: this.clock,
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
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
    const limit = options?.limit ?? all.length;
    const offset = options?.offset ?? 0;
    return { cases: all.slice(offset, offset + limit), totalCount: all.length };
  }

  async getCase(caseId: string): Promise<CaseRecord> {
    return structuredClone(this.getMutableRecord(caseId));
  }

  private getMutableRecord(caseId: string): CaseRecord {
    const record = this.cases.get(caseId);
    if (!record) {
      throw new ApiError(
        404,
        "case_not_found",
        "Case was not found.",
        "Use a valid caseId from the case list endpoint.",
      );
    }

    return record;
  }

  private assertConsentMutable(record: CaseRecord): void {
    if (record.status !== "CONSENT_WITHDRAWN") {
      return;
    }

    throw new ApiError(
      409,
      "consent_withdrawn",
      "Case is locked because consent has been withdrawn.",
      "Create a new case under renewed consent rather than mutating this terminal consent-withdrawn case.",
    );
  }

  async registerSample(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    const input = parseRegisterSampleInput(rawInput);

    const { sampleRecord, nextStatus } = await registerSampleForCase(
      this.getSampleArtifactMutationContext(),
      record,
      input,
      correlationId,
    );
    const workflowGateOpened = nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW";
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
        sampleRecord.registeredAt,
        sampleRecord.registeredAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async registerArtifact(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    const input = parseRegisterArtifactInput(rawInput);

    const { artifact, nextStatus } = await registerArtifactForCase(
      this.getSampleArtifactMutationContext(),
      record,
      input,
      correlationId,
    );
    const workflowGateOpened = nextStatus === "READY_FOR_WORKFLOW" && record.status !== "READY_FOR_WORKFLOW";
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
        artifact.registeredAt,
        artifact.registeredAt,
      ),
    );

    return this.rebuildCaseProjection(caseId);
  }

  async requestWorkflow(caseId: string, rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    const input = parseRequestWorkflowInput(rawInput);
    const requestedAt = this.clock.nowIso();
    const { workflowRequest, nextStatus, isDuplicate } = await requestWorkflowForCase(
      this.getWorkflowMutationContext(),
      record,
      input,
      correlationId,
    );

    if (isDuplicate) {
      return structuredClone(record);
    }

    await this.applyTransition(record, nextStatus, correlationId);
    record.timeline.push(
      timelineEvent(
        this.clock,
        "workflow_requested",
        `${input.workflowName} requested with reference bundle ${input.referenceBundleId}.`,
      ),
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

  async startWorkflowRun(
    caseId: string,
    startedRun: WorkflowRunRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);

    const { run, isReplay } = await startWorkflowRunForCase(
      this.getWorkflowMutationContext(),
      record,
      startedRun,
      correlationId,
    );

    if (isReplay) {
      return structuredClone(record);
    }

    const startedAt = run.startedAt ?? this.clock.nowIso();
    await this.applyTransition(record, "WORKFLOW_RUNNING", correlationId);
    record.timeline.push(
      timelineEvent(this.clock, "workflow_started", `Workflow run ${run.runId} started.`, startedAt),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "workflow.started", `Workflow run ${run.runId} started.`, correlationId, startedAt),
    );
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

  async completeWorkflowRun(
    caseId: string,
    completedRun: WorkflowRunRecord,
    derivedArtifacts: RunArtifact[],
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);

    const { run, isReplay } = await completeWorkflowRunForCase(
      this.getWorkflowMutationContext(),
      record,
      completedRun,
      derivedArtifacts,
      correlationId,
    );

    if (isReplay) {
      return structuredClone(record);
    }

    const completedAt = run.completedAt ?? this.clock.nowIso();
    await this.applyTransition(record, "WORKFLOW_COMPLETED", correlationId);

    for (const artifact of derivedArtifacts) {
      record.auditEvents.push(
        auditEvent(
          this.clock,
          "artifact.derived",
          `Derived artifact ${artifact.semanticType} from run ${completedRun.runId}.`,
          correlationId,
          completedAt,
        ),
      );
    }

    record.timeline.push(
      timelineEvent(
        this.clock,
        "workflow_completed",
        `Run ${completedRun.runId} completed with ${derivedArtifacts.length} derived artifacts.`,
        completedAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "workflow.completed", `Run ${completedRun.runId} completed.`, correlationId, completedAt),
    );
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

  async cancelWorkflowRun(
    caseId: string,
    cancelledRun: WorkflowRunRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);

    const { run, isReplay } = await cancelWorkflowRunForCase(
      this.getWorkflowMutationContext(),
      record,
      cancelledRun,
      correlationId,
    );

    if (isReplay) {
      return structuredClone(record);
    }

    const completedAt = run.completedAt ?? this.clock.nowIso();
    await this.applyTransition(record, "WORKFLOW_CANCELLED", correlationId);
    record.timeline.push(
      timelineEvent(this.clock, "workflow_cancelled", `Run ${cancelledRun.runId} was cancelled.`, completedAt),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "workflow.cancelled",
        `Workflow run ${cancelledRun.runId} was cancelled.`,
        correlationId,
        completedAt,
      ),
    );
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

  async failWorkflowRun(
    caseId: string,
    failedRun: WorkflowRunRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);

    const { run, isReplay } = await failWorkflowRunForCase(
      this.getWorkflowMutationContext(),
      record,
      failedRun,
      correlationId,
    );

    if (isReplay) {
      return structuredClone(record);
    }

    const completedAt = run.completedAt ?? this.clock.nowIso();
    await this.applyTransition(record, "WORKFLOW_FAILED", correlationId);
    record.timeline.push(
      timelineEvent(
        this.clock,
        "workflow_failed",
        `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`,
        completedAt,
      ),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "workflow.failed",
        `Run ${failedRun.runId} failed: ${failedRun.failureReason ?? "unknown failure"}`,
        correlationId,
        completedAt,
      ),
    );
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

  async recordHlaConsensus(
    caseId: string,
    consensus: HlaConsensusRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    await recordHlaConsensusForCase(this.getHlaQcMutationContext(), record, caseId, consensus, correlationId);
    return this.rebuildCaseProjection(caseId);
  }

  async getHlaConsensus(caseId: string): Promise<HlaConsensusRecord | null> {
    const record = await this.getCase(caseId);
    return record.hlaConsensus ?? null;
  }

  // ─── Phase 2: QC Gate ─────────────────────────────────────────────

  async recordQcGate(
    caseId: string,
    runId: string,
    gate: QcGateRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    const run = record.workflowRuns.find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }
    if (run.status !== "COMPLETED") {
      throw new ApiError(
        409,
        "invalid_transition",
        "QC gate can only be evaluated after workflow run completes.",
        "Complete the workflow run before evaluating QC.",
      );
    }

    const nextStatus = gate.outcome === "FAILED" ? "QC_FAILED" : "QC_PASSED";
    await recordQcGateForCase(this.getHlaQcMutationContext(), record, caseId, runId, gate, correlationId);
    await this.applyTransition(record, nextStatus, correlationId);
    record.updatedAt = this.clock.nowIso();
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "qc.evaluated",
        { runId, gate: structuredClone(gate), nextStatus },
        correlationId,
        gate.evaluatedAt,
        record.updatedAt,
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
      throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
    }
    return run;
  }

  async listWorkflowRuns(caseId: string): Promise<WorkflowRunRecord[]> {
    const record = await this.getCase(caseId);
    return record.workflowRuns;
  }

  async generateBoardPacket(caseId: string, correlationId: AuditContextInput): Promise<BoardPacketGenerationResult> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    return generateBoardPacketForCase(this.getReviewMutationContext(), record, caseId, correlationId);
  }

  async listBoardPackets(caseId: string): Promise<BoardPacketRecord[]> {
    const record = await this.getCase(caseId);
    return record.boardPackets;
  }

  async getBoardPacket(caseId: string, packetId: string): Promise<BoardPacketRecord> {
    const record = await this.getCase(caseId);
    const packet = record.boardPackets.find((candidate) => candidate.packetId === packetId);
    if (!packet) {
      throw new ApiError(
        404,
        "board_packet_not_found",
        "Board packet was not found for this case.",
        "Use a valid packetId from the board packet list endpoint.",
      );
    }
    return structuredClone(packet);
  }

  // ─── Wave 15: Review Outcome + Manufacturing Handoff ────────────

  async recordReviewOutcome(
    caseId: string,
    input: RecordReviewOutcomeInput,
    correlationId: AuditContextInput,
  ): Promise<ReviewOutcomeResult> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    return recordReviewOutcomeForCase(this.getReviewMutationContext(), record, caseId, input, correlationId);
  }

  async authorizeFinalRelease(
    caseId: string,
    input: AuthorizeFinalReleaseInput,
    correlationId: AuditContextInput,
  ): Promise<FinalReleaseAuthorizationResult> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    return authorizeFinalReleaseForCase(this.getReviewMutationContext(), record, caseId, input, correlationId);
  }

  async listReviewOutcomes(caseId: string): Promise<ReviewOutcomeRecord[]> {
    const record = await this.getCase(caseId);
    return structuredClone(record.reviewOutcomes);
  }

  async getReviewOutcome(caseId: string, reviewId: string): Promise<ReviewOutcomeRecord> {
    const record = await this.getCase(caseId);
    const reviewOutcome = record.reviewOutcomes.find((candidate) => candidate.reviewId === reviewId);
    if (!reviewOutcome) {
      throw new ApiError(
        404,
        "review_outcome_not_found",
        "Review outcome was not found for this case.",
        "Use a valid reviewId from the review outcome list endpoint.",
      );
    }

    return structuredClone(reviewOutcome);
  }

  async generateHandoffPacket(
    caseId: string,
    input: GenerateHandoffPacketInput,
    correlationId: AuditContextInput,
  ): Promise<HandoffPacketGenerationResult> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    return generateHandoffPacketForCase(this.getReviewMutationContext(), record, caseId, input, correlationId);
  }

  async listHandoffPackets(caseId: string): Promise<HandoffPacketRecord[]> {
    const record = await this.getCase(caseId);
    return structuredClone(record.handoffPackets);
  }

  async getHandoffPacket(caseId: string, handoffId: string): Promise<HandoffPacketRecord> {
    const record = await this.getCase(caseId);
    const handoff = record.handoffPackets.find((candidate) => candidate.handoffId === handoffId);
    if (!handoff) {
      throw new ApiError(
        404,
        "handoff_packet_not_found",
        "Handoff packet was not found for this case.",
        "Use a valid handoffId from the handoff packet list endpoint.",
      );
    }

    return structuredClone(handoff);
  }

  // ─── Wave 8: Neoantigen Ranking ────────────────────────────────────

  async recordNeoantigenRanking(
    caseId: string,
    ranking: RankingResult,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
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

  async recordConstructDesign(
    caseId: string,
    constructDesign: ConstructDesignPackage,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
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

  async recordAdministration(
    caseId: string,
    administration: AdministrationRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    return recordAdministrationForCase(this.getOutcomeMutationContext(), record, caseId, administration, correlationId);
  }

  async recordImmuneMonitoring(
    caseId: string,
    immuneMonitoring: ImmuneMonitoringRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    return recordImmuneMonitoringForCase(
      this.getOutcomeMutationContext(),
      record,
      caseId,
      immuneMonitoring,
      correlationId,
    );
  }

  async recordClinicalFollowUp(
    caseId: string,
    clinicalFollowUp: ClinicalFollowUpRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    return recordClinicalFollowUpForCase(
      this.getOutcomeMutationContext(),
      record,
      caseId,
      clinicalFollowUp,
      correlationId,
    );
  }

  async getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]> {
    return getOutcomeTimelineForCase(await this.getCase(caseId));
  }

  async getFullTraceability(caseId: string): Promise<FullTraceabilityRecord> {
    return getFullTraceabilityForCase(await this.getCase(caseId));
  }

  async syncConsentStatus(
    caseId: string,
    consentStatus: ConsentStatus,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    if (record.status === "CONSENT_WITHDRAWN" && consentStatus !== "withdrawn") {
      throw new ApiError(
        409,
        "new_case_required_after_consent_withdrawal",
        "Renewed consent cannot reopen a terminal consent-withdrawn case.",
        "Create a new case linked to the renewed consent record rather than mutating the withdrawn case.",
      );
    }

    record.caseProfile = { ...record.caseProfile, consentStatus };
    const nextStatus = deriveCaseStatus(
      consentStatus,
      record.samples,
      record.artifacts,
      record.workflowRequests.length > 0,
    );
    await this.applyTransition(record, nextStatus, correlationId);
    record.timeline.push(
      timelineEvent(this.clock, "consent_updated", `Consent status synchronized to '${consentStatus}'.`),
    );
    record.auditEvents.push(
      auditEvent(this.clock, "consent.updated", `Consent status changed to '${consentStatus}'.`, correlationId),
    );
    record.updatedAt = this.clock.nowIso();
    await this.appendCaseEvent(
      this.createCaseEvent(caseId, "consent.updated", { consentStatus, nextStatus }, correlationId),
    );
    return this.rebuildCaseProjection(caseId);
  }

  async restartFromRevision(caseId: string, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
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
      this.createCaseEvent(caseId, "revision.restarted", { nextStatus: record.status }, correlationId),
    );
    return this.rebuildCaseProjection(caseId);
  }

  async resolveHlaReview(
    caseId: string,
    resolution: { rationale: string },
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    if (record.status !== "HLA_REVIEW_REQUIRED") {
      throw new ApiError(
        409,
        "invalid_transition",
        `resolveHlaReview requires HLA_REVIEW_REQUIRED status, current: ${record.status}.`,
        "Only cases in HLA_REVIEW_REQUIRED status can have their HLA review resolved.",
      );
    }
    await this.applyTransition(record, "AWAITING_REVIEW", correlationId);
    record.timeline.push(
      timelineEvent(this.clock, "hla_review_resolved", `HLA review resolved: ${resolution.rationale}`),
    );
    record.auditEvents.push(
      auditEvent(
        this.clock,
        "hla.review.resolved",
        `Operator resolved HLA review: ${resolution.rationale}`,
        correlationId,
      ),
    );
    record.updatedAt = this.clock.nowIso();
    await this.appendCaseEvent(
      this.createCaseEvent(
        caseId,
        "hla.review.resolved",
        { rationale: resolution.rationale, nextStatus: record.status },
        correlationId,
      ),
    );
    return this.rebuildCaseProjection(caseId);
  }

  async verifyAuditChain(caseId: string): Promise<AuditChainVerificationResult> {
    const record = await this.getCase(caseId);
    const sorted = [...record.auditEvents].sort((a, b) => {
      const byTime = a.occurredAt.localeCompare(b.occurredAt);
      return byTime !== 0 ? byTime : a.eventId.localeCompare(b.eventId);
    });
    return verifyAuditChainIntegrity(sorted);
  }
}
