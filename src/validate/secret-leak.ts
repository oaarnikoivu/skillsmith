import type { Diagnostic } from "@/types";

const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9]{20,}\b/g;
const ANTHROPIC_KEY_PATTERN = /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g;
const GITHUB_TOKEN_PATTERN = /\bgh[pousr]_[A-Za-zA-Z0-9]{20,}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g;

const AUTHORIZATION_HEADER_PATTERN =
  /authorization\s*:\s*bearer\s+(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`]+))/gi;
const API_KEY_HEADER_PATTERN = /x-api-key\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`]+))/gi;
const BASIC_AUTH_PATTERN =
  /(?:https?:\/\/)([^:\s/]+):([^@\s/]+)@|authorization\s*:\s*basic\s+(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`]+))/gi;

const DEFAULT_ENV_SECRET_NAMES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;

function isPlaceholderLike(value: string): boolean {
  const candidate = value.trim().replace(/^['"`]|['"`]$/g, "");
  if (candidate.length === 0) {
    return true;
  }

  if (
    /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(candidate) ||
    /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(candidate)
  ) {
    return true;
  }

  if (/^<[^>]+>$/.test(candidate)) {
    return true;
  }

  if (
    /^(?:YOUR|REPLACE|INSERT|ENTER|EXAMPLE|DUMMY|REDACTED|MASKED|PLACEHOLDER)[A-Z0-9_ -]*$/i.test(
      candidate,
    )
  ) {
    return true;
  }

  if (candidate === "***" || candidate === "..." || /^x{6,}$/i.test(candidate)) {
    return true;
  }

  return false;
}

function extractFirstDefined(groups: readonly (string | undefined)[]): string | undefined {
  for (const group of groups) {
    if (group !== undefined) {
      return group;
    }
  }
  return undefined;
}

function envSecretNamesFromConfig(): string[] {
  const raw = process.env.SKILLSMITH_SECRET_ENV_NAMES;
  if (!raw) {
    return [...DEFAULT_ENV_SECRET_NAMES];
  }

  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return [...new Set([...DEFAULT_ENV_SECRET_NAMES, ...names])];
}

function redactedPreview(value: string): string {
  if (value.length <= 8) {
    return "***";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function addLikelyPatternDiagnostics(
  markdown: string,
  diagnostics: Diagnostic[],
  pattern: RegExp,
  label: string,
): void {
  const matches = markdown.match(pattern);
  if (!matches || matches.length === 0) {
    return;
  }

  diagnostics.push({
    level: "error",
    code: "OUTPUT_SECRET_LIKELY",
    message: `Rendered markdown contains a value matching ${label}. Replace it with a placeholder.`,
  });
}

function addHeaderLiteralDiagnostics(
  markdown: string,
  diagnostics: Diagnostic[],
  pattern: RegExp,
  headerName: string,
): void {
  const matches = markdown.matchAll(pattern);
  for (const match of matches) {
    const value = extractFirstDefined(match.slice(1));
    if (!value || isPlaceholderLike(value)) {
      continue;
    }

    diagnostics.push({
      level: "error",
      code: "OUTPUT_SECRET_HEADER_LITERAL",
      message: `Rendered markdown contains a literal credential in "${headerName}" (${redactedPreview(value)}). Use a placeholder instead.`,
    });
  }
}

function addEnvSecretMatchDiagnostics(markdown: string, diagnostics: Diagnostic[]): void {
  const envNames = envSecretNamesFromConfig();
  for (const envName of envNames) {
    const envValue = process.env[envName];
    if (!envValue || envValue.trim().length === 0) {
      continue;
    }

    if (!markdown.includes(envValue)) {
      continue;
    }

    diagnostics.push({
      level: "error",
      code: "OUTPUT_SECRET_ENV_MATCH",
      message: `Rendered markdown contains the value of environment variable "${envName}". Replace it with a placeholder.`,
    });
  }
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }

  return result;
}

export function validateNoSecretLeaks(markdown: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  addLikelyPatternDiagnostics(
    markdown,
    diagnostics,
    OPENAI_KEY_PATTERN,
    "an OpenAI API key pattern",
  );
  addLikelyPatternDiagnostics(
    markdown,
    diagnostics,
    ANTHROPIC_KEY_PATTERN,
    "an Anthropic API key pattern",
  );
  addLikelyPatternDiagnostics(
    markdown,
    diagnostics,
    GITHUB_TOKEN_PATTERN,
    "a GitHub token pattern",
  );
  addLikelyPatternDiagnostics(markdown, diagnostics, JWT_PATTERN, "a JWT token pattern");
  addLikelyPatternDiagnostics(
    markdown,
    diagnostics,
    PRIVATE_KEY_PATTERN,
    "a private key block pattern",
  );

  addHeaderLiteralDiagnostics(markdown, diagnostics, AUTHORIZATION_HEADER_PATTERN, "Authorization");
  addHeaderLiteralDiagnostics(markdown, diagnostics, API_KEY_HEADER_PATTERN, "x-api-key");
  addHeaderLiteralDiagnostics(markdown, diagnostics, BASIC_AUTH_PATTERN, "basic authentication");
  addEnvSecretMatchDiagnostics(markdown, diagnostics);

  return dedupeDiagnostics(diagnostics);
}
