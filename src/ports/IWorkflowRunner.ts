import type { DerivedArtifactSemanticType, WorkflowFailureCategory, WorkflowRunManifest, WorkflowRunRecord } from "../types";

export interface WorkflowRunRequest {
  runId: string;
  caseId: string;
  requestId: string;
  workflowName: string;
  referenceBundleId: string;
  executionProfile: string;
  manifest?: WorkflowRunManifest;
}

export interface IWorkflowRunner {
  startRun(request: WorkflowRunRequest): Promise<WorkflowRunRecord>;
  getRun(runId: string): Promise<WorkflowRunRecord>;
  cancelRun(runId: string): Promise<WorkflowRunRecord>;
  listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]>;
  completeRun(runId: string, derivedArtifacts?: Array<{ semanticType: DerivedArtifactSemanticType; artifactHash: string; producingStep: string }>): Promise<WorkflowRunRecord>;
  failRun(runId: string, reason: string, failureCategory?: WorkflowFailureCategory): Promise<WorkflowRunRecord>;
}
