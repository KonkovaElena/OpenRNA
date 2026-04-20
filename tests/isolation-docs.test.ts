import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function readRootDoc(fileName: string): string {
  return readFileSync(path.resolve(__dirname, `../${fileName}`), "utf8");
}

test("bundled documentation surfaces do not link outside the standalone repository", () => {
  const rootDocs = ["README.md", "docs/design.md"];

  for (const fileName of rootDocs) {
    const content = readRootDoc(fileName);
    const markdownLinks = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
    const escapingLinks = markdownLinks.filter(
      (target) => !target.startsWith("http://") && !target.startsWith("https://") && target.replace(/\\/g, "/").startsWith("../"),
    );

    assert.deepEqual(
      escapingLinks,
      [],
      `${fileName} contains links that escape the standalone repository: ${escapingLinks.join(", ")}`,
    );
  }
});