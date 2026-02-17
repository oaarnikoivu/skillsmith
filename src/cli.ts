#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import "dotenv/config";
import { APP_NAME } from "@/config";
import { generateSegmentedSkill } from "@/pipeline/generate-segmented-skill";
import { generateSkill } from "@/pipeline/generate-skill";
import type {
  Diagnostic,
  GenerateCommandOptions,
  GenerateSegmentedCommandOptions,
  GenerateSegmentedSkillResult,
  LlmProvider,
} from "@/types";

const DEFAULT_OUTPUT_PATH = "out/SKILL.md";
const DEFAULT_SEGMENTED_OUTPUT_DIR = "out/segmented-skills";

const ROOT_USAGE = `
${APP_NAME} - Convert OpenAPI specs into SKILL.md files

Usage:
  ${APP_NAME} generate --input <path> [--output <path>] [--dry-run] [--overrides <path>]
  ${APP_NAME} generate-segmented --input <path> [--output-dir <path>] [--dry-run] [--overrides <path>]
  ${APP_NAME} --help
`;

const GENERATE_USAGE = `
Usage:
  ${APP_NAME} generate --input <path> [--output <path>] [--dry-run] [--overrides <path>]

Options:
  -i, --input <path>       Path to OpenAPI JSON or YAML file (required)
  -o, --output <path>      Output path for generated SKILL.md (default: out/SKILL.md)
      --server-url <url>   Override/inject API base URL for generated skills
      --dry-run            Run generation without writing output files
      --overrides <path>   Optional path to overrides file
      --provider <name>    LLM provider: openai | anthropic
      --model <id>         LLM model override
      --temperature <n>    LLM temperature value
      --max-output-tokens <n>  LLM max output tokens
  -h, --help               Show help for generate command
`;

const GENERATE_SEGMENTED_USAGE = `
Usage:
  ${APP_NAME} generate-segmented --input <path> [--output-dir <path>] [--dry-run] [--overrides <path>]

Options:
  -i, --input <path>       Path to OpenAPI JSON or YAML file (required)
      --output-dir <path>  Output directory for segmented skill files (default: out/<api>-skills)
      --server-url <url>   Override/inject API base URL for generated skills
      --parallelism <n>    Number of segments to generate concurrently (default: 3)
      --dry-run            Run generation without writing output files
      --overrides <path>   Optional path to overrides file
      --provider <name>    LLM provider: openai | anthropic
      --model <id>         LLM model override
      --temperature <n>    LLM temperature value
      --max-output-tokens <n>  LLM max output tokens
  -h, --help               Show help for generate-segmented command
`;

function parseLlmProvider(value: string): LlmProvider {
  if (value === "openai" || value === "anthropic") {
    return value;
  }

  throw new Error(`Invalid --provider value: ${value}. Supported providers: openai, anthropic`);
}

function parseGenerateArgs(argv: string[]): GenerateCommandOptions {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let serverUrl: string | undefined;
  let overridesPath: string | undefined;
  let dryRun = false;
  let llmProvider: LlmProvider | undefined;
  let llmModel: string | undefined;
  let llmTemperature: number | undefined;
  let llmMaxOutputTokens: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "-i":
      case "--input": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --input");
        }
        inputPath = value;
        index += 1;
        break;
      }
      case "-o":
      case "--output": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --output");
        }
        outputPath = value;
        index += 1;
        break;
      }
      case "--server-url": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --server-url");
        }
        serverUrl = value;
        index += 1;
        break;
      }
      case "--overrides": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --overrides");
        }
        overridesPath = value;
        index += 1;
        break;
      }
      case "--provider": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --provider");
        }
        llmProvider = parseLlmProvider(value);
        index += 1;
        break;
      }
      case "--dry-run": {
        dryRun = true;
        break;
      }
      case "--model": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --model");
        }
        llmModel = value;
        index += 1;
        break;
      }
      case "--temperature": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --temperature");
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid --temperature value: ${value}`);
        }
        llmTemperature = parsed;
        index += 1;
        break;
      }
      case "--max-output-tokens": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --max-output-tokens");
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`Invalid --max-output-tokens value: ${value}`);
        }
        llmMaxOutputTokens = parsed;
        index += 1;
        break;
      }
      default: {
        throw new Error(`Unknown argument: ${token}`);
      }
    }
  }

  if (!inputPath) {
    throw new Error("Missing required --input argument");
  }

  return {
    inputPath,
    outputPath,
    serverUrl,
    dryRun,
    overridesPath,
    llmProvider,
    llmModel,
    llmTemperature,
    llmMaxOutputTokens,
  };
}

function parseGenerateSegmentedArgs(argv: string[]): GenerateSegmentedCommandOptions {
  let inputPath: string | undefined;
  let outputDir: string | undefined;
  let serverUrl: string | undefined;
  let segmentParallelism: number | undefined;
  let overridesPath: string | undefined;
  let dryRun = false;
  let llmProvider: LlmProvider | undefined;
  let llmModel: string | undefined;
  let llmTemperature: number | undefined;
  let llmMaxOutputTokens: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "-i":
      case "--input": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --input");
        }
        inputPath = value;
        index += 1;
        break;
      }
      case "--output-dir": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --output-dir");
        }
        outputDir = value;
        index += 1;
        break;
      }
      case "--server-url": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --server-url");
        }
        serverUrl = value;
        index += 1;
        break;
      }
      case "--parallelism": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --parallelism");
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`Invalid --parallelism value: ${value}`);
        }
        segmentParallelism = parsed;
        index += 1;
        break;
      }
      case "--overrides": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --overrides");
        }
        overridesPath = value;
        index += 1;
        break;
      }
      case "--provider": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --provider");
        }
        llmProvider = parseLlmProvider(value);
        index += 1;
        break;
      }
      case "--dry-run": {
        dryRun = true;
        break;
      }
      case "--model": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --model");
        }
        llmModel = value;
        index += 1;
        break;
      }
      case "--temperature": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --temperature");
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid --temperature value: ${value}`);
        }
        llmTemperature = parsed;
        index += 1;
        break;
      }
      case "--max-output-tokens": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --max-output-tokens");
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`Invalid --max-output-tokens value: ${value}`);
        }
        llmMaxOutputTokens = parsed;
        index += 1;
        break;
      }
      default: {
        throw new Error(`Unknown argument: ${token}`);
      }
    }
  }

  if (!inputPath) {
    throw new Error("Missing required --input argument");
  }

  return {
    inputPath,
    outputDir,
    serverUrl,
    segmentParallelism,
    dryRun,
    overridesPath,
    llmProvider,
    llmModel,
    llmTemperature,
    llmMaxOutputTokens,
  };
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const codePrefix = diagnostic.code ? `[${diagnostic.code}] ` : "";
    const line = `${diagnostic.level.toUpperCase()}: ${codePrefix}${diagnostic.message}`;
    if (diagnostic.level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

function printProgress(message: string): void {
  console.error(`[pipeline] ${message}...`);
}

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

async function main(): Promise<void> {
  const [, , command, ...argv] = process.argv;

  if (!command || command === "-h" || command === "--help") {
    console.log(ROOT_USAGE.trim());
    return;
  }

  if (command === "generate") {
    if (argv.includes("-h") || argv.includes("--help")) {
      console.log(GENERATE_USAGE.trim());
      return;
    }

    const options = parseGenerateArgs(argv);
    const result = await generateSkill({
      ...options,
      onProgress: printProgress,
    });
    const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.level === "error");
    const resolvedOutputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;

    if (result.diagnostics.length > 0) {
      printDiagnostics(result.diagnostics);
    }

    if (options.dryRun) {
      console.log(result.markdown);
    } else if (hasErrors) {
      console.error("Skipped writing output due to validation errors.");
    } else if (result.markdown.length > 0) {
      await mkdir(dirname(resolvedOutputPath), { recursive: true });
      await writeFile(resolvedOutputPath, result.markdown, "utf8");
      console.log(`Wrote ${resolvedOutputPath}`);
    } else {
      console.error("Skipped writing output due to validation errors.");
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "generate-segmented") {
    if (argv.includes("-h") || argv.includes("--help")) {
      console.log(GENERATE_SEGMENTED_USAGE.trim());
      return;
    }

    const options = parseGenerateSegmentedArgs(argv);
    const result = await generateSegmentedSkill({
      ...options,
      onProgress: printProgress,
    });
    const hasErrors = result.diagnostics.some((diagnostic) => diagnostic.level === "error");
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
      console.error("Skipped writing output due to validation errors.");
    } else {
      await writeSegmentedFiles(outputDir, result.files);
      console.log(`Wrote ${result.files.length} files under ${outputDir}`);
    }

    if (hasErrors) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  console.error("CLI failed to start.", error);
  process.exitCode = 1;
});
