import { tmpdir } from "node:os";
import type { IPlatformAdapter } from "../../ports/IPlatformAdapter";

/**
 * Node.js implementation of IPlatformAdapter.
 *
 * Bridges to `process.platform`, `os.tmpdir()`, and Node path constants.
 * Lives in Infrastructure so Domain never sees `process` or `os` imports.
 */
export class NodePlatformAdapter implements IPlatformAdapter {
  readonly platform: "win32" | "darwin" | "linux" | "other";
  readonly pathSeparator: string;
  readonly pathDelimiter: string;

  constructor() {
    const raw = process.platform;
    this.platform = raw === "win32" || raw === "darwin" || raw === "linux" ? raw : "other";
    this.pathSeparator = raw === "win32" ? "\\" : "/";
    this.pathDelimiter = raw === "win32" ? ";" : ":";
  }

  getTempDirectory(): string {
    return tmpdir();
  }

  getDefaultShutdownSignals(): readonly string[] {
    return ["SIGINT", "SIGTERM"];
  }

  supportsUnixDomainSockets(): boolean {
    return this.platform !== "win32";
  }
}
