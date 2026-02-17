import type { OperationIR, SpecIR } from "@/ir/ir-types";

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

export function toSegmentSpecIR(base: SpecIR, segment: SkillSegment): SpecIR {
  return {
    title: base.title,
    version: base.version,
    servers: base.servers,
    operations: segment.operations,
    schemas: segment.schemas,
  };
}
