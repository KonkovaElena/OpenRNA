import { ApiError } from "../errors.js";
import type { IModalityRegistry } from "../ports/IModalityRegistry.js";
import type { DeliveryModality, HorizonModality } from "../types.js";

const DEFAULT_MODALITIES: readonly HorizonModality[] = [
  {
    modality: "conventional-mrna",
    maturityLevel: "validated",
    enabledByDefault: true,
    isEnabled: true,
  },
  {
    modality: "saRNA",
    maturityLevel: "preclinical",
    enabledByDefault: false,
    isEnabled: false,
  },
  {
    modality: "circRNA",
    maturityLevel: "research",
    enabledByDefault: false,
    isEnabled: false,
  },
] as const;

export class InMemoryModalityRegistry implements IModalityRegistry {
  private readonly modalities = new Map<DeliveryModality, HorizonModality>();

  constructor(initialModalities: readonly HorizonModality[] = DEFAULT_MODALITIES) {
    for (const modality of initialModalities) {
      this.modalities.set(modality.modality, structuredClone(modality));
    }
  }

  async getModality(modality: DeliveryModality): Promise<HorizonModality> {
    const record = this.modalities.get(modality);
    if (!record) {
      throw new ApiError(404, "modality_not_found", `Modality ${modality} is not registered.`, "Use a registered delivery modality.");
    }

    return structuredClone(record);
  }

  async listModalities(): Promise<HorizonModality[]> {
    return [...this.modalities.values()]
      .map((modality) => structuredClone(modality))
      .sort((left, right) => left.modality.localeCompare(right.modality));
  }

  async activateModality(modality: DeliveryModality, activationReason: string): Promise<HorizonModality> {
    const record = await this.getModality(modality);
    if (record.enabledByDefault) {
      return record;
    }

    const activated: HorizonModality = {
      ...record,
      isEnabled: true,
      activationReason,
      activatedAt: new Date().toISOString(),
    };
    this.modalities.set(modality, activated);
    return structuredClone(activated);
  }

  async assertModalityAvailable(modality: DeliveryModality): Promise<void> {
    const record = await this.getModality(modality);
    if (!record.isEnabled) {
      throw new ApiError(
        409,
        "modality_not_enabled",
        `Delivery modality ${modality} is not enabled for construct design.`,
        "Activate the modality explicitly before generating a non-default construct.",
      );
    }
  }
}