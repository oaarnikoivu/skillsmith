# Publish to npm (Runbook)

This project publishes as a scoped package: `@oaarnikoivu/skillsmith`.

## Prerequisites

1. npm account with publish access to scope `@oaarnikoivu`
2. Logged in locally:

```bash
npm whoami || npm login
```

## 1) Verify scope/package availability

Check your scope access:

```bash
npm access ls-packages oaarnikoivu
```

Check whether package name already exists:

```bash
npm view @oaarnikoivu/skillsmith
```

- If this returns `404`, name is available.
- If package exists, bump version before publishing an update.

## 2) Ensure repo is ready

From repo root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

## 2.5) Pre-publish package test (recommended)

Build the exact tarball that npm would publish:

```bash
pnpm pack
```

Then test-install that tarball in an isolated temp project:

```bash
mkdir -p /tmp/skillsmith-pack-test
cd /tmp/skillsmith-pack-test
pnpm init
pnpm add /absolute/path/to/oaarnikoivu-skillsmith-<version>.tgz
pnpm exec skillsmith --help
```

This verifies the real packaged artifact before public publish.

## 3) Publish

```bash
npm publish --access public
```

Notes:

- Package uses `prepack`, so build runs automatically before publish.
- Package uses `prepublishOnly`, so format/lint/typecheck/test run automatically as publish gate.
- If this repository is private, do not use `--provenance` for manual local publish.

## 4) Verify publish

```bash
npm view @oaarnikoivu/skillsmith version
npx @oaarnikoivu/skillsmith@latest --help
```

## 5) Install/use

```bash
npm install -g @oaarnikoivu/skillsmith
skillsmith --help
```

## Common failure fixes

1. Auth/permission errors:

- Re-run `npm login`
- Verify you have permission for scope `@oaarnikoivu`

If npm fails with cache permission errors (for example `EPERM` under `~/.npm/_cacache`), fix ownership and retry:

```bash
sudo chown -R $(id -u):$(id -g) ~/.npm
```

2. Version already exists:

- Bump version in package.json:

```bash
npm version patch
git push
git push --tags
```

Then publish again.

Published versions are immutable in normal flows, so do not try to reuse an already published version number.

3. 2FA-required publish:

- npm may ask for OTP in CLI; enter current code and retry.
