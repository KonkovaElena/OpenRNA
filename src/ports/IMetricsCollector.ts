/**
 * Domain port for metrics collection.
 *
 * All metric emission in src/ must go through this abstraction.
 * Infrastructure provides the concrete implementation (Prometheus, CloudWatch, etc.).
 */
export interface IMetricsCollector {
  /**
   * Record the current total number of cases.
   */
  recordCaseTotal(count: number): void;

  /**
   * Record the count of cases for a specific status.
   */
  recordCasesByStatus(status: string, count: number): void;

  /**
   * Increment the HTTP request counter.
   */
  incrementHttpRequest(method: string, route: string, statusCode: number): void;

  /**
   * Observe HTTP request duration in seconds.
   */
  observeHttpRequestDuration(method: string, route: string, durationSeconds: number): void;

  /**
   * Export collected metrics in Prometheus exposition format.
   */
  exportMetrics(): Promise<string>;
}
