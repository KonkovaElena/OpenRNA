import { ApiError } from "./errors";
import type { AuditContextInput } from "./store-helpers";
import { auditEvent, cloneWorkflowRun, hasSameDerivedArtifactsForRun, timelineEvent } from "./store-helpers";
import type { WorkflowStoreMutationContext } from "./store-request-workflow";
import type { CaseRecord, RunArtifact, WorkflowRunRecord } from "./types";

export async function completeWorkflowRunForCase(
  context: WorkflowStoreMutationContext,
  record: CaseRecord,
  completedRun: WorkflowRunRecord,
  derivedArtifacts: RunArtifact[],
  correlationId: AuditContextInput,
): Promise<CaseRecord> {
  const run = record.workflowRuns.find((candidate) => candidate.runId === completedRun.runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Workflow run was not found on this case.", "Use a valid runId.");
  }
  if (completedRun.status !== "COMPLETED") {
    throw new ApiError(
      409,
      "invalid_transition",
      "Completed workflow run must be in COMPLETED status.",
      "Complete the workflow run before persisting terminal state.",
    );
  }

  if (run.status === "COMPLETED") {
    const existingDerivedArtifacts = record.derivedArtifacts.filter(
      (artifact) => artifact.runId === completedRun.runId,
    );
    if (!hasSameDerivedArtifactsForRun(existingDerivedArtifacts, derivedArtifacts ?? [])) {
      throw new ApiError(
        409,
        "invalid_transition",
        "Workflow completion replay emitted a different derived artifact set.",
        "Replay completion only with the original derived artifact payload.",
      );
    }
    return record;
  }

  if (run.status !== "RUNNING") {
    throw new ApiError(409, "invalid_transition", "Only running workflows can be completed.", "Check run status.");
  }

  const completedAt = completedRun.completedAt ?? context.clock.nowIso();
  Object.assign(run, cloneWorkflowRun({ ...completedRun, caseId: record.caseId, completedAt }));

  if (derivedArtifacts) {
    for (const artifact of derivedArtifacts) {
      record.derivedArtifacts.push(artifact);
    }
  }

  await context.applyTransition(record, "WORKFLOW_COMPLETED", correlationId);
  for (const artifact of derivedArtifacts ?? []) {
    record.auditEvents.push(
      auditEvent(
        context.clock,
        "artifact.derived",
        `Derived artifact ${artifact.semanticType} from run ${completedRun.runId}.`,
        correlationId,
        completedAt,
      ),
    );
  }
  record.timeline.push(
    timelineEvent(
      context.clock,
      "workflow_completed",
      `Run ${completedRun.runId} completed with ${(derivedArtifacts ?? []).length} derived artifacts.`,
      completedAt,
    ),
  );
  record.auditEvents.push(
    auditEvent(context.clock, "workflow.completed", `Run ${completedRun.runId} completed.`, correlationId, completedAt),
  );
  record.updatedAt = completedAt;
  await context.appendCaseEvent(
    context.createCaseEvent(
      record.caseId,
      "workflow.completed",
      {
        run: cloneWorkflowRun(run),
        derivedArtifacts: structuredClone(derivedArtifacts ?? []),
        nextStatus: record.status,
      },
      correlationId,
      completedAt,
      completedAt,
    ),
  );

  return record;
}
