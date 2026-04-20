import type { Express } from "express";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IAuditSignatureProvider } from "../ports/IAuditSignatureProvider";
import type { IRbacProvider } from "../ports/IRbacProvider";
import { parseAuditSignInput, parseAuditVerifyInput } from "../validation";

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
      const input = parseAuditSignInput(req.body);
      const signed = await auditSignatureProvider.signAuditEntry(input.entry as unknown as Parameters<typeof auditSignatureProvider.signAuditEntry>[0], input.principal);
      res.status(201).json({ signedEntry: signed });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/audit/verify", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const input = parseAuditVerifyInput(req.body);
      const valid = await auditSignatureProvider.verifySignature(input.entry as unknown as Parameters<typeof auditSignatureProvider.verifySignature>[0]);
      res.json({ valid });
    } catch (error) {
      next(error);
    }
  });
}