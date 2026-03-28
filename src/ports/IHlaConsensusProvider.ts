import type { HlaConsensusRecord, HlaToolEvidence } from "../types";

export interface HlaTypingInput {
  toolName: string;
  alleles: string[];
  confidence: number;
  rawOutput?: string;
}

export interface IHlaConsensusProvider {
  produceConsensus(caseId: string, inputs: HlaTypingInput[], referenceVersion: string): Promise<HlaConsensusRecord>;
  getConsensus(caseId: string): Promise<HlaConsensusRecord | null>;
}
