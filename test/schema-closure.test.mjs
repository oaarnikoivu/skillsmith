import assert from "node:assert/strict";
import test from "node:test";
import { requiredSchemasForOperations } from "../dist/segment/schema-closure.js";

function makeOperation(overrides = {}) {
  return {
    id: "test_op",
    method: "GET",
    path: "/test",
    tags: [],
    parameters: [],
    responses: [],
    ...overrides,
  };
}

test("schema-closure: linear chain A -> B -> C includes all three", () => {
  const schemas = {
    A: { type: "object", properties: { b: { $ref: "#/components/schemas/B" } } },
    B: { type: "object", properties: { c: { $ref: "#/components/schemas/C" } } },
    C: { type: "object", properties: { id: { type: "string" } } },
  };

  const operations = [
    makeOperation({
      responses: [{ statusCode: "200", schemaSummary: "A" }],
    }),
  ];

  const required = requiredSchemasForOperations(operations, schemas);
  assert.ok(required.has("A"));
  assert.ok(required.has("B"));
  assert.ok(required.has("C"));
  assert.equal(required.size, 3);
});

test("schema-closure: circular ref A -> B -> A terminates with both required", () => {
  const schemas = {
    A: { type: "object", properties: { b: { $ref: "#/components/schemas/B" } } },
    B: { type: "object", properties: { a: { $ref: "#/components/schemas/A" } } },
  };

  const operations = [
    makeOperation({
      responses: [{ statusCode: "200", schemaSummary: "A" }],
    }),
  ];

  const required = requiredSchemasForOperations(operations, schemas);
  assert.ok(required.has("A"));
  assert.ok(required.has("B"));
  assert.equal(required.size, 2);
});

test("schema-closure: unreferenced schema is not included", () => {
  const schemas = {
    Used: { type: "object", properties: { id: { type: "string" } } },
    Unused: { type: "object", properties: { name: { type: "string" } } },
  };

  const operations = [
    makeOperation({
      responses: [{ statusCode: "200", schemaSummary: "Used" }],
    }),
  ];

  const required = requiredSchemasForOperations(operations, schemas);
  assert.ok(required.has("Used"));
  assert.ok(!required.has("Unused"));
  assert.equal(required.size, 1);
});

test("schema-closure: schema referenced in parameter schemaSummary is included", () => {
  const schemas = {
    FilterInput: { type: "object", properties: { field: { type: "string" } } },
  };

  const operations = [
    makeOperation({
      parameters: [
        { name: "filter", location: "query", required: false, schemaSummary: "FilterInput" },
      ],
    }),
  ];

  const required = requiredSchemasForOperations(operations, schemas);
  assert.ok(required.has("FilterInput"));
  assert.equal(required.size, 1);
});

test("schema-closure: schema referenced in requestBody schemaSummary is included", () => {
  const schemas = {
    CreateInput: { type: "object", properties: { name: { type: "string" } } },
  };

  const operations = [
    makeOperation({
      requestBody: { required: true, contentTypes: ["application/json"], schemaSummary: "CreateInput" },
    }),
  ];

  const required = requiredSchemasForOperations(operations, schemas);
  assert.ok(required.has("CreateInput"));
  assert.equal(required.size, 1);
});

test("schema-closure: no operations yields empty set", () => {
  const schemas = {
    Orphan: { type: "object", properties: { id: { type: "string" } } },
  };

  const required = requiredSchemasForOperations([], schemas);
  assert.equal(required.size, 0);
});

test("schema-closure: missing schema in chain is handled gracefully", () => {
  const schemas = {
    A: { type: "object", properties: { b: { $ref: "#/components/schemas/Missing" } } },
  };

  const operations = [
    makeOperation({
      responses: [{ statusCode: "200", schemaSummary: "A" }],
    }),
  ];

  const required = requiredSchemasForOperations(operations, schemas);
  assert.ok(required.has("A"));
  assert.equal(required.size, 1);
});

test("schema-closure: array items with $ref are followed", () => {
  const schemas = {
    ListResponse: {
      type: "object",
      properties: {
        items: { type: "array", items: { $ref: "#/components/schemas/ItemOut" } },
      },
    },
    ItemOut: { type: "object", properties: { id: { type: "string" } } },
  };

  const operations = [
    makeOperation({
      responses: [{ statusCode: "200", schemaSummary: "ListResponse" }],
    }),
  ];

  const required = requiredSchemasForOperations(operations, schemas);
  assert.ok(required.has("ListResponse"));
  assert.ok(required.has("ItemOut"));
  assert.equal(required.size, 2);
});
