import type { WellKnownWorkflowName } from "../types";

export interface OrchestrationStep {
  workflowName: WellKnownWorkflowName;
  dependsOn: WellKnownWorkflowName[];
}

export interface OrchestrationPlan {
  caseId: string;
  steps: OrchestrationStep[];
}

export interface StepResult {
  workflowName: WellKnownWorkflowName;
  runId: string;
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  failureReason?: string;
}

export interface OrchestrationResult {
  caseId: string;
  planSteps: OrchestrationStep[];
  results: StepResult[];
  overallStatus: "COMPLETED" | "PARTIAL" | "FAILED";
}

export interface IWorkflowOrchestrator {
  /**
   * Build the default execution plan for a case based on workflowDependencies.
   * Optionally filter to a subset of workflows.
   */
  plan(caseId: string, workflows?: WellKnownWorkflowName[]): OrchestrationPlan;

  /**
   * Execute the plan. Each step calls startRun → completeRun/failRun through the
   * configured IWorkflowRunner. Steps whose dependencies failed are SKIPPED.
   */
  execute(plan: OrchestrationPlan): Promise<OrchestrationResult>;
}
