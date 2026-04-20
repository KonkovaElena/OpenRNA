import type { HlaConsensusRecord, HlaDisagreementRecord } from "../types";
import type { IHlaConsensusProvider, HlaTypingInput } from "../ports/IHlaConsensusProvider";

/**
 * @sota-stub Stub implementation of IHlaConsensusProvider providing local math consensus resolution.
 */
export class InMemoryHlaConsensusProvider implements IHlaConsensusProvider {
  private readonly records = new Map<string, HlaConsensusRecord>();

  async produceConsensus(
    caseId: string,
    inputs: HlaTypingInput[],
    referenceVersion: string,
    operatorReviewThreshold = 0,
  ): Promise<HlaConsensusRecord> {
    // Build consensus: collect all unique alleles across tools, compute average confidence
    const alleleSet = new Set<string>();
    for (const input of inputs) {
      for (const allele of input.alleles) {
        alleleSet.add(allele);
      }
    }

    let validInputs = 0;
    let sumConfidence = 0;
    for (const i of inputs) {
      if (Number.isFinite(i.confidence) && i.confidence >= 0 && i.confidence <= 1) {
        sumConfidence += i.confidence;
        validInputs++;
      }
    }

    const avgConfidence =
      validInputs > 0
        ? sumConfidence / validInputs
        : 0;

    // Detect disagreements: compare alleles across tool pairs per locus
    const disagreements = this.detectDisagreements(inputs);
    const unresolvedDisagreementCount = disagreements.filter((candidate) => candidate.resolution === "unresolved").length;
    const manualReviewRequired = unresolvedDisagreementCount > operatorReviewThreshold;

    // Per-tool confidence decomposition
    const confidenceDecomposition: Record<string, number> = {};
    for (const input of inputs) {
      confidenceDecomposition[input.toolName] = input.confidence;
    }

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
      operatorReviewThreshold,
      unresolvedDisagreementCount,
      manualReviewRequired,
      referenceVersion,
      producedAt: new Date().toISOString(),
      disagreements: disagreements.length > 0 ? disagreements : undefined,
      confidenceDecomposition:
        Object.keys(confidenceDecomposition).length > 0 ? confidenceDecomposition : undefined,
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

  /**
   * Extract HLA loci from allele strings (e.g. "HLA-A*02:01" → "HLA-A")
   * and detect pairwise disagreements between tools at the same locus.
   */
  private detectDisagreements(inputs: HlaTypingInput[]): HlaDisagreementRecord[] {
    if (inputs.length < 2) return [];

    // Build per-tool locus → allele map
    const toolLoci = new Map<string, Map<string, string>>();
    for (const input of inputs) {
      const locusMap = new Map<string, string>();
      for (const allele of input.alleles) {
        const locus = allele.includes("*") ? allele.split("*")[0] : allele;
        locusMap.set(locus, allele);
      }
      toolLoci.set(input.toolName, locusMap);
    }

    const disagreements: HlaDisagreementRecord[] = [];
    const toolNames = [...toolLoci.keys()];

    for (let i = 0; i < toolNames.length; i++) {
      for (let j = i + 1; j < toolNames.length; j++) {
        const toolA = toolNames[i];
        const toolB = toolNames[j];
        const lociA = toolLoci.get(toolA)!;
        const lociB = toolLoci.get(toolB)!;

        // Check shared loci for disagreements
        for (const [locus, alleleA] of lociA) {
          const alleleB = lociB.get(locus);
          if (alleleB && alleleA !== alleleB) {
            // Resolve: majority wins if ≥3 tools, else unresolved for 2 tools
            let resolution: HlaDisagreementRecord["resolution"] = "unresolved";
            if (inputs.length >= 3) {
              const countA = [...toolLoci.values()].filter(
                (m) => m.get(locus) === alleleA,
              ).length;
              const countB = [...toolLoci.values()].filter(
                (m) => m.get(locus) === alleleB,
              ).length;
              if (countA > countB) resolution = "majority";
              else if (countB > countA) resolution = "majority";
            }

            disagreements.push({
              locus,
              toolA,
              toolAAllele: alleleA,
              toolB,
              toolBAllele: alleleB,
              resolution,
            });
          }
        }
      }
    }

    return disagreements;
  }
}
