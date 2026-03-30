import type { ReferenceBundleManifest } from "../types";
import type { IReferenceBundleRegistry } from "../ports/IReferenceBundleRegistry";

const DEFAULT_BUNDLES: ReferenceBundleManifest[] = [
  {
    bundleId: "GRCh38-2026a",
    genomeAssembly: "GRCh38",
    annotationVersion: "GENCODE v44",
    knownSitesVersion: "dbSNP 156",
    hlaDatabaseVersion: "IMGT/HLA 3.55.0",
    frozenAt: "2026-01-15T00:00:00.000Z",
  },
  {
    bundleId: "GRCh37-legacy",
    genomeAssembly: "GRCh37",
    annotationVersion: "GENCODE v19",
    knownSitesVersion: "dbSNP 151",
    hlaDatabaseVersion: "IMGT/HLA 3.24.0",
    frozenAt: "2024-06-01T00:00:00.000Z",
  },
];

export class InMemoryReferenceBundleRegistry implements IReferenceBundleRegistry {
  private readonly bundles = new Map<string, ReferenceBundleManifest>();
  private readonly pins = new Map<string, string>(); // runId → bundleId

  constructor(initialBundles: ReferenceBundleManifest[] = DEFAULT_BUNDLES) {
    for (const bundle of initialBundles) {
      this.bundles.set(bundle.bundleId, bundle);
    }
  }

  async getBundle(bundleId: string): Promise<ReferenceBundleManifest | null> {
    return this.bundles.get(bundleId) ?? null;
  }

  async listBundles(): Promise<ReferenceBundleManifest[]> {
    return [...this.bundles.values()];
  }

  pinBundle(bundleId: string, runId: string): void {
    this.pins.set(runId, bundleId);
  }

  async registerBundle(bundle: ReferenceBundleManifest): Promise<ReferenceBundleManifest> {
    if (this.bundles.has(bundle.bundleId)) {
      throw new Error(`Bundle '${bundle.bundleId}' already registered`);
    }
    this.bundles.set(bundle.bundleId, bundle);
    return bundle;
  }

  /** Test helper: check if a run is pinned. */
  getPinnedBundle(runId: string): string | undefined {
    return this.pins.get(runId);
  }
}
