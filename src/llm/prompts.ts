import type { SpecIR } from "@/ir/ir-types";
import type { SkillIndexIR } from "@/segment/segment-types";
import type { Diagnostic } from "@/types";

function quoteList(values: string[]): string {
  if (values.length === 0) {
    return "(none)";
  }
  return values.map((value) => `\`${value}\``).join(", ");
}

function operationRequirements(specIR: SpecIR): string {
  return specIR.operations
    .map((operation) => {
      const requiredParams = operation.parameters
        .filter((parameter) => parameter.required)
        .map((parameter) => parameter.name);
      return [
        `- Operation heading must be exactly: ### \`${operation.id}\``,
        `  Method: ${operation.method}, Path: ${operation.path}`,
        `  Required parameters that must appear by name in this section: ${quoteList(requiredParams)}`,
        '  Must include an "Example request" subsection with a concrete HTTP call (for example, cURL).',
      ].join("\n");
    })
    .join("\n");
}

function outputContract(specIR: SpecIR): string {
  const operationIds = specIR.operations.map((operation) => operation.id);
  const operationHeadings = operationIds.map((operationId) => `### \`${operationId}\``).join("\n");
  const schemaNames = Object.keys(specIR.schemas);
  const schemaSectionRequirement =
    schemaNames.length > 0
      ? '- Include a top-level "## Schemas" section with concrete schema shapes from `schemas` in the IR.'
      : '- If no schemas are provided in the IR, omit the "## Schemas" section.';

  return [
    "Output contract (must follow exactly):",
    "- Return markdown only.",
    '- Include a top-level "## Operations" section exactly with that heading.',
    schemaSectionRequirement,
    "- Under it, include one section per operation with the exact heading format shown below.",
    "- Do not rename operation IDs.",
    '- Each operation section must include an "Example request".',
    "",
    "Required operation headings:",
    operationHeadings,
  ].join("\n");
}

function serializeIR(specIR: SpecIR): string {
  return JSON.stringify(specIR, null, 2);
}

function indexOutputContract(indexIR: SkillIndexIR): string {
  const requiredFileHeadings = indexIR.segments
    .map((segment) => `### \`${segment.filePath}\``)
    .join("\n");

  return [
    "Output contract (must follow exactly):",
    "- Return markdown only.",
    '- Include a top-level "## Skill Files" section exactly with that heading.',
    "- Under it, include one subsection per file with the exact heading format shown below.",
    "- Do not rename file paths or operation IDs.",
    "",
    "Required file headings:",
    requiredFileHeadings || "(none)",
  ].join("\n");
}

function serializeIndexIR(indexIR: SkillIndexIR): string {
  return JSON.stringify(indexIR, null, 2);
}

export function buildSkillPrompt(specIR: SpecIR): string {
  return [
    "You are generating a SKILL.md file for an API agent.",
    "Use the provided API IR as the source of truth. Do not invent endpoints or parameters.",
    "Return markdown only.",
    "",
    "Requirements:",
    "- Keep every operation from the IR in the final markdown.",
    "- Keep operation IDs exactly as provided.",
    "- For each operation, include method, path, parameters, and responses.",
    "- Use schema definitions in `schemas` from the IR when describing request/response bodies.",
    '- Include a "## Schemas" section that documents concrete field-level shapes for relevant schemas.',
    "- Preserve enum values, required flags, and defaults.",
    "- If information is missing, state that explicitly instead of hallucinating.",
    "",
    outputContract(specIR),
    "",
    "Operation-specific requirements:",
    operationRequirements(specIR),
    "",
    "API IR (JSON):",
    serializeIR(specIR),
    "",
    "Produce an improved SKILL.md with clear guidance for an autonomous coding agent.",
  ].join("\n");
}

export function buildRepairPrompt(
  specIR: SpecIR,
  previousMarkdown: string,
  diagnostics: Diagnostic[],
): string {
  const relevantDiagnostics = diagnostics
    .filter((diagnostic) => diagnostic.code?.startsWith("OUTPUT_"))
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("\n");

  return [
    "Repair this SKILL.md output so it satisfies the required structure.",
    "The previous output failed validation. Fix it without dropping any operation.",
    "",
    outputContract(specIR),
    "",
    "Operation-specific requirements:",
    operationRequirements(specIR),
    "",
    "Validation errors to fix:",
    relevantDiagnostics || "(none provided)",
    "",
    "Previous markdown:",
    previousMarkdown,
    "",
    "Return only corrected markdown.",
  ].join("\n");
}

export function buildSkillIndexPrompt(indexIR: SkillIndexIR): string {
  return [
    "You are generating a root SKILL.md router for segmented API skills.",
    "Use the provided segmented index IR as the source of truth.",
    "Return markdown only.",
    "",
    "Requirements:",
    '- Include a concise "How to use these files" section for autonomous agents.',
    "- For each segment file, include when to use it and which operations it covers.",
    "- Keep file paths and operation IDs exactly as provided.",
    "- If a workflow spans multiple files, explain how an agent should combine them.",
    "",
    indexOutputContract(indexIR),
    "",
    "Segmented index IR (JSON):",
    serializeIndexIR(indexIR),
    "",
    "Produce an actionable root SKILL.md that helps agents choose the right file quickly.",
  ].join("\n");
}

export function buildSkillIndexRepairPrompt(
  indexIR: SkillIndexIR,
  previousMarkdown: string,
  diagnostics: Diagnostic[],
): string {
  const relevantDiagnostics = diagnostics
    .filter((diagnostic) => diagnostic.code?.startsWith("OUTPUT_INDEX_"))
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("\n");

  return [
    "Repair this root SKILL.md output so it satisfies the required segmented-router structure.",
    "",
    indexOutputContract(indexIR),
    "",
    "Validation errors to fix:",
    relevantDiagnostics || "(none provided)",
    "",
    "Previous markdown:",
    previousMarkdown,
    "",
    "Return only corrected markdown.",
  ].join("\n");
}
