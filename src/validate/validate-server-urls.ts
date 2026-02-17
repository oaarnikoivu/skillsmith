import type { SpecIR } from "@/ir/ir-types";
import type { Diagnostic } from "@/types";

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isPlaceholderHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "example.com" ||
    normalized.endsWith(".example.com") ||
    normalized === "example.org" ||
    normalized.endsWith(".example.org") ||
    normalized === "example.net" ||
    normalized.endsWith(".example.net") ||
    normalized.endsWith(".example") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid")
  );
}

export function hasUsableServerUrl(specIR: SpecIR): boolean {
  for (const serverUrl of specIR.servers) {
    const parsed = parseUrl(serverUrl);
    if (!parsed) {
      continue;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      continue;
    }

    if (!isPlaceholderHost(parsed.hostname)) {
      return true;
    }
  }

  return false;
}

export function validateServerUrls(specIR: SpecIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (specIR.servers.length === 0) {
    diagnostics.push({
      level: "error",
      code: "SERVER_URL_REQUIRED",
      message:
        "No server URL is configured. Provide one via --server-url or overrides.servers so generated skills include a valid API base URL.",
    });
    return diagnostics;
  }

  let usableCount = 0;
  for (const serverUrl of specIR.servers) {
    const parsed = parseUrl(serverUrl);
    if (!parsed) {
      diagnostics.push({
        level: "error",
        code: "SERVER_URL_INVALID",
        message: `Server URL "${serverUrl}" is not a valid absolute URL.`,
      });
      continue;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      diagnostics.push({
        level: "error",
        code: "SERVER_URL_INVALID",
        message: `Server URL "${serverUrl}" must use http or https.`,
      });
      continue;
    }

    if (isPlaceholderHost(parsed.hostname)) {
      diagnostics.push({
        level: "warning",
        code: "SERVER_URL_PLACEHOLDER",
        message: `Server URL "${serverUrl}" looks like a placeholder and should be replaced with a real domain.`,
      });
      continue;
    }

    usableCount += 1;
  }

  if (usableCount === 0) {
    diagnostics.push({
      level: "error",
      code: "SERVER_URL_REQUIRED",
      message:
        "No usable non-placeholder server URL is configured. Provide one via --server-url or overrides.servers.",
    });
  }

  return diagnostics;
}
