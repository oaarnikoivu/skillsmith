import { extname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { OpenApiDocumentEnvelope } from "@/types";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(content: string): unknown {
  return JSON.parse(content) as unknown;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extensionHint(source: string): string {
  if (isHttpUrl(source)) {
    return extname(new URL(source).pathname).toLowerCase();
  }

  return extname(source).toLowerCase();
}

function parseOpenApiContent(
  sourceContent: string,
  sourcePath: string,
  contentType?: string,
): unknown {
  const fileExtension = extensionHint(sourcePath);
  const contentTypeLower = contentType?.toLowerCase();

  if (contentTypeLower?.includes("json") || fileExtension === ".json") {
    return parseJson(sourceContent);
  }

  if (
    contentTypeLower?.includes("yaml") ||
    contentTypeLower?.includes("yml") ||
    fileExtension === ".yaml" ||
    fileExtension === ".yml"
  ) {
    return parseYaml(sourceContent);
  }

  try {
    return parseJson(sourceContent);
  } catch {
    return parseYaml(sourceContent);
  }
}

export async function loadSpec(inputPath: string): Promise<OpenApiDocumentEnvelope> {
  const sourceIsUrl = isHttpUrl(inputPath);
  let sourceContent: string;
  let sourcePath: string;
  let contentType: string | undefined;

  if (sourceIsUrl) {
    let response: Response;
    try {
      response = await fetch(inputPath, {
        headers: {
          accept: "application/json, application/yaml, text/yaml, */*",
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to fetch OpenAPI URL "${inputPath}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenAPI URL "${inputPath}": HTTP ${response.status} ${response.statusText}`,
      );
    }

    sourceContent = await response.text();
    sourcePath = response.url || inputPath;
    contentType = response.headers.get("content-type") ?? undefined;
  } else {
    sourceContent = await readFile(inputPath, "utf8");
    sourcePath = resolve(inputPath);
  }

  let parsed: unknown;

  try {
    parsed = parseOpenApiContent(sourceContent, sourcePath, contentType);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse OpenAPI source "${inputPath}": ${reason}`, {
      cause: error,
    });
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`OpenAPI source "${inputPath}" must contain a top-level object.`);
  }

  return {
    sourcePath,
    document: parsed,
  };
}
