import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

const repoRoot = process.cwd();

async function buildSnapshotArtifacts() {
  const { loadSpec } = await import("../dist/openapi/load-spec.js");
  const { resolveRefs } = await import("../dist/openapi/resolve-refs.js");
  const { normalizeSpec } = await import("../dist/openapi/normalize-spec.js");
  const { validateSpec } = await import("../dist/openapi/validate-spec.js");
  const { buildIR } = await import("../dist/ir/build-ir.js");
  const { buildSkillPrompt } = await import("../dist/llm/prompts.js");

  const specPath = path.join(repoRoot, "test", "fixtures", "letztennis.openapi.json");
  const loaded = await loadSpec(specPath);
  const resolved = await resolveRefs(loaded);
  const normalized = normalizeSpec(resolved);
  const validation = validateSpec(normalized);

  assert.equal(
    validation.valid,
    true,
    `Expected valid fixture. Diagnostics: ${JSON.stringify(validation.diagnostics)}`,
  );

  const ir = buildIR(normalized);
  const prompt = buildSkillPrompt(ir);

  return {
    irJson: JSON.stringify(ir, null, 2),
    prompt,
  };
}

test("letztennis IR snapshot matches expected", async () => {
  const { irJson } = await buildSnapshotArtifacts();
  const expected = readFileSync(
    path.join(repoRoot, "test", "golden", "letztennis.ir.json"),
    "utf8",
  );
  assert.deepEqual(JSON.parse(irJson), JSON.parse(expected));
});

test("letztennis prompt snapshot matches expected", async () => {
  const { prompt } = await buildSnapshotArtifacts();
  const expected = readFileSync(
    path.join(repoRoot, "test", "golden", "letztennis.prompt.txt"),
    "utf8",
  );
  assert.equal(prompt.trimEnd(), expected.trimEnd());
});
