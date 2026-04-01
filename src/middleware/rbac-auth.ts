import { type NextFunction, type Request, type Response } from "express";
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

    const rawKey = req.header("x-api-key");
    const principal = (Array.isArray(rawKey) ? rawKey[0] : rawKey) ?? "anonymous";
    const rawCaseId = req.params.caseId;
    const resource = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

    try {
      const result = await rbacProvider.checkPermission(principal, action, resource);
      if (!result.allowed) {
        res.status(403).json({
          error: "Forbidden",
          detail: result.reason ?? `Insufficient permissions for action '${action}'`,
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
