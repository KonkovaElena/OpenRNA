import type { WorkflowDispatchRecord } from "../types";

export interface IWorkflowDispatchSink {
  recordWorkflowRequested(dispatch: WorkflowDispatchRecord): Promise<void>;
}