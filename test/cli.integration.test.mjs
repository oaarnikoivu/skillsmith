import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import prettier from "prettier";

const repoRoot = process.cwd();
const testEnvPath = path.join(repoRoot, "test", "fixtures", "test.env");

function runCli(args, options = {}) {
  const {
    mockResponse,
    mockResponses,
    disableApiKey = false,
    serverUrl = "https://api.letztennis.com",
    provider = "openai",
    model = "gpt-5.2",
    injectProviderAndModel = true,
    configPath,
  } = options;
  const env = { ...process.env };
  env.DOTENV_CONFIG_PATH = testEnvPath;
  env.OPENAPI_TO_SKILLMD_CONFIG_PATH =
    configPath ??
    path.join(mkdtempSync(path.join(os.tmpdir(), "openapi-to-skillmd-config-")), "config.json");

  if (mockResponses === undefined) {
    delete env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES;
  } else {
    env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES = JSON.stringify(mockResponses);
  }

  if (mockResponse === undefined) {
    delete env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE;
  } else {
    env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE = mockResponse;
  }

  if (disableApiKey) {
    delete env.OPENAI_API_KEY;
  }

  const commandArgs = [...args];
  const command = commandArgs[0];
  const supportsGenerationServerUrl = command === "generate" || command === "generate-segmented";
  if (supportsGenerationServerUrl && serverUrl && !commandArgs.includes("--server-url")) {
    commandArgs.push("--server-url", serverUrl);
  }
  if (supportsGenerationServerUrl && injectProviderAndModel) {
    if (!commandArgs.includes("--provider")) {
      commandArgs.push("--provider", provider);
    }
    if (!commandArgs.includes("--model")) {
      commandArgs.push("--model", model);
    }
  }

  return execFileSync("node", [path.join(repoRoot, "dist/cli.js"), ...commandArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  });
}

test("fails when --provider is missing", () => {
  assert.throws(
    () =>
      runCli(
        ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
        { injectProviderAndModel: false },
      ),
    /No LLM provider configured/,
  );
});

test("fails when --model is missing", () => {
  assert.throws(
    () =>
      runCli(
        [
          "generate",
          "--input",
          path.join("test", "fixtures", "one-op.openapi.json"),
          "--provider",
          "openai",
          "--dry-run",
        ],
        { injectProviderAndModel: false },
      ),
    /No LLM model configured/,
  );
});

test("uses cached provider/model when flags are omitted", () => {
  const configPath = path.join(
    mkdtempSync(path.join(os.tmpdir(), "openapi-to-skillmd-config-")),
    "config.json",
  );
  const mockResponse = readFileSync(
    path.join(repoRoot, "test", "golden", "one-op.SKILL.md"),
    "utf8",
  );

  runCli(["config", "set", "--provider", "openai", "--model", "gpt-5.2"], {
    injectProviderAndModel: false,
    serverUrl: null,
    configPath,
  });

  const output = runCli(
    ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
    {
      injectProviderAndModel: false,
      configPath,
      mockResponse,
    },
  );

  assert.match(output, /### `create_club`/);
});

test("config clear removes cached provider/model", () => {
  const configPath = path.join(
    mkdtempSync(path.join(os.tmpdir(), "openapi-to-skillmd-config-")),
    "config.json",
  );

  runCli(["config", "set", "--provider", "openai", "--model", "gpt-5.2"], {
    injectProviderAndModel: false,
    serverUrl: null,
    configPath,
  });

  runCli(["config", "clear"], {
    injectProviderAndModel: false,
    serverUrl: null,
    configPath,
  });

  assert.throws(
    () =>
      runCli(
        ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
        {
          injectProviderAndModel: false,
          configPath,
        },
      ),
    /No LLM provider configured/,
  );
});

test("ignore-config bypasses cached provider/model", () => {
  const configPath = path.join(
    mkdtempSync(path.join(os.tmpdir(), "openapi-to-skillmd-config-")),
    "config.json",
  );

  runCli(["config", "set", "--provider", "openai", "--model", "gpt-5.2"], {
    injectProviderAndModel: false,
    serverUrl: null,
    configPath,
  });

  assert.throws(
    () =>
      runCli(
        [
          "generate",
          "--input",
          path.join("test", "fixtures", "one-op.openapi.json"),
          "--dry-run",
          "--ignore-config",
        ],
        {
          injectProviderAndModel: false,
          configPath,
        },
      ),
    /No LLM provider configured/,
  );
});

test("save-config persists provider/model from command flags", () => {
  const configPath = path.join(
    mkdtempSync(path.join(os.tmpdir(), "openapi-to-skillmd-config-")),
    "config.json",
  );
  const mockResponse = readFileSync(
    path.join(repoRoot, "test", "golden", "one-op.SKILL.md"),
    "utf8",
  );

  runCli(
    [
      "generate",
      "--input",
      path.join("test", "fixtures", "one-op.openapi.json"),
      "--dry-run",
      "--provider",
      "openai",
      "--model",
      "gpt-5.2",
      "--save-config",
    ],
    {
      injectProviderAndModel: false,
      configPath,
      mockResponse,
    },
  );

  const saved = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(saved.provider, "openai");
  assert.equal(saved.model, "gpt-5.2");
});

test("generates expected markdown for one-op fixture", async () => {
  const mockResponse = readFileSync(
    path.join(repoRoot, "test", "golden", "one-op.SKILL.md"),
    "utf8",
  );
  const actual = runCli(
    ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
    { mockResponse },
  );
  const expected = readFileSync(path.join(repoRoot, "test", "golden", "one-op.SKILL.md"), "utf8");
  const normalizedActual = await prettier.format(actual, { parser: "markdown" });
  const normalizedExpected = await prettier.format(expected, { parser: "markdown" });
  assert.equal(normalizedActual, normalizedExpected);
});

test("includes warning diagnostics when OpenAPI paths are empty", () => {
  const mockResponse = readFileSync(
    path.join(repoRoot, "test", "golden", "one-op.SKILL.md"),
    "utf8",
  );
  const output = runCli(
    ["generate", "--input", path.join("test", "fixtures", "sample.openapi.json"), "--dry-run"],
    { mockResponse },
  );

  assert.match(output, /WARNING: \[OPENAPI_EMPTY_PATHS]/);
  assert.match(output, /# demo Skill/);
});

test("fails when no usable server URL is available and none is injected", () => {
  assert.throws(
    () =>
      runCli(
        ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
        { serverUrl: null },
      ),
    /SERVER_URL_REQUIRED/,
  );
});

test("fails when no LLM API key is set and no mock response is provided", () => {
  assert.throws(
    () =>
      runCli(
        ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
        { mockResponse: undefined, disableApiKey: true },
      ),
    /OPENAI_API_KEY is required/,
  );
});

test("fails when LLM output misses required parameters", () => {
  const invalidSkill = [
    "# demo Skill",
    "",
    "## Operations",
    "",
    "### `create_club`",
    "Method: `POST`",
    "Path: `/clubs`",
    "Summary: missing required parameter mention",
    "",
    "Example request:",
    "```bash",
    'curl -X POST "https://api.example.com/clubs"',
    "```",
  ].join("\n");

  assert.throws(
    () =>
      runCli(
        ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
        { mockResponse: invalidSkill },
      ),
    /OUTPUT_REQUIRED_PARAM_MISSING/,
  );
});

test("fails when operation example request is missing", () => {
  const invalidSkill = [
    "# demo Skill",
    "",
    "## Operations",
    "",
    "### `create_club`",
    "Method: `POST`",
    "Path: `/clubs`",
    "Required parameter noted: `include_meta`",
  ].join("\n");

  assert.throws(
    () =>
      runCli(
        ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
        { mockResponse: invalidSkill },
      ),
    /OUTPUT_OPERATION_EXAMPLE_MISSING/,
  );
});

test("does not write output file when validation errors are present", () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "openapi-to-skillmd-"));
  const outputPath = path.join(tmpDir, "SKILL.md");
  const invalidSkill = [
    "# demo Skill",
    "",
    "## Operations",
    "",
    "### `create_club`",
    "Method: `POST`",
    "Path: `/clubs`",
    "",
    "Example request:",
    "```bash",
    'curl -X POST "https://api.example.com/clubs"',
    "```",
  ].join("\n");

  try {
    assert.throws(
      () =>
        runCli(
          [
            "generate",
            "--input",
            path.join("test", "fixtures", "one-op.openapi.json"),
            "--output",
            outputPath,
          ],
          { mockResponse: invalidSkill },
        ),
      /OUTPUT_REQUIRED_PARAM_MISSING/,
    );

    assert.equal(existsSync(outputPath), false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("accepts operation sections with alternate headings", () => {
  const alternateHeadingSkill = [
    "# demo Skill",
    "",
    "## Operation: `create_club` — Create Club",
    "",
    "Method: `POST`",
    "Path: `/clubs`",
    "Required parameter noted: `include_meta`",
    "",
    "Example request:",
    "```bash",
    'curl -X POST "https://api.example.com/clubs?include_meta=true"',
    "```",
  ].join("\n");

  const output = runCli(
    ["generate", "--input", path.join("test", "fixtures", "one-op.openapi.json"), "--dry-run"],
    { mockResponse: alternateHeadingSkill },
  );

  assert.match(output, /## Operation: `create_club`/);
  assert.doesNotMatch(output, /OUTPUT_MISSING_OPERATIONS_SECTION/);
});

test("fails when referenced schemas section is missing", () => {
  const invalidSkill = [
    "# schema-ref Skill",
    "",
    "## Operations",
    "",
    "### `list_clubs`",
    "Method: `GET`",
    "Path: `/clubs`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.example.com/clubs"',
    "```",
  ].join("\n");

  assert.throws(
    () =>
      runCli(
        [
          "generate",
          "--input",
          path.join("test", "fixtures", "schema-ref.openapi.json"),
          "--dry-run",
        ],
        { mockResponse: invalidSkill },
      ),
    /OUTPUT_MISSING_SCHEMAS_SECTION/,
  );
});

test("fails when transitive referenced schema is missing from schemas section", () => {
  const invalidSkill = [
    "# schema-ref Skill",
    "",
    "## Operations",
    "",
    "### `list_clubs`",
    "Method: `GET`",
    "Path: `/clubs`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.example.com/clubs"',
    "```",
    "",
    "## Schemas",
    "",
    "### `ClubOut`",
    "- `clubId`: `string`",
    "- `address`: `AddressOut`",
  ].join("\n");

  assert.throws(
    () =>
      runCli(
        [
          "generate",
          "--input",
          path.join("test", "fixtures", "schema-ref.openapi.json"),
          "--dry-run",
        ],
        { mockResponse: invalidSkill },
      ),
    /OUTPUT_SCHEMA_MISSING/,
  );
});

test("passes when all referenced schemas are documented", () => {
  const validSkill = [
    "# schema-ref Skill",
    "",
    "## Operations",
    "",
    "### `list_clubs`",
    "Method: `GET`",
    "Path: `/clubs`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.example.com/clubs"',
    "```",
    "",
    "## Schemas",
    "",
    "### `ClubOut`",
    "- `clubId`: `string`",
    "- `address`: `AddressOut`",
    "",
    "### `AddressOut`",
    "- `city`: `string`",
  ].join("\n");

  const output = runCli(
    ["generate", "--input", path.join("test", "fixtures", "schema-ref.openapi.json"), "--dry-run"],
    { mockResponse: validSkill },
  );

  assert.match(output, /### `ClubOut`/);
  assert.match(output, /### `AddressOut`/);
});

test("generate-segmented emits root and grouped files in dry-run", () => {
  const tournamentsSkill = [
    "## Operations",
    "",
    "### `list_tournaments`",
    "Method: `GET`",
    "Path: `/tournaments`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.segmented.example/tournaments"',
    "```",
    "",
    "## Schemas",
    "",
    "### `TournamentOut`",
    "- `id`: `string`",
    "- `name`: `string`",
  ].join("\n");

  const clubsSkill = [
    "## Operations",
    "",
    "### `list_clubs`",
    "Method: `GET`",
    "Path: `/clubs`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.segmented.example/clubs"',
    "```",
    "",
    "### `get_club`",
    "Method: `GET`",
    "Path: `/clubs/{clubId}`",
    "Required parameter: `clubId`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.segmented.example/clubs/club-1"',
    "```",
    "",
    "## Schemas",
    "",
    "### `ClubOut`",
    "- `id`: `string`",
    "- `name`: `string`",
    "",
    "### `ClubDetailsOut`",
    "- `id`: `string`",
    "- `name`: `string`",
    "- `address`: `AddressOut`",
    "",
    "### `AddressOut`",
    "- `city`: `string`",
  ].join("\n");

  const rootSkill = [
    "# Segmented Demo API Skills",
    "",
    "## How to use these files",
    "- Use the file that matches the resource domain.",
    "",
    "## Skill Files",
    "",
    "### `groups/tournaments.SKILL.md`",
    "- Use for tournament listing flows.",
    "- Operations: `list_tournaments`",
    "",
    "### `groups/clubs.SKILL.md`",
    "- Use for club listing and club detail flows.",
    "- Operations: `list_clubs`, `get_club`",
  ].join("\n");

  const output = runCli(
    [
      "generate-segmented",
      "--input",
      path.join("test", "fixtures", "segmented-tags.openapi.json"),
      "--dry-run",
    ],
    { mockResponses: [tournamentsSkill, clubsSkill, rootSkill] },
  );

  assert.match(output, /<!-- FILE: SKILL.md -->/);
  assert.match(output, /<!-- FILE: groups\/tournaments\.SKILL\.md -->/);
  assert.match(output, /<!-- FILE: groups\/clubs\.SKILL\.md -->/);
});

test("generate-segmented does not write files when root index validation fails", () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "openapi-to-skillmd-segmented-"));
  const outputDir = path.join(tmpDir, "skills");
  const tournamentsSkill = [
    "## Operations",
    "",
    "### `list_tournaments`",
    "Method: `GET`",
    "Path: `/tournaments`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.segmented.example/tournaments"',
    "```",
    "",
    "## Schemas",
    "",
    "### `TournamentOut`",
    "- `id`: `string`",
    "- `name`: `string`",
  ].join("\n");

  const clubsSkill = [
    "## Operations",
    "",
    "### `list_clubs`",
    "Method: `GET`",
    "Path: `/clubs`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.segmented.example/clubs"',
    "```",
    "",
    "### `get_club`",
    "Method: `GET`",
    "Path: `/clubs/{clubId}`",
    "Required parameter: `clubId`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.segmented.example/clubs/club-1"',
    "```",
    "",
    "## Schemas",
    "",
    "### `ClubOut`",
    "- `id`: `string`",
    "- `name`: `string`",
    "",
    "### `ClubDetailsOut`",
    "- `id`: `string`",
    "- `name`: `string`",
    "- `address`: `AddressOut`",
    "",
    "### `AddressOut`",
    "- `city`: `string`",
  ].join("\n");

  const invalidRootSkill = [
    "# Segmented Demo API Skills",
    "",
    "## Skill Files",
    "",
    "### `groups/tournaments.SKILL.md`",
    "- Operations: `list_tournaments`",
    "",
    "### `groups/clubs.SKILL.md`",
    "- Operations: `list_clubs`",
  ].join("\n");

  try {
    assert.throws(
      () =>
        runCli(
          [
            "generate-segmented",
            "--input",
            path.join("test", "fixtures", "segmented-tags.openapi.json"),
            "--output-dir",
            outputDir,
          ],
          {
            mockResponses: [
              tournamentsSkill,
              clubsSkill,
              invalidRootSkill,
              invalidRootSkill,
              invalidRootSkill,
              invalidRootSkill,
            ],
          },
        ),
      /OUTPUT_INDEX_OPERATION_MISSING/,
    );

    assert.equal(existsSync(path.join(outputDir, "SKILL.md")), false);
    assert.equal(existsSync(path.join(outputDir, "groups", "clubs.SKILL.md")), false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
