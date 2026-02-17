import type { SkillIndexIR } from "@/segment/segment-types";
import type { Diagnostic } from "@/types";

function parseFileSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headingPattern = /^###\s+`([^`]+)`\s*$/gm;
  const matches = [...markdown.matchAll(headingPattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const currentMatch = matches[index];
    const nextMatch = matches[index + 1];
    const filePath = currentMatch[1];
    const sectionStart = currentMatch.index ?? 0;
    const sectionEnd = nextMatch?.index ?? markdown.length;
    sections.set(filePath, markdown.slice(sectionStart, sectionEnd));
  }

  return sections;
}

function sectionContainsOperation(sectionText: string, operationId: string): boolean {
  if (sectionText.includes(`\`${operationId}\``)) {
    return true;
  }

  return new RegExp(`\\b${operationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
    sectionText,
  );
}

export function validateIndexOutput(
  markdown: string,
  indexIR: SkillIndexIR,
  diagnostics: Diagnostic[] = [],
): Diagnostic[] {
  const outputDiagnostics = [...diagnostics];

  if (markdown.trim().length === 0) {
    outputDiagnostics.push({
      level: "error",
      code: "OUTPUT_INDEX_EMPTY",
      message: "Rendered root SKILL markdown is empty.",
    });
    return outputDiagnostics;
  }

  if (!/^##\s+Skill Files\b/m.test(markdown)) {
    outputDiagnostics.push({
      level: "error",
      code: "OUTPUT_INDEX_MISSING_SKILL_FILES_SECTION",
      message: 'Rendered root SKILL markdown is missing a "Skill Files" section.',
    });
  }

  const fileSections = parseFileSections(markdown);

  for (const segment of indexIR.segments) {
    const section = fileSections.get(segment.filePath);
    if (!section) {
      outputDiagnostics.push({
        level: "error",
        code: "OUTPUT_INDEX_FILE_MISSING",
        message: `Segment file entry "${segment.filePath}" is missing from root SKILL markdown.`,
      });
      continue;
    }

    for (const operationId of segment.operationIds) {
      if (!sectionContainsOperation(section, operationId)) {
        outputDiagnostics.push({
          level: "error",
          code: "OUTPUT_INDEX_OPERATION_MISSING",
          message: `Operation "${operationId}" is missing from segment entry "${segment.filePath}".`,
        });
      }
    }
  }

  return outputDiagnostics;
}
