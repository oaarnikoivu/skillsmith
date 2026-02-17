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

function parseOpenApiContent(fileContent: string, inputPath: string): unknown {
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

export async function loadSpec(inputPath: string): Promise<OpenApiDocumentEnvelope> {
  const fileContent = await readFile(inputPath, "utf8");
  let parsed: unknown;

  try {
    parsed = parseOpenApiContent(fileContent, inputPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse OpenAPI file "${inputPath}": ${reason}`, {
      cause: error,
    });
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`OpenAPI file "${inputPath}" must contain a top-level object.`);
  }

  return {
    sourcePath: resolve(inputPath),
    document: parsed,
  };
}
