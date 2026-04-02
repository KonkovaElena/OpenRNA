import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditContext } from "./types";

export const DEFAULT_ANONYMOUS_ACTOR_ID = "system:anonymous";

const auditContextStorage = new AsyncLocalStorage<AuditContext>();

export function createAnonymousAuditContext(correlationId: string): AuditContext {
  return {
    correlationId,
    actorId: DEFAULT_ANONYMOUS_ACTOR_ID,
    authMechanism: "anonymous",
  };
}

export function runWithAuditContext<T>(context: AuditContext, callback: () => T): T {
  return auditContextStorage.run(context, callback);
}

export function getCurrentAuditContext(): AuditContext | undefined {
  return auditContextStorage.getStore();
}