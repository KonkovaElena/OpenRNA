// ─── Case Event Journal ─────────────────────────────────────────────

export const caseDomainEventTypes = [
  "case.created",
  "sample.registered",
  "artifact.registered",
  "workflow.requested",
  "workflow.started",
  "workflow.completed",
  "workflow.cancelled",
  "workflow.failed",
  "hla.consensus.produced",
  "qc.evaluated",
  "board.packet.generated",
  "review.outcome.recorded",
  "final.release.authorized",
  "handoff.packet.generated",
  "neoantigen.ranking.recorded",
  "construct.design.recorded",
  "administration.recorded",
  "immune-monitoring.recorded",
  "clinical-follow-up.recorded",
  "consent.updated",
  "revision.restarted",
  "hla.review.resolved",
] as const;

export type CaseDomainEventType = (typeof caseDomainEventTypes)[number];

export type DomainEventInput<TType extends string, TPayload> = {
  eventId: string;
  aggregateId: string;
  aggregateType: "case";
  type: TType;
  occurredAt: string;
  updatedAt: string;
  correlationId: string;
  actorId: string;
  authMechanism: import("./types-core").AuthMechanism;
  payload: TPayload;
};

export type DomainEventRecord<TType extends string, TPayload> = DomainEventInput<TType, TPayload> & {
  version: number;
};

// ─── Event Payloads ────────────────────────────────────────────────

export interface CaseCreatedEventPayload {
  createdAt: string;
  status: import("./types-core").CaseStatus;
  caseProfile: import("./types-core").CaseProfile;
}

export interface SampleRegisteredEventPayload {
  sample: import("./types-core").SampleRecord;
  nextStatus: import("./types-core").CaseStatus;
  workflowGateOpened: boolean;
}

export interface ArtifactRegisteredEventPayload {
  artifact: import("./types-core").ArtifactRecord;
  nextStatus: import("./types-core").CaseStatus;
  workflowGateOpened: boolean;
}

export interface WorkflowRequestedEventPayload {
  request: import("./types-core").WorkflowRequestRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface WorkflowStartedEventPayload {
  run: import("./types-workflow").WorkflowRunRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface WorkflowCompletedEventPayload {
  run: import("./types-workflow").WorkflowRunRecord;
  derivedArtifacts: import("./types-core").RunArtifact[];
  nextStatus: import("./types-core").CaseStatus;
}

export interface WorkflowCancelledEventPayload {
  run: import("./types-workflow").WorkflowRunRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface WorkflowFailedEventPayload {
  run: import("./types-workflow").WorkflowRunRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface HlaConsensusProducedEventPayload {
  consensus: import("./types-workflow").HlaConsensusRecord;
}

export interface QcEvaluatedEventPayload {
  runId: string;
  gate: import("./types-workflow").QcGateRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface BoardPacketGeneratedEventPayload {
  packet: import("./types-review").BoardPacketRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface ReviewOutcomeRecordedEventPayload {
  reviewOutcome: import("./types-review").ReviewOutcomeRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface FinalReleaseAuthorizedEventPayload {
  reviewOutcome: import("./types-review").ReviewOutcomeRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface HandoffPacketGeneratedEventPayload {
  handoffPacket: import("./types-review").HandoffPacketRecord;
  nextStatus: import("./types-core").CaseStatus;
}

export interface NeoantigenRankingRecordedEventPayload {
  ranking: import("./types-scientific").RankingResult;
}

export interface ConstructDesignRecordedEventPayload {
  constructDesign: import("./types-scientific").ConstructDesignPackage;
}

export interface AdministrationRecordedEventPayload {
  entry: Extract<import("./types-scientific").OutcomeTimelineEntry, { entryType: "administration" }>;
}

export interface ImmuneMonitoringRecordedEventPayload {
  entry: Extract<import("./types-scientific").OutcomeTimelineEntry, { entryType: "immune-monitoring" }>;
}

export interface ClinicalFollowUpRecordedEventPayload {
  entry: Extract<import("./types-scientific").OutcomeTimelineEntry, { entryType: "clinical-follow-up" }>;
}

export interface ConsentUpdatedEventPayload {
  consentStatus: import("./types-core").ConsentStatus;
  nextStatus: import("./types-core").CaseStatus;
}

export interface RevisionRestartedEventPayload {
  nextStatus: import("./types-core").CaseStatus;
}

export interface HlaReviewResolvedEventPayload {
  rationale: string;
  nextStatus: import("./types-core").CaseStatus;
}

export type CaseDomainEventInput =
  | DomainEventInput<"case.created", CaseCreatedEventPayload>
  | DomainEventInput<"sample.registered", SampleRegisteredEventPayload>
  | DomainEventInput<"artifact.registered", ArtifactRegisteredEventPayload>
  | DomainEventInput<"workflow.requested", WorkflowRequestedEventPayload>
  | DomainEventInput<"workflow.started", WorkflowStartedEventPayload>
  | DomainEventInput<"workflow.completed", WorkflowCompletedEventPayload>
  | DomainEventInput<"workflow.cancelled", WorkflowCancelledEventPayload>
  | DomainEventInput<"workflow.failed", WorkflowFailedEventPayload>
  | DomainEventInput<"hla.consensus.produced", HlaConsensusProducedEventPayload>
  | DomainEventInput<"qc.evaluated", QcEvaluatedEventPayload>
  | DomainEventInput<"board.packet.generated", BoardPacketGeneratedEventPayload>
  | DomainEventInput<"review.outcome.recorded", ReviewOutcomeRecordedEventPayload>
  | DomainEventInput<"final.release.authorized", FinalReleaseAuthorizedEventPayload>
  | DomainEventInput<"handoff.packet.generated", HandoffPacketGeneratedEventPayload>
  | DomainEventInput<"neoantigen.ranking.recorded", NeoantigenRankingRecordedEventPayload>
  | DomainEventInput<"construct.design.recorded", ConstructDesignRecordedEventPayload>
  | DomainEventInput<"administration.recorded", AdministrationRecordedEventPayload>
  | DomainEventInput<"immune-monitoring.recorded", ImmuneMonitoringRecordedEventPayload>
  | DomainEventInput<"clinical-follow-up.recorded", ClinicalFollowUpRecordedEventPayload>
  | DomainEventInput<"consent.updated", ConsentUpdatedEventPayload>
  | DomainEventInput<"revision.restarted", RevisionRestartedEventPayload>
  | DomainEventInput<"hla.review.resolved", HlaReviewResolvedEventPayload>;

export type CaseDomainEventRecord =
  | DomainEventRecord<"case.created", CaseCreatedEventPayload>
  | DomainEventRecord<"sample.registered", SampleRegisteredEventPayload>
  | DomainEventRecord<"artifact.registered", ArtifactRegisteredEventPayload>
  | DomainEventRecord<"workflow.requested", WorkflowRequestedEventPayload>
  | DomainEventRecord<"workflow.started", WorkflowStartedEventPayload>
  | DomainEventRecord<"workflow.completed", WorkflowCompletedEventPayload>
  | DomainEventRecord<"workflow.cancelled", WorkflowCancelledEventPayload>
  | DomainEventRecord<"workflow.failed", WorkflowFailedEventPayload>
  | DomainEventRecord<"hla.consensus.produced", HlaConsensusProducedEventPayload>
  | DomainEventRecord<"qc.evaluated", QcEvaluatedEventPayload>
  | DomainEventRecord<"board.packet.generated", BoardPacketGeneratedEventPayload>
  | DomainEventRecord<"review.outcome.recorded", ReviewOutcomeRecordedEventPayload>
  | DomainEventRecord<"final.release.authorized", FinalReleaseAuthorizedEventPayload>
  | DomainEventRecord<"handoff.packet.generated", HandoffPacketGeneratedEventPayload>
  | DomainEventRecord<"neoantigen.ranking.recorded", NeoantigenRankingRecordedEventPayload>
  | DomainEventRecord<"construct.design.recorded", ConstructDesignRecordedEventPayload>
  | DomainEventRecord<"administration.recorded", AdministrationRecordedEventPayload>
  | DomainEventRecord<"immune-monitoring.recorded", ImmuneMonitoringRecordedEventPayload>
  | DomainEventRecord<"clinical-follow-up.recorded", ClinicalFollowUpRecordedEventPayload>
  | DomainEventRecord<"consent.updated", ConsentUpdatedEventPayload>
  | DomainEventRecord<"revision.restarted", RevisionRestartedEventPayload>
  | DomainEventRecord<"hla.review.resolved", HlaReviewResolvedEventPayload>;
