# Gideon

Gideon is a macOS desktop app that turns a product walkthrough recording into editable short-form video drafts.

## Local development

Use the bundled Codex runtime or any local Node.js 22+ environment.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Build a downloadable Mac app

```bash
pnpm package:mac
```

The packaged `.dmg` and `.zip` artifacts are written to `release/`:

- `release/Gideon-0.1.0-arm64.dmg`
- `release/Gideon-0.1.0-arm64-mac.zip`

Local builds are unsigned unless Apple Developer ID signing credentials are configured. For local testing on a Mac, open the DMG and drag Gideon to Applications. A public internet download should be signed and notarized before release.

## GitHub packaging artifact

The `Build macOS app` workflow builds the app on macOS and uploads the DMG/ZIP as workflow artifacts. After pushing to `main`, open the latest workflow run in GitHub Actions and download the Gideon macOS artifact.

## Runtime requirements

- macOS
- FFmpeg and ffprobe available on `PATH`, or at `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe`
- `/usr/bin/say` for local voiceover generation; if unavailable, Gideon renders with silent audio

## Optional AI provider configuration

Gideon runs without paid provider credentials using deterministic local fallbacks. To enable provider-backed semantic analysis, transcription, and TTS, launch the app with:

```bash
OPENAI_API_KEY=sk-... pnpm start
```

Supported provider variables:

- `OPENAI_API_KEY` or `GIDEON_OPENAI_API_KEY`
- `GIDEON_OPENAI_BASE_URL`, default `https://api.openai.com/v1`
- `GIDEON_OPENAI_LLM_MODEL`, default `gpt-5.1`
- `GIDEON_OPENAI_TRANSCRIPTION_MODEL`, default `gpt-4o-transcribe`
- `GIDEON_OPENAI_TTS_MODEL`, default `gpt-4o-mini-tts`
- `GIDEON_OPENAI_TTS_VOICE`, default `coral`

Provider outputs are treated as untrusted until parsed and validated. If a provider call fails, Gideon records a safe provider-run error and falls back to the local path where possible.
