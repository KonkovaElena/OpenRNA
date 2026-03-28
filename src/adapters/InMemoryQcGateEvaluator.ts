import type { QcGateOutcome, QcGateRecord, QcResult } from "../types";
import type { IQcGateEvaluator, QcMetricSet } from "../ports/IQcGateEvaluator";

export class InMemoryQcGateEvaluator implements IQcGateEvaluator {
  private readonly records = new Map<string, QcGateRecord>();

  async evaluate(runId: string, metrics: QcMetricSet): Promise<QcGateRecord> {
    let outcome: QcGateOutcome = "PASSED";

    for (const result of metrics.results) {
      if (!result.pass) {
        outcome = "FAILED";
        break;
      }
    }

    // Check for WARN: all pass individually, but any has notes indicating borderline
    if (outcome === "PASSED") {
      for (const result of metrics.results) {
        if (result.pass && result.notes?.toLowerCase().includes("warn")) {
          outcome = "WARN";
          break;
        }
      }
    }

    const record: QcGateRecord = {
      runId,
      outcome,
      results: metrics.results,
      evaluatedAt: new Date().toISOString(),
    };

    this.records.set(runId, record);
    return record;
  }

  async getGateResult(runId: string): Promise<QcGateRecord | null> {
    return this.records.get(runId) ?? null;
  }
}
