import type { ReferenceBundleManifest } from "../types";

export interface IReferenceBundleRegistry {
  getBundle(bundleId: string): Promise<ReferenceBundleManifest | null>;
  listBundles(): Promise<ReferenceBundleManifest[]>;
  pinBundle(bundleId: string, runId: string): void;
  registerBundle(bundle: ReferenceBundleManifest): Promise<ReferenceBundleManifest>;
}
