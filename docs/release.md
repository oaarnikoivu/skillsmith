# Release Workflow Runbook

This project should use a release workflow that runs on git tag pushes (for example `v1.2.3`).

## Required release steps

1. Trigger on tag push:
- Pattern: `v*.*.*`

2. Re-run quality gates in release context:
- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm test`

3. Build package:
- `pnpm build`

4. Validate version/tag match:
- Compare tag version (without `v`) with `package.json` `version`
- Fail if mismatch

5. Publish to npm:
- `npm publish --access public --provenance`
- Use `NPM_TOKEN` from GitHub Actions secrets

6. Create GitHub Release:
- Create release for the tag
- Include release notes/changelog summary

7. Attach package artifact:
- Run `pnpm pack`
- Upload generated `.tgz` to the GitHub Release assets

## Required GitHub secrets

- `NPM_TOKEN`: npm automation token with publish access for the package

## Recommended permissions

- `contents: write` (for creating release)
- `id-token: write` (for npm provenance)

## Optional safeguards (recommended)

1. Prevent duplicate publishes:
- Check if version already exists: `npm view skillsmith@<version>`
- Skip/fail publish if already present

2. Manual release dry-run mode:
- Add `workflow_dispatch`
- Allow draft release flow without `npm publish`

3. Keep least privilege:
- Use minimal job permissions
- Scope secrets only to release workflow
