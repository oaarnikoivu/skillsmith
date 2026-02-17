import { buildIR } from "@/ir/build-ir";
import { generateDraftWithLlm } from "@/llm/client";
import {
  buildRepairPrompt,
  buildSkillIndexPrompt,
  buildSkillIndexRepairPrompt,
  buildSkillPrompt,
} from "@/llm/prompts";
import { mergeOverrides } from "@/overrides/merge-overrides";
import { normalizeSpec } from "@/openapi/normalize-spec";
import { loadSpec } from "@/openapi/load-spec";
import { resolveRefs } from "@/openapi/resolve-refs";
import { validateSpec } from "@/openapi/validate-spec";
import { buildSegments } from "@/segment/build-segments";
import type { SkillIndexIR } from "@/segment/segment-types";
import { toSegmentSpecIR } from "@/segment/segment-types";
import type {
  Diagnostic,
  GenerateSegmentedCommandOptions,
  GenerateSegmentedSkillResult,
} from "@/types";
import { validateIndexOutput } from "@/validate/validate-index-output";
import { validateOutput } from "@/validate/validate-output";

const MAX_REPAIR_ATTEMPTS = 3;

function hasOutputErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) => diagnostic.level === "error" && diagnostic.code?.startsWith("OUTPUT"),
  );
}

function qualifyDiagnostics(filePath: string, diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    message: `[${filePath}] ${diagnostic.message}`,
  }));
}

function coverageDiagnostics(
  operationIds: readonly string[],
  segments: { filePath: string; operationIds: readonly string[] }[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const counts = new Map<string, number>();

  for (const operationId of operationIds) {
    counts.set(operationId, 0);
  }

  for (const segment of segments) {
    for (const operationId of segment.operationIds) {
      if (!counts.has(operationId)) {
        diagnostics.push({
          level: "error",
          code: "SEGMENT_UNKNOWN_OPERATION",
          message: `Segment "${segment.filePath}" includes unknown operation "${operationId}".`,
        });
        continue;
      }

      counts.set(operationId, (counts.get(operationId) ?? 0) + 1);
    }
  }

  for (const [operationId, count] of counts.entries()) {
    if (count === 0) {
      diagnostics.push({
        level: "error",
        code: "SEGMENT_OPERATION_UNCOVERED",
        message: `Operation "${operationId}" is not included in any segment file.`,
      });
    } else if (count > 1) {
      diagnostics.push({
        level: "error",
        code: "SEGMENT_OPERATION_DUPLICATED",
        message: `Operation "${operationId}" appears in multiple segment files.`,
      });
    }
  }

  return diagnostics;
}

export async function generateSegmentedSkill(
  options: GenerateSegmentedCommandOptions,
): Promise<GenerateSegmentedSkillResult> {
  const progress = options.onProgress ?? (() => {});

  progress("Loading OpenAPI spec");
  const loadedSpec = await loadSpec(options.inputPath);
  progress("Resolving $ref references");
  const resolvedSpec = await resolveRefs(loadedSpec);
  progress("Normalizing OpenAPI document");
  const normalizedSpec = normalizeSpec(resolvedSpec);
  progress("Validating normalized spec");
  const validation = validateSpec(normalizedSpec);

  if (!validation.valid) {
    progress("Spec validation failed");
    return {
      files: [],
      diagnostics: validation.diagnostics,
      defaultOutputDir: "out/segmented-skills",
    };
  }

  progress("Building intermediate representation (IR)");
  const specIR = buildIR(normalizedSpec);
  progress("Applying overrides");
  const mergedSpecIR = await mergeOverrides(specIR, options.overridesPath);
  progress("Building segment plan");
  const segmentPlan = buildSegments(mergedSpecIR);
  const outputSegments = segmentPlan.segments.map((segment) => ({
    ...segment,
    filePath: `groups/${segment.fileName}`,
  }));

  const provider = options.llmProvider ?? "openai";
  const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  const hasMockResponse =
    process.env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE !== undefined ||
    process.env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES !== undefined;
  const apiKeyVarName = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const defaultModel =
    provider === "openai" ? process.env.OPENAI_MODEL : process.env.ANTHROPIC_MODEL;
  const baseUrl = provider === "openai" ? process.env.OPENAI_BASE_URL : undefined;

  if (!apiKey && !hasMockResponse) {
    throw new Error(
      `${apiKeyVarName} is required (unless OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE is set). Deterministic rendering is disabled and LLM generation is mandatory.`,
    );
  }

  const llmRequestBase = {
    provider,
    system: "You are a technical writer creating precise SKILL.md docs for API agent tooling.",
    model: options.llmModel ?? defaultModel,
    temperature: options.llmTemperature,
    maxOutputTokens: options.llmMaxOutputTokens,
    apiKey,
    baseUrl,
  };

  const files: GenerateSegmentedSkillResult["files"] = [];
  const diagnostics: Diagnostic[] = [...validation.diagnostics];

  for (const segment of outputSegments) {
    const segmentSpecIR = toSegmentSpecIR(mergedSpecIR, segment);
    progress(`Requesting draft for ${segment.filePath}`);
    const prompt = buildSkillPrompt(segmentSpecIR);
    const llmOutput = await generateDraftWithLlm({
      ...llmRequestBase,
      prompt,
    });

    let markdown = llmOutput.content.trim();
    if (markdown.length === 0) {
      throw new Error(`LLM returned an empty response while generating "${segment.filePath}".`);
    }

    progress(`Validating ${segment.filePath}`);
    let segmentDiagnostics = validateOutput(markdown, segmentSpecIR, []);
    let repairAttempt = 0;
    while (hasOutputErrors(segmentDiagnostics) && repairAttempt < MAX_REPAIR_ATTEMPTS) {
      repairAttempt += 1;
      progress(`Repairing ${segment.filePath} (attempt ${repairAttempt}/${MAX_REPAIR_ATTEMPTS})`);
      const repairPrompt = buildRepairPrompt(segmentSpecIR, markdown, segmentDiagnostics);
      const repairedOutput = await generateDraftWithLlm({
        ...llmRequestBase,
        prompt: repairPrompt,
      });
      const repairedMarkdown = repairedOutput.content.trim();
      if (repairedMarkdown.length === 0) {
        throw new Error(`LLM returned an empty response while repairing "${segment.filePath}".`);
      }

      markdown = repairedMarkdown;
      segmentDiagnostics = validateOutput(markdown, segmentSpecIR, []);
    }

    diagnostics.push(...qualifyDiagnostics(segment.filePath, segmentDiagnostics));
    files.push({
      path: segment.filePath,
      markdown,
    });
  }

  const indexIR: SkillIndexIR = {
    title: mergedSpecIR.title,
    version: mergedSpecIR.version,
    servers: mergedSpecIR.servers,
    segments: outputSegments.map((segment) => ({
      title: segment.title,
      sourceKind: segment.sourceKind,
      sourceValue: segment.sourceValue,
      filePath: segment.filePath,
      operationIds: segment.operations.map((operation) => operation.id),
    })),
  };

  diagnostics.push(
    ...coverageDiagnostics(
      mergedSpecIR.operations.map((operation) => operation.id),
      indexIR.segments,
    ),
  );

  progress("Requesting draft for root SKILL.md");
  const indexPrompt = buildSkillIndexPrompt(indexIR);
  const indexOutput = await generateDraftWithLlm({
    ...llmRequestBase,
    prompt: indexPrompt,
  });

  let indexMarkdown = indexOutput.content.trim();
  if (indexMarkdown.length === 0) {
    throw new Error("LLM returned an empty response while generating root SKILL.md.");
  }

  progress("Validating root SKILL.md");
  let indexDiagnostics = validateIndexOutput(indexMarkdown, indexIR, []);
  let indexRepairAttempt = 0;
  while (hasOutputErrors(indexDiagnostics) && indexRepairAttempt < MAX_REPAIR_ATTEMPTS) {
    indexRepairAttempt += 1;
    progress(`Repairing root SKILL.md (attempt ${indexRepairAttempt}/${MAX_REPAIR_ATTEMPTS})`);
    const repairPrompt = buildSkillIndexRepairPrompt(indexIR, indexMarkdown, indexDiagnostics);
    const repairedOutput = await generateDraftWithLlm({
      ...llmRequestBase,
      prompt: repairPrompt,
    });
    const repairedMarkdown = repairedOutput.content.trim();
    if (repairedMarkdown.length === 0) {
      throw new Error("LLM returned an empty response while repairing root SKILL.md.");
    }

    indexMarkdown = repairedMarkdown;
    indexDiagnostics = validateIndexOutput(indexMarkdown, indexIR, []);
  }

  diagnostics.push(...qualifyDiagnostics("SKILL.md", indexDiagnostics));
  files.unshift({
    path: "SKILL.md",
    markdown: indexMarkdown,
  });

  progress("Segmented pipeline completed");
  return {
    files,
    diagnostics,
    defaultOutputDir: `out/${segmentPlan.apiSlug}-skills`,
  };
}
