import type {
  HttpMethod,
  OperationIR,
  OperationAuthIR,
  ParameterIR,
  RequestBodyIR,
  ResponseIR,
  SecurityFlowIR,
  SecurityRequirementSetIR,
  SecuritySchemeIR,
  SecuritySchemeType,
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

function normalizeSecuritySchemeType(value: unknown): SecuritySchemeType {
  const candidate = asNonEmptyString(value);
  if (
    candidate === "apiKey" ||
    candidate === "http" ||
    candidate === "oauth2" ||
    candidate === "openIdConnect" ||
    candidate === "mutualTLS"
  ) {
    return candidate;
  }

  return "unknown";
}

function normalizeScopes(scopesNode: unknown): string[] {
  if (!isJsonObject(scopesNode)) {
    return [];
  }

  return Object.keys(scopesNode)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function normalizeOauthFlows(flowsNode: unknown): SecurityFlowIR[] | undefined {
  if (!isJsonObject(flowsNode)) {
    return undefined;
  }

  const flows = Object.entries(flowsNode)
    .filter(([, flowNode]) => isJsonObject(flowNode))
    .map(([flowName, flowNode]) => {
      const flow = flowNode as JsonObject;
      return {
        flow: flowName,
        authorizationUrl: asNonEmptyString(flow.authorizationUrl),
        tokenUrl: asNonEmptyString(flow.tokenUrl),
        refreshUrl: asNonEmptyString(flow.refreshUrl),
        scopes: normalizeScopes(flow.scopes),
      } satisfies SecurityFlowIR;
    })
    .sort((left, right) => left.flow.localeCompare(right.flow));

  return flows.length > 0 ? flows : undefined;
}

function normalizeSecuritySchemes(document: JsonObject): Record<string, SecuritySchemeIR> {
  const componentsNode = isJsonObject(document.components) ? document.components : {};
  const securitySchemesNode = isJsonObject(componentsNode.securitySchemes)
    ? componentsNode.securitySchemes
    : {};

  const result: Record<string, SecuritySchemeIR> = {};
  const entries = Object.entries(securitySchemesNode).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [schemeName, schemeCandidate] of entries) {
    if (!isJsonObject(schemeCandidate)) {
      continue;
    }

    const schemeType = normalizeSecuritySchemeType(schemeCandidate.type);
    const normalized: SecuritySchemeIR = {
      name: schemeName,
      type: schemeType,
      description: asNonEmptyString(schemeCandidate.description),
    };

    if (schemeType === "apiKey") {
      const inValue = asNonEmptyString(schemeCandidate.in);
      if (inValue === "query" || inValue === "header" || inValue === "cookie") {
        normalized.in = inValue;
      }
      normalized.parameterName = asNonEmptyString(schemeCandidate.name);
    } else if (schemeType === "http") {
      normalized.httpScheme = asNonEmptyString(schemeCandidate.scheme);
      normalized.bearerFormat = asNonEmptyString(schemeCandidate.bearerFormat);
    } else if (schemeType === "oauth2") {
      normalized.oauthFlows = normalizeOauthFlows(schemeCandidate.flows);
    } else if (schemeType === "openIdConnect") {
      normalized.openIdConnectUrl = asNonEmptyString(schemeCandidate.openIdConnectUrl);
    }

    result[schemeName] = normalized;
  }

  return result;
}

function normalizeSecurityRequirementSet(
  requirementNode: unknown,
): SecurityRequirementSetIR | undefined {
  if (!isJsonObject(requirementNode)) {
    return undefined;
  }

  const schemes = Object.entries(requirementNode)
    .map(([schemeName, scopesNode]) => ({
      schemeName,
      scopes: Array.isArray(scopesNode)
        ? scopesNode
            .map((scope) => asNonEmptyString(scope))
            .filter((scope): scope is string => scope !== undefined)
            .sort((left, right) => left.localeCompare(right))
        : [],
    }))
    .filter((scheme) => scheme.schemeName.trim().length > 0)
    .sort((left, right) => left.schemeName.localeCompare(right.schemeName));

  if (schemes.length === 0) {
    return undefined;
  }

  return { schemes };
}

function normalizeOperationAuth(
  operationNode: JsonObject,
  globalSecurityNode: unknown,
): OperationAuthIR | undefined {
  const hasOperationSecurity = "security" in operationNode;
  const effectiveSecurityNode = hasOperationSecurity ? operationNode.security : globalSecurityNode;
  if (!Array.isArray(effectiveSecurityNode)) {
    return undefined;
  }

  let optional = false;
  const requirementSets: SecurityRequirementSetIR[] = [];
  const seen = new Set<string>();

  for (const requirementNode of effectiveSecurityNode) {
    if (!isJsonObject(requirementNode)) {
      continue;
    }

    if (Object.keys(requirementNode).length === 0) {
      optional = true;
      continue;
    }

    const requirementSet = normalizeSecurityRequirementSet(requirementNode);
    if (!requirementSet) {
      continue;
    }

    const dedupeKey = JSON.stringify(requirementSet);
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      requirementSets.push(requirementSet);
    }
  }

  if (requirementSets.length === 0 && !optional) {
    return undefined;
  }

  return {
    inherited: !hasOperationSecurity,
    optional,
    requirementSets,
  };
}

export function buildIR({ document }: NormalizedOpenApiDocumentEnvelope): SpecIR {
  const info = isJsonObject(document.info) ? document.info : {};
  const paths = isJsonObject(document.paths) ? document.paths : {};
  const serversNode = Array.isArray(document.servers) ? document.servers : [];
  const globalSecurityNode = document.security;

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
        auth: normalizeOperationAuth(operationCandidate, globalSecurityNode),
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
    securitySchemes: normalizeSecuritySchemes(document),
    operations,
    schemas: normalizeComponentSchemas(document),
  };
}
