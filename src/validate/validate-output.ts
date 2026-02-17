import type { Diagnostic } from "@/types";
import type { SpecIR } from "@/ir/ir-types";
import { validateNoSecretLeaks } from "@/validate/secret-leak";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractOperationIdFromHeading(
  headingText: string,
  expectedOperationIds: readonly string[],
): string | undefined {
  const backtickMatches = headingText.matchAll(/`([^`]+)`/g);
  for (const match of backtickMatches) {
    const candidate = match[1];
    if (expectedOperationIds.includes(candidate)) {
      return candidate;
    }
  }

  const normalized = headingText.replace(/^operation\s*[:-]\s*/i, "").trim();
  const firstToken = normalized.split(/\s+/)[0]?.replace(/[,:;()[\]{}]+$/g, "");
  if (firstToken && expectedOperationIds.includes(firstToken)) {
    return firstToken;
  }

  for (const operationId of expectedOperationIds) {
    const operationIdPattern = new RegExp(
      `(?:^|\\s)${escapeRegex(operationId)}(?:\\s|$|[—-])`,
      "i",
    );
    if (operationIdPattern.test(headingText)) {
      return operationId;
    }
  }

  return undefined;
}

function parseOperationSections(
  markdown: string,
  expectedOperationIds: readonly string[],
): Map<string, string> {
  const sections = new Map<string, string>();
  const headingPattern = /^#{2,6}\s+(.+?)\s*$/gm;
  const matches = [...markdown.matchAll(headingPattern)];
  const operationHeadings = matches
    .map((match) => {
      const headingText = match[1] ?? "";
      const operationId = extractOperationIdFromHeading(headingText, expectedOperationIds);
      if (!operationId) {
        return undefined;
      }
      return {
        operationId,
        index: match.index ?? 0,
      };
    })
    .filter((entry): entry is { operationId: string; index: number } => entry !== undefined);

  for (let index = 0; index < operationHeadings.length; index += 1) {
    const currentHeading = operationHeadings[index];
    const nextHeading = operationHeadings[index + 1];
    const sectionStart = currentHeading.index;
    const sectionEnd = nextHeading?.index ?? markdown.length;
    const sectionText = markdown.slice(sectionStart, sectionEnd);
    sections.set(currentHeading.operationId, sectionText);
  }

  return sections;
}

function sectionContainsParameter(sectionText: string, parameterName: string): boolean {
  if (sectionText.includes(`\`${parameterName}\``)) {
    return true;
  }

  const pattern = new RegExp(`\\b${escapeRegex(parameterName)}\\b`, "i");
  return pattern.test(sectionText);
}

function sectionHasExampleRequest(sectionText: string): boolean {
  const examplePattern = /\bexample\b/i;
  return examplePattern.test(sectionText);
}

function sectionContainsIdentifier(sectionText: string, identifier: string): boolean {
  if (sectionText.includes(`\`${identifier}\``)) {
    return true;
  }

  return new RegExp(`\\b${escapeRegex(identifier)}\\b`, "i").test(sectionText);
}

function sectionHasAuthenticationLanguage(sectionText: string): boolean {
  return /\b(auth|authentication|authorization|token|bearer|basic|cookie|api[-_ ]?key)\b/i.test(
    sectionText,
  );
}

function schemasSection(markdown: string): string | undefined {
  const schemasHeadingMatch = /^##\s+Schemas\b.*$/gim.exec(markdown);
  if (!schemasHeadingMatch) {
    return undefined;
  }

  const sectionStart = schemasHeadingMatch.index ?? 0;
  const rest = markdown.slice(sectionStart);
  const nextTopLevelHeadingMatch = /\n##\s+/.exec(rest.slice(1));
  if (!nextTopLevelHeadingMatch) {
    return rest;
  }

  const sectionEnd = sectionStart + 1 + nextTopLevelHeadingMatch.index;
  return markdown.slice(sectionStart, sectionEnd);
}

function authenticationSection(markdown: string): string | undefined {
  const authenticationHeadingMatch = /^##\s+Authentication\b.*$/gim.exec(markdown);
  if (!authenticationHeadingMatch) {
    return undefined;
  }

  const sectionStart = authenticationHeadingMatch.index ?? 0;
  const rest = markdown.slice(sectionStart);
  const nextTopLevelHeadingMatch = /\n##\s+/.exec(rest.slice(1));
  if (!nextTopLevelHeadingMatch) {
    return rest;
  }

  const sectionEnd = sectionStart + 1 + nextTopLevelHeadingMatch.index;
  return markdown.slice(sectionStart, sectionEnd);
}

function extractSchemaNamesFromHeading(
  headingText: string,
  schemaNameSet: ReadonlySet<string>,
): string[] {
  const matches = new Set<string>();

  const backtickMatches = headingText.matchAll(/`([^`]+)`/g);
  for (const match of backtickMatches) {
    const candidate = match[1];
    if (schemaNameSet.has(candidate)) {
      matches.add(candidate);
    }
  }

  for (const schemaName of schemaNameSet) {
    const pattern = new RegExp(`\\b${escapeRegex(schemaName)}\\b`);
    if (pattern.test(headingText)) {
      matches.add(schemaName);
    }
  }

  return [...matches];
}

function documentedSchemasInSection(
  sectionText: string,
  schemaNames: readonly string[],
): Set<string> {
  const documented = new Set<string>();
  const schemaNameSet = new Set(schemaNames);
  const headingPattern = /^#{3,6}\s+(.+?)\s*$/gm;

  for (const match of sectionText.matchAll(headingPattern)) {
    const headingText = match[1] ?? "";
    const schemaMatches = extractSchemaNamesFromHeading(headingText, schemaNameSet);
    for (const schemaName of schemaMatches) {
      documented.add(schemaName);
    }
  }

  return documented;
}

function documentedAuthSchemesInSection(
  sectionText: string,
  schemeNames: readonly string[],
): Set<string> {
  const documented = new Set<string>();
  const headingPattern = /^#{3,6}\s+(.+?)\s*$/gm;
  const schemeNameSet = new Set(schemeNames);

  for (const match of sectionText.matchAll(headingPattern)) {
    const headingText = match[1] ?? "";
    const extracted = extractSchemaNamesFromHeading(headingText, schemeNameSet);
    for (const schemeName of extracted) {
      documented.add(schemeName);
    }
  }

  return documented;
}

function schemasReferencedInSchemaSummary(
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

function collectSchemaRefs(
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

function requiredSchemas(specIR: SpecIR): Set<string> {
  const schemaNames = Object.keys(specIR.schemas);
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

  for (const operation of specIR.operations) {
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

    const schemaNode = specIR.schemas[current];
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

export function validateOutput(
  markdown: string,
  specIR: SpecIR,
  diagnostics: Diagnostic[] = [],
): Diagnostic[] {
  const outputDiagnostics = [...diagnostics];
  const expectedOperationIds = specIR.operations.map((operation) => operation.id);
  const requiredAuthSchemeNames = [
    ...new Set(
      specIR.operations.flatMap((operation) =>
        (operation.auth?.requirementSets ?? []).flatMap((requirementSet) =>
          requirementSet.schemes.map((scheme) => scheme.schemeName),
        ),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));

  if (markdown.trim().length === 0) {
    outputDiagnostics.push({
      level: "error",
      code: "OUTPUT_EMPTY",
      message: "Rendered markdown is empty.",
    });
    return outputDiagnostics;
  }

  const operationSections = parseOperationSections(markdown, expectedOperationIds);
  const hasOperationsHeading = /^##\s+Operations\b/m.test(markdown);
  if (!hasOperationsHeading && operationSections.size === 0) {
    outputDiagnostics.push({
      level: "error",
      code: "OUTPUT_MISSING_OPERATIONS_SECTION",
      message: 'Rendered markdown is missing an "Operations" section.',
    });
  }

  for (const operation of specIR.operations) {
    const section = operationSections.get(operation.id);
    if (!section) {
      outputDiagnostics.push({
        level: "error",
        code: "OUTPUT_OPERATION_MISSING",
        message: `Operation "${operation.id}" is not present in rendered markdown.`,
      });
      continue;
    }

    const requiredParameters = operation.parameters
      .filter((parameter) => parameter.required)
      .map((parameter) => parameter.name);

    for (const requiredParameter of requiredParameters) {
      if (!sectionContainsParameter(section, requiredParameter)) {
        outputDiagnostics.push({
          level: "error",
          code: "OUTPUT_REQUIRED_PARAM_MISSING",
          message: `Required parameter "${requiredParameter}" for operation "${operation.id}" is missing from rendered markdown.`,
        });
      }
    }

    if (!sectionHasExampleRequest(section)) {
      outputDiagnostics.push({
        level: "error",
        code: "OUTPUT_OPERATION_EXAMPLE_MISSING",
        message: `Operation "${operation.id}" is missing an example request.`,
      });
    }

    const operationAuthSchemeNames = [
      ...new Set(
        (operation.auth?.requirementSets ?? []).flatMap((requirementSet) =>
          requirementSet.schemes.map((scheme) => scheme.schemeName),
        ),
      ),
    ].sort((left, right) => left.localeCompare(right));
    const hasOperationAuthRequirement =
      operationAuthSchemeNames.length > 0 || operation.auth?.optional;
    if (hasOperationAuthRequirement) {
      if (!sectionHasAuthenticationLanguage(section) && operationAuthSchemeNames.length === 0) {
        outputDiagnostics.push({
          level: "error",
          code: "OUTPUT_OPERATION_AUTH_MISSING",
          message: `Operation "${operation.id}" is missing authentication guidance.`,
        });
      }

      for (const schemeName of operationAuthSchemeNames) {
        if (!sectionContainsIdentifier(section, schemeName)) {
          outputDiagnostics.push({
            level: "error",
            code: "OUTPUT_OPERATION_AUTH_SCHEME_MISSING",
            message: `Operation "${operation.id}" is missing authentication scheme "${schemeName}".`,
          });
        }
      }
    }
  }

  if (requiredAuthSchemeNames.length > 0) {
    const sectionText = authenticationSection(markdown);
    if (!sectionText) {
      outputDiagnostics.push({
        level: "error",
        code: "OUTPUT_MISSING_AUTHENTICATION_SECTION",
        message:
          'Rendered markdown is missing an "Authentication" section for security-restricted operations.',
      });
    } else {
      const documentedAuthSchemes = documentedAuthSchemesInSection(
        sectionText,
        requiredAuthSchemeNames,
      );
      for (const schemeName of requiredAuthSchemeNames) {
        if (!documentedAuthSchemes.has(schemeName)) {
          outputDiagnostics.push({
            level: "error",
            code: "OUTPUT_AUTH_SCHEME_MISSING",
            message: `Authentication scheme "${schemeName}" is missing from the "Authentication" section.`,
          });
        }
      }
    }
  }

  const requiredSchemaSet = requiredSchemas(specIR);
  if (requiredSchemaSet.size > 0) {
    const sectionText = schemasSection(markdown);
    if (!sectionText) {
      outputDiagnostics.push({
        level: "error",
        code: "OUTPUT_MISSING_SCHEMAS_SECTION",
        message:
          'Rendered markdown is missing a "Schemas" section for referenced response/request schemas.',
      });
    } else {
      const documentedSchemas = documentedSchemasInSection(sectionText, [...requiredSchemaSet]);
      const missingSchemas = [...requiredSchemaSet]
        .filter((schemaName) => !documentedSchemas.has(schemaName))
        .sort((left, right) => left.localeCompare(right));

      for (const schemaName of missingSchemas) {
        outputDiagnostics.push({
          level: "error",
          code: "OUTPUT_SCHEMA_MISSING",
          message: `Referenced schema "${schemaName}" is missing from the "Schemas" section.`,
        });
      }
    }
  }

  outputDiagnostics.push(...validateNoSecretLeaks(markdown));

  return outputDiagnostics;
}
