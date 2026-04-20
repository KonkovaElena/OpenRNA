import type { WorkflowRunRecord } from "../types";

export interface WorkflowRunRequest {
  caseId: string;
  requestId: string;
  workflowName: string;
  referenceBundleId: string;
  executionProfile: string;
}

export interface IWorkflowRunner {
  startRun(request: WorkflowRunRequest): Promise<WorkflowRunRecord>;
  getRun(runId: string): Promise<WorkflowRunRecord>;
  cancelRun(runId: string): Promise<WorkflowRunRecord>;
  listRunsByCaseId(caseId: string): Promise<WorkflowRunRecord[]>;
  completeRun(runId: string, derivedArtifacts?: Array<{ semanticType: string; artifactHash: string; producingStep: string }>): Promise<WorkflowRunRecord>;
  failRun(runId: string, reason: string): Promise<WorkflowRunRecord>;
}
