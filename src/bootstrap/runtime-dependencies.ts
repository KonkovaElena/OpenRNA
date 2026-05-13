import { InMemoryCaseAccessStore } from "../adapters/InMemoryCaseAccessStore";
import { InMemoryConsentTracker } from "../adapters/InMemoryConsentTracker";
import { InMemoryStateMachineGuard } from "../adapters/InMemoryStateMachineGuard";
import { InMemoryWorkflowDispatchSink } from "../adapters/InMemoryWorkflowDispatchSink";
import { InMemoryWorkflowRunner } from "../adapters/InMemoryWorkflowRunner";
import { PostgresCaseAccessStore } from "../adapters/PostgresCaseAccessStore";
import { PostgresCaseStore } from "../adapters/PostgresCaseStore";
import { PostgresConsentTracker } from "../adapters/PostgresConsentTracker";
import { PostgresWorkflowDispatchSink } from "../adapters/PostgresWorkflowDispatchSink";
import { PostgresWorkflowRunner } from "../adapters/PostgresWorkflowRunner";
import type { AppConfig } from "../config";
import { createPostgresPool } from "../infrastructure/postgres/createPostgresPool";
import type { ICaseAccessStore } from "../ports/ICaseAccessStore";
import type { IConsentTracker } from "../ports/IConsentTracker";
import { MemoryCaseStore } from "../store";

export interface WorkflowDispatchRuntimeDependency {
  sink: InMemoryWorkflowDispatchSink | PostgresWorkflowDispatchSink;
  shutdown: () => Promise<void>;
}

export interface DurableRuntimeDependencies {
  store: MemoryCaseStore | PostgresCaseStore;
  runner: InMemoryWorkflowRunner | PostgresWorkflowRunner;
  consentTracker: IConsentTracker;
  caseAccessStore: ICaseAccessStore;
  shutdown: () => Promise<void>;
}

export async function createWorkflowDispatchDependency(config: AppConfig): Promise<WorkflowDispatchRuntimeDependency> {
  const connectionString = config.workflowDispatchDatabaseUrl;
  if (!connectionString) {
    return {
      sink: new InMemoryWorkflowDispatchSink(),
      shutdown: async () => {},
    };
  }

  const sink = new PostgresWorkflowDispatchSink(createPostgresPool(connectionString), {
    tableName: config.workflowDispatchTableName,
  });
  await sink.initialize();

  return {
    sink,
    shutdown: async () => sink.close(),
  };
}

export async function createDurableRuntimeDependencies(
  config: AppConfig,
  dispatchSink: InMemoryWorkflowDispatchSink | PostgresWorkflowDispatchSink,
): Promise<DurableRuntimeDependencies> {
  const connectionString = config.caseStoreDatabaseUrl;
  if (!connectionString) {
    return {
      store: new MemoryCaseStore(undefined, dispatchSink, [], new InMemoryStateMachineGuard()),
      runner: new InMemoryWorkflowRunner(),
      consentTracker: new InMemoryConsentTracker(),
      caseAccessStore: new InMemoryCaseAccessStore(),
      shutdown: async () => {},
    };
  }

  const pool = createPostgresPool(connectionString);
  const store = new PostgresCaseStore(pool, undefined, dispatchSink, new InMemoryStateMachineGuard());
  const consentTracker = new PostgresConsentTracker(pool);
  const caseAccessStore = new PostgresCaseAccessStore(pool);
  await store.initialize();
  await consentTracker.initialize();
  await caseAccessStore.initialize();

  return {
    store,
    runner: new PostgresWorkflowRunner(pool),
    consentTracker,
    caseAccessStore,
    shutdown: async () => store.close(),
  };
}
