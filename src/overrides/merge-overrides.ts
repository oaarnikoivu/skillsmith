import { extname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { OperationIR, ParameterIR, RequestBodyIR, ResponseIR, SpecIR } from "@/ir/ir-types";
import type { JsonObject } from "@/types";

type OperationOverride = {
  id?: string;
  summary?: string;
  parameters?: ParameterIR[];
  requestBody?: RequestBodyIR;
  responses?: ResponseIR[];
};

type OverridesFile = {
  title?: string;
  version?: string;
  servers?: string[];
  operations?: Record<string, OperationOverride>;
};

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

function parseJson(content: string): unknown {
  return JSON.parse(content) as unknown;
}

function parseOverridesContent(fileContent: string, inputPath: string): unknown {
  const fileExtension = extname(inputPath).toLowerCase();

  if (fileExtension === ".json") {
    return parseJson(fileContent);
  }

  if (fileExtension === ".yaml" || fileExtension === ".yml") {
    return parseYaml(fileContent);
  }

  try {
    return parseJson(fileContent);
  } catch {
    return parseYaml(fileContent);
  }
}

function normalizeParameterOverride(parameterCandidate: unknown): ParameterIR | undefined {
  if (!isJsonObject(parameterCandidate)) {
    return undefined;
  }

  const name = asNonEmptyString(parameterCandidate.name);
  const location = asNonEmptyString(parameterCandidate.location);
  const required = parameterCandidate.required;
  const schemaSummary = asNonEmptyString(parameterCandidate.schemaSummary);

  if (
    !name ||
    !location ||
    (location !== "path" &&
      location !== "query" &&
      location !== "header" &&
      location !== "cookie") ||
    typeof required !== "boolean" ||
    !schemaSummary
  ) {
    return undefined;
  }

  const enumValues = Array.isArray(parameterCandidate.enumValues)
    ? parameterCandidate.enumValues.map((value) => String(value))
    : undefined;

  return {
    name,
    location,
    required,
    schemaSummary,
    description: asNonEmptyString(parameterCandidate.description),
    defaultValue: parameterCandidate.defaultValue,
    enumValues,
  };
}

function normalizeResponseOverride(responseCandidate: unknown): ResponseIR | undefined {
  if (!isJsonObject(responseCandidate)) {
    return undefined;
  }

  const statusCode = asNonEmptyString(responseCandidate.statusCode);
  if (!statusCode) {
    return undefined;
  }

  return {
    statusCode,
    description: asNonEmptyString(responseCandidate.description),
    schemaSummary: asNonEmptyString(responseCandidate.schemaSummary),
  };
}

function normalizeRequestBodyOverride(requestBodyCandidate: unknown): RequestBodyIR | undefined {
  if (!isJsonObject(requestBodyCandidate)) {
    return undefined;
  }

  if (typeof requestBodyCandidate.required !== "boolean") {
    return undefined;
  }

  const contentTypes = Array.isArray(requestBodyCandidate.contentTypes)
    ? requestBodyCandidate.contentTypes
        .map((contentType) => asNonEmptyString(contentType))
        .filter((contentType): contentType is string => contentType !== undefined)
    : [];

  return {
    required: requestBodyCandidate.required,
    contentTypes,
    schemaSummary: asNonEmptyString(requestBodyCandidate.schemaSummary),
  };
}

function normalizeOperationOverride(operationCandidate: unknown): OperationOverride | undefined {
  if (!isJsonObject(operationCandidate)) {
    return undefined;
  }

  const parameters = Array.isArray(operationCandidate.parameters)
    ? operationCandidate.parameters
        .map((parameter) => normalizeParameterOverride(parameter))
        .filter((parameter): parameter is ParameterIR => parameter !== undefined)
    : undefined;

  const responses = Array.isArray(operationCandidate.responses)
    ? operationCandidate.responses
        .map((response) => normalizeResponseOverride(response))
        .filter((response): response is ResponseIR => response !== undefined)
    : undefined;

  return {
    id: asNonEmptyString(operationCandidate.id),
    summary: asNonEmptyString(operationCandidate.summary),
    parameters,
    requestBody: normalizeRequestBodyOverride(operationCandidate.requestBody),
    responses,
  };
}

function normalizeOverridesFile(raw: unknown, sourcePath: string): OverridesFile {
  if (!isJsonObject(raw)) {
    throw new Error(`Overrides file "${sourcePath}" must contain a top-level object.`);
  }

  let operations: Record<string, OperationOverride> | undefined;
  if ("operations" in raw && raw.operations !== undefined) {
    if (!isJsonObject(raw.operations)) {
      throw new Error(`"operations" in overrides file "${sourcePath}" must be an object.`);
    }

    const mappedOperations: Record<string, OperationOverride> = {};
    for (const [operationId, operationOverrideCandidate] of Object.entries(raw.operations)) {
      const normalized = normalizeOperationOverride(operationOverrideCandidate);
      if (normalized) {
        mappedOperations[operationId] = normalized;
      }
    }
    operations = mappedOperations;
  }

  const servers = Array.isArray(raw.servers)
    ? raw.servers
        .map((serverValue) => asNonEmptyString(serverValue))
        .filter((serverValue): serverValue is string => serverValue !== undefined)
    : undefined;

  return {
    title: asNonEmptyString(raw.title),
    version: asNonEmptyString(raw.version),
    servers,
    operations,
  };
}

function applyOperationOverride(
  operation: OperationIR,
  override: OperationOverride | undefined,
): OperationIR {
  if (!override) {
    return operation;
  }

  return {
    ...operation,
    id: override.id ?? operation.id,
    summary: override.summary ?? operation.summary,
    parameters: override.parameters ?? operation.parameters,
    requestBody: override.requestBody ?? operation.requestBody,
    responses: override.responses ?? operation.responses,
  };
}

export async function mergeOverrides(specIR: SpecIR, overridesPath?: string): Promise<SpecIR> {
  if (!overridesPath) {
    return specIR;
  }

  const absolutePath = resolve(overridesPath);
  const fileContent = await readFile(absolutePath, "utf8");

  let parsed: unknown;
  try {
    parsed = parseOverridesContent(fileContent, absolutePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse overrides file "${absolutePath}": ${reason}`, {
      cause: error,
    });
  }

  const overrides = normalizeOverridesFile(parsed, absolutePath);

  return {
    title: overrides.title ?? specIR.title,
    version: overrides.version ?? specIR.version,
    servers: overrides.servers ?? specIR.servers,
    securitySchemes: specIR.securitySchemes,
    operations: specIR.operations.map((operation) =>
      applyOperationOverride(operation, overrides.operations?.[operation.id]),
    ),
    schemas: specIR.schemas,
  };
}
