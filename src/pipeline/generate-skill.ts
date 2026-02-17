import type { GenerateCommandOptions, GenerateSkillResult } from "@/types";
import { loadSpec } from "@/openapi/load-spec";
import { resolveRefs } from "@/openapi/resolve-refs";
import { normalizeSpec } from "@/openapi/normalize-spec";
import { validateSpec } from "@/openapi/validate-spec";
import { buildIR } from "@/ir/build-ir";
import { mergeOverrides } from "@/overrides/merge-overrides";
import { validateOutput } from "@/validate/validate-output";
import { buildRepairPrompt, buildSkillPrompt } from "@/llm/prompts";
import { generateDraftWithLlm } from "@/llm/client";

const MAX_REPAIR_ATTEMPTS = 3;

function hasOutputErrors(diagnostics: GenerateSkillResult["diagnostics"]): boolean {
  return diagnostics.some(
    (diagnostic) => diagnostic.level === "error" && diagnostic.code?.startsWith("OUTPUT_"),
  );
}

export async function generateSkill(options: GenerateCommandOptions): Promise<GenerateSkillResult> {
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
      markdown: "",
      diagnostics: validation.diagnostics,
    };
  }

  progress("Building intermediate representation (IR)");
  const specIR = buildIR(normalizedSpec);
  progress("Applying overrides");
  const mergedSpecIR = await mergeOverrides(specIR, options.overridesPath);
  progress("Building LLM prompt");
  const prompt = buildSkillPrompt(mergedSpecIR);
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

  progress("Requesting initial draft from LLM");
  const llmOutput = await generateDraftWithLlm({
    ...llmRequestBase,
    prompt,
  });

  let markdown = llmOutput.content.trim();
  if (markdown.length === 0) {
    throw new Error("LLM returned an empty response. Generation failed.");
  }

  const diagnostics = [...validation.diagnostics];
  progress("Validating LLM output");
  let outputDiagnostics = validateOutput(markdown, mergedSpecIR, diagnostics);

  let repairAttempt = 0;
  while (hasOutputErrors(outputDiagnostics) && repairAttempt < MAX_REPAIR_ATTEMPTS) {
    repairAttempt += 1;
    progress(`Repairing LLM output (attempt ${repairAttempt}/${MAX_REPAIR_ATTEMPTS})`);
    const repairPrompt = buildRepairPrompt(mergedSpecIR, markdown, outputDiagnostics);
    const repairedOutput = await generateDraftWithLlm({
      ...llmRequestBase,
      prompt: repairPrompt,
    });
    const repairedMarkdown = repairedOutput.content.trim();

    if (repairedMarkdown.length === 0) {
      throw new Error("LLM returned an empty response during repair. Generation failed.");
    }

    markdown = repairedMarkdown;
    progress("Validating repaired output");
    outputDiagnostics = validateOutput(markdown, mergedSpecIR, diagnostics);
  }

  progress("Pipeline completed");
  return { markdown, diagnostics: outputDiagnostics };
}
