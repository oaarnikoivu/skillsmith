import assert from "node:assert/strict";
import test from "node:test";
import { buildIR } from "../dist/ir/build-ir.js";

test("buildIR: minimal OpenAPI doc produces correct SpecIR shape", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Test API", version: "2.0.0" },
      servers: [{ url: "https://api.test.com" }],
      paths: {
        "/items": {
          get: {
            operationId: "list_items",
            summary: "List items",
            parameters: [
              { name: "limit", in: "query", required: false, schema: { type: "integer" } },
            ],
            responses: {
              200: { description: "OK" },
            },
          },
        },
      },
    },
  });

  assert.equal(ir.title, "Test API");
  assert.equal(ir.version, "2.0.0");
  assert.deepEqual(ir.servers, ["https://api.test.com"]);
  assert.equal(ir.operations.length, 1);

  const op = ir.operations[0];
  assert.equal(op.id, "list_items");
  assert.equal(op.method, "GET");
  assert.equal(op.path, "/items");
  assert.equal(op.parameters.length, 1);
  assert.equal(op.parameters[0].name, "limit");
  assert.equal(op.parameters[0].location, "query");
  assert.equal(op.parameters[0].required, false);
  assert.equal(op.responses.length, 1);
  assert.equal(op.responses[0].statusCode, "200");
});

test("buildIR: missing operationId generates fallback ID", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users/{userId}/posts": {
          get: {
            responses: { 200: { description: "OK" } },
          },
        },
      },
    },
  });

  assert.equal(ir.operations.length, 1);
  assert.equal(ir.operations[0].id, "get_users_userid_posts");
});

test("buildIR: multiple security schemes are normalized", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
          OAuth2: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: "https://auth.example.com/authorize",
                tokenUrl: "https://auth.example.com/token",
                scopes: { "read:items": "Read items" },
              },
            },
          },
        },
      },
    },
  });

  assert.equal(Object.keys(ir.securitySchemes).length, 3);
  assert.equal(ir.securitySchemes.BearerAuth.type, "http");
  assert.equal(ir.securitySchemes.BearerAuth.httpScheme, "bearer");
  assert.equal(ir.securitySchemes.ApiKeyAuth.type, "apiKey");
  assert.equal(ir.securitySchemes.ApiKeyAuth.in, "header");
  assert.equal(ir.securitySchemes.ApiKeyAuth.parameterName, "X-API-Key");
  assert.equal(ir.securitySchemes.OAuth2.type, "oauth2");
  assert.equal(ir.securitySchemes.OAuth2.oauthFlows.length, 1);
  assert.deepEqual(ir.securitySchemes.OAuth2.oauthFlows[0].scopes, ["read:items"]);
});

test("buildIR: empty paths produces empty operations array", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Empty", version: "0.0.1" },
      paths: {},
    },
  });

  assert.deepEqual(ir.operations, []);
});

test("buildIR: missing info defaults title and version", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      paths: {},
    },
  });

  assert.equal(ir.title, "Untitled API");
  assert.equal(ir.version, "0.0.0");
});

test("buildIR: operations sorted by path then method order", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/b": {
          post: { operationId: "b_post", responses: {} },
          get: { operationId: "b_get", responses: {} },
        },
        "/a": {
          get: { operationId: "a_get", responses: {} },
        },
      },
    },
  });

  const ids = ir.operations.map((op) => op.id);
  assert.deepEqual(ids, ["a_get", "b_get", "b_post"]);
});

test("buildIR: component schemas are normalized", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      components: {
        schemas: {
          UserOut: { type: "object", properties: { id: { type: "string" } } },
          AddressOut: { type: "object", properties: { city: { type: "string" } } },
        },
      },
    },
  });

  assert.deepEqual(Object.keys(ir.schemas), ["AddressOut", "UserOut"]);
});

test("buildIR: path-level parameters are merged with operation-level", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/items/{itemId}": {
          parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }],
          get: {
            operationId: "get_item",
            parameters: [
              { name: "fields", in: "query", required: false, schema: { type: "string" } },
            ],
            responses: { 200: { description: "OK" } },
          },
        },
      },
    },
  });

  const op = ir.operations[0];
  assert.equal(op.parameters.length, 2);
  const names = op.parameters.map((p) => p.name).sort();
  assert.deepEqual(names, ["fields", "itemId"]);
});

test("buildIR: global security is inherited by operations", () => {
  const ir = buildIR({
    sourcePath: "test.json",
    document: {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      security: [{ BearerAuth: [] }],
      paths: {
        "/items": {
          get: {
            operationId: "list_items",
            responses: { 200: { description: "OK" } },
          },
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer" },
        },
      },
    },
  });

  const op = ir.operations[0];
  assert.ok(op.auth);
  assert.equal(op.auth.inherited, true);
  assert.equal(op.auth.requirementSets.length, 1);
  assert.equal(op.auth.requirementSets[0].schemes[0].schemeName, "BearerAuth");
});
