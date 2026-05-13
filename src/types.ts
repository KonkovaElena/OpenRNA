//  Barrel module  re-exports all domain types from split modules

export * from "./types-core";
export * from "./types-events";
export * from "./types-review";
export * from "./types-scientific";
export * from "./types-workflow";

//  Aggregating CaseRecord (depends on all domain modules)

import type {
  ArtifactRecord,
  CaseAuditEventRecord,
  CaseProfile,
  CaseStatus,
  RunArtifact,
  SampleRecord,
  TimelineEvent,
  WorkflowRequestRecord,
} from "./types-core";
import type { BoardPacketRecord, HandoffPacketRecord, ReviewOutcomeRecord } from "./types-review";
import type { ConstructDesignPackage, HorizonModality, OutcomeTimelineEntry, RankingResult } from "./types-scientific";
import type { HlaConsensusRecord, QcGateRecord, WorkflowRunRecord } from "./types-workflow";

export interface CaseRecord {
  caseId: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  caseProfile: CaseProfile;
  samples: SampleRecord[];
  artifacts: ArtifactRecord[];
  workflowRequests: WorkflowRequestRecord[];
  workflowRuns: WorkflowRunRecord[];
  derivedArtifacts: RunArtifact[];
  timeline: TimelineEvent[];
  auditEvents: CaseAuditEventRecord[];
  hlaConsensus?: HlaConsensusRecord;
  qcGates: QcGateRecord[];
  boardPackets: BoardPacketRecord[];
  reviewOutcomes: ReviewOutcomeRecord[];
  handoffPackets: HandoffPacketRecord[];
  neoantigenRanking?: RankingResult;
  constructDesign?: ConstructDesignPackage;
  outcomeTimeline: OutcomeTimelineEntry[];
  modalities?: HorizonModality[];
}
