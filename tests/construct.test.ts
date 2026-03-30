import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/errors";
import type {
  ConstructDesignPackage,
  DeliveryModality,
  CodonOptimizationMeta,
  ManufacturabilityCheck,
  RankingRationale,
} from "../src/types";
import type { IConstructDesigner, ConstructDesignRequest } from "../src/ports/IConstructDesigner";
import { InMemoryConstructDesigner } from "../src/adapters/InMemoryConstructDesigner";
import { InMemoryModalityRegistry } from "../src/adapters/InMemoryModalityRegistry";

// ─── Wave 9.A — Construct design types ──────────────────────────────

describe("Wave 9.A — Construct design types and port", () => {
  it("ConstructDesignPackage carries all required fields", () => {
    const pkg: ConstructDesignPackage = {
      constructId: "ctor-001",
      caseId: "case-001",
      version: 1,
      deliveryModality: "conventional-mrna",
      sequence: "AUGCCCGAU",
      designRationale: "Selected top 2 candidates by composite score",
      candidateIds: ["neo-1", "neo-2"],
      codonOptimization: { algorithm: "LinearDesign", gcContentPercent: 52.3, caiScore: 0.87 },
      manufacturabilityChecks: [
        { checkName: "secondary_structure", pass: true, detail: "No problematic hairpins", severity: "info" },
      ],
      designedAt: "2026-03-27T14:00:00Z",
    };
    assert.equal(pkg.constructId, "ctor-001");
    assert.equal(pkg.deliveryModality, "conventional-mrna");
    assert.equal(pkg.candidateIds.length, 2);
    assert.ok(pkg.codonOptimization.caiScore > 0);
    assert.equal(pkg.manufacturabilityChecks.length, 1);
  });

  it("DeliveryModality supports conventional-mrna, saRNA, circRNA", () => {
    const modalities: DeliveryModality[] = ["conventional-mrna", "saRNA", "circRNA"];
    assert.equal(modalities.length, 3);
    assert.ok(modalities.includes("conventional-mrna"));
    assert.ok(modalities.includes("saRNA"));
    assert.ok(modalities.includes("circRNA"));
  });

  it("IConstructDesigner port defines designConstruct method", () => {
    const designer: IConstructDesigner = {
      designConstruct: async (_req: ConstructDesignRequest) => ({
        constructId: "ctor-stub",
        caseId: _req.caseId,
        version: 1,
        deliveryModality: _req.deliveryModality ?? "conventional-mrna",
        sequence: "AUG",
        designRationale: "stub",
        candidateIds: [],
        codonOptimization: { algorithm: "stub", gcContentPercent: 50, caiScore: 0.5 },
        manufacturabilityChecks: [],
        designedAt: new Date().toISOString(),
      }),
    };
    assert.equal(typeof designer.designConstruct, "function");
  });
});

// ─── Wave 9.B — InMemoryConstructDesigner ───────────────────────────

function buildRankedCandidates(): RankingRationale[] {
  return [
    {
      candidateId: "neo-alpha",
      compositeScore: 0.88,
      rank: 1,
      featureScores: { bindingAffinity: 0.92, expression: 0.85, clonality: 0.90, manufacturability: 0.80, tolerance: 0.75 },
      featureWeights: { bindingAffinity: 0.30, expression: 0.25, clonality: 0.20, manufacturability: 0.15, tolerance: 0.10 },
      uncertaintyContribution: 0.05,
      explanation: "Top candidate with strong binding and expression",
    },
    {
      candidateId: "neo-beta",
      compositeScore: 0.72,
      rank: 2,
      featureScores: { bindingAffinity: 0.78, expression: 0.70, clonality: 0.65, manufacturability: 0.75, tolerance: 0.80 },
      featureWeights: { bindingAffinity: 0.30, expression: 0.25, clonality: 0.20, manufacturability: 0.15, tolerance: 0.10 },
      uncertaintyContribution: 0.08,
      explanation: "Second candidate with moderate scores",
    },
  ];
}

describe("Wave 9.B — InMemoryConstructDesigner", () => {
  const designer = new InMemoryConstructDesigner();
  const candidates = buildRankedCandidates();

  it("produces a construct with correct caseId and candidateIds", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates });
    assert.equal(pkg.caseId, "case-9b");
    assert.deepEqual(pkg.candidateIds, ["neo-alpha", "neo-beta"]);
  });

  it("defaults delivery modality to conventional-mrna", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates });
    assert.equal(pkg.deliveryModality, "conventional-mrna");
  });

  it("rejects non-default modalities until the gate is activated", async () => {
    await assert.rejects(
      () => designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates, deliveryModality: "saRNA" }),
      (error: unknown) => error instanceof ApiError && error.code === "modality_not_enabled",
    );
  });

  it("allows explicit delivery modality after gate activation", async () => {
    const modalityRegistry = new InMemoryModalityRegistry();
    await modalityRegistry.activateModality("saRNA", "Wave 11 adapter test enablement");
    const gatedDesigner = new InMemoryConstructDesigner(modalityRegistry);
    const pkg = await gatedDesigner.designConstruct({ caseId: "case-9b", rankedCandidates: candidates, deliveryModality: "saRNA" });
    assert.equal(pkg.deliveryModality, "saRNA");
  });

  it("generates a non-empty mRNA sequence", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates });
    assert.ok(pkg.sequence.length > 0, "sequence should be non-empty");
    assert.ok(pkg.sequence.startsWith("AUG"), "sequence should start with AUG (start codon)");
  });

  it("includes codon optimization metadata with valid ranges", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates });
    assert.ok(pkg.codonOptimization.gcContentPercent > 0, "GC content should be positive");
    assert.ok(pkg.codonOptimization.gcContentPercent <= 100, "GC content should be ≤100");
    assert.ok(pkg.codonOptimization.caiScore > 0 && pkg.codonOptimization.caiScore <= 1, "CAI should be in (0,1]");
    assert.equal(pkg.codonOptimization.algorithm, "LinearDesign");
  });

  it("runs manufacturability checks with at least sequence_length and gc_content", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates });
    const checkNames = pkg.manufacturabilityChecks.map((c) => c.checkName);
    assert.ok(checkNames.includes("sequence_length"), "should check sequence length");
    assert.ok(checkNames.includes("gc_content"), "should check GC content");
  });

  it("produces a design rationale mentioning candidate IDs", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates });
    assert.ok(pkg.designRationale.includes("neo-alpha"), "rationale should mention top candidate");
    assert.ok(pkg.designRationale.includes("conventional-mrna"), "rationale should mention modality");
  });

  it("assigns version 1 and a valid constructId", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-9b", rankedCandidates: candidates });
    assert.equal(pkg.version, 1);
    assert.ok(pkg.constructId.startsWith("ctor_"), "constructId should have ctor_ prefix");
  });

  it("handles empty candidates gracefully", async () => {
    const pkg = await designer.designConstruct({ caseId: "case-empty", rankedCandidates: [] });
    assert.equal(pkg.candidateIds.length, 0);
    assert.ok(pkg.sequence.length > 0, "still produces UTR wrapping");
    assert.ok(pkg.designRationale.includes("No candidates"), "rationale should note empty input");
  });
});
