import type { Express } from "express";
import { parseActivateModalityInput } from "../store";
import type { IModalityRegistry } from "../ports/IModalityRegistry";
import type { DeliveryModality } from "../types";

export function registerModalityRoutes(app: Express, modalityRegistry: IModalityRegistry): void {
  app.get("/api/modalities", async (_req, res, next) => {
    try {
      const modalities = await modalityRegistry.listModalities();
      res.json({ modalities });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/modalities/:modality", async (req, res, next) => {
    try {
      const modality = await modalityRegistry.getModality(req.params.modality as DeliveryModality);
      res.json({ modality });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/modalities/:modality/activate", async (req, res, next) => {
    try {
      const input = parseActivateModalityInput(req.body);
      const modality = await modalityRegistry.activateModality(
        req.params.modality as DeliveryModality,
        input.activationReason,
      );
      res.json({ modality });
    } catch (error) {
      next(error);
    }
  });
}