import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors";
import type { ICaseAccessStore } from "../ports/ICaseAccessStore";
import type { CasePermission, IRbacProvider } from "../ports/IRbacProvider";

function requiredCasePermissionForRequest(req: Request): CasePermission {
  if (req.method === "GET" || req.method === "HEAD") {
    return "VIEW_CASE";
  }

  const path = req.originalUrl.toLowerCase();
  if (path.includes("/review-outcomes")) {
    return "REVIEW_CASE";
  }

  if (path.includes("/final-releases") || path.includes("/handoff-packets")) {
    return "RELEASE_CASE";
  }

  return "MUTATE_CASE";
}

export function caseAccessAuth(caseAccessStore: ICaseAccessStore, rbacProvider: IRbacProvider) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const caseId = typeof req.params.caseId === "string" ? req.params.caseId : undefined;
    if (!caseId) {
      next();
      return;
    }

    const principalId = String(res.locals.principalId ?? "system:anonymous");

    try {
      const roles = await rbacProvider.getPrincipalRoles(principalId);
      if (roles.includes("ADMIN") || roles.includes("SYSTEM")) {
        next();
        return;
      }

      const requiredPermission = requiredCasePermissionForRequest(req);
      const allowedByCaseAccessStore = await caseAccessStore.canAccess(caseId, principalId);
      const allowedByRbacCaseScope = await rbacProvider.canAccessCase(principalId, caseId, requiredPermission);
      if (!allowedByCaseAccessStore && !allowedByRbacCaseScope) {
        next(
          new ApiError(
            403,
            "resource_access_denied",
            "Resource access denied.",
            `Principal '${principalId}' does not have access to case '${caseId}'.`,
          ),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
