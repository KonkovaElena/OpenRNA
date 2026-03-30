import type { RankingRationale, ConstructDesignPackage, DeliveryModality } from "../types";

export interface ConstructDesignRequest {
  caseId: string;
  rankedCandidates: RankingRationale[];
  deliveryModality?: DeliveryModality; // defaults to "conventional-mrna"
}

export interface IConstructDesigner {
  designConstruct(request: ConstructDesignRequest): Promise<ConstructDesignPackage>;
}
