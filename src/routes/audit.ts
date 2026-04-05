import type { Express } from "express";
import { ApiError } from "../errors";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IAuditSignatureProvider } from "../ports/IAuditSignatureProvider";
import type { IRbacProvider } from "../ports/IRbacProvider";

interface AuditRouteDependencies {
  rbacProvider: IRbacProvider;
  auditSignatureProvider: IAuditSignatureProvider;
}

export function registerAuditRoutes(
  app: Express,
  { rbacProvider, auditSignatureProvider }: AuditRouteDependencies,
): void {
  app.post("/api/audit/sign", rbacAuth(rbacProvider, "ADMIN_OPERATIONS"), async (req, res, next) => {
    try {
      const { entry, principal } = req.body;
      if (!entry || !principal) {
        throw new ApiError(
          400,
          "invalid_input",
          "Both entry and principal are required.",
          "Provide an audit entry and signing principal.",
        );
      }
      const signed = await auditSignatureProvider.signAuditEntry(entry, principal);
      res.status(201).json({ signedEntry: signed });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/audit/verify", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const { entry } = req.body;
      if (!entry) {
        throw new ApiError(
          400,
          "invalid_input",
          "Signed entry is required.",
          "Provide a signed audit entry to verify.",
        );
      }
      const valid = await auditSignatureProvider.verifySignature(entry);
      res.json({ valid });
    } catch (error) {
      next(error);
    }
  });
}