import type { QcGateOutcome, QcGateRecord, QcResult } from "../types";

export interface QcMetricSet {
  results: QcResult[];
}

export interface IQcGateEvaluator {
  evaluate(runId: string, metrics: QcMetricSet): Promise<QcGateRecord>;
  getGateResult(runId: string): Promise<QcGateRecord | null>;
}
