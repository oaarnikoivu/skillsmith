#!/usr/bin/env node

import "dotenv/config";
import { ROOT_USAGE, handleConfigCommand } from "@/cli/parse-args";
import { runGenerate } from "@/cli/commands/generate";
import { runGenerateSegmented } from "@/cli/commands/generate-segmented";

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
    await runGenerate(argv);
    return;
  }

  if (command === "generate-segmented") {
    await runGenerateSegmented(argv);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  console.error("CLI failed to start.", error);
  process.exitCode = 1;
});
