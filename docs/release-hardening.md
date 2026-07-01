# Release hardening

This document defines the current macOS release gate for Gideon desktop artifacts.

## Local package gate

Local builds can remain unsigned for development:

```bash
pnpm package:mac
pnpm release:mac:check
hdiutil verify release/Gideon-0.1.0-arm64.dmg
```

`pnpm release:mac:check` validates the expected DMG/ZIP/blockmap/latest metadata and writes `release/provenance.json` with artifact sizes and hashes. The `release/` directory remains ignored by git.

## Production package gate

Production releases should use the signed packaging command:

```bash
pnpm package:mac:signed
GIDEON_RELEASE_CHANNEL=production pnpm release:mac:check
hdiutil verify release/Gideon-0.1.0-arm64.dmg
```

Production mode requires:

- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `CSC_LINK` or `CSC_NAME` for the Developer ID Application signing identity

The check also validates that `latest-mac.yml` hashes and sizes match the generated DMG/ZIP artifacts.

## Provenance manifest

`release/provenance.json` records:

- Gideon version and release channel;
- source repository, commit, and workflow run ID when running in GitHub Actions;
- Node and package manager versions;
- file names, sizes, SHA-256 hashes, and SHA-512 hashes for generated artifacts.

The GitHub macOS build uploads the DMG, ZIP, blockmaps, `latest-mac.yml`, and `provenance.json` as workflow artifacts.

## Live promotion evidence workflow

The macOS workflow has a manual `workflow_dispatch` live promotion path. Set `run_live_promotion=true` only after staging infrastructure, provider credentials, object storage, Redis/PostgreSQL, hosted MCP session/project, metric probe configuration, base64-encoded fixture secrets, and Apple signing credentials are configured in GitHub Secrets/Vars.

The live job first runs `pnpm production:live-env:check` to fail fast on missing or weak staging/provider/storage/MCP/signing configuration, then runs `pnpm production:fixtures:materialize` to validate and decode the base64 private fixture secrets into ignored `tmp/live-fixtures` files. It then runs `pnpm production:promote:check -- --live`, self-verifies `tmp/production-promotion-evidence.json`, runs `pnpm production:evidence:check -- --path tmp/production-promotion-evidence.json`, and uploads `Gideon-production-promotion-evidence`. The evidence artifact is designed to contain step names, commands, safe env overrides, timings, exit codes, and failure status only; it must not contain cookies, API keys, signed URLs, provider payloads, transcripts, prompts, or media paths.
