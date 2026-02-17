# openapi-to-skillmd

Generate high-quality `SKILL.md` documentation from OpenAPI specs for autonomous agents.

This tool is intentionally **LLM-first** and **validation-driven**:

- It does not use deterministic markdown rendering as a fallback.
- It validates generated output against strict structural rules.
- It attempts automatic repair with follow-up LLM prompts.
- It refuses to write files when validation still fails.

## What this tool does

`openapi-to-skillmd` converts an OpenAPI document (`.json`, `.yaml`, `.yml`) into agent-oriented skill docs in two modes:

1. `generate`

- Produces a single file (`SKILL.md` style output).

2. `generate-segmented`

- Produces a folder with:
  - a root router file (`SKILL.md`) explaining which file to use
  - multiple group files under `groups/` for specific endpoint domains

Segmented mode is designed for larger APIs where a single prompt/file becomes too large and less reliable.

## Requirements

- Node.js `20+`
- pnpm `10+`

## Install

```bash
pnpm install
```

Build once before using `dist/cli.js`:

```bash
pnpm build
```

## Quick start

Single file:

```bash
node dist/cli.js generate --input path/to/openapi.json
```

Segmented output:

```bash
node dist/cli.js generate-segmented --input path/to/openapi.json
```

## CLI reference

### Root command

```bash
openapi-to-skillmd generate --input <path> [options]
openapi-to-skillmd generate-segmented --input <path> [options]
```

### `generate` options

```text
-i, --input <path>              Required OpenAPI input path
-o, --output <path>             Output markdown path (default: out/SKILL.md)
    --dry-run                   Print markdown to stdout, do not write files
    --overrides <path>          Optional overrides YAML/JSON
    --provider <openai|anthropic>
    --model <id>
    --temperature <n>
    --max-output-tokens <n>     Default: 6000
-h, --help
```

### `generate-segmented` options

```text
-i, --input <path>              Required OpenAPI input path
    --output-dir <path>         Output directory (default: out/<api>-skills)
    --parallelism <n>           Segment concurrency (default: 3)
    --dry-run                   Print all files to stdout with file markers
    --overrides <path>          Optional overrides YAML/JSON
    --provider <openai|anthropic>
    --model <id>
    --temperature <n>
    --max-output-tokens <n>     Default: 6000
-h, --help
```

## How generation works (pipeline)

### Common pipeline

Both commands run this preprocessing flow:

1. Load spec from disk (`json`/`yaml`).
2. Resolve/bundle `$ref` (local refs only; HTTP refs disabled).
3. Normalize OpenAPI shapes used by the IR builder.
4. Validate OpenAPI structure and emit diagnostics.
5. Build IR (title/version/servers/operations/schemas).
6. Apply optional overrides.

Then the LLM generation phase starts.

### Single-file mode (`generate`)

1. Build SKILL prompt from full IR.
2. Request draft from LLM.
3. Validate output.
4. If errors exist, run repair prompt loop (`max 3 attempts`).
5. If errors remain:

- exit non-zero
- print diagnostics
- do not write output

### Segmented mode (`generate-segmented`)

1. Build segment plan from IR.
2. Group operations:

- by first tag if present
- otherwise by top-level path segment

3. For each segment, compute required schema subset including transitive `$ref` closure.
4. Generate each segment file with LLM (concurrently, bounded by `--parallelism`).
5. Validate and repair each segment (`max 3 attempts`).
6. Build and generate root router `SKILL.md` (contains file routing guidance).
7. Validate and repair root router (`max 3 attempts`).
8. If any errors remain:

- exit non-zero
- print diagnostics
- do not write files

## Output structure

### `generate`

Default output:

```text
out/SKILL.md
```

### `generate-segmented`

Default output:

```text
out/<api-slug>-skills/
  SKILL.md
  groups/
    <group-1>.SKILL.md
    <group-2>.SKILL.md
    ...
```

Root `SKILL.md` is a router document for agents (when to use which group file).

## Validation rules

The validator enforces strict quality contracts.

### Operation-level checks

- Markdown is not empty.
- `## Operations` section exists (or equivalent parseable operation headings).
- Every expected operation appears.
- Every required parameter appears in that operation section.
- Every operation section includes an example request.

### Schema checks

- If operations reference schemas, `## Schemas` section must exist.
- All required referenced schemas must be documented.
- Transitive schema dependencies are included (via `$ref` closure).

### Root router checks (segmented)

- `## Skill Files` section exists.
- Every expected segment file heading exists.
- Segment entry mentions all operation IDs assigned to that file.

### Write behavior

If any `error` diagnostics remain after repair attempts, the CLI will not write output.

## Diagnostics and exit codes

- Warnings and errors are printed as structured lines:

```text
ERROR: [CODE] Message...
WARNING: [CODE] Message...
```

- Exit code behavior:
- `0` when no error-level diagnostics remain
- non-zero when error-level diagnostics remain or startup fails

## Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The CLI auto-loads `.env` on startup.

### Provider credentials

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

You need the key matching `--provider` unless a mock-response env var is used.

### Optional model/provider config

- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `ANTHROPIC_MODEL`

### Segmented parallelism

- `OPENAPI_TO_SKILLMD_SEGMENT_PARALLELISM`
- Used only if `--parallelism` is not provided.

### Test/dev LLM mocking

1. Single-response mock:

- `OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE`

2. Ordered multi-response mock (for multi-call flows like segmented generation):

- `OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES`
- Must be a JSON array of strings.

Important:

- When ordered mock responses are active, segmented generation runs sequentially to preserve deterministic response ordering.

## Examples

### Single file to default path

```bash
node dist/cli.js generate --input spec.yaml
```

### Single file to custom path

```bash
node dist/cli.js generate --input spec.yaml --output out/my-skill.md
```

### Dry-run single file

```bash
node dist/cli.js generate --input spec.yaml --dry-run
```

### Segmented generation to default dir

```bash
node dist/cli.js generate-segmented --input spec.yaml
```

### Segmented generation with custom dir and higher concurrency

```bash
node dist/cli.js generate-segmented --input spec.yaml --output-dir out/my-api-skills --parallelism 5
```

### Provider/model override

```bash
node dist/cli.js generate --input spec.yaml --provider anthropic --model claude-3-5-sonnet-latest
```

## Overrides

Overrides let you patch IR metadata before prompt generation.

Supported top-level fields:

- `title`
- `version`
- `servers`
- `operations` map keyed by `operationId`

Per-operation override fields:

- `id`
- `summary`
- `parameters` (full replacement)
- `requestBody` (full replacement)
- `responses` (full replacement)

Example:

```yaml
title: My API (Agent Friendly)
version: 1.2.3
servers:
  - https://api.example.com
operations:
  list_clubs_clubs_get:
    summary: List clubs with stable identifiers.
```

## Development commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm format:check
```

## Troubleshooting

### `OPENAI_API_KEY is required...`

Set the provider key in `.env` (or use mock-response env vars for tests).

### Output not written even though pipeline completed

If validation still has errors after repairs, write is intentionally blocked.
Check printed diagnostics and regenerate.

### Missing schema diagnostics (`OUTPUT_SCHEMA_MISSING`)

Your generated `## Schemas` section is incomplete for referenced/transitive schemas.
The tool is strict by design.

### Large specs still fail in single mode

Use segmented mode and/or increase:

```bash
--max-output-tokens 9000
```

### Slow segmented generation

Increase concurrency:

```bash
--parallelism 5
```

(Watch API rate limits.)

## Security notes

- `.env` is gitignored.
- Do not commit real credentials.
- Use `.env.example` for placeholders only.

## Project structure

```text
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

test/
  fixtures/
  golden/
```
