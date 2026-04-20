import type { Server } from "node:http";

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

  await Promise.all(resourceClosers.map((close) => close()));
}