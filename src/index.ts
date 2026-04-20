import { createServer } from "node:http";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { MemoryCaseStore } from "./store";
import { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";
import { InMemoryWorkflowRunner } from "./adapters/InMemoryWorkflowRunner";
import { PostgresCaseStore } from "./adapters/PostgresCaseStore";
import { PostgresWorkflowDispatchSink } from "./adapters/PostgresWorkflowDispatchSink";
import { PostgresWorkflowRunner } from "./adapters/PostgresWorkflowRunner";
import { closeServerAndResources } from "./runtime-shutdown";
import { Pool } from "pg";

function createDispatchSink(config: ReturnType<typeof loadConfig>) {
  const connectionString = config.workflowDispatchDatabaseUrl;
  if (!connectionString) {
    return {
      sink: new InMemoryWorkflowDispatchSink(),
      shutdown: async () => {},
    };
  }

  const pool = new Pool({ connectionString });
  const sink = new PostgresWorkflowDispatchSink(pool, {
    tableName: config.workflowDispatchTableName,
  });

  return {
    sink,
    shutdown: async () => sink.close(),
  };
}

function createDurableAdapters(
  config: ReturnType<typeof loadConfig>,
  dispatchSink: InMemoryWorkflowDispatchSink | PostgresWorkflowDispatchSink,
) {
  const connectionString = config.caseStoreDatabaseUrl;
  if (!connectionString) {
    return {
      store: new MemoryCaseStore(undefined, dispatchSink) as MemoryCaseStore | PostgresCaseStore,
      runner: new InMemoryWorkflowRunner() as InMemoryWorkflowRunner | PostgresWorkflowRunner,
      shutdown: async () => {},
    };
  }

  const pool = new Pool({ connectionString });
  const store = new PostgresCaseStore(pool, undefined, dispatchSink);
  const runner = new PostgresWorkflowRunner(pool);

  return {
    store,
    runner,
    shutdown: async () => store.close(),
  };
}

async function bootstrap() {
  const config = loadConfig();
  const dispatch = createDispatchSink(config);
  if (dispatch.sink instanceof PostgresWorkflowDispatchSink) {
    await dispatch.sink.initialize();
  }
  const durable = createDurableAdapters(config, dispatch.sink);
  if (durable.store instanceof PostgresCaseStore) {
    await durable.store.initialize();
  }
  const app = createApp({ store: durable.store, workflowRunner: durable.runner });
  const server = createServer(app);
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = async () => {
    if (!shutdownPromise) {
      shutdownPromise = closeServerAndResources(server, [dispatch.shutdown, durable.shutdown]);
    }

    await shutdownPromise;
  };

  const handleShutdownSignal = () => {
    void shutdown().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
  };

  process.on("SIGINT", () => {
    handleShutdownSignal();
  });
  process.on("SIGTERM", () => {
    handleShutdownSignal();
  });

  server.listen(config.port, () => {
    process.stdout.write(`personalized-mrna-control-plane listening on http://localhost:${config.port}\n`);
  });
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});