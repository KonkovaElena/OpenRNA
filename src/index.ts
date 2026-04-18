import { createServer } from "node:http";
import { createApp } from "./app";
import { loadConfig } from "./config";
import {
  createDurableRuntimeDependencies,
  createWorkflowDispatchDependency,
} from "./bootstrap/runtime-dependencies";
import { closeServerAndResources } from "./runtime-shutdown";

async function bootstrap() {
  const config = loadConfig();
  const dispatch = await createWorkflowDispatchDependency(config);
  const durable = await createDurableRuntimeDependencies(config, dispatch.sink);
  if (!config.apiKey) {
    process.stderr.write("WARNING: API_KEY not set — API endpoints are unprotected.\n");
  }
  const app = createApp({
    store: durable.store,
    workflowRunner: durable.runner,
    consentTracker: durable.consentTracker,
    caseAccessStore: durable.caseAccessStore,
    apiKey: config.apiKey,
    apiKeyPrincipalId: config.apiKeyPrincipalId,
    jwtAuthOptions: config.jwt,
    rbacAllowAll: config.rbacAllowAll,
    enableRateLimiting: config.rateLimitEnabled,
    rateLimitOptions: {
      maxTokens: config.rateLimitMaxTokens,
      refillRate: config.rateLimitRefillRate,
    },
    enforceServerDerivedConsentOnCreate: true,
  });
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
    process.stdout.write(`OpenRNA listening on http://localhost:${config.port}\n`);
  });
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});