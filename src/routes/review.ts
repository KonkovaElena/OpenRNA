import type { Express, RequestHandler } from "express";
import { ApiError } from "../errors";
import {
  parseGenerateHandoffPacketInput,
  parseRecordQaReleaseInput,
  parseRecordReviewOutcomeInput,
} from "../store";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IAuditSignatureProvider } from "../ports/IAuditSignatureProvider";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { CaseStore } from "../store";

type RouteParamResolver = (req: Parameters<RequestHandler>[0], name: string) => string;

interface ReviewRouteDependencies {
  store: CaseStore;
  rbacProvider: IRbacProvider;
  auditSignatureProvider: IAuditSignatureProvider;
  consentGateMw: RequestHandler;
  getRequiredRouteParam: RouteParamResolver;
}

export function registerReviewRoutes(
  app: Express,
  { store, rbacProvider, auditSignatureProvider, consentGateMw, getRequiredRouteParam }: ReviewRouteDependencies,
): void {
  const signCriticalAction = async (
    caseId: string,
    actionType: string,
    detail: string,
    principal: string,
    signature: {
      printedName: string;
      meaning: string;
      stepUpAuth: {
        method: "totp" | "webauthn";
        totpCode?: string;
        webAuthnAssertion?: string;
        challengeId?: string;
      };
    },
    correlationId: string,
  ) => {
    const stepUpValid = await auditSignatureProvider.verifyStepUpAuth(signature.stepUpAuth);
    if (!stepUpValid) {
      throw new ApiError(
        403,
        "step_up_auth_required",
        "Step-up authentication evidence is invalid for this critical action.",
        "Provide a valid TOTP or WebAuthn assertion and retry.",
      );
    }

    const signed = await auditSignatureProvider.signAuditEntry(
      {
        eventId: `sig_${actionType}_${Date.now()}`,
        caseId,
        type: actionType,
        detail,
        occurredAt: new Date().toISOString(),
        correlationId,
      },
      principal,
      {
        printedName: signature.printedName,
        meaning: signature.meaning,
      },
      signature.stepUpAuth,
    );

    return {
      printedName: signed.printedName ?? signature.printedName,
      meaning: signed.meaning ?? signature.meaning,
      signedBy: signed.signedBy,
      signedAt: signed.signedAt,
      signatureMethod: signed.signatureMethod,
      signatureHash: signed.signatureHash,
      stepUpMethod: signed.stepUpMethod,
    };
  };

  app.post("/api/cases/:caseId/board-packets", rbacAuth(rbacProvider, "REQUEST_WORKFLOW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const result = await store.generateBoardPacket(caseId, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        packet: result.packet,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/board-packets", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const packets = await store.listBoardPackets(caseId);
      res.json({ packets, meta: { totalPackets: packets.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/board-packets/:packetId", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const packetId = getRequiredRouteParam(req, "packetId");
      const packet = await store.getBoardPacket(caseId, packetId);
      res.json({ packet });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/review-outcomes", rbacAuth(rbacProvider, "APPROVE_REVIEW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordReviewOutcomeInput(req.body);
      if (input.reviewDisposition === "approved") {
        if (!input.signature) {
          throw new ApiError(
            400,
            "signature_required",
            "Approved review outcomes require electronic signature evidence.",
            "Provide signature.printedName, signature.meaning, and signature.stepUpAuth.",
          );
        }

        input.signatureManifest = await signCriticalAction(
          caseId,
          "review.outcome.recorded",
          `Approved review outcome for packet ${input.packetId}.`,
          input.reviewerId,
          input.signature,
          correlationId,
        );
      }

      const result = await store.recordReviewOutcome(caseId, input, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        reviewOutcome: result.reviewOutcome,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/qa-releases", rbacAuth(rbacProvider, "APPROVE_REVIEW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseRecordQaReleaseInput(req.body);
      input.signatureManifest = await signCriticalAction(
        caseId,
        "qa.release.recorded",
        `QA release for review ${input.reviewId}.`,
        input.qaReviewerId,
        input.signature,
        correlationId,
      );

      const result = await store.recordQaRelease(caseId, input, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        qaRelease: result.qaRelease,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/qa-releases", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const qaReleases = await store.listQaReleases(caseId);
      res.json({ qaReleases, meta: { totalQaReleases: qaReleases.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/qa-releases/:qaReleaseId", rbacAuth(rbacProvider, "VIEW_CASE"), async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const qaReleaseId = getRequiredRouteParam(req, "qaReleaseId");
      const qaRelease = await store.getQaRelease(caseId, qaReleaseId);
      res.json({ qaRelease });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/review-outcomes", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const reviewOutcomes = await store.listReviewOutcomes(caseId);
      res.json({ reviewOutcomes, meta: { totalReviewOutcomes: reviewOutcomes.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/review-outcomes/:reviewId", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const reviewId = getRequiredRouteParam(req, "reviewId");
      const reviewOutcome = await store.getReviewOutcome(caseId, reviewId);
      res.json({ reviewOutcome });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/handoff-packets", rbacAuth(rbacProvider, "APPROVE_REVIEW"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const correlationId = String(res.locals.correlationId ?? "");
      const input = parseGenerateHandoffPacketInput(req.body);
      const result = await store.generateHandoffPacket(caseId, input, correlationId);
      res.status(result.created ? 201 : 200).json({
        case: result.case,
        handoff: result.handoff,
        meta: { created: result.created },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/handoff-packets", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const handoffs = await store.listHandoffPackets(caseId);
      res.json({ handoffs, meta: { totalHandoffs: handoffs.length } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId/handoff-packets/:handoffId", rbacAuth(rbacProvider, "VIEW_CASE"), consentGateMw, async (req, res, next) => {
    try {
      const caseId = getRequiredRouteParam(req, "caseId");
      const handoffId = getRequiredRouteParam(req, "handoffId");
      const handoff = await store.getHandoffPacket(caseId, handoffId);
      res.json({ handoff });
    } catch (error) {
      next(error);
    }
  });
}