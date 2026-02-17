import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { LlmProvider } from "@/types";

const CONFIG_ENV_PATH = "SKILLSMITH_CONFIG_PATH";

export interface UserConfig {
  provider: LlmProvider;
  model: string;
}

function defaultConfigDir(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData && appData.trim().length > 0) {
      return join(appData, "skillsmith");
    }

    return join(homedir(), "AppData", "Roaming", "skillsmith");
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim().length > 0) {
    return join(xdgConfigHome, "skillsmith");
  }

  return join(homedir(), ".config", "skillsmith");
}

export function resolveUserConfigPath(): string {
  const overridePath = process.env[CONFIG_ENV_PATH];
  if (overridePath && overridePath.trim().length > 0) {
    return overridePath;
  }

  return join(defaultConfigDir(), "config.json");
}

function parseProvider(value: unknown): LlmProvider | undefined {
  if (value === "openai" || value === "anthropic") {
    return value;
  }

  return undefined;
}

export async function readUserConfig(
  path = resolveUserConfigPath(),
): Promise<UserConfig | undefined> {
  try {
    const file = await readFile(path, "utf8");
    const parsed = JSON.parse(file) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Config content must be a JSON object.");
    }

    const provider = parseProvider((parsed as Record<string, unknown>).provider);
    if (!provider) {
      throw new Error('Config "provider" must be "openai" or "anthropic".');
    }

    const model = (parsed as Record<string, unknown>).model;
    if (typeof model !== "string" || model.trim().length === 0) {
      throw new Error('Config "model" must be a non-empty string.');
    }

    return { provider, model };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return undefined;
    }

    throw new Error(
      `Failed to read config at ${path}. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function writeUserConfig(
  config: UserConfig,
  path = resolveUserConfigPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), { encoding: "utf8", flag: "w" });
}

export async function clearUserConfig(path = resolveUserConfigPath()): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch (error) {
    throw new Error(
      `Failed to clear config at ${path}. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
