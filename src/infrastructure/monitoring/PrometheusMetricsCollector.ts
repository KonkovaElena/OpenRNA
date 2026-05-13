import { Counter, Gauge, Histogram, Registry } from "prom-client";
import type { IMetricsCollector } from "../../ports/IMetricsCollector";

/**
 * Prometheus-compatible IMetricsCollector implementation.
 *
 * Uses the prom-client library to maintain counters, gauges, and histograms.
 * All metrics are registered to a dedicated Registry to avoid global-state
 * collisions with other libraries.
 */
export class PrometheusMetricsCollector implements IMetricsCollector {
  private readonly registry: Registry;
  private readonly caseTotal: Gauge;
  private readonly casesByStatus: Gauge;
  private readonly httpRequestsTotal: Counter;
  private readonly httpRequestDurationSeconds: Histogram;

  constructor() {
    this.registry = new Registry();

    this.caseTotal = new Gauge({
      name: "openrna_cases_total",
      help: "Total cases in the workflow store",
      registers: [this.registry],
    });

    this.casesByStatus = new Gauge({
      name: "openrna_cases_by_status",
      help: "Cases by control-plane status",
      labelNames: ["status"],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: "openrna_http_requests_total",
      help: "Total HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: "openrna_http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  recordCaseTotal(count: number): void {
    this.caseTotal.set(count);
  }

  recordCasesByStatus(status: string, count: number): void {
    this.casesByStatus.set({ status }, count);
  }

  incrementHttpRequest(method: string, route: string, statusCode: number): void {
    this.httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
  }

  observeHttpRequestDuration(method: string, route: string, durationSeconds: number): void {
    this.httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
  }

  async exportMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
