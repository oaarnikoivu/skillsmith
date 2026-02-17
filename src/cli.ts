#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import "dotenv/config";
import { APP_NAME } from "@/config";
import { generateSegmentedSkill } from "@/pipeline/generate-segmented-skill";
import { generateSkill } from "@/pipeline/generate-skill";
import {
  clearUserConfig,
  readUserConfig,
  resolveUserConfigPath,
  writeUserConfig,
} from "@/user-config";
import type {
  Diagnostic,
  GenerateCommandOptions,
  GenerateSegmentedCommandOptions,
  GenerateSegmentedSkillResult,
  LlmProvider,
} from "@/types";

const DEFAULT_OUTPUT_PATH = "out/SKILL.md";
const DEFAULT_SEGMENTED_OUTPUT_DIR = "out/segmented-skills";

interface ParsedGenerateCommandOptions extends Omit<
  GenerateCommandOptions,
  "llmProvider" | "llmModel"
> {
  llmProvider?: LlmProvider;
  llmModel?: string;
  ignoreConfig: boolean;
  saveConfig: boolean;
}

interface ParsedGenerateSegmentedCommandOptions extends Omit<
  GenerateSegmentedCommandOptions,
  "llmProvider" | "llmModel"
> {
  llmProvider?: LlmProvider;
  llmModel?: string;
  ignoreConfig: boolean;
  saveConfig: boolean;
}

const ROOT_USAGE = `
${APP_NAME} - Convert OpenAPI specs into SKILL.md files

Usage:
  ${APP_NAME} generate --input <path> [--provider <openai|anthropic>] [--model <id>] [--output <path>] [--dry-run] [--overrides <path>]
  ${APP_NAME} generate-segmented --input <path> [--provider <openai|anthropic>] [--model <id>] [--output-dir <path>] [--dry-run] [--overrides <path>]
  ${APP_NAME} config <set|get|clear> [options]
  ${APP_NAME} --help
`;

const GENERATE_USAGE = `
Usage:
  ${APP_NAME} generate --input <path> [--provider <openai|anthropic>] [--model <id>] [--output <path>] [--dry-run] [--overrides <path>]

Options:
  -i, --input <path>       Path to OpenAPI JSON or YAML file (required)
  -o, --output <path>      Output path for generated SKILL.md (default: out/SKILL.md)
      --server-url <url>   Override/inject API base URL for generated skills
      --dry-run            Run generation without writing output files
      --overrides <path>   Optional path to overrides file
      --provider <name>    LLM provider: openai | anthropic
      --model <id>         LLM model id
      --ignore-config      Do not read provider/model from user config
      --save-config        Save resolved provider/model as user preference
      --temperature <n>    LLM temperature value
      --max-output-tokens <n>  LLM max output tokens
  -h, --help               Show help for generate command
`;

const GENERATE_SEGMENTED_USAGE = `
Usage:
  ${APP_NAME} generate-segmented --input <path> [--provider <openai|anthropic>] [--model <id>] [--output-dir <path>] [--dry-run] [--overrides <path>]

Options:
  -i, --input <path>       Path to OpenAPI JSON or YAML file (required)
      --output-dir <path>  Output directory for segmented skill files (default: out/<api>-skills)
      --server-url <url>   Override/inject API base URL for generated skills
      --parallelism <n>    Number of segments to generate concurrently (default: 3)
      --dry-run            Run generation without writing output files
      --overrides <path>   Optional path to overrides file
      --provider <name>    LLM provider: openai | anthropic
      --model <id>         LLM model id
      --ignore-config      Do not read provider/model from user config
      --save-config        Save resolved provider/model as user preference
      --temperature <n>    LLM temperature value
      --max-output-tokens <n>  LLM max output tokens
  -h, --help               Show help for generate-segmented command
`;

const CONFIG_USAGE = `
Usage:
  ${APP_NAME} config set --provider <openai|anthropic> --model <id>
  ${APP_NAME} config get
  ${APP_NAME} config clear

Options:
      --provider <name>    LLM provider to persist
      --model <id>         LLM model id to persist
  -h, --help               Show help for config command
`;

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  magenta: "\u001B[35m",
  gray: "\u001B[90m",
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const PROGRESS_MARKERS = ["🚀", "🧩", "⚙️", "🔍", "🛠️", "🧠"] as const;

type LogLevel = "success" | "warning" | "error";

function emojiEnabled(stream: NodeJS.WriteStream): boolean {
  return (
    stream.isTTY &&
    process.env.OPENAPI_TO_SKILLMD_PLAIN !== "1" &&
    process.env.OPENAPI_TO_SKILLMD_NO_EMOJI !== "1"
  );
}

function colorEnabled(stream: NodeJS.WriteStream): boolean {
  return (
    stream.isTTY &&
    process.env.NO_COLOR === undefined &&
    process.env.OPENAPI_TO_SKILLMD_PLAIN !== "1"
  );
}

function style(stream: NodeJS.WriteStream, text: string, ...codes: string[]): string {
  if (!colorEnabled(stream) || codes.length === 0) {
    return text;
  }

  return `${codes.join("")}${text}${ANSI.reset}`;
}

function formatLevelLine(stream: NodeJS.WriteStream, level: LogLevel, message: string): string {
  if (!stream.isTTY || process.env.OPENAPI_TO_SKILLMD_PLAIN === "1") {
    return message;
  }

  const icon =
    level === "success" ? "✅" : level === "warning" ? "⚠️" : level === "error" ? "❌" : "";
  const color = level === "success" ? ANSI.green : level === "warning" ? ANSI.yellow : ANSI.red;
  const iconPrefix = emojiEnabled(stream) ? `${icon} ` : "";

  return style(stream, `${iconPrefix}${message}`, color, ANSI.bold);
}

class ProgressRenderer {
  private readonly interactive =
    process.stderr.isTTY &&
    process.env.OPENAPI_TO_SKILLMD_PLAIN !== "1" &&
    process.env.TERM !== "dumb";

  private spinnerTimer: NodeJS.Timeout | undefined;
  private frameIndex = 0;
  private step = 0;
  private message = "";

  update(message: string): void {
    if (!this.interactive) {
      console.error(`[pipeline] ${message}...`);
      return;
    }

    this.step += 1;
    this.message = message;
    this.ensureSpinner();
    this.render();
  }

  complete(status: "success" | "error", message: string): void {
    if (!this.interactive) {
      return;
    }

    this.stopSpinner();
    const line = formatLevelLine(process.stderr, status, message);
    process.stderr.write(`${line}\n`);
  }

  stop(): void {
    if (!this.interactive) {
      return;
    }

    this.stopSpinner();
  }

  private ensureSpinner(): void {
    if (this.spinnerTimer !== undefined) {
      return;
    }

    this.spinnerTimer = setInterval(() => {
      this.render();
    }, 90);

    if (typeof this.spinnerTimer.unref === "function") {
      this.spinnerTimer.unref();
    }
  }

  private stopSpinner(): void {
    if (this.spinnerTimer !== undefined) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
    process.stderr.write("\r\u001B[2K");
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
    this.frameIndex += 1;

    const marker = PROGRESS_MARKERS[this.step % PROGRESS_MARKERS.length];
    const coloredFrame = style(process.stderr, frame, ANSI.cyan, ANSI.bold);
    const pipelineLabel = style(
      process.stderr,
      `pipeline ${String(this.step).padStart(2, "0")}`,
      ANSI.gray,
    );
    const line = `${coloredFrame} ${marker} ${pipelineLabel} ${this.message}`;

    process.stderr.write(`\r\u001B[2K${line}`);
  }
}

const progressRenderer = new ProgressRenderer();

function parseLlmProvider(value: string): LlmProvider {
  if (value === "openai" || value === "anthropic") {
    return value;
  }

  throw new Error(`Invalid --provider value: ${value}. Supported providers: openai, anthropic`);
}

function parseGenerateArgs(argv: string[]): ParsedGenerateCommandOptions {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let serverUrl: string | undefined;
  let overridesPath: string | undefined;
  let dryRun = false;
  let ignoreConfig = false;
  let saveConfig = false;
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
      case "--ignore-config": {
        ignoreConfig = true;
        break;
      }
      case "--save-config": {
        saveConfig = true;
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
    ignoreConfig,
    saveConfig,
    overridesPath,
    llmProvider,
    llmModel,
    llmTemperature,
    llmMaxOutputTokens,
  };
}

function parseGenerateSegmentedArgs(argv: string[]): ParsedGenerateSegmentedCommandOptions {
  let inputPath: string | undefined;
  let outputDir: string | undefined;
  let serverUrl: string | undefined;
  let segmentParallelism: number | undefined;
  let overridesPath: string | undefined;
  let dryRun = false;
  let ignoreConfig = false;
  let saveConfig = false;
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
      case "--ignore-config": {
        ignoreConfig = true;
        break;
      }
      case "--save-config": {
        saveConfig = true;
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
    ignoreConfig,
    saveConfig,
    overridesPath,
    llmProvider,
    llmModel,
    llmTemperature,
    llmMaxOutputTokens,
  };
}

interface ConfigSetOptions {
  provider?: LlmProvider;
  model?: string;
}

function parseConfigSetArgs(argv: string[]): ConfigSetOptions {
  let provider: LlmProvider | undefined;
  let model: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--provider": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --provider");
        }
        provider = parseLlmProvider(value);
        index += 1;
        break;
      }
      case "--model": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --model");
        }
        model = value;
        index += 1;
        break;
      }
      default: {
        throw new Error(`Unknown argument: ${token}`);
      }
    }
  }

  return { provider, model };
}

async function resolveLlmSelection(options: {
  llmProvider?: LlmProvider;
  llmModel?: string;
  ignoreConfig: boolean;
  saveConfig: boolean;
}): Promise<{ provider: LlmProvider; model: string }> {
  const config = options.ignoreConfig ? undefined : await readUserConfig();
  const provider = options.llmProvider ?? config?.provider;
  const model = options.llmModel ?? config?.model;

  if (!provider) {
    throw new Error(
      "No LLM provider configured. Pass --provider or run `openapi-to-skillmd config set --provider <openai|anthropic> --model <id>`.",
    );
  }

  if (!model || model.trim().length === 0) {
    throw new Error(
      "No LLM model configured. Pass --model or run `openapi-to-skillmd config set --provider <openai|anthropic> --model <id>`.",
    );
  }

  const resolved = { provider, model };
  if (options.saveConfig) {
    await writeUserConfig(resolved);
    console.log(
      formatLevelLine(
        process.stdout,
        "success",
        `Saved model preference to ${resolveUserConfigPath()}`,
      ),
    );
  }

  return resolved;
}

async function handleConfigCommand(argv: string[]): Promise<void> {
  const [subcommand, ...subArgs] = argv;
  if (!subcommand || subcommand === "-h" || subcommand === "--help") {
    console.log(CONFIG_USAGE.trim());
    return;
  }

  if (subcommand === "get") {
    if (subArgs.includes("-h") || subArgs.includes("--help")) {
      console.log(CONFIG_USAGE.trim());
      return;
    }

    if (subArgs.length > 0) {
      throw new Error(`Unknown argument: ${subArgs[0]}`);
    }

    const config = await readUserConfig();
    if (!config) {
      console.log(`No config saved at ${resolveUserConfigPath()}`);
      return;
    }

    console.log(
      JSON.stringify(
        {
          configPath: resolveUserConfigPath(),
          provider: config.provider,
          model: config.model,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (subcommand === "set") {
    if (subArgs.includes("-h") || subArgs.includes("--help")) {
      console.log(CONFIG_USAGE.trim());
      return;
    }

    const options = parseConfigSetArgs(subArgs);
    if (!options.provider) {
      throw new Error("Missing required --provider argument");
    }
    if (!options.model || options.model.trim().length === 0) {
      throw new Error("Missing required --model argument");
    }

    await writeUserConfig({ provider: options.provider, model: options.model });
    console.log(
      formatLevelLine(process.stdout, "success", `Saved config to ${resolveUserConfigPath()}`),
    );
    return;
  }

  if (subcommand === "clear") {
    if (subArgs.includes("-h") || subArgs.includes("--help")) {
      console.log(CONFIG_USAGE.trim());
      return;
    }

    if (subArgs.length > 0) {
      throw new Error(`Unknown argument: ${subArgs[0]}`);
    }

    await clearUserConfig();
    console.log(
      formatLevelLine(process.stdout, "success", `Cleared config at ${resolveUserConfigPath()}`),
    );
    return;
  }

  throw new Error(`Unknown config command: ${subcommand}`);
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const codePrefix = diagnostic.code ? `[${diagnostic.code}] ` : "";
    const line = `${diagnostic.level.toUpperCase()}: ${codePrefix}${diagnostic.message}`;
    if (diagnostic.level === "error") {
      console.error(formatLevelLine(process.stderr, "error", line));
    } else {
      console.log(formatLevelLine(process.stdout, "warning", line));
    }
  }
}

function printProgress(message: string): void {
  progressRenderer.update(message);
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

  if (command === "config") {
    await handleConfigCommand(argv);
    return;
  }

  if (command === "generate") {
    if (argv.includes("-h") || argv.includes("--help")) {
      console.log(GENERATE_USAGE.trim());
      return;
    }

    const options = parseGenerateArgs(argv);
    const llmSelection = await resolveLlmSelection(options);
    const result = await generateSkill({
      inputPath: options.inputPath,
      outputPath: options.outputPath,
      serverUrl: options.serverUrl,
      dryRun: options.dryRun,
      overridesPath: options.overridesPath,
      llmProvider: llmSelection.provider,
      llmModel: llmSelection.model,
      llmTemperature: options.llmTemperature,
      llmMaxOutputTokens: options.llmMaxOutputTokens,
      onProgress: printProgress,
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
    return;
  }

  if (command === "generate-segmented") {
    if (argv.includes("-h") || argv.includes("--help")) {
      console.log(GENERATE_SEGMENTED_USAGE.trim());
      return;
    }

    const options = parseGenerateSegmentedArgs(argv);
    const llmSelection = await resolveLlmSelection(options);
    const result = await generateSegmentedSkill({
      inputPath: options.inputPath,
      outputDir: options.outputDir,
      serverUrl: options.serverUrl,
      segmentParallelism: options.segmentParallelism,
      dryRun: options.dryRun,
      overridesPath: options.overridesPath,
      llmProvider: llmSelection.provider,
      llmModel: llmSelection.model,
      llmTemperature: options.llmTemperature,
      llmMaxOutputTokens: options.llmMaxOutputTokens,
      onProgress: printProgress,
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
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  progressRenderer.stop();
  console.error("CLI failed to start.", error);
  process.exitCode = 1;
});
