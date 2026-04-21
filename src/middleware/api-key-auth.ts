import { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { ApiError } from "../errors";

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
      next(new ApiError(401, "missing_credentials", "Missing x-api-key header.", "Provide the required authentication credentials and retry."));
      return;
    }

    const providedBuffer = Buffer.from(provided, "utf-8");
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      next(new ApiError(403, "invalid_api_key", "Invalid API key.", "Retry with a valid x-api-key header."));
      return;
    }

    next();
  };
}
