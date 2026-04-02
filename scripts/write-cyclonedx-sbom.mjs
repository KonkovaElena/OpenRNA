import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.argv[2] ?? "openrna-runtime-sbom.cdx.json");
const npmArgs = ["sbom", "--sbom-format", "cyclonedx", "--package-lock-only", "--omit=dev"];
const npmExecPath = process.env.npm_execpath;

let stdout = "";

if (!npmExecPath) {
  console.error("npm_execpath is not available; run this helper through `npm run`.");
  process.exit(1);
}

const child = spawn(process.execPath, [npmExecPath, ...npmArgs], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "inherit"],
});

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});

child.on("error", (error) => {
  console.error(`Failed to start npm sbom: ${error.message}`);
  process.exitCode = 1;
});

child.on("close", (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    console.error("npm sbom did not produce valid JSON.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  console.log(`Wrote CycloneDX SBOM to ${outputPath}`);
});