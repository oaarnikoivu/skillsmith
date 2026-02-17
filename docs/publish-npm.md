# Publish to npm (Runbook)

This project publishes as a scoped package: `@aarnio/skillsmith`.

## Prerequisites

1. npm account with publish access to scope `@aarnio`
2. Logged in locally:

```bash
npm whoami || npm login
```

## 1) Verify scope/package availability

Check your scope access:

```bash
npm access ls-packages aarnio
```

Check whether package name already exists:

```bash
npm view @aarnio/skillsmith
```

- If this returns `404`, name is available.
- If package exists, bump version before publishing an update.

## 2) Ensure repo is ready

From repo root:

```bash
pnpm lint
pnpm test
```

## 3) Publish

```bash
npm publish --access public
```

Notes:

- Package uses `prepack`, so build runs automatically before publish.
- Package uses `prepublishOnly`, so lint/test run automatically as publish gate.

## 4) Verify publish

```bash
npm view @aarnio/skillsmith version
npx @aarnio/skillsmith@latest --help
```

## 5) Install/use

```bash
npm install -g @aarnio/skillsmith
skillsmith --help
```

## Common failure fixes

1. Auth/permission errors:
- Re-run `npm login`
- Verify you have permission for scope `@aarnio`

2. Version already exists:
- Bump version in package.json:

```bash
npm version patch
git push
git push --tags
```

Then publish again.

3. 2FA-required publish:
- npm may ask for OTP in CLI; enter current code and retry.
