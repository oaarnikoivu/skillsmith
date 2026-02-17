# skillsmith

Generate high-quality `SKILL.md` documentation from OpenAPI specs for autonomous agents.

This tool is intentionally **LLM-first** and **validation-driven**:

- It does not use deterministic markdown rendering as a fallback.
- It validates generated output against strict structural rules.
- It attempts automatic repair with follow-up LLM prompts.
- It refuses to write files when validation still fails.

## What this tool does

`skillsmith` converts an OpenAPI document (`.json`, `.yaml`, `.yml`) into agent-oriented skill docs in two modes:

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

## npm package usage

If you install this CLI as an npm package (instead of cloning the repo), use:

```bash
npm install -g @aarnio/skillsmith
```

Or run without global install:

```bash
npx @aarnio/skillsmith@latest --help
```

## Publish to npm

Before first publish:

1. Ensure package name is available (`npm view @aarnio/skillsmith`).
2. If unavailable, switch to a scoped name (for example `@your-scope/skillsmith`) in `package.json`.
3. Login to npm: `npm login`.

Release flow:

1. Bump version in `package.json` (or use `npm version patch|minor|major`).
2. Validate package contents: `pnpm pack --dry-run`.
3. Publish: `npm publish --access public`.

Notes:

- `prepack` runs `pnpm build`, so `dist/` is always generated before packing.
- `prepublishOnly` runs lint + tests as a publish gate.
- Published files are limited to `dist/`, `README.md`, and `LICENSE`.

### API key setup (OPENAI)

Set your key in your shell environment. Do not store secrets in git-tracked files.

#### macOS / Linux (zsh or bash)

Current terminal session only:

```bash
export OPENAI_API_KEY="your_openai_api_key_here"
```

Persist for future sessions (`~/.zshrc` or `~/.bashrc`):

```bash
echo 'export OPENAI_API_KEY="your_openai_api_key_here"' >> ~/.zshrc
source ~/.zshrc
```

#### Windows PowerShell

Current terminal session only:

```powershell
$env:OPENAI_API_KEY = "your_openai_api_key_here"
```

Persist for your user:

```powershell
[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "your_openai_api_key_here", "User")
```

#### Windows Command Prompt (cmd.exe)

Current terminal session only:

```cmd
set OPENAI_API_KEY=your_openai_api_key_here
```

Persist for your user:

```cmd
setx OPENAI_API_KEY "your_openai_api_key_here"
```

### Optional `.env` usage

You can also place `OPENAI_API_KEY=...` in a `.env` file in your current working directory.
The CLI auto-loads `.env` at startup.

### Quick verification

```bash
skillsmith config set --provider openai --model gpt-5.2
skillsmith generate --input path/to/openapi.json
```

## Quick start

Single file:

```bash
node dist/cli.js generate --input path/to/openapi.json --provider openai --model gpt-5.2
```

Segmented output:

```bash
node dist/cli.js generate-segmented --input path/to/openapi.json --provider openai --model gpt-5.2
```

Or save your preferred provider/model once and omit them later:

```bash
node dist/cli.js config set --provider openai --model gpt-5.2
```

## CLI reference

### Root command

```bash
skillsmith generate --input <path-or-url> [--type <openapi>|--input-type <openapi>] [--provider <openai|anthropic>] [--model <id>] [options]
skillsmith generate-segmented --input <path-or-url> [--type <openapi>|--input-type <openapi>] [--provider <openai|anthropic>] [--model <id>] [options]
skillsmith config <set|get|clear> [options]
```

### `generate` options

```text
-i, --input <path-or-url>       Required OpenAPI input source (local file path or http/https URL)
    --type <openapi>            Input type (default: openapi)
    --input-type <openapi>      Alias for --type
-o, --output <path>             Output markdown path (default: out/SKILL.md)
    --server-url <url>          Override/inject API base URL used in generated skills
    --dry-run                   Print markdown to stdout, do not write files
    --overrides <path>          Optional overrides YAML/JSON
    --provider <openai|anthropic>  LLM provider (overrides cached config)
    --model <id>                   LLM model id (overrides cached config)
    --ignore-config                Ignore cached provider/model
    --save-config                  Save resolved provider/model to config
    --temperature <n>
    --max-output-tokens <n>     Default: 6000
-h, --help
```

### `generate-segmented` options

```text
-i, --input <path-or-url>       Required OpenAPI input source (local file path or http/https URL)
    --type <openapi>            Input type (default: openapi)
    --input-type <openapi>      Alias for --type
    --output-dir <path>         Output directory (default: out/<api>-skills)
    --server-url <url>          Override/inject API base URL used in generated skills
    --parallelism <n>           Segment concurrency (default: 3)
    --dry-run                   Print all files to stdout with file markers
    --overrides <path>          Optional overrides YAML/JSON
    --provider <openai|anthropic>  LLM provider (overrides cached config)
    --model <id>                   LLM model id (overrides cached config)
    --ignore-config                Ignore cached provider/model
    --save-config                  Save resolved provider/model to config
    --temperature <n>
    --max-output-tokens <n>     Default: 6000
-h, --help
```

### `config` options

```text
config set --provider <openai|anthropic> --model <id>
config get
config clear
```

## How generation works (pipeline)

### Common pipeline

Both commands run this preprocessing flow:

1. Load spec from local path or URL (`json`/`yaml`).
2. Resolve/bundle `$ref` (local refs only; HTTP refs disabled).
3. Normalize OpenAPI shapes used by the IR builder.
4. Validate OpenAPI structure and emit diagnostics.
5. Build IR (title/version/servers/securitySchemes/operations/schemas).
6. Apply optional overrides.
7. Validate server URLs (must include at least one usable non-placeholder `http/https` URL, or use `--server-url`).

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
- For protected operations, operation sections must include auth guidance and referenced scheme names.

### Authentication checks

- If any operation has OpenAPI security requirements, `## Authentication` section must exist.
- All referenced security schemes must be documented under `## Authentication` (e.g. `### \`BearerAuth\``).
- Security requirements are derived from OpenAPI `components.securitySchemes`, top-level `security`, and operation-level `security` overrides.

### Secret leak checks

- Generated markdown is scanned for likely secret/token patterns.
- Literal credentials in auth headers are blocked (for example `Authorization: Bearer <literal>` and `x-api-key: <literal>`).
- Private key block patterns and common token formats are blocked.
- Placeholder-style values are allowed (for example `$API_KEY`, `${API_KEY}`, `<TOKEN>`, `REDACTED`).
- Optional exact-value env matching is available via `SKILLSMITH_SECRET_ENV_NAMES`.

### Schema checks

- If operations reference schemas, `## Schemas` section must exist.
- All required referenced schemas must be documented.
- Transitive schema dependencies are included (via `$ref` closure).

### Root router checks (segmented)

- `## Skill Files` section exists.
- Every expected segment file heading exists.
- Segment entry mentions all operation IDs assigned to that file.

### Server URL checks

- At least one usable non-placeholder server URL must exist before generation.
- Placeholder hosts such as `.example`, `.test`, `.invalid`, and localhost are rejected as usable base URLs.
- If your spec is missing real servers (or uses placeholder domains), pass `--server-url https://your-real-host`.

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

You need the key matching the resolved provider unless a mock-response env var is used.

### User config path

User preference file location:

- macOS/Linux: `~/.config/skillsmith/config.json` (or `$XDG_CONFIG_HOME/skillsmith/config.json`)
- Windows: `%APPDATA%\skillsmith\config.json`

For tests/advanced setups, override path with:

- `SKILLSMITH_CONFIG_PATH`

### Provider config

- `SKILLSMITH_SECRET_ENV_NAMES` (optional, comma-separated env var names whose values must never appear in generated markdown)

## Agent Runtime Credentials (Important)

When generated skills describe API authentication (API key, bearer, basic auth, cookie, OAuth token), follow this rule:

- Keep credentials out of `SKILL.md`.
- Keep credentials out of prompts, logs, and git-tracked files.
- Provide credentials at runtime via environment variables or a secret manager.

### What to put in `SKILL.md`

- Auth mechanism and header/cookie/query shape.
- Placeholder names only, for example:
  - `Authorization: Bearer $API_BEARER_TOKEN`
  - `x-api-key: $API_KEY`
  - basic auth with `$API_USERNAME` / `$API_PASSWORD`
  - cookie value placeholder such as `$SESSION_TOKEN`

### What users should do at runtime

- Export secrets in the environment before running the agent/tooling.
- Example (macOS/Linux):

```bash
export API_KEY=\"your_real_api_key\"
export API_BEARER_TOKEN=\"your_real_bearer_token\"
export API_USERNAME=\"your_username\"
export API_PASSWORD=\"your_password\"
export SESSION_TOKEN=\"your_session_token\"
```

- On Windows, set equivalent env vars in PowerShell or cmd.

### Execution model

- Agent decides _what request to make_.
- A trusted runtime tool/wrapper injects credentials from env vars into headers/cookies.
- Agent output should never reveal raw secret values.

### Logging and safety

- Redact auth headers/cookies/tokens in logs and traces.
- Avoid printing full request headers if they include credentials.
- Use least-privilege credentials and rotate them regularly.

### Segmented parallelism

- `SKILLSMITH_SEGMENT_PARALLELISM`
- Used only if `--parallelism` is not provided.

### Test/dev LLM mocking

1. Single-response mock:

- `SKILLSMITH_LLM_MOCK_RESPONSE`

2. Ordered multi-response mock (for multi-call flows like segmented generation):

- `SKILLSMITH_LLM_MOCK_RESPONSES`
- Must be a JSON array of strings.

Important:

- When ordered mock responses are active, segmented generation runs sequentially to preserve deterministic response ordering.

## Examples

### Single file to default path

```bash
node dist/cli.js generate --input spec.yaml --server-url https://api.yourdomain.com --provider openai --model gpt-5.2
```

### Single file from URL input

```bash
node dist/cli.js generate --input https://127.0.0.1/openapi.json --provider openai --model gpt-5.2
```

### Single file to custom path

```bash
node dist/cli.js generate --input spec.yaml --server-url https://api.yourdomain.com --provider openai --model gpt-5.2 --output out/my-skill.md
```

### Dry-run single file

```bash
node dist/cli.js generate --input spec.yaml --server-url https://api.yourdomain.com --provider openai --model gpt-5.2 --dry-run
```

### Segmented generation to default dir

```bash
node dist/cli.js generate-segmented --input spec.yaml --server-url https://api.yourdomain.com --provider openai --model gpt-5.2
```

### Segmented generation with custom dir and higher concurrency

```bash
node dist/cli.js generate-segmented --input spec.yaml --server-url https://api.yourdomain.com --provider openai --model gpt-5.2 --output-dir out/my-api-skills --parallelism 5
```

### Anthropic example

```bash
node dist/cli.js generate --input spec.yaml --server-url https://api.yourdomain.com --provider anthropic --model claude-3-5-sonnet-latest
```

### Save provider/model once

```bash
node dist/cli.js config set --provider openai --model gpt-5.2
```

### Generate using saved provider/model

```bash
node dist/cli.js generate --input spec.yaml --server-url https://api.yourdomain.com
```

### Ignore saved config for one run

```bash
node dist/cli.js generate --input spec.yaml --server-url https://api.yourdomain.com --provider anthropic --model claude-3-5-sonnet-latest --ignore-config
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

### `SERVER_URL_REQUIRED`

Your spec has no usable real server URL (or only placeholder/local URLs). Inject one:

```bash
--server-url https://api.yourdomain.com
```

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
