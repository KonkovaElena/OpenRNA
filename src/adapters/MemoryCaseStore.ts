import { randomUUID } from "node:crypto";
import { ApiError } from "../errors";
import type { ICaseStore } from "../ports/ICaseStore";
import type { IEventStore } from "../ports/IEventStore";
import type { IStateMachineGuard } from "../ports/IStateMachineGuard";
import type { IWorkflowDispatchSink } from "../ports/IWorkflowDispatchSink";
import { replayCaseEvents } from "../queries/CaseProjection";
import {
  resolveHlaReviewForCase,
  restartFromRevisionForCase,
  syncConsentStatusForCase,
} from "../store-consent-revision";
import { createCaseRecord } from "../store-create-case";
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
import { recordConstructDesignForCase, recordNeoantigenRankingForCase } from "../store-scientific";
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
    type: string,
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
      applyTransition: this.applyTransition.bind(this),
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
    };
  }

  private getScientificMutationContext() {
    return {
      clock: this.clock,
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
    };
  }

  private getConsentRevisionMutationContext() {
    return {
      clock: this.clock,
      applyTransition: this.applyTransition.bind(this),
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
    };
  }

  private getCreateCaseMutationContext() {
    return {
      clock: this.clock,
      generateId: randomUUID,
      deriveCaseStatus,
      createCaseEvent: this.createCaseEvent.bind(this),
      appendCaseEvent: this.appendCaseEvent.bind(this),
    };
  }

  async createCase(rawInput: unknown, correlationId: AuditContextInput): Promise<CaseRecord> {
    const input = parseCreateCaseInput(rawInput);
    const record = await createCaseRecord(this.getCreateCaseMutationContext(), input, correlationId);
    return this.rebuildCaseProjection(record.caseId);
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
    await requestWorkflowForCase(this.getWorkflowMutationContext(), record, input, correlationId);
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
    await startWorkflowRunForCase(this.getWorkflowMutationContext(), record, startedRun, correlationId);
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
    await completeWorkflowRunForCase(
      this.getWorkflowMutationContext(),
      record,
      completedRun,
      derivedArtifacts,
      correlationId,
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
    await cancelWorkflowRunForCase(this.getWorkflowMutationContext(), record, cancelledRun, correlationId);
    return this.rebuildCaseProjection(caseId);
  }

  async failWorkflowRun(
    caseId: string,
    failedRun: WorkflowRunRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    await failWorkflowRunForCase(this.getWorkflowMutationContext(), record, failedRun, correlationId);
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
    await recordQcGateForCase(this.getHlaQcMutationContext(), record, caseId, runId, gate, correlationId);
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
    await recordNeoantigenRankingForCase(this.getScientificMutationContext(), record, caseId, ranking, correlationId);
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
    await recordConstructDesignForCase(
      this.getScientificMutationContext(),
      record,
      caseId,
      constructDesign,
      correlationId,
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
    await syncConsentStatusForCase(
      this.getConsentRevisionMutationContext(),
      record,
      caseId,
      consentStatus,
      correlationId,
    );
    return this.rebuildCaseProjection(caseId);
  }

  async restartFromRevision(caseId: string, correlationId: AuditContextInput): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    await restartFromRevisionForCase(this.getConsentRevisionMutationContext(), record, caseId, correlationId);
    return this.rebuildCaseProjection(caseId);
  }

  async resolveHlaReview(
    caseId: string,
    resolution: { rationale: string },
    correlationId: AuditContextInput,
  ): Promise<CaseRecord> {
    const record = this.getMutableRecord(caseId);
    this.assertConsentMutable(record);
    await resolveHlaReviewForCase(this.getConsentRevisionMutationContext(), record, caseId, resolution, correlationId);
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
