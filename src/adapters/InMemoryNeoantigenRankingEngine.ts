import type { INeoantigenRankingEngine } from "../ports/INeoantigenRankingEngine.js";
import type {
  NeoantigenCandidate,
  RankingResult,
  RankingRationale,
  ConfidenceInterval,
} from "../types.js";

const FEATURE_WEIGHTS = {
  bindingAffinity: 0.30,
  expression: 0.25,
  clonality: 0.20,
  manufacturability: 0.15,
  tolerance: 0.10,
} as const;

function scoreBinding(c: NeoantigenCandidate): number {
  // Lower IC50 = stronger binding. Sigmoid-style normalization: 1 / (1 + ic50/500)
  return 1 / (1 + c.bindingAffinity.ic50nM / 500);
}

function scoreExpression(c: NeoantigenCandidate): number {
  // Higher TPM + higher VAF = better. Normalize TPM [0,100]→[0,1], VAF already [0,1]
  const tpmNorm = Math.min(c.expressionSupport.tpm / 100, 1);
  return (tpmNorm + c.expressionSupport.variantAlleleFraction) / 2;
}

function scoreClonality(c: NeoantigenCandidate): number {
  // Clonal + high VAF preferred
  const clonalBonus = c.clonality.isClonal ? 0.5 : 0;
  return Math.min(c.clonality.vaf + clonalBonus, 1);
}

function scoreManufacturability(c: NeoantigenCandidate): number {
  // GC content near 0.5 is ideal; low folding risk preferred
  const gcScore = 1 - Math.abs(c.manufacturability.gcContent - 0.5) * 2;
  const foldScore = c.manufacturability.selfFoldingRisk === "low" ? 1
    : c.manufacturability.selfFoldingRisk === "medium" ? 0.5
    : 0.2;
  return (gcScore + foldScore) / 2;
}

function scoreTolerance(c: NeoantigenCandidate): number {
  // Higher edit distance + lower tolerance risk = better
  const distScore = Math.min(c.selfSimilarity.editDistance / 5, 1);
  const riskScore = c.selfSimilarity.toleranceRisk === "low" ? 1
    : c.selfSimilarity.toleranceRisk === "medium" ? 0.5
    : 0.1;
  return (distScore + riskScore) / 2;
}

function buildExplanation(featureScores: Record<string, number>, c: NeoantigenCandidate): string {
  const parts: string[] = [];
  if (featureScores.bindingAffinity > 0.7) parts.push("strong binding");
  else if (featureScores.bindingAffinity < 0.3) parts.push("weak binding");
  if (featureScores.expression > 0.5) parts.push("high expression");
  if (featureScores.clonality > 0.7) parts.push("clonal");
  if (featureScores.tolerance < 0.5) parts.push("moderate tolerance risk");
  if (c.uncertaintyScore > 0.5) parts.push("high uncertainty");
  return parts.length > 0 ? parts.join("; ") : "average across features";
}

export class InMemoryNeoantigenRankingEngine implements INeoantigenRankingEngine {
  async rank(caseId: string, candidates: NeoantigenCandidate[]): Promise<RankingResult> {
    if (candidates.length === 0) {
      return {
        caseId,
        rankedCandidates: [],
        ensembleMethod: "weighted-sum",
        confidenceInterval: { lower: 0, upper: 0 },
        rankedAt: new Date().toISOString(),
      };
    }

    const scored: Array<{ candidate: NeoantigenCandidate; featureScores: Record<string, number>; composite: number; uncContrib: number }> = [];

    for (const c of candidates) {
      const featureScores: Record<string, number> = {
        bindingAffinity: scoreBinding(c),
        expression: scoreExpression(c),
        clonality: scoreClonality(c),
        manufacturability: scoreManufacturability(c),
        tolerance: scoreTolerance(c),
      };

      const rawComposite =
        featureScores.bindingAffinity * FEATURE_WEIGHTS.bindingAffinity +
        featureScores.expression * FEATURE_WEIGHTS.expression +
        featureScores.clonality * FEATURE_WEIGHTS.clonality +
        featureScores.manufacturability * FEATURE_WEIGHTS.manufacturability +
        featureScores.tolerance * FEATURE_WEIGHTS.tolerance;

      // Uncertainty penalizes the composite score
      const uncContrib = c.uncertaintyScore * 0.2;
      const composite = Math.max(0, Math.min(1, rawComposite - uncContrib));

      scored.push({ candidate: c, featureScores, composite, uncContrib });
    }

    // Sort descending by composite
    scored.sort((a, b) => b.composite - a.composite);

    const rankedCandidates: RankingRationale[] = scored.map((s, i) => ({
      candidateId: s.candidate.candidateId,
      rank: i + 1,
      compositeScore: Math.round(s.composite * 1000) / 1000,
      featureWeights: { ...FEATURE_WEIGHTS },
      featureScores: s.featureScores,
      uncertaintyContribution: Math.round(s.uncContrib * 1000) / 1000,
      explanation: buildExplanation(s.featureScores, s.candidate),
    }));

    const confidenceInterval = this.computeConfidenceInterval(scored.map(s => s.composite), candidates.length);

    return {
      caseId,
      rankedCandidates,
      ensembleMethod: "weighted-sum",
      confidenceInterval,
      rankedAt: new Date().toISOString(),
    };
  }

  private computeConfidenceInterval(scores: number[], n: number): ConfidenceInterval {
    if (n === 0) return { lower: 0, upper: 0 };
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    // Simple uncertainty: halve spread with more candidates (1/sqrt(n) scaling)
    const baseSpread = 0.3;
    const spread = baseSpread / Math.sqrt(n);
    return {
      lower: Math.round(Math.max(0, mean - spread) * 1000) / 1000,
      upper: Math.round(Math.min(1, mean + spread) * 1000) / 1000,
    };
  }
}
