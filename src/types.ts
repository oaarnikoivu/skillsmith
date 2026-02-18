export type DiagnosticLevel = "info" | "warning" | "error";
export type JsonObject = Record<string, unknown>;
export type LlmProvider = "openai" | "anthropic";
export type InputType = "openapi";

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  code?: string;
}

export interface GenerateCommandOptions {
  inputType: InputType;
  inputPath: string;
  outputPath?: string;
  serverUrl?: string;
  dryRun: boolean;
  overridesPath?: string;
  llmProvider: LlmProvider;
  llmModel: string;
  llmMaxOutputTokens?: number;
  onProgress?: (message: string) => void;
}

export interface GenerateSkillResult {
  markdown: string;
  diagnostics: Diagnostic[];
}

export interface GenerateSegmentedCommandOptions {
  inputType: InputType;
  inputPath: string;
  outputDir?: string;
  serverUrl?: string;
  segmentParallelism?: number;
  dryRun: boolean;
  overridesPath?: string;
  llmProvider: LlmProvider;
  llmModel: string;
  llmMaxOutputTokens?: number;
  onProgress?: (message: string) => void;
}

export interface GeneratedSkillFile {
  path: string;
  markdown: string;
}

export interface GenerateSegmentedSkillResult {
  files: GeneratedSkillFile[];
  diagnostics: Diagnostic[];
  defaultOutputDir: string;
}

export interface OpenApiDocumentEnvelope {
  sourcePath: string;
  document: JsonObject;
}

export interface ResolvedOpenApiDocumentEnvelope {
  sourcePath: string;
  document: JsonObject;
}

export interface NormalizedOpenApiDocumentEnvelope {
  sourcePath: string;
  document: JsonObject;
}

export interface ValidationReport {
  valid: boolean;
  diagnostics: Diagnostic[];
}
