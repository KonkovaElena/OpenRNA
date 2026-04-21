import { type NextFunction, type Request, type Response } from "express";
import { ApiError } from "../errors";
import type { IRbacProvider, RbacAction } from "../ports/IRbacProvider";

/**
 * RBAC authorization middleware factory.
 *
 * Resolves the principal from the x-api-key header (current auth mechanism).
 * In the future, this would also support JWT bearer tokens.
 *
 * When no RBAC provider is supplied, all requests are allowed (backward compatible).
 */
export function rbacAuth(rbacProvider: IRbacProvider | undefined, action: RbacAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!rbacProvider) {
      next();
      return;
    }

    const principal = String(res.locals.principalId ?? "system:anonymous");
    const rawCaseId = req.params.caseId;
    const resource = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

    try {
      const result = await rbacProvider.checkPermission(principal, action, resource);
      if (!result.allowed) {
        const guidance = `Use a principal with '${action}' permission for this route.`;
        next(new ApiError(
          403,
          "forbidden",
          "Forbidden.",
          result.reason ? `${result.reason}. ${guidance}` : guidance,
        ));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
