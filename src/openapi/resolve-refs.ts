import $RefParser from "@apidevtools/json-schema-ref-parser";
import type { JsonObject } from "@/types";
import type { OpenApiDocumentEnvelope, ResolvedOpenApiDocumentEnvelope } from "@/types";

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function resolveRefs(
  spec: OpenApiDocumentEnvelope,
): Promise<ResolvedOpenApiDocumentEnvelope> {
  const bundled = await $RefParser.bundle(spec.sourcePath, spec.document, {
    resolve: {
      http: false,
    },
  });

  if (!isJsonObject(bundled)) {
    throw new Error(`Bundled OpenAPI document from "${spec.sourcePath}" is not an object.`);
  }

  return {
    sourcePath: spec.sourcePath,
    document: bundled,
  };
}
