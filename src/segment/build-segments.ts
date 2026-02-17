import type { OperationIR, SpecIR } from "@/ir/ir-types";
import { requiredSchemasForOperations } from "@/segment/schema-closure";
import type { SegmentPlan, SkillSegment } from "@/segment/segment-types";

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "segment";
}

function topLevelPath(path: string): string {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  return segments[0] ?? "root";
}

function groupIdentity(operation: OperationIR): {
  groupKey: string;
  sourceKind: SkillSegment["sourceKind"];
  sourceValue: string;
  baseTitle: string;
} {
  const firstTag = operation.tags[0];
  if (firstTag && firstTag.trim().length > 0) {
    return {
      groupKey: `tag:${firstTag}`,
      sourceKind: "tag",
      sourceValue: firstTag,
      baseTitle: `Tag: ${firstTag}`,
    };
  }

  const pathRoot = topLevelPath(operation.path);
  return {
    groupKey: `path:${pathRoot}`,
    sourceKind: "path",
    sourceValue: `/${pathRoot}`,
    baseTitle: `Path: /${pathRoot}`,
  };
}

function pickSegmentFileName(baseSlug: string, counts: Map<string, number>): string {
  const current = counts.get(baseSlug) ?? 0;
  counts.set(baseSlug, current + 1);
  if (current === 0) {
    return `${baseSlug}.SKILL.md`;
  }

  return `${baseSlug}-${current + 1}.SKILL.md`;
}

function segmentSchemas(
  operations: readonly OperationIR[],
  allSchemas: Record<string, unknown>,
): Record<string, unknown> {
  const requiredSchemaNames = [...requiredSchemasForOperations(operations, allSchemas)].sort(
    (left, right) => left.localeCompare(right),
  );
  const result: Record<string, unknown> = {};
  for (const schemaName of requiredSchemaNames) {
    if (schemaName in allSchemas) {
      result[schemaName] = allSchemas[schemaName];
    }
  }
  return result;
}

export function buildSegments(specIR: SpecIR): SegmentPlan {
  const apiSlug = slugify(specIR.title);
  const groups = new Map<
    string,
    {
      sourceKind: SkillSegment["sourceKind"];
      sourceValue: string;
      baseTitle: string;
      operations: OperationIR[];
    }
  >();

  for (const operation of specIR.operations) {
    const identity = groupIdentity(operation);
    const current = groups.get(identity.groupKey);
    if (current) {
      current.operations.push(operation);
      continue;
    }

    groups.set(identity.groupKey, {
      sourceKind: identity.sourceKind,
      sourceValue: identity.sourceValue,
      baseTitle: identity.baseTitle,
      operations: [operation],
    });
  }

  const segmentFileNames = new Map<string, number>();
  const segments = [...groups.entries()]
    .map(([groupKey, group]) => {
      const groupSlug = slugify(group.baseTitle.replace(/^Tag:\s*/i, "").replace(/^Path:\s*/i, ""));
      const fileName = pickSegmentFileName(groupSlug, segmentFileNames);
      return {
        id: groupKey,
        title: group.baseTitle,
        sourceKind: group.sourceKind,
        sourceValue: group.sourceValue,
        fileName,
        operations: group.operations,
        schemas: segmentSchemas(group.operations, specIR.schemas),
      } satisfies SkillSegment;
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  return {
    apiSlug,
    segments,
  };
}
