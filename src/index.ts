import { createServer } from "node:http";
import { createApp } from "./app";
import { MemoryCaseStore } from "./store";
import { InMemoryWorkflowDispatchSink } from "./adapters/InMemoryWorkflowDispatchSink";
import { PostgresWorkflowDispatchSink } from "./adapters/PostgresWorkflowDispatchSink";
import { Pool } from "pg";

function createDispatchSink() {
  const connectionString = process.env.WORKFLOW_DISPATCH_DATABASE_URL;
  if (!connectionString) {
    return {
      sink: new InMemoryWorkflowDispatchSink(),
      shutdown: async () => {},
    };
  }

  const pool = new Pool({ connectionString });
  const sink = new PostgresWorkflowDispatchSink(pool, {
    tableName: process.env.WORKFLOW_DISPATCH_TABLE_NAME ?? "workflow_dispatches",
  });

  return {
    sink,
    shutdown: async () => sink.close(),
  };
}

async function bootstrap() {
  const port = Number(process.env.PORT ?? 4010);
  const dispatch = createDispatchSink();
  if (dispatch.sink instanceof PostgresWorkflowDispatchSink) {
    await dispatch.sink.initialize();
  }
  const store = new MemoryCaseStore(undefined, dispatch.sink);
  const app = createApp({ store });
  const server = createServer(app);

  const shutdown = async () => {
    server.close(() => {
      void dispatch.shutdown();
    });
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  server.listen(port, () => {
    process.stdout.write(`personalized-mrna-control-plane listening on http://localhost:${port}\n`);
  });
}

void bootstrap();