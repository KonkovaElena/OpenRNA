import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { closeServerAndResources } from "../src/runtime-shutdown";

test("closeServerAndResources waits for resource shutdown before resolving", async () => {
  const server = createServer((_req, res) => {
    res.end("ok");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  let dispatchClosed = false;
  let durableClosed = false;

  const shutdownPromise = closeServerAndResources(server, [
    async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          dispatchClosed = true;
          resolve();
        }, 25);
      });
    },
    async () => {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          durableClosed = true;
          resolve();
        }, 5);
      });
    },
  ]);

  assert.equal(dispatchClosed, false);
  assert.equal(durableClosed, false);

  await shutdownPromise;

  assert.equal(dispatchClosed, true);
  assert.equal(durableClosed, true);
  assert.equal(server.listening, false);
});