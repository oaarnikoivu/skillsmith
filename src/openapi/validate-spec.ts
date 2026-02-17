import type {
  Diagnostic,
  JsonObject,
  NormalizedOpenApiDocumentEnvelope,
  ValidationReport,
} from "@/types";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

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

function error(message: string, code: string): Diagnostic {
  return { level: "error", message, code };
}

function warning(message: string, code: string): Diagnostic {
  return { level: "warning", message, code };
}

export function validateSpec({ document }: NormalizedOpenApiDocumentEnvelope): ValidationReport {
  const diagnostics: Diagnostic[] = [];

  const openApiVersion = asNonEmptyString(document.openapi);
  if (!openApiVersion) {
    diagnostics.push(
      error('Missing required top-level "openapi" string.', "OPENAPI_MISSING_VERSION"),
    );
  } else if (!openApiVersion.startsWith("3.")) {
    diagnostics.push(
      error(
        `Unsupported OpenAPI version "${openApiVersion}". Only OpenAPI 3.x is supported.`,
        "OPENAPI_UNSUPPORTED_VERSION",
      ),
    );
  }

  const info = document.info;
  if (!isJsonObject(info)) {
    diagnostics.push(error('Missing required top-level "info" object.', "OPENAPI_MISSING_INFO"));
  } else {
    const title = asNonEmptyString(info.title);
    const version = asNonEmptyString(info.version);

    if (!title) {
      diagnostics.push(
        error('Missing required "info.title" string.', "OPENAPI_MISSING_INFO_TITLE"),
      );
    }
    if (!version) {
      diagnostics.push(
        error('Missing required "info.version" string.', "OPENAPI_MISSING_INFO_VERSION"),
      );
    }
  }

  const paths = document.paths;
  if (!isJsonObject(paths)) {
    diagnostics.push(error('Missing required top-level "paths" object.', "OPENAPI_MISSING_PATHS"));
  } else {
    const pathEntries = Object.entries(paths);
    if (pathEntries.length === 0) {
      diagnostics.push(warning('The "paths" object is empty.', "OPENAPI_EMPTY_PATHS"));
    }

    for (const [pathKey, pathItem] of pathEntries) {
      if (!pathKey.startsWith("/")) {
        diagnostics.push(
          warning(`Path key "${pathKey}" should start with "/".`, "OPENAPI_PATH_FORMAT_WARNING"),
        );
      }

      if (!isJsonObject(pathItem)) {
        diagnostics.push(
          error(`Path item at "${pathKey}" must be an object.`, "OPENAPI_PATH_ITEM_INVALID"),
        );
        continue;
      }

      const operationEntries = Object.entries(pathItem).filter(([operationKey]) =>
        HTTP_METHODS.has(operationKey),
      );
      if (operationEntries.length === 0) {
        diagnostics.push(
          warning(`Path "${pathKey}" has no HTTP operations.`, "OPENAPI_PATH_NO_OPERATIONS"),
        );
      }

      for (const [method, operation] of operationEntries) {
        if (!isJsonObject(operation)) {
          diagnostics.push(
            error(
              `Operation "${method.toUpperCase()} ${pathKey}" must be an object.`,
              "OPENAPI_OPERATION_INVALID",
            ),
          );
          continue;
        }

        const operationId = asNonEmptyString(operation.operationId);
        if (!operationId) {
          diagnostics.push(
            warning(
              `Operation "${method.toUpperCase()} ${pathKey}" is missing operationId.`,
              "OPENAPI_MISSING_OPERATION_ID",
            ),
          );
        }
      }
    }
  }

  const valid = diagnostics.every((diagnostic) => diagnostic.level !== "error");
  return { valid, diagnostics };
}
