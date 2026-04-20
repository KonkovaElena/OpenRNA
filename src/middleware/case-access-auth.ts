import { type NextFunction, type Request, type Response } from "express";
import type { ICaseAccessStore } from "../ports/ICaseAccessStore";
import type { IRbacProvider } from "../ports/IRbacProvider";

export function caseAccessAuth(
  caseAccessStore: ICaseAccessStore,
  rbacProvider: IRbacProvider,
) {
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

      const allowed = await caseAccessStore.canAccess(caseId, principalId);
      if (!allowed) {
        res.status(403).json({
          error: "Forbidden",
          detail: `Principal '${principalId}' does not have access to case '${caseId}'.`,
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
