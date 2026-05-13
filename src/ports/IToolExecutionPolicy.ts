/**
 * Execution firewall for tool and scientific-adapter invocations.
 *
 * Every tool call (Python bridge, external solver, sandboxed process, etc.)
 * must pass `evaluate()` before execution. Returns an allow/deny decision
 * with an optional reason string.
 */
export interface IToolExecutionPolicy {
  evaluate(context: ToolExecutionContext): ToolExecutionDecision;
}

export interface ToolExecutionContext {
  /** Identifier of the tool or adapter being invoked. */
  toolId: string;

  /** Principal ID requesting the execution. */
  principalId: string;

  /** Case ID, if the tool is case-scoped. */
  caseId?: string;

  /** Estimated CPU time in milliseconds (optional budget check). */
  estimatedCpuMs?: number;

  /** Estimated memory in MB (optional budget check). */
  estimatedMemoryMb?: number;
}

export interface ToolExecutionDecision {
  allowed: boolean;
  reason?: string;
}
