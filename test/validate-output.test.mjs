import assert from "node:assert/strict";
import test from "node:test";
import { validateOutput } from "../dist/validate/validate-output.js";

function makeSpecIR(overrides = {}) {
  return {
    title: "Test API",
    version: "1.0.0",
    servers: ["https://api.test.com"],
    securitySchemes: {},
    operations: [
      {
        id: "list_items",
        method: "GET",
        path: "/items",
        tags: [],
        parameters: [
          { name: "limit", location: "query", required: true, schemaSummary: "integer" },
        ],
        responses: [{ statusCode: "200", description: "OK" }],
      },
    ],
    schemas: {},
    ...overrides,
  };
}

function validMarkdown() {
  return [
    "# Test API Skill",
    "",
    "## Operations",
    "",
    "### `list_items`",
    "Method: `GET`",
    "Path: `/items`",
    "Required parameter: `limit`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.test.com/items?limit=10"',
    "```",
  ].join("\n");
}

test("validateOutput: valid markdown produces zero diagnostics", () => {
  const diagnostics = validateOutput(validMarkdown(), makeSpecIR());
  const errors = diagnostics.filter((d) => d.level === "error");
  assert.equal(errors.length, 0);
});

test("validateOutput: empty markdown produces OUTPUT_EMPTY", () => {
  const diagnostics = validateOutput("", makeSpecIR());
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_EMPTY"));
});

test("validateOutput: missing operation produces OUTPUT_OPERATION_MISSING", () => {
  const markdown = [
    "# Test API Skill",
    "",
    "## Operations",
    "",
    "### `wrong_operation`",
    "Some content",
  ].join("\n");

  const diagnostics = validateOutput(markdown, makeSpecIR());
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_OPERATION_MISSING"));
});

test("validateOutput: missing required param produces OUTPUT_REQUIRED_PARAM_MISSING", () => {
  const markdown = [
    "# Test API Skill",
    "",
    "## Operations",
    "",
    "### `list_items`",
    "Method: `GET`",
    "Path: `/items`",
    "",
    "Example request:",
    "```bash",
    'curl "https://api.test.com/items"',
    "```",
  ].join("\n");

  const diagnostics = validateOutput(markdown, makeSpecIR());
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_REQUIRED_PARAM_MISSING"));
});

test("validateOutput: missing example produces OUTPUT_OPERATION_EXAMPLE_MISSING", () => {
  const markdown = [
    "# Test API Skill",
    "",
    "## Operations",
    "",
    "### `list_items`",
    "Method: `GET`",
    "Path: `/items`",
    "Required parameter: `limit`",
  ].join("\n");

  const diagnostics = validateOutput(markdown, makeSpecIR());
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_OPERATION_EXAMPLE_MISSING"));
});

test("validateOutput: missing auth section produces OUTPUT_MISSING_AUTHENTICATION_SECTION", () => {
  const specIR = makeSpecIR({
    operations: [
      {
        id: "get_secure",
        method: "GET",
        path: "/secure",
        tags: [],
        parameters: [],
        responses: [{ statusCode: "200", description: "OK" }],
        auth: {
          inherited: true,
          optional: false,
          requirementSets: [{ schemes: [{ schemeName: "BearerAuth", scopes: [] }] }],
        },
      },
    ],
  });

  const markdown = [
    "# Test API Skill",
    "",
    "## Operations",
    "",
    "### `get_secure`",
    "Method: `GET`",
    "Auth: `BearerAuth`",
    "",
    "Example request:",
    '```bash\ncurl "https://api.test.com/secure"\n```',
  ].join("\n");

  const diagnostics = validateOutput(markdown, specIR);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_MISSING_AUTHENTICATION_SECTION"));
});

test("validateOutput: missing schemas section produces OUTPUT_MISSING_SCHEMAS_SECTION", () => {
  const specIR = makeSpecIR({
    operations: [
      {
        id: "list_items",
        method: "GET",
        path: "/items",
        tags: [],
        parameters: [],
        responses: [{ statusCode: "200", description: "OK", schemaSummary: "ItemOut" }],
      },
    ],
    schemas: {
      ItemOut: { type: "object", properties: { id: { type: "string" } } },
    },
  });

  const markdown = [
    "# Test API Skill",
    "",
    "## Operations",
    "",
    "### `list_items`",
    "Method: `GET`",
    "",
    "Example request:",
    '```bash\ncurl "https://api.test.com/items"\n```',
  ].join("\n");

  const diagnostics = validateOutput(markdown, specIR);
  assert.ok(diagnostics.some((d) => d.code === "OUTPUT_MISSING_SCHEMAS_SECTION"));
});

test("validateOutput: valid markdown with schemas passes", () => {
  const specIR = makeSpecIR({
    operations: [
      {
        id: "list_items",
        method: "GET",
        path: "/items",
        tags: [],
        parameters: [],
        responses: [{ statusCode: "200", description: "OK", schemaSummary: "ItemOut" }],
      },
    ],
    schemas: {
      ItemOut: { type: "object", properties: { id: { type: "string" } } },
    },
  });

  const markdown = [
    "# Test API Skill",
    "",
    "## Operations",
    "",
    "### `list_items`",
    "Method: `GET`",
    "",
    "Example request:",
    '```bash\ncurl "https://api.test.com/items"\n```',
    "",
    "## Schemas",
    "",
    "### `ItemOut`",
    "- `id`: `string`",
  ].join("\n");

  const diagnostics = validateOutput(markdown, specIR);
  const errors = diagnostics.filter((d) => d.level === "error");
  assert.equal(errors.length, 0);
});
