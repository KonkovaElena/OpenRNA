import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerReviewRoutes } from "../src/routes/review";
import { registerDesignRoutes } from "../src/routes/design";
import { registerGovernanceRoutes } from "../src/routes/governance";
import { registerOutcomeRoutes } from "../src/routes/outcomes";
import { registerWorkflowRoutes } from "../src/routes/workflow";

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

test("app delegates review endpoints through a dedicated review registrar", () => {
  assert.equal(typeof registerReviewRoutes, "function");

  const appSource = readRepoFile("src", "app.ts");
  const reviewSource = readRepoFile("src", "routes", "review.ts");

  assert.match(appSource, /import\s+\{\s*registerReviewRoutes\s*\}\s+from\s+"\.\/routes\/review"/);
  assert.match(appSource, /registerReviewRoutes\(app,\s*\{/);
  assert.match(reviewSource, /\/api\/cases\/:caseId\/board-packets/);
  assert.match(reviewSource, /\/api\/cases\/:caseId\/review-outcomes/);
  assert.match(reviewSource, /\/api\/cases\/:caseId\/final-releases/);
  assert.match(reviewSource, /\/api\/cases\/:caseId\/handoff-packets/);
});

test("app delegates governance endpoints through a dedicated governance registrar", () => {
  assert.equal(typeof registerGovernanceRoutes, "function");

  const appSource = readRepoFile("src", "app.ts");
  const governanceSource = readRepoFile("src", "routes", "governance.ts");

  assert.match(appSource, /import\s+\{\s*registerGovernanceRoutes\s*\}\s+from\s+"\.\/routes\/governance"/);
  assert.match(appSource, /registerGovernanceRoutes\(app,\s*\{/);
  assert.match(governanceSource, /\/api\/reference-bundles/);
  assert.match(governanceSource, /\/api\/cases\/:caseId\/allowed-transitions/);
  assert.match(governanceSource, /\/api\/cases\/:caseId\/validate-transition/);
  assert.match(governanceSource, /\/api\/cases\/:caseId\/consent/);
  assert.match(governanceSource, /\/api\/cases\/:caseId\/resolve-hla-review/);
});

test("app delegates design endpoints through a dedicated design registrar", () => {
  assert.equal(typeof registerDesignRoutes, "function");

  const appSource = readRepoFile("src", "app.ts");
  const designSource = readRepoFile("src", "routes", "design.ts");

  assert.match(appSource, /import\s+\{\s*registerDesignRoutes\s*\}\s+from\s+"\.\/routes\/design"/);
  assert.match(appSource, /registerDesignRoutes\(app,\s*\{/);
  assert.match(designSource, /\/api\/cases\/:caseId\/neoantigen-ranking/);
  assert.match(designSource, /\/api\/cases\/:caseId\/construct-design/);
});

test("app delegates outcomes endpoints through a dedicated outcomes registrar", () => {
  assert.equal(typeof registerOutcomeRoutes, "function");

  const appSource = readRepoFile("src", "app.ts");
  const outcomesSource = readRepoFile("src", "routes", "outcomes.ts");

  assert.match(appSource, /import\s+\{\s*registerOutcomeRoutes\s*\}\s+from\s+"\.\/routes\/outcomes"/);
  assert.match(appSource, /registerOutcomeRoutes\(app,\s*\{/);
  assert.match(outcomesSource, /\/api\/cases\/:caseId\/outcomes\/administration/);
  assert.match(outcomesSource, /\/api\/cases\/:caseId\/outcomes\/immune-monitoring/);
  assert.match(outcomesSource, /\/api\/cases\/:caseId\/outcomes\/clinical-follow-up/);
  assert.match(outcomesSource, /\/api\/cases\/:caseId\/traceability/);
});

test("app delegates workflow and orchestration endpoints through a dedicated workflow registrar", () => {
  assert.equal(typeof registerWorkflowRoutes, "function");

  const appSource = readRepoFile("src", "app.ts");
  const workflowSource = readRepoFile("src", "routes", "workflow.ts");

  assert.match(appSource, /import\s+\{\s*registerWorkflowRoutes\s*\}\s+from\s+"\.\/routes\/workflow"/);
  assert.match(appSource, /registerWorkflowRoutes\(app,\s*\{/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/workflows/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/runs\/:runId\/start/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/runs\/:runId\/complete/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/runs\/:runId\/fail/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/runs\/:runId\/cancel/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/runs/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/runs\/:runId/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/hla-consensus/);
  assert.match(workflowSource, /\/api\/cases\/:caseId\/runs\/:runId\/qc/);
});