import { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";

const EXEMPT_PATHS = new Set(["/", "/healthz", "/readyz", "/metrics"]);

export function apiKeyAuth(expectedKey: string) {
  const expectedBuffer = Buffer.from(expectedKey, "utf-8");

  return (req: Request, res: Response, next: NextFunction): void => {
    if (EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }

    const provided = req.header("x-api-key");
    if (!provided) {
      res.status(401).json({ error: "Missing x-api-key header." });
      return;
    }

    const providedBuffer = Buffer.from(provided, "utf-8");
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      res.status(403).json({ error: "Invalid API key." });
      return;
    }

    next();
  };
}
