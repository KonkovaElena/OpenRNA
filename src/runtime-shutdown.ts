import type { Server } from "node:http";

const SHUTDOWN_RESOURCE_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, label: string, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Shutdown timeout: ${label} exceeded ${ms}ms`)), ms);
    }),
  ]);
}

export async function closeServerAndResources(
  server: Pick<Server, "close" | "listening">,
  resourceClosers: Array<() => Promise<void>>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  await Promise.all(
    resourceClosers.map((close, index) =>
      withTimeout(close(), `resourceCloser[${index}]`, SHUTDOWN_RESOURCE_TIMEOUT_MS),
    ),
  );
}
