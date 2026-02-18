import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { generateSkill } from "@/pipeline/generate-skill";
import { ProgressRenderer, formatLevelLine, printDiagnostics } from "@/cli/progress";
import { GENERATE_USAGE, parseGenerateArgs, resolveLlmSelection } from "@/cli/parse-args";

const DEFAULT_OUTPUT_PATH = "out/SKILL.md";

export async function runGenerate(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(GENERATE_USAGE.trim());
    return;
  }

  const progressRenderer = new ProgressRenderer();
  try {
    const options = parseGenerateArgs(argv);
    const llmSelection = await resolveLlmSelection(options);
    const result = await generateSkill({
      inputType: options.inputType,
      inputPath: options.inputPath,
      outputPath: options.outputPath,
      serverUrl: options.serverUrl,
      dryRun: options.dryRun,
      overridesPath: options.overridesPath,
      llmProvider: llmSelection.provider,
      llmModel: llmSelection.model,
      llmMaxOutputTokens: options.llmMaxOutputTokens,
      onProgress: (message: string) => progressRenderer.update(message),
    });
    const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.level === "error");
    progressRenderer.complete(
      hasErrors ? "error" : "success",
      hasErrors ? "Generation completed with validation errors." : "Generation completed.",
    );
    const resolvedOutputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;

    if (result.diagnostics.length > 0) {
      printDiagnostics(result.diagnostics);
    }

    if (options.dryRun) {
      console.log(result.markdown);
    } else if (hasErrors) {
      console.error(
        formatLevelLine(
          process.stderr,
          "error",
          "Skipped writing output due to validation errors.",
        ),
      );
    } else if (result.markdown.length > 0) {
      await mkdir(dirname(resolvedOutputPath), { recursive: true });
      await writeFile(resolvedOutputPath, result.markdown, "utf8");
      console.log(formatLevelLine(process.stdout, "success", `Wrote ${resolvedOutputPath}`));
    } else {
      console.error(
        formatLevelLine(
          process.stderr,
          "error",
          "Skipped writing output due to validation errors.",
        ),
      );
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
  } catch (error) {
    progressRenderer.stop();
    throw error;
  }
}
