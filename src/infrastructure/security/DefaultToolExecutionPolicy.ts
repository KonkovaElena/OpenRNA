import type {
  IToolExecutionPolicy,
  ToolExecutionContext,
  ToolExecutionDecision,
} from "../../ports/IToolExecutionPolicy";

/**
 * Default tool-execution policy.
 *
 * Allows all invocations by default (permissive for development). Future
 * iterations can add RBAC checks, resource budgets, and block-lists here.
 */
export class DefaultToolExecutionPolicy implements IToolExecutionPolicy {
  evaluate(context: ToolExecutionContext): ToolExecutionDecision {
    // Example: deny tools with no principal (anonymous execution)
    if (!context.principalId || context.principalId === "system:anonymous") {
      return { allowed: false, reason: "Anonymous tool execution is not permitted." };
    }

    // Example: cap estimated CPU at 5 minutes
    if (context.estimatedCpuMs && context.estimatedCpuMs > 300_000) {
      return { allowed: false, reason: "Estimated CPU exceeds 5-minute budget." };
    }

    // Example: cap estimated memory at 4 GiB
    if (context.estimatedMemoryMb && context.estimatedMemoryMb > 4096) {
      return { allowed: false, reason: "Estimated memory exceeds 4 GiB budget." };
    }

    return { allowed: true };
  }
}
