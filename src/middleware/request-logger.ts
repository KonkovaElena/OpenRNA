import { type NextFunction, type Request, type Response } from "express";

const SKIP_PATHS = new Set(["/healthz", "/readyz", "/metrics"]);

export type RequestLogWriter = (line: string) => void;

function defaultRequestLogWriter(line: string): void {
  process.stdout.write(line);
}

export function requestLogger(write: RequestLogWriter = defaultRequestLogWriter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SKIP_PATHS.has(req.path)) {
      next();
      return;
    }

    const start = Date.now();

    res.on("finish", () => {
      const entry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        correlationId: res.locals.correlationId ?? undefined,
        principalId: res.locals.principalId ?? undefined,
        authMechanism: res.locals.authMechanism ?? undefined,
      };
      write(JSON.stringify(entry) + "\n");
    });

    next();
  };
}
