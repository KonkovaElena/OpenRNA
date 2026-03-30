import type { NeoantigenCandidate, RankingResult } from "../types.js";

export interface INeoantigenRankingEngine {
  rank(caseId: string, candidates: NeoantigenCandidate[]): Promise<RankingResult>;
}
