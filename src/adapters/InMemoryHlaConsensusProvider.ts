import type { HlaConsensusRecord } from "../types";
import type { IHlaConsensusProvider, HlaTypingInput } from "../ports/IHlaConsensusProvider";

export class InMemoryHlaConsensusProvider implements IHlaConsensusProvider {
  private readonly records = new Map<string, HlaConsensusRecord>();

  async produceConsensus(
    caseId: string,
    inputs: HlaTypingInput[],
    referenceVersion: string,
  ): Promise<HlaConsensusRecord> {
    // Build consensus: collect all unique alleles across tools, compute average confidence
    const alleleSet = new Set<string>();
    for (const input of inputs) {
      for (const allele of input.alleles) {
        alleleSet.add(allele);
      }
    }

    const avgConfidence =
      inputs.length > 0
        ? inputs.reduce((sum, i) => sum + i.confidence, 0) / inputs.length
        : 0;

    const record: HlaConsensusRecord = {
      caseId,
      alleles: [...alleleSet].sort(),
      perToolEvidence: inputs.map((i) => ({
        toolName: i.toolName,
        alleles: i.alleles,
        confidence: i.confidence,
        rawOutput: i.rawOutput,
      })),
      confidenceScore: Math.round(avgConfidence * 1000) / 1000,
      referenceVersion,
      producedAt: new Date().toISOString(),
    };

    this.records.set(caseId, record);
    return record;
  }

  async getConsensus(caseId: string): Promise<HlaConsensusRecord | null> {
    return this.records.get(caseId) ?? null;
  }

  /** Test helper: seed a consensus record directly. */
  seedConsensus(caseId: string, record: HlaConsensusRecord): void {
    this.records.set(caseId, record);
  }
}
