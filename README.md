# skillsmith

[![CI](https://github.com/oaarnikoivu/skillsmith/actions/workflows/ci.yml/badge.svg)](https://github.com/oaarnikoivu/skillsmith/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40aarnio%2Fskillsmith.svg)](https://www.npmjs.com/package/@aarnio/skillsmith)
[![license](https://img.shields.io/npm/l/%40aarnio%2Fskillsmith.svg)](./LICENSE)

Generate agent-ready `SKILL.md` files from API specs.

`skillsmith` is an LLM-first CLI that turns OpenAPI specs into practical, validated skills for autonomous agents.

## Features

- Generate a single `SKILL.md` from an OpenAPI spec.
- Generate segmented skill folders for large APIs.
- Validate output structure and completeness (operations, required params, schemas, auth).
- Reject leaked secrets in generated markdown.
- Auto-repair failed outputs with follow-up LLM prompts.
- Refuse to write files when validation still fails.

## Install

### Global

```bash
npm install -g @aarnio/skillsmith
skillsmith --help
```

### One-off with npx

```bash
npx @aarnio/skillsmith@latest --help
```

### Requirements

- Node.js `>=20`

## Quick Start

Set your provider key in environment:

```bash
export OPENAI_API_KEY="your_key_here"
# or
export ANTHROPIC_API_KEY="your_key_here"
```

Generate one skill file:

```bash
skillsmith generate \
  --input ./openapi.json \
  --type openapi \
  --provider openai \
  --model gpt-5.2 \
  --server-url https://api.example.com
```

Generate segmented skills (recommended for bigger specs):

```bash
skillsmith generate-segmented \
  --input ./openapi.json \
  --type openapi \
  --provider openai \
  --model gpt-5.2 \
  --server-url https://api.example.com
```

For larger APIs, increase token budget:

```bash
skillsmith generate \
  --input ./openapi.json \
  --type openapi \
  --provider openai \
  --model gpt-5.2 \
  --server-url https://api.example.com \
  --max-output-tokens 12000
```

Default outputs:

```text
generate            -> out/SKILL.md
generate-segmented  -> out/<api-slug>-skills/
```

## Commands

### `generate`

Create a single `SKILL.md`.

```bash
skillsmith generate --input <path-or-url> [options]
```

Common options:

- `--type <openapi>` or `--input-type <openapi>`
- `--provider <openai|anthropic>`
- `--model <id>`
- `--server-url <url>`
- `--output <path>`
- `--overrides <path>`
- `--dry-run`
- `--max-output-tokens <n>`

Tip: if your API is large or generated output gets truncated, increase `--max-output-tokens` (for example `9000` to `16000`, depending on model limits).

### `generate-segmented`

Create a routed skill directory with grouped files.

```bash
skillsmith generate-segmented --input <path-or-url> [options]
```

Common options:

- `--type <openapi>` or `--input-type <openapi>`
- `--provider <openai|anthropic>`
- `--model <id>`
- `--server-url <url>`
- `--output-dir <path>`
- `--parallelism <n>`
- `--overrides <path>`
- `--dry-run`
- `--max-output-tokens <n>`

Tip: segmented mode also benefits from higher `--max-output-tokens` when segments still contain many operations/schemas.

### `config`

Store preferred provider/model locally:

```bash
skillsmith config set --provider openai --model gpt-5.2
skillsmith config get
skillsmith config clear
```

Then you can omit `--provider` and `--model` in generate commands.

## Input Types

`skillsmith` accepts a `--type`/`--input-type` argument.

Currently supported:

- `openapi`

This is intentionally extensible for future inputs (for example GraphQL).

## Environment Variables

Required (depending on provider):

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Optional:

- `SKILLSMITH_CONFIG_PATH`
- `SKILLSMITH_SECRET_ENV_NAMES`
- `SKILLSMITH_SEGMENT_PARALLELISM`
- `SKILLSMITH_LLM_MOCK_RESPONSE`
- `SKILLSMITH_LLM_MOCK_RESPONSES`
- `SKILLSMITH_PLAIN`
- `SKILLSMITH_NO_EMOJI`

The CLI also auto-loads `.env` in the working directory.

## Validation Guarantees

Before writing output, `skillsmith` validates:

- operations are present and structurally complete
- required parameters are documented
- operation examples are present
- required auth sections/schemes are documented
- required/transitive schemas are documented
- generated markdown does not contain likely secret leaks

If any error-level diagnostics remain, output is not written.

## Security Model

Do not put real credentials in `SKILL.md`.

Use placeholders in generated docs (for example `$API_KEY`, `$BEARER_TOKEN`) and inject real values at runtime via environment variables or your secret manager.

## Documentation

- Publish guide: `docs/publish-npm.md`
- Release workflow guide: `docs/release.md`
- FastAPI auth example fixture: `examples/fastapi_auth_demo/README.md`

## Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

## License

MIT. See `LICENSE`.
