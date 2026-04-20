import { type NextFunction, type Request, type Response } from "express";
import type { IConsentTracker } from "../ports/IConsentTracker";
import { ApiError } from "../errors";

/**
 * Consent enforcement middleware factory.
 *
 * Blocks case-scoped operations (writes and regulated disclosures) when consent is not active.
 * Resolves caseId from req.params.caseId — passes through when no caseId is present.
 *
 * Regulatory basis: 21 CFR Part 11 (electronic consent), GDPR Art. 7 (withdrawal of consent).
 */
export function requireActiveConsent(consentTracker: IConsentTracker) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const caseId = typeof req.params.caseId === "string" ? req.params.caseId : undefined;
    if (!caseId) {
      next();
      return;
    }

    try {
      const active = await consentTracker.isConsentActive(caseId);
      if (!active) {
        throw new ApiError(
          403,
          "consent_required",
          "Active patient consent is required for this operation.",
          "Record a 'granted' consent event via POST /api/cases/:caseId/consent before proceeding.",
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
