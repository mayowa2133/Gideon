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

The packaged `.dmg` and `.zip` artifacts are written to `release/`. Local builds are unsigned unless Apple Developer ID signing credentials are configured.

## Runtime requirements

- macOS
- FFmpeg and ffprobe available on `PATH`, or at `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe`
- `/usr/bin/say` for local voiceover generation; if unavailable, Gideon renders with silent audio

