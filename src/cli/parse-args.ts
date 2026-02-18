import { APP_NAME } from "@/config";
import { formatLevelLine } from "@/cli/progress";
import {
  clearUserConfig,
  readUserConfig,
  resolveUserConfigPath,
  writeUserConfig,
} from "@/user-config";
import type {
  GenerateCommandOptions,
  GenerateSegmentedCommandOptions,
  InputType,
  LlmProvider,
} from "@/types";

export const ROOT_USAGE = `
${APP_NAME} - Convert OpenAPI specs into SKILL.md files

Usage:
  ${APP_NAME} generate --input <path-or-url> [--type <openapi>|--input-type <openapi>] [--provider <openai|anthropic>] [--model <id>] [--output <path>] [--dry-run] [--overrides <path>]
  ${APP_NAME} generate-segmented --input <path-or-url> [--type <openapi>|--input-type <openapi>] [--provider <openai|anthropic>] [--model <id>] [--output-dir <path>] [--dry-run] [--overrides <path>]
  ${APP_NAME} config <set|get|clear> [options]
  ${APP_NAME} --help
`;

export const GENERATE_USAGE = `
Usage:
  ${APP_NAME} generate --input <path-or-url> [--type <openapi>|--input-type <openapi>] [--provider <openai|anthropic>] [--model <id>] [--output <path>] [--dry-run] [--overrides <path>]

Options:
  -i, --input <path>       Path or URL to OpenAPI JSON/YAML source (required)
      --type <type>        Input type: openapi (default: openapi)
      --input-type <type>  Alias for --type
  -o, --output <path>      Output path for generated SKILL.md (default: out/SKILL.md)
      --server-url <url>   Override/inject API base URL for generated skills
      --dry-run            Run generation without writing output files
      --overrides <path>   Optional path to overrides file
      --provider <name>    LLM provider: openai | anthropic
      --model <id>         LLM model id
      --ignore-config      Do not read provider/model from user config
      --save-config        Save resolved provider/model as user preference
      --max-output-tokens <n>  LLM max output tokens
  -h, --help               Show help for generate command
`;

export const GENERATE_SEGMENTED_USAGE = `
Usage:
  ${APP_NAME} generate-segmented --input <path-or-url> [--type <openapi>|--input-type <openapi>] [--provider <openai|anthropic>] [--model <id>] [--output-dir <path>] [--dry-run] [--overrides <path>]

Options:
  -i, --input <path>       Path or URL to OpenAPI JSON/YAML source (required)
      --type <type>        Input type: openapi (default: openapi)
      --input-type <type>  Alias for --type
      --output-dir <path>  Output directory for segmented skill files (default: out/<api>-skills)
      --server-url <url>   Override/inject API base URL for generated skills
      --parallelism <n>    Number of segments to generate concurrently (default: 3)
      --dry-run            Run generation without writing output files
      --overrides <path>   Optional path to overrides file
      --provider <name>    LLM provider: openai | anthropic
      --model <id>         LLM model id
      --ignore-config      Do not read provider/model from user config
      --save-config        Save resolved provider/model as user preference
      --max-output-tokens <n>  LLM max output tokens
  -h, --help               Show help for generate-segmented command
`;

export const CONFIG_USAGE = `
Usage:
  ${APP_NAME} config set --provider <openai|anthropic> --model <id>
  ${APP_NAME} config get
  ${APP_NAME} config clear

Options:
      --provider <name>    LLM provider to persist
      --model <id>         LLM model id to persist
  -h, --help               Show help for config command
`;

export interface ParsedGenerateCommandOptions extends Omit<
  GenerateCommandOptions,
  "llmProvider" | "llmModel"
> {
  llmProvider?: LlmProvider;
  llmModel?: string;
  ignoreConfig: boolean;
  saveConfig: boolean;
}

export interface ParsedGenerateSegmentedCommandOptions extends Omit<
  GenerateSegmentedCommandOptions,
  "llmProvider" | "llmModel"
> {
  llmProvider?: LlmProvider;
  llmModel?: string;
  ignoreConfig: boolean;
  saveConfig: boolean;
}

interface CommonParsedOptions {
  inputType: InputType;
  inputPath?: string;
  serverUrl?: string;
  overridesPath?: string;
  dryRun: boolean;
  ignoreConfig: boolean;
  saveConfig: boolean;
  llmProvider?: LlmProvider;
  llmModel?: string;
  llmMaxOutputTokens?: number;
}

function parseLlmProvider(value: string): LlmProvider {
  if (value === "openai" || value === "anthropic") {
    return value;
  }

  throw new Error(`Invalid --provider value: ${value}. Supported providers: openai, anthropic`);
}

function parseInputType(value: string): InputType {
  if (value === "openapi") {
    return value;
  }

  throw new Error(`Invalid --type/--input-type value: ${value}. Supported values: openapi`);
}

function parseCommonArgs(argv: string[]): { common: CommonParsedOptions; remaining: string[] } {
  const common: CommonParsedOptions = {
    inputType: "openapi",
    dryRun: false,
    ignoreConfig: false,
    saveConfig: false,
  };
  const remaining: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "-i":
      case "--input": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --input");
        }
        common.inputPath = value;
        index += 1;
        break;
      }
      case "--type":
      case "--input-type": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --type/--input-type");
        }
        common.inputType = parseInputType(value);
        index += 1;
        break;
      }
      case "--server-url": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --server-url");
        }
        common.serverUrl = value;
        index += 1;
        break;
      }
      case "--overrides": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --overrides");
        }
        common.overridesPath = value;
        index += 1;
        break;
      }
      case "--provider": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --provider");
        }
        common.llmProvider = parseLlmProvider(value);
        index += 1;
        break;
      }
      case "--model": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --model");
        }
        common.llmModel = value;
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
        common.llmMaxOutputTokens = parsed;
        index += 1;
        break;
      }
      case "--dry-run": {
        common.dryRun = true;
        break;
      }
      case "--ignore-config": {
        common.ignoreConfig = true;
        break;
      }
      case "--save-config": {
        common.saveConfig = true;
        break;
      }
      default: {
        remaining.push(token);
        break;
      }
    }
  }

  return { common, remaining };
}

export function parseGenerateArgs(argv: string[]): ParsedGenerateCommandOptions {
  const { common, remaining } = parseCommonArgs(argv);
  let outputPath: string | undefined;

  for (let index = 0; index < remaining.length; index += 1) {
    const token = remaining[index];

    switch (token) {
      case "-o":
      case "--output": {
        const value = remaining[index + 1];
        if (!value) {
          throw new Error("Missing value for --output");
        }
        outputPath = value;
        index += 1;
        break;
      }
      default: {
        throw new Error(`Unknown argument: ${token}`);
      }
    }
  }

  if (!common.inputPath) {
    throw new Error("Missing required --input argument");
  }

  return {
    inputType: common.inputType,
    inputPath: common.inputPath,
    outputPath,
    serverUrl: common.serverUrl,
    dryRun: common.dryRun,
    ignoreConfig: common.ignoreConfig,
    saveConfig: common.saveConfig,
    overridesPath: common.overridesPath,
    llmProvider: common.llmProvider,
    llmModel: common.llmModel,
    llmMaxOutputTokens: common.llmMaxOutputTokens,
  };
}

export function parseGenerateSegmentedArgs(argv: string[]): ParsedGenerateSegmentedCommandOptions {
  const { common, remaining } = parseCommonArgs(argv);
  let outputDir: string | undefined;
  let segmentParallelism: number | undefined;

  for (let index = 0; index < remaining.length; index += 1) {
    const token = remaining[index];

    switch (token) {
      case "--output-dir": {
        const value = remaining[index + 1];
        if (!value) {
          throw new Error("Missing value for --output-dir");
        }
        outputDir = value;
        index += 1;
        break;
      }
      case "--parallelism": {
        const value = remaining[index + 1];
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
      default: {
        throw new Error(`Unknown argument: ${token}`);
      }
    }
  }

  if (!common.inputPath) {
    throw new Error("Missing required --input argument");
  }

  return {
    inputType: common.inputType,
    inputPath: common.inputPath,
    outputDir,
    serverUrl: common.serverUrl,
    segmentParallelism,
    dryRun: common.dryRun,
    ignoreConfig: common.ignoreConfig,
    saveConfig: common.saveConfig,
    overridesPath: common.overridesPath,
    llmProvider: common.llmProvider,
    llmModel: common.llmModel,
    llmMaxOutputTokens: common.llmMaxOutputTokens,
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

export async function resolveLlmSelection(options: {
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
      "No LLM provider configured. Pass --provider or run `skillsmith config set --provider <openai|anthropic> --model <id>`.",
    );
  }

  if (!model || model.trim().length === 0) {
    throw new Error(
      "No LLM model configured. Pass --model or run `skillsmith config set --provider <openai|anthropic> --model <id>`.",
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

export async function handleConfigCommand(argv: string[]): Promise<void> {
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
