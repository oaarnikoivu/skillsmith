import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { generateSegmentedSkill } from "@/pipeline/generate-segmented-skill";
import type { GenerateSegmentedSkillResult } from "@/types";
import { ProgressRenderer, formatLevelLine, printDiagnostics } from "@/cli/progress";
import {
  GENERATE_SEGMENTED_USAGE,
  parseGenerateSegmentedArgs,
  resolveLlmSelection,
} from "@/cli/parse-args";

const DEFAULT_SEGMENTED_OUTPUT_DIR = "out/segmented-skills";

async function writeSegmentedFiles(
  outputDir: string,
  files: GenerateSegmentedSkillResult["files"],
): Promise<void> {
  for (const file of files) {
    const absolutePath = join(outputDir, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.markdown, "utf8");
  }
}

export async function runGenerateSegmented(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(GENERATE_SEGMENTED_USAGE.trim());
    return;
  }

  const progressRenderer = new ProgressRenderer();
  try {
    const options = parseGenerateSegmentedArgs(argv);
    const llmSelection = await resolveLlmSelection(options);
    const result = await generateSegmentedSkill({
      inputType: options.inputType,
      inputPath: options.inputPath,
      outputDir: options.outputDir,
      serverUrl: options.serverUrl,
      segmentParallelism: options.segmentParallelism,
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
      hasErrors
        ? "Segmented generation completed with validation errors."
        : "Segmented generation completed.",
    );
    const outputDir = options.outputDir ?? result.defaultOutputDir ?? DEFAULT_SEGMENTED_OUTPUT_DIR;

    if (result.diagnostics.length > 0) {
      printDiagnostics(result.diagnostics);
    }

    if (options.dryRun) {
      for (const file of result.files) {
        console.log(`<!-- FILE: ${file.path} -->`);
        console.log(file.markdown);
        console.log("");
      }
    } else if (hasErrors) {
      console.error(
        formatLevelLine(
          process.stderr,
          "error",
          "Skipped writing output due to validation errors.",
        ),
      );
    } else {
      await writeSegmentedFiles(outputDir, result.files);
      console.log(
        formatLevelLine(
          process.stdout,
          "success",
          `Wrote ${result.files.length} files under ${outputDir}`,
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
