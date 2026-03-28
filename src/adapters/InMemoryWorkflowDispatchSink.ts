import type { WorkflowDispatchRecord } from "../types";
import type { IWorkflowDispatchSink } from "../ports/IWorkflowDispatchSink";

export class InMemoryWorkflowDispatchSink implements IWorkflowDispatchSink {
  private readonly dispatches: WorkflowDispatchRecord[] = [];

  async recordWorkflowRequested(dispatch: WorkflowDispatchRecord): Promise<void> {
    this.dispatches.push(dispatch);
  }

  getDispatches(): WorkflowDispatchRecord[] {
    return [...this.dispatches];
  }
}