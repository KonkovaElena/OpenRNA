import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";

type PackageJson = {
  scripts?: {
    start?: string;
  };
};

type TsConfig = {
  compilerOptions?: {
    outDir?: string;
    rootDir?: string;
  };
};

test("package start script points at the emitted TypeScript entrypoint", () => {
  const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8")) as PackageJson;
  const tsconfig = JSON.parse(readFileSync(path.resolve(__dirname, "../tsconfig.json"), "utf8")) as TsConfig;

  const rootDir = (tsconfig.compilerOptions?.rootDir ?? ".").replace(/\\/g, "/");
  const outDir = (tsconfig.compilerOptions?.outDir ?? "dist").replace(/\\/g, "/");
  const sourceEntrypoint = "src/index.ts";
  const emittedEntrypoint = path.posix.join(
    outDir,
    path.posix.relative(rootDir, sourceEntrypoint).replace(/\.ts$/, ".js"),
  );

  assert.equal(packageJson.scripts?.start, `node ${emittedEntrypoint}`);
});