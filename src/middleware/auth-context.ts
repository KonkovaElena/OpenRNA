import { type NextFunction, type Request, type Response } from "express";
import { createAnonymousAuditContext, runWithAuditContext } from "../audit-context";
import { ApiError } from "../errors";
import {
  anonymousPrincipal,
  type AuthSettings,
  AuthResolutionError,
  hasAuthenticationConfig,
  resolveRequestPrincipal,
  resolveUnsignedPrincipalHint,
  toAuditContext,
} from "../auth";

const EXEMPT_PATHS = new Set(["/", "/healthz", "/readyz", "/metrics"]);

function setPrincipalLocals(res: Response, principal: ReturnType<typeof anonymousPrincipal>): void {
  res.locals.principal = principal;
  res.locals.principalId = principal.principalId;
  res.locals.actorId = principal.actorId;
  res.locals.authMechanism = principal.authMechanism;
  res.locals.roles = principal.roles;
}

function nextStepForAuthResolution(code: AuthResolutionError["code"]): string {
  switch (code) {
    case "missing_credentials":
      return "Provide the required authentication credentials and retry.";
    case "invalid_api_key":
      return "Retry with a valid x-api-key header.";
    case "invalid_token":
      return "Retry with a valid bearer token.";
  }
}

export function authenticationContext(settings: AuthSettings) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = String(res.locals.correlationId ?? "unknown-correlation");

    if (EXEMPT_PATHS.has(req.path)) {
      const principal = anonymousPrincipal();
      setPrincipalLocals(res, principal);
      runWithAuditContext(createAnonymousAuditContext(correlationId), next);
      return;
    }

    if (!hasAuthenticationConfig(settings)) {
      const principal = resolveUnsignedPrincipalHint(req.headers);
      setPrincipalLocals(res, principal);
      runWithAuditContext(toAuditContext(correlationId, principal), next);
      return;
    }

    try {
      const principal = resolveRequestPrincipal(req.headers, settings);
      setPrincipalLocals(res, principal);
      runWithAuditContext(toAuditContext(correlationId, principal), next);
    } catch (error) {
      if (error instanceof AuthResolutionError) {
        next(new ApiError(error.statusCode, error.code, error.message, nextStepForAuthResolution(error.code)));
        return;
      }
      next(error);
    }
  };
}