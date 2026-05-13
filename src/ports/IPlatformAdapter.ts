/**
 * Cross-platform abstraction for OS-specific behaviour.
 *
 * Domain/Application/Core must never branch on `process.platform` or
 * `os.platform()`. All platform-specific decisions (signal handling, path
 * separators, sandbox selection, etc.) flow through this port.
 */
export interface IPlatformAdapter {
  readonly platform: "win32" | "darwin" | "linux" | "other";
  readonly pathSeparator: string;
  readonly pathDelimiter: string;

  /**
   * Return the absolute path to a temp directory suitable for the platform.
   */
  getTempDirectory(): string;

  /**
   * Return the default signal used for graceful shutdown.
   */
  getDefaultShutdownSignals(): readonly string[];

  /**
   * Whether the current platform supports Unix-domain sockets.
   */
  supportsUnixDomainSockets(): boolean;
}
