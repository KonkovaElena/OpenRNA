/**
 * Monitoring facade — single entry point for all metrics emission in src/.
 *
 * Per AGENTS.md hard rule #7: "Metrics: Only via src/monitoring/index.ts.
 * No direct prom-client outside this module."
 */

export { PrometheusMetricsCollector } from "../infrastructure/monitoring/PrometheusMetricsCollector";
export type { IMetricsCollector } from "../ports/IMetricsCollector";
