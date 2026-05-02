import type { AuditContextInput } from "../store-helpers";
import type {
  AdministrationRecord,
  AuditChainVerificationResult,
  AuthorizeFinalReleaseInput,
  BoardPacketGenerationResult,
  BoardPacketRecord,
  CaseRecord,
  ClinicalFollowUpRecord,
  ConsentStatus,
  ConstructDesignPackage,
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
  WorkflowRunRecord,
} from "../types";

/**
 * Primary application port for case aggregate persistence and mutation.
 *
 * The interface intentionally lives in `src/ports` so route handlers,
 * bootstrap wiring, and infrastructure adapters depend on an explicit
 * boundary rather than on a concrete store implementation. Implementations
 * must preserve event-journal semantics, correlation-aware audit metadata,
 * and consent-state invariants.
 */
export interface ICaseStore {
  createCase(
    rawInput: unknown,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  listCases(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ cases: CaseRecord[]; totalCount: number }>;
  getCase(caseId: string): Promise<CaseRecord>;
  registerSample(
    caseId: string,
    rawInput: unknown,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  registerArtifact(
    caseId: string,
    rawInput: unknown,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  requestWorkflow(
    caseId: string,
    rawInput: unknown,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  getOperationsSummary(): Promise<OperationsSummary>;
  startWorkflowRun(
    caseId: string,
    startedRun: WorkflowRunRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  completeWorkflowRun(
    caseId: string,
    completedRun: WorkflowRunRecord,
    derivedArtifacts: RunArtifact[],
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  cancelWorkflowRun(
    caseId: string,
    cancelledRun: WorkflowRunRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  failWorkflowRun(
    caseId: string,
    failedRun: WorkflowRunRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  recordHlaConsensus(
    caseId: string,
    record: HlaConsensusRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  getHlaConsensus(caseId: string): Promise<HlaConsensusRecord | null>;
  recordQcGate(
    caseId: string,
    runId: string,
    gate: QcGateRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  getQcGate(caseId: string, runId: string): Promise<QcGateRecord | null>;
  getWorkflowRun(caseId: string, runId: string): Promise<WorkflowRunRecord>;
  listWorkflowRuns(caseId: string): Promise<WorkflowRunRecord[]>;
  generateBoardPacket(
    caseId: string,
    correlationId: AuditContextInput,
  ): Promise<BoardPacketGenerationResult>;
  listBoardPackets(caseId: string): Promise<BoardPacketRecord[]>;
  getBoardPacket(caseId: string, packetId: string): Promise<BoardPacketRecord>;
  recordReviewOutcome(
    caseId: string,
    input: RecordReviewOutcomeInput,
    correlationId: AuditContextInput,
  ): Promise<ReviewOutcomeResult>;
  authorizeFinalRelease(
    caseId: string,
    input: AuthorizeFinalReleaseInput,
    correlationId: AuditContextInput,
  ): Promise<FinalReleaseAuthorizationResult>;
  listReviewOutcomes(caseId: string): Promise<ReviewOutcomeRecord[]>;
  getReviewOutcome(
    caseId: string,
    reviewId: string,
  ): Promise<ReviewOutcomeRecord>;
  generateHandoffPacket(
    caseId: string,
    input: GenerateHandoffPacketInput,
    correlationId: AuditContextInput,
  ): Promise<HandoffPacketGenerationResult>;
  listHandoffPackets(caseId: string): Promise<HandoffPacketRecord[]>;
  getHandoffPacket(
    caseId: string,
    handoffId: string,
  ): Promise<HandoffPacketRecord>;
  recordNeoantigenRanking(
    caseId: string,
    ranking: RankingResult,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  getNeoantigenRanking(caseId: string): Promise<RankingResult | null>;
  recordConstructDesign(
    caseId: string,
    constructDesign: ConstructDesignPackage,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  getConstructDesign(caseId: string): Promise<ConstructDesignPackage | null>;
  recordAdministration(
    caseId: string,
    administration: AdministrationRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  recordImmuneMonitoring(
    caseId: string,
    immuneMonitoring: ImmuneMonitoringRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  recordClinicalFollowUp(
    caseId: string,
    clinicalFollowUp: ClinicalFollowUpRecord,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  getOutcomeTimeline(caseId: string): Promise<OutcomeTimelineEntry[]>;
  getFullTraceability(caseId: string): Promise<FullTraceabilityRecord>;
  syncConsentStatus(
    caseId: string,
    consentStatus: ConsentStatus,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  restartFromRevision(
    caseId: string,
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  resolveHlaReview(
    caseId: string,
    resolution: { rationale: string },
    correlationId: AuditContextInput,
  ): Promise<CaseRecord>;
  verifyAuditChain(caseId: string): Promise<AuditChainVerificationResult>;
}
