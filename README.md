# openapi-to-skillmd

CLI tool for converting OpenAPI specs into `SKILL.md` files for agent workflows.

## Status

Current implementation includes:

- TypeScript CLI with `generate` command and argument parsing.
- OpenAPI file loading (`.json`, `.yaml`, `.yml`).
- Basic OpenAPI validation with structured diagnostics.
- `$ref` bundling across local files.
- OpenAPI normalization for parameters/responses/request-body schema shapes.
- IR builder that extracts API title/version, operations, and component schema definitions.
- LLM-only `SKILL.md` generation using `ai` + `@ai-sdk/openai`.
- Output validation checks (non-empty output + operation coverage + example requests + referenced schema coverage).

Deterministic rendering is intentionally disabled.

## Requirements

- Node.js 20+
- pnpm 10+

## Install

```bash
pnpm install
```

## Environment

Copy `.env.example` to `.env` and set values as needed.

```bash
cp .env.example .env
```

The CLI auto-loads `.env` at startup.

## Scripts

```bash
pnpm dev
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
```

## CLI Usage

```bash
openapi-to-skillmd generate --input <path> [--output <path>] [--dry-run] [--overrides <path>]
openapi-to-skillmd generate-segmented --input <path> [--output-dir <path>] [--dry-run] [--overrides <path>]
```

Key options:

- Default output path (when not using `--dry-run`): `out/SKILL.md`.
- `--dry-run`: prints output to stdout and skips writing files.
- When validation errors remain after repair attempts, the CLI exits non-zero and does not write output.
- `--overrides <path>`: applies a YAML/JSON override file.
- `--provider <name>`: provider selection (`openai` or `anthropic`).
- `--model <id>`, `--temperature <n>`, `--max-output-tokens <n>`: LLM controls (`max-output-tokens` defaults to `6000`).
- Segmented mode groups operations by first tag (if present), otherwise by top-level path segment.
- Segmented default output directory: `out/<api>-skills`.
- `OPENAI_API_KEY` is required for `openai` provider unless `OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE` is set.
- `ANTHROPIC_API_KEY` is required for `anthropic` provider unless `OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE` is set.

Examples:

```bash
# Print generated markdown (or diagnostics) to stdout
node dist/cli.js generate --input test/fixtures/sample.openapi.json --dry-run

# Write output to default path: out/SKILL.md
node dist/cli.js generate --input spec.yaml

# Write output to explicit file
node dist/cli.js generate --input spec.yaml --output SKILL.md

# Generate with explicit model override
node dist/cli.js generate --input spec.yaml --output SKILL.md --model gpt-4.1-mini

# Generate with Anthropic provider
node dist/cli.js generate --input spec.yaml --output SKILL.md --provider anthropic --model claude-3-5-sonnet-latest

# Generate segmented skills (root + groups/*)
node dist/cli.js generate-segmented --input spec.yaml

# Generate segmented skills to a custom folder
node dist/cli.js generate-segmented --input spec.yaml --output-dir out/my-api-skills
```

## Overrides Format

Overrides accept JSON or YAML. Supported top-level fields:

- `title`
- `version`
- `operations` (map keyed by `operationId`)

Operation override fields:

- `id`
- `summary`
- `parameters` (full replacement)
- `requestBody` (full replacement)
- `responses` (full replacement)

Example:

```yaml
title: My API (Agent Friendly)
version: 1.2.3
operations:
  list_clubs_clubs_get:
    summary: List clubs with stable identifiers.
```

## Project Structure

```txt
src/
  cli.ts
  config.ts
  types.ts
  openapi/
  ir/
  llm/
  segment/
  render/
  validate/
  overrides/
  pipeline/
```
