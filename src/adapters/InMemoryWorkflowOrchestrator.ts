import { randomUUID } from "node:crypto";
import type { IWorkflowOrchestrator, OrchestrationPlan, OrchestrationResult, OrchestrationStep, StepResult } from "../ports/IWorkflowOrchestrator";
import type { IWorkflowRunner, WorkflowRunRequest } from "../ports/IWorkflowRunner";
import type { DerivedArtifactSemanticType, WellKnownWorkflowName } from "../types";
import { wellKnownWorkflowNames, workflowArtifactContract, workflowDependencies } from "../types";

/**
 * In-memory workflow orchestrator that sequences runs through an IWorkflowRunner
 * in dependency order, simulating immediate completion with contract artifacts.
 */
export class InMemoryWorkflowOrchestrator implements IWorkflowOrchestrator {
  constructor(
    private readonly runner: IWorkflowRunner,
    private readonly referenceBundleId: string,
    private readonly executionProfile: string,
  ) {}

  plan(caseId: string, workflows?: WellKnownWorkflowName[]): OrchestrationPlan {
    const included = workflows
      ? new Set<WellKnownWorkflowName>(workflows)
      : new Set<WellKnownWorkflowName>(wellKnownWorkflowNames);

    // Topological sort via Kahn's algorithm
    const inDegree = new Map<WellKnownWorkflowName, number>();
    const adjacency = new Map<WellKnownWorkflowName, WellKnownWorkflowName[]>();

    for (const wf of included) {
      inDegree.set(wf, 0);
      adjacency.set(wf, []);
    }

    for (const wf of included) {
      const deps = workflowDependencies[wf].filter((d) => included.has(d));
      inDegree.set(wf, deps.length);
      for (const dep of deps) {
        adjacency.get(dep)!.push(wf);
      }
    }

    const queue: WellKnownWorkflowName[] = [];
    for (const [wf, deg] of inDegree) {
      if (deg === 0) queue.push(wf);
    }

    const sorted: WellKnownWorkflowName[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const neighbor of adjacency.get(current)!) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    const steps: OrchestrationStep[] = sorted.map((wf) => ({
      workflowName: wf,
      dependsOn: workflowDependencies[wf].filter((d) => included.has(d)),
    }));

    return { caseId, steps };
  }

  async execute(plan: OrchestrationPlan): Promise<OrchestrationResult> {
    const completed = new Set<string>();
    const failed = new Set<string>();
    const results: StepResult[] = [];

    for (const step of plan.steps) {
      // Skip if any dependency failed or was skipped
      const depsFailed = step.dependsOn.some((d) => failed.has(d) || !completed.has(d));
      if (depsFailed) {
        results.push({ workflowName: step.workflowName, runId: "", status: "SKIPPED" });
        failed.add(step.workflowName);
        continue;
      }

      const runId = `run_${randomUUID()}`;
      const request: WorkflowRunRequest = {
        runId,
        caseId: plan.caseId,
        requestId: `req_${randomUUID()}`,
        workflowName: step.workflowName,
        referenceBundleId: this.referenceBundleId,
        executionProfile: this.executionProfile,
      };

      try {
        await this.runner.startRun(request);

        // Simulate immediate completion with contract-expected artifacts
        const contractTypes = workflowArtifactContract[step.workflowName] ?? [];
        const artifacts = contractTypes.map((st: DerivedArtifactSemanticType) => ({
          semanticType: st,
          artifactHash: `sha256:${randomUUID().replace(/-/g, "")}`,
          producingStep: step.workflowName,
        }));

        await this.runner.completeRun(runId, artifacts);
        completed.add(step.workflowName);
        results.push({ workflowName: step.workflowName, runId, status: "COMPLETED" });
      } catch (err) {
        failed.add(step.workflowName);
        results.push({
          workflowName: step.workflowName,
          runId,
          status: "FAILED",
          failureReason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const allCompleted = results.every((r) => r.status === "COMPLETED");
    const allFailed = results.every((r) => r.status === "FAILED" || r.status === "SKIPPED");

    return {
      caseId: plan.caseId,
      planSteps: plan.steps,
      results,
      overallStatus: allCompleted ? "COMPLETED" : allFailed ? "FAILED" : "PARTIAL",
    };
  }
}
