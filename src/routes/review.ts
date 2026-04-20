import type { Express, RequestHandler } from "express";
import { parseGenerateHandoffPacketInput, parseRecordReviewOutcomeInput } from "../store";
import { rbacAuth } from "../middleware/rbac-auth";
import type { IRbacProvider } from "../ports/IRbacProvider";
import type { CaseStore } from "../store";

type RouteParamResolver = (req: Parameters<RequestHandler>[0], name: string) => string;

interface ReviewRouteDependencies {
  store: CaseStore;
  rbacProvider: IRbacProvider;
  consentGateMw: RequestHandler;
  getRequiredRouteParam: RouteParamResolver;
}

export function registerReviewRoutes(
  app: Express,
  { store, rbacProvider, consentGateMw, getRequiredRouteParam }: ReviewRouteDependencies,
): void {
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