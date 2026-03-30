import type { DeliveryModality, HorizonModality } from "../types.js";

export interface IModalityRegistry {
  getModality(modality: DeliveryModality): Promise<HorizonModality>;
  listModalities(): Promise<HorizonModality[]>;
  activateModality(modality: DeliveryModality, activationReason: string): Promise<HorizonModality>;
  assertModalityAvailable(modality: DeliveryModality): Promise<void>;
}