import type { OperationIR, SecuritySchemeIR, SpecIR } from "@/ir/ir-types";

export type SegmentSourceKind = "tag" | "path";

export interface SkillSegment {
  id: string;
  title: string;
  sourceKind: SegmentSourceKind;
  sourceValue: string;
  fileName: string;
  operations: OperationIR[];
  schemas: Record<string, unknown>;
}

export interface SegmentPlan {
  apiSlug: string;
  segments: SkillSegment[];
}

export interface SegmentManifest {
  title: string;
  sourceKind: SegmentSourceKind;
  sourceValue: string;
  filePath: string;
  operationIds: string[];
}

export interface SkillIndexIR {
  title: string;
  version: string;
  servers: string[];
  segments: SegmentManifest[];
}

function requiredSecuritySchemeNames(operations: readonly OperationIR[]): Set<string> {
  const names = new Set<string>();

  for (const operation of operations) {
    const requirementSets = operation.auth?.requirementSets ?? [];
    for (const requirementSet of requirementSets) {
      for (const scheme of requirementSet.schemes) {
        names.add(scheme.schemeName);
      }
    }
  }

  return names;
}

export function toSegmentSpecIR(base: SpecIR, segment: SkillSegment): SpecIR {
  const schemeNames = requiredSecuritySchemeNames(segment.operations);
  const securitySchemes: Record<string, SecuritySchemeIR> = {};
  for (const schemeName of [...schemeNames].sort((left, right) => left.localeCompare(right))) {
    const scheme = base.securitySchemes[schemeName];
    if (scheme) {
      securitySchemes[schemeName] = scheme;
    } else {
      securitySchemes[schemeName] = {
        name: schemeName,
        type: "unknown",
      };
    }
  }

  return {
    title: base.title,
    version: base.version,
    servers: base.servers,
    securitySchemes,
    operations: segment.operations,
    schemas: segment.schemas,
  };
}
