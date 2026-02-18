import type { OperationIR } from "@/ir/ir-types";

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function schemasReferencedInSchemaSummary(
  schemaSummary: string | undefined,
  schemaNames: readonly string[],
): Set<string> {
  const referenced = new Set<string>();
  if (!schemaSummary) {
    return referenced;
  }

  for (const schemaName of schemaNames) {
    const pattern = new RegExp(`\\b${escapeRegex(schemaName)}\\b`);
    if (pattern.test(schemaSummary)) {
      referenced.add(schemaName);
    }
  }

  return referenced;
}

export function collectSchemaRefs(
  schemaNode: unknown,
  schemaNameSet: ReadonlySet<string>,
  refs: Set<string>,
): void {
  if (Array.isArray(schemaNode)) {
    for (const value of schemaNode) {
      collectSchemaRefs(value, schemaNameSet, refs);
    }
    return;
  }

  if (typeof schemaNode !== "object" || schemaNode === null) {
    return;
  }

  const candidate = schemaNode as Record<string, unknown>;
  const refValue = typeof candidate.$ref === "string" ? candidate.$ref : undefined;
  if (refValue) {
    const refName = refValue.split("/").at(-1);
    if (refName && schemaNameSet.has(refName)) {
      refs.add(refName);
    }
  }

  for (const value of Object.values(candidate)) {
    collectSchemaRefs(value, schemaNameSet, refs);
  }
}

export function requiredSchemasForOperations(
  operations: readonly OperationIR[],
  allSchemas: Record<string, unknown>,
): Set<string> {
  const schemaNames = Object.keys(allSchemas);
  const schemaNameSet = new Set(schemaNames);
  const required = new Set<string>();
  const queue: string[] = [];

  const pushSummaryReferences = (summary: string | undefined): void => {
    const refs = schemasReferencedInSchemaSummary(summary, schemaNames);
    for (const ref of refs) {
      if (!required.has(ref)) {
        required.add(ref);
        queue.push(ref);
      }
    }
  };

  for (const operation of operations) {
    for (const parameter of operation.parameters) {
      pushSummaryReferences(parameter.schemaSummary);
    }

    pushSummaryReferences(operation.requestBody?.schemaSummary);
    for (const response of operation.responses) {
      pushSummaryReferences(response.schemaSummary);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const schemaNode = allSchemas[current];
    if (schemaNode === undefined) {
      continue;
    }

    const refs = new Set<string>();
    collectSchemaRefs(schemaNode, schemaNameSet, refs);
    for (const ref of refs) {
      if (!required.has(ref)) {
        required.add(ref);
        queue.push(ref);
      }
    }
  }

  return required;
}
