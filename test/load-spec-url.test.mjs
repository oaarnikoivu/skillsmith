import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

const repoRoot = process.cwd();

test("loadSpec supports OpenAPI URL input", async () => {
  const { loadSpec } = await import("../dist/openapi/load-spec.js");
  const fixtureJson = readFileSync(
    path.join(repoRoot, "test", "fixtures", "one-op.openapi.json"),
    "utf8",
  );
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    assert.equal(input, "https://127.0.0.1/openapi.json");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      url: "https://127.0.0.1/openapi.json",
      headers: {
        get(name) {
          return name.toLowerCase() === "content-type" ? "application/json" : null;
        },
      },
      text: async () => fixtureJson,
    };
  };

  try {
    const loaded = await loadSpec("https://127.0.0.1/openapi.json");
    assert.equal(loaded.sourcePath, "https://127.0.0.1/openapi.json");
    assert.equal(loaded.document.openapi, "3.1.0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadSpec surfaces HTTP errors for OpenAPI URL input", async () => {
  const { loadSpec } = await import("../dist/openapi/load-spec.js");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    url: "https://127.0.0.1/openapi.json",
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "text/plain" : null;
      },
    },
    text: async () => "not found",
  });

  try {
    await assert.rejects(
      () => loadSpec("https://127.0.0.1/openapi.json"),
      /Failed to fetch OpenAPI URL .* HTTP 404 Not Found/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
