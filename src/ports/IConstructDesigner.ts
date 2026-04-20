import type { RankingRationale, ConstructDesignPackage, DeliveryModality, EpitopeLinkerStrategy } from "../types";

export interface ConstructDesignRequest {
  caseId: string;
  rankedCandidates: RankingRationale[];
  deliveryModality?: DeliveryModality; // defaults to "conventional-mrna"
  linkerStrategy?: EpitopeLinkerStrategy;
}

export interface IConstructDesigner {
  designConstruct(request: ConstructDesignRequest): Promise<ConstructDesignPackage>;
}
