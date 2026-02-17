import type { JsonObject } from "@/types";
import type { NormalizedOpenApiDocumentEnvelope, ResolvedOpenApiDocumentEnvelope } from "@/types";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNullVariant(anyOfNode: unknown): boolean {
  if (!Array.isArray(anyOfNode)) {
    return false;
  }

  return anyOfNode.some((variant) => isJsonObject(variant) && variant.type === "null");
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined) {
    return [];
  }
  return [value];
}

function normalizeSchemaNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => normalizeSchemaNode(item));
  }

  if (!isJsonObject(node)) {
    return node;
  }

  const normalized: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    normalized[key] = normalizeSchemaNode(value);
  }

  if (Array.isArray(normalized.type)) {
    const typeValues = normalized.type.filter((item): item is string => typeof item === "string");
    const nonNullTypes = typeValues.filter((item) => item !== "null");
    const includesNull = typeValues.includes("null");

    if (includesNull) {
      if (nonNullTypes.length === 1) {
        normalized.type = nonNullTypes[0];
      } else {
        normalized.anyOf = [
          ...(Array.isArray(normalized.anyOf) ? normalized.anyOf : []),
          ...nonNullTypes.map((typeValue) => ({ type: typeValue })),
        ];
        delete normalized.type;
      }
    }
  }

  if (normalized.nullable === true) {
    delete normalized.nullable;

    if (Array.isArray(normalized.anyOf)) {
      if (!hasNullVariant(normalized.anyOf)) {
        normalized.anyOf = [...normalized.anyOf, { type: "null" }];
      }
    } else {
      const schemaType = normalized.type;
      if (typeof schemaType === "string" && schemaType !== "null") {
        const baseSchema = { ...normalized };
        delete baseSchema.type;
        normalized.anyOf = [{ ...baseSchema, type: schemaType }, { type: "null" }];
        delete normalized.type;
      }
    }
  }

  if (Array.isArray(normalized.anyOf) && !hasNullVariant(normalized.anyOf)) {
    if (normalized.type === "null") {
      normalized.anyOf = [...normalized.anyOf, { type: "null" }];
      delete normalized.type;
    }
  }

  return normalized;
}

function normalizeOperationNode(operationNode: JsonObject): JsonObject {
  const normalizedOperation = { ...operationNode };
  normalizedOperation.parameters = toArray(operationNode.parameters);

  if (isJsonObject(operationNode.responses)) {
    const normalizedResponses: JsonObject = {};
    for (const [statusCode, responseNode] of Object.entries(operationNode.responses)) {
      if (!isJsonObject(responseNode)) {
        normalizedResponses[statusCode] = responseNode;
        continue;
      }

      const normalizedResponse = { ...responseNode };
      if (isJsonObject(responseNode.content)) {
        const normalizedContent: JsonObject = {};
        for (const [contentType, mediaTypeNode] of Object.entries(responseNode.content)) {
          if (!isJsonObject(mediaTypeNode)) {
            normalizedContent[contentType] = mediaTypeNode;
            continue;
          }
          const normalizedMediaType = { ...mediaTypeNode };
          if ("schema" in mediaTypeNode) {
            normalizedMediaType.schema = normalizeSchemaNode(mediaTypeNode.schema);
          }
          normalizedContent[contentType] = normalizedMediaType;
        }
        normalizedResponse.content = normalizedContent;
      }

      normalizedResponses[statusCode] = normalizedResponse;
    }

    normalizedOperation.responses = normalizedResponses;
  }

  if (isJsonObject(operationNode.requestBody)) {
    const normalizedRequestBody = { ...operationNode.requestBody };
    if (isJsonObject(operationNode.requestBody.content)) {
      const normalizedRequestContent: JsonObject = {};
      for (const [contentType, mediaTypeNode] of Object.entries(
        operationNode.requestBody.content,
      )) {
        if (!isJsonObject(mediaTypeNode)) {
          normalizedRequestContent[contentType] = mediaTypeNode;
          continue;
        }
        const normalizedMediaType = { ...mediaTypeNode };
        if ("schema" in mediaTypeNode) {
          normalizedMediaType.schema = normalizeSchemaNode(mediaTypeNode.schema);
        }
        normalizedRequestContent[contentType] = normalizedMediaType;
      }
      normalizedRequestBody.content = normalizedRequestContent;
    }
    normalizedOperation.requestBody = normalizedRequestBody;
  }

  return normalizedOperation;
}

export function normalizeSpec(
  spec: ResolvedOpenApiDocumentEnvelope,
): NormalizedOpenApiDocumentEnvelope {
  const normalizedDocument = normalizeSchemaNode(spec.document);
  if (!isJsonObject(normalizedDocument)) {
    throw new Error(`Normalized OpenAPI document from "${spec.sourcePath}" is not an object.`);
  }

  if (isJsonObject(normalizedDocument.paths)) {
    const normalizedPaths: JsonObject = {};
    for (const [pathKey, pathItemNode] of Object.entries(normalizedDocument.paths)) {
      if (!isJsonObject(pathItemNode)) {
        normalizedPaths[pathKey] = pathItemNode;
        continue;
      }

      const normalizedPathItem = { ...pathItemNode };
      normalizedPathItem.parameters = toArray(pathItemNode.parameters);

      for (const method of HTTP_METHODS) {
        const operationNode = normalizedPathItem[method];
        if (!isJsonObject(operationNode)) {
          continue;
        }
        normalizedPathItem[method] = normalizeOperationNode(operationNode);
      }

      normalizedPaths[pathKey] = normalizedPathItem;
    }
    normalizedDocument.paths = normalizedPaths;
  }

  return {
    sourcePath: spec.sourcePath,
    document: normalizedDocument,
  };
}
