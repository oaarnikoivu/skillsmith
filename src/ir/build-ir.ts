import type {
  HttpMethod,
  OperationIR,
  ParameterIR,
  RequestBodyIR,
  ResponseIR,
  SpecIR,
} from "@/ir/ir-types";
import type { JsonObject, NormalizedOpenApiDocumentEnvelope } from "@/types";

const METHOD_MAP: Record<string, HttpMethod> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
  trace: "TRACE",
};

const METHOD_ORDER: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueStringList(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getRefName(refValue: string): string {
  const hashIndex = refValue.lastIndexOf("/");
  if (hashIndex === -1 || hashIndex === refValue.length - 1) {
    return refValue;
  }
  return refValue.slice(hashIndex + 1);
}

function schemaSummary(schema: unknown): string {
  if (!isJsonObject(schema)) {
    return "unknown";
  }

  const refValue = asNonEmptyString(schema.$ref);
  if (refValue) {
    return getRefName(refValue);
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const hasNull = schema.anyOf.some((item) => isJsonObject(item) && item.type === "null");
    const variants = schema.anyOf
      .filter((item) => !(isJsonObject(item) && item.type === "null"))
      .map((item) => schemaSummary(item));
    const joined = uniqueStringList(variants).join(" | ") || "unknown";
    return hasNull ? `nullable ${joined}` : joined;
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return uniqueStringList(schema.oneOf.map((item) => schemaSummary(item))).join(" | ");
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return uniqueStringList(schema.allOf.map((item) => schemaSummary(item))).join(" & ");
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumValues = schema.enum.map((item) => String(item));
    return `enum(${enumValues.join(", ")})`;
  }

  const schemaType = asNonEmptyString(schema.type);
  const schemaFormat = asNonEmptyString(schema.format);

  if (schemaType === "array") {
    return `array<${schemaSummary(schema.items)}>`;
  }

  if (schemaType) {
    if (schemaType === "object" && isJsonObject(schema.properties)) {
      const propertyCount = Object.keys(schema.properties).length;
      return `object(${propertyCount} properties)`;
    }

    return schemaFormat ? `${schemaType}(${schemaFormat})` : schemaType;
  }

  return "unknown";
}

function enumValuesFromSchema(schema: unknown): string[] | undefined {
  if (!isJsonObject(schema)) {
    return undefined;
  }

  if (Array.isArray(schema.enum)) {
    const values = schema.enum.map((item) => String(item));
    return values.length > 0 ? uniqueStringList(values) : undefined;
  }

  if (Array.isArray(schema.anyOf)) {
    const nestedEnums = schema.anyOf.flatMap((item) => enumValuesFromSchema(item) ?? []);
    return nestedEnums.length > 0 ? uniqueStringList(nestedEnums) : undefined;
  }

  return undefined;
}

function defaultValueFromSchema(schema: unknown): unknown {
  if (!isJsonObject(schema)) {
    return undefined;
  }

  if ("default" in schema) {
    return schema.default;
  }

  if (Array.isArray(schema.anyOf)) {
    for (const item of schema.anyOf) {
      const nestedDefault = defaultValueFromSchema(item);
      if (nestedDefault !== undefined) {
        return nestedDefault;
      }
    }
  }

  return undefined;
}

function normalizeParameters(parametersNode: unknown): ParameterIR[] {
  if (!Array.isArray(parametersNode)) {
    return [];
  }

  const parameters: ParameterIR[] = [];
  for (const parameterCandidate of parametersNode) {
    if (!isJsonObject(parameterCandidate)) {
      continue;
    }

    const parameterName = asNonEmptyString(parameterCandidate.name);
    const parameterLocation = asNonEmptyString(parameterCandidate.in);
    if (!parameterName || !parameterLocation) {
      continue;
    }

    if (
      parameterLocation !== "path" &&
      parameterLocation !== "query" &&
      parameterLocation !== "header" &&
      parameterLocation !== "cookie"
    ) {
      continue;
    }

    const schemaNode = isJsonObject(parameterCandidate.schema)
      ? parameterCandidate.schema
      : undefined;
    const explicitDescription = asNonEmptyString(parameterCandidate.description);
    const schemaDescription = schemaNode ? asNonEmptyString(schemaNode.description) : undefined;

    parameters.push({
      name: parameterName,
      location: parameterLocation,
      required: parameterCandidate.required === true,
      schemaSummary: schemaSummary(schemaNode),
      description: explicitDescription ?? schemaDescription,
      defaultValue: defaultValueFromSchema(schemaNode),
      enumValues: enumValuesFromSchema(schemaNode),
    });
  }

  return parameters;
}

function mergeParameters(pathLevel: ParameterIR[], operationLevel: ParameterIR[]): ParameterIR[] {
  const byKey = new Map<string, ParameterIR>();

  for (const parameter of pathLevel) {
    const key = `${parameter.location}:${parameter.name}`;
    byKey.set(key, parameter);
  }

  for (const parameter of operationLevel) {
    const key = `${parameter.location}:${parameter.name}`;
    byKey.set(key, parameter);
  }

  return Array.from(byKey.values());
}

function responseSchemaSummary(responseCandidate: JsonObject): string | undefined {
  const content = responseCandidate.content;
  if (!isJsonObject(content)) {
    return undefined;
  }

  const jsonContent = content["application/json"];
  if (isJsonObject(jsonContent)) {
    return schemaSummary(jsonContent.schema);
  }

  for (const mediaTypeValue of Object.values(content)) {
    if (!isJsonObject(mediaTypeValue)) {
      continue;
    }
    if ("schema" in mediaTypeValue) {
      return schemaSummary(mediaTypeValue.schema);
    }
  }

  return undefined;
}

function normalizeResponses(responsesNode: unknown): ResponseIR[] {
  if (!isJsonObject(responsesNode)) {
    return [];
  }

  const responses: ResponseIR[] = [];
  for (const [statusCode, responseCandidate] of Object.entries(responsesNode)) {
    if (!isJsonObject(responseCandidate)) {
      continue;
    }

    responses.push({
      statusCode,
      description: asNonEmptyString(responseCandidate.description),
      schemaSummary: responseSchemaSummary(responseCandidate),
    });
  }

  return responses;
}

function normalizeRequestBody(requestBodyNode: unknown): RequestBodyIR | undefined {
  if (!isJsonObject(requestBodyNode)) {
    return undefined;
  }

  const contentNode = requestBodyNode.content;
  if (!isJsonObject(contentNode)) {
    return undefined;
  }

  const contentTypes = Object.keys(contentNode);
  let schemaSummaryValue: string | undefined;

  const jsonContentNode = contentNode["application/json"];
  if (isJsonObject(jsonContentNode)) {
    schemaSummaryValue = schemaSummary(jsonContentNode.schema);
  } else {
    for (const mediaTypeNode of Object.values(contentNode)) {
      if (!isJsonObject(mediaTypeNode)) {
        continue;
      }
      if ("schema" in mediaTypeNode) {
        schemaSummaryValue = schemaSummary(mediaTypeNode.schema);
        break;
      }
    }
  }

  return {
    required: requestBodyNode.required === true,
    contentTypes,
    schemaSummary: schemaSummaryValue,
  };
}

function fallbackOperationId(method: HttpMethod, path: string): string {
  const normalizedPath = path
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return `${method.toLowerCase()}_${normalizedPath || "root"}`;
}

function normalizeTags(tagsNode: unknown): string[] {
  if (!Array.isArray(tagsNode)) {
    return [];
  }

  return tagsNode
    .map((tagValue) => asNonEmptyString(tagValue))
    .filter((tagValue): tagValue is string => tagValue !== undefined);
}

function compareOperations(a: OperationIR, b: OperationIR): number {
  if (a.path !== b.path) {
    return a.path.localeCompare(b.path);
  }

  return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
}

function normalizeComponentSchemas(document: JsonObject): Record<string, unknown> {
  const componentsNode = isJsonObject(document.components) ? document.components : {};
  const schemasNode = isJsonObject(componentsNode.schemas) ? componentsNode.schemas : {};
  const schemas = Object.entries(schemasNode)
    .filter(([schemaName]) => schemaName.trim().length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  const result: Record<string, unknown> = {};
  for (const [schemaName, schemaDefinition] of schemas) {
    result[schemaName] = schemaDefinition;
  }

  return result;
}

export function buildIR({ document }: NormalizedOpenApiDocumentEnvelope): SpecIR {
  const info = isJsonObject(document.info) ? document.info : {};
  const paths = isJsonObject(document.paths) ? document.paths : {};
  const serversNode = Array.isArray(document.servers) ? document.servers : [];

  const title = asNonEmptyString(info.title) ?? "Untitled API";
  const version = asNonEmptyString(info.version) ?? "0.0.0";
  const servers = serversNode
    .filter((serverNode): serverNode is JsonObject => isJsonObject(serverNode))
    .map((serverNode) => asNonEmptyString(serverNode.url))
    .filter((url): url is string => url !== undefined);

  const operations: OperationIR[] = [];

  for (const [path, pathItemCandidate] of Object.entries(paths)) {
    if (!isJsonObject(pathItemCandidate)) {
      continue;
    }

    const pathParameters = normalizeParameters(pathItemCandidate.parameters);

    for (const [methodKey, methodValue] of Object.entries(METHOD_MAP)) {
      const operationCandidate = pathItemCandidate[methodKey];
      if (!isJsonObject(operationCandidate)) {
        continue;
      }

      const operationParameters = normalizeParameters(operationCandidate.parameters);
      const parameters = mergeParameters(pathParameters, operationParameters);
      const operationId =
        asNonEmptyString(operationCandidate.operationId) ?? fallbackOperationId(methodValue, path);

      operations.push({
        id: operationId,
        summary: asNonEmptyString(operationCandidate.summary),
        method: methodValue,
        path,
        tags: normalizeTags(operationCandidate.tags),
        parameters,
        requestBody: normalizeRequestBody(operationCandidate.requestBody),
        responses: normalizeResponses(operationCandidate.responses),
      });
    }
  }

  operations.sort(compareOperations);

  return {
    title,
    version,
    servers,
    operations,
    schemas: normalizeComponentSchemas(document),
  };
}
