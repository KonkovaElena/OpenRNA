import { randomUUID } from "node:crypto";
import type { IModalityRegistry } from "../ports/IModalityRegistry.js";
import type { ConstructDesignPackage, RankingRationale } from "../types";
import type { IConstructDesigner, ConstructDesignRequest } from "../ports/IConstructDesigner";
import { InMemoryModalityRegistry } from "./InMemoryModalityRegistry.js";

/**
 * In-memory construct designer that converts ranked neoantigen candidates
 * into an mRNA construct design package with codon optimization metadata
 * and manufacturability checks.
 */
export class InMemoryConstructDesigner implements IConstructDesigner {
  constructor(private readonly modalityRegistry: IModalityRegistry = new InMemoryModalityRegistry()) {}

  async designConstruct(request: ConstructDesignRequest): Promise<ConstructDesignPackage> {
    const modality = request.deliveryModality ?? "conventional-mrna";
    await this.modalityRegistry.assertModalityAvailable(modality);
    const candidateIds = request.rankedCandidates.map((c) => c.candidateId);

    // Build concatenated epitope sequence (simplified: join candidate IDs as placeholder epitopes)
    const sequence = this.buildSequence(request.rankedCandidates);
    const gcContent = this.computeGcContent(sequence);
    const caiScore = this.estimateCai(sequence);

    const manufacturabilityChecks = this.runManufacturabilityChecks(sequence, modality);

    return {
      constructId: `ctor_${randomUUID()}`,
      caseId: request.caseId,
      version: 1,
      deliveryModality: modality,
      sequence,
      designRationale: this.buildRationale(request.rankedCandidates, modality),
      candidateIds,
      codonOptimization: {
        algorithm: "LinearDesign",
        gcContentPercent: gcContent,
        caiScore,
      },
      manufacturabilityChecks,
      designedAt: new Date().toISOString(),
    };
  }

  private buildSequence(candidates: RankingRationale[]): string {
    // Simplified: generate a representative mRNA sequence per candidate
    // Real implementation would use actual epitope sequences + linkers
    const epitopes = candidates.map((c) => {
      // Use candidateId hash as seed for deterministic pseudo-sequence
      const seed = [...c.candidateId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
      return this.generateCodonOptimizedEpitope(seed);
    });
    const linker = "GGCGGCAGC"; // GGS flexible linker (common in tandem minigene constructs)
    const fivePrimeUtr = "AUGAAGAAAGCGAUCGCGAUC";
    const threePrimeUtr = "UGAAAUAAACUAGCUAG";
    return fivePrimeUtr + epitopes.join(linker) + threePrimeUtr;
  }

  private generateCodonOptimizedEpitope(seed: number): string {
    const codons = ["AUG", "GCG", "GAU", "CCC", "UUU", "AAA", "GGC", "UCG", "CAG", "ACG"];
    const length = 27; // ~9 amino acids (typical MHC-I epitope)
    let result = "";
    for (let i = 0; i < length; i += 3) {
      result += codons[(seed + i) % codons.length];
    }
    return result;
  }

  private computeGcContent(sequence: string): number {
    const gcCount = [...sequence].filter((c) => c === "G" || c === "C").length;
    return Math.round((gcCount / sequence.length) * 1000) / 10;
  }

  private estimateCai(sequence: string): number {
    // Simplified CAI estimation: codon frequency in human genome
    // Real implementation would use codon usage tables
    const length = sequence.length;
    const score = 0.75 + (length % 100) / 400; // 0.75-1.0 range
    return Math.round(Math.min(score, 1.0) * 100) / 100;
  }

  private runManufacturabilityChecks(
    sequence: string,
    modality: string,
  ): ConstructDesignPackage["manufacturabilityChecks"] {
    const checks: ConstructDesignPackage["manufacturabilityChecks"] = [];

    // Check sequence length
    const maxLength = modality === "saRNA" ? 12000 : 5000;
    checks.push({
      checkName: "sequence_length",
      pass: sequence.length <= maxLength,
      detail: `Sequence length ${sequence.length} nt (max ${maxLength} for ${modality})`,
      severity: sequence.length > maxLength ? "blocking" : "info",
    });

    // Check GC content (40-60% is ideal for IVT)
    const gcPercent = this.computeGcContent(sequence);
    const gcPass = gcPercent >= 40 && gcPercent <= 60;
    checks.push({
      checkName: "gc_content",
      pass: gcPass,
      detail: `GC content ${gcPercent}% (target 40-60%)`,
      severity: gcPass ? "info" : "warning",
    });

    // Check for homopolymer runs (>6 same base)
    const homopolymerMatch = /([AUGC])\1{6,}/.exec(sequence);
    checks.push({
      checkName: "homopolymer_runs",
      pass: !homopolymerMatch,
      detail: homopolymerMatch
        ? `Homopolymer run detected: ${homopolymerMatch[0]}`
        : "No problematic homopolymer runs",
      severity: homopolymerMatch ? "warning" : "info",
    });

    return checks;
  }

  private buildRationale(candidates: RankingRationale[], modality: string): string {
    if (candidates.length === 0) {
      return "No candidates provided; empty construct generated.";
    }
    const topIds = candidates.slice(0, 3).map((c) => c.candidateId).join(", ");
    return `Construct designed with ${candidates.length} epitope(s) from candidates [${topIds}] ` +
      `using ${modality} delivery modality. Epitopes ordered by composite rank score.`;
  }
}
