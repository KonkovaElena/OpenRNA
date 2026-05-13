/**
 * Barrel module - re-exports the MemoryCaseStore adapter and all public symbols
 * previously defined inline. Existing imports from "./store" continue to work
 * without modification.
 */

export { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";
export type { Clock, ReconstructedRun } from "./adapters/MemoryCaseStore";
export { MemoryCaseStore, reconstructRunFromManifest, SystemClock } from "./adapters/MemoryCaseStore";
export type { IWorkflowDispatchSink as WorkflowDispatchSink } from "./ports/IWorkflowDispatchSink";
export type { AuditContextInput } from "./store-helpers";
export { buildEvidenceLineage } from "./store-helpers";
export {
  parseActivateModalityInput,
  parseAuthorizeFinalReleaseInput,
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
  parseRecordNeoantigenRankingInput,
  parseRecordReviewOutcomeInput,
  parseRegisterArtifactInput,
  parseRegisterBundleInput,
  parseRegisterSampleInput,
  parseRequestWorkflowInput,
  parseStartWorkflowRunInput,
  parseWorkflowOutputManifest,
  parseWorkflowRunManifest,
} from "./validation";

import type { ICaseStore } from "./ports/ICaseStore";
export type CaseStore = ICaseStore;
