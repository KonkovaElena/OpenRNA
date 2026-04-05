import type { AppConfig } from "../config";
import { MemoryCaseStore } from "../store";
import { InMemoryWorkflowDispatchSink } from "../adapters/InMemoryWorkflowDispatchSink";
import { InMemoryWorkflowRunner } from "../adapters/InMemoryWorkflowRunner";
import { PostgresCaseStore } from "../adapters/PostgresCaseStore";
import { PostgresWorkflowDispatchSink } from "../adapters/PostgresWorkflowDispatchSink";
import { PostgresWorkflowRunner } from "../adapters/PostgresWorkflowRunner";
import { InMemoryStateMachineGuard } from "../adapters/InMemoryStateMachineGuard";
import { createPostgresPool } from "../infrastructure/postgres/createPostgresPool";

export interface WorkflowDispatchRuntimeDependency {
  sink: InMemoryWorkflowDispatchSink | PostgresWorkflowDispatchSink;
  shutdown: () => Promise<void>;
}

export interface DurableRuntimeDependencies {
  store: MemoryCaseStore | PostgresCaseStore;
  runner: InMemoryWorkflowRunner | PostgresWorkflowRunner;
  shutdown: () => Promise<void>;
}

export async function createWorkflowDispatchDependency(
  config: AppConfig,
): Promise<WorkflowDispatchRuntimeDependency> {
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
      shutdown: async () => {},
    };
  }

  const pool = createPostgresPool(connectionString);
  const store = new PostgresCaseStore(pool, undefined, dispatchSink, new InMemoryStateMachineGuard());
  await store.initialize();

  return {
    store,
    runner: new PostgresWorkflowRunner(pool),
    shutdown: async () => store.close(),
  };
}