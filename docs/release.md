# Release Workflow Runbook

This repository publishes `@oaarnikoivu/skillsmith` from `.github/workflows/release.yml`.

## Trigger

- Workflow trigger: tag push matching `v*.*.*`
- Example: `v0.1.0`

## One-time setup

1. Add repository secret `NPM_TOKEN` in GitHub Actions settings.
2. Ensure `package.json` metadata points to this repo:

- `repository.url`
- `bugs.url`
- `homepage`

## Release steps

1. Run local checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

2. Bump version (or manually edit `package.json`):

```bash
npm version patch
```

3. Push commit and tag:

```bash
git push origin main --follow-tags
```

Alternative if tag was created manually:

```bash
git push origin main
git push origin vX.Y.Z
```

4. Verify the `Release` workflow run in GitHub Actions.

## What the workflow does

1. Installs dependencies with `pnpm install --frozen-lockfile`.
2. Runs `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
3. Verifies tag version matches `package.json` version.
4. Blocks duplicate versions already on npm.
5. Builds tarball with `pnpm pack`.
6. Publishes package:

- Public repo: `npm publish --access public --provenance`
- Private repo: `npm publish --access public` (no provenance)

7. Creates GitHub Release and uploads the `.tgz` artifact.

## Troubleshooting

1. Workflow did not trigger:

- Confirm you pushed a tag like `v0.1.0`.
- Confirm `.github/workflows/release.yml` exists in the tagged commit.
- Re-push tag if needed:

```bash
git push origin :refs/tags/v0.1.0
git push origin v0.1.0
```

2. `E422` provenance repository mismatch:

- Update `package.json` repo metadata to match the actual GitHub repo URL.

3. `E422` provenance unsupported for private repo:

- Private repos cannot publish with provenance.
- The workflow already falls back to plain `npm publish` for private repos.

4. Version already exists on npm:

- Bump version and publish a new tag. Do not reuse a published version.
