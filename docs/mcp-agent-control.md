# Gideon MCP agent control plane

Gideon must support two AI paths:

1. **Provider-backed in-app automation** — Gideon calls configured providers for ASR, OCR, LLM analysis, and TTS.
2. **Agent-controlled automation over MCP** — Codex, Claude Code, or another MCP client connects to Gideon and brings its own model credentials. Gideon exposes project tools; it does not need LLM API keys for this path.

The MCP path is inspired by Palmier-style agent control: the agent talks with the user, inspects the current creative/project state, proposes edits, applies bounded structured changes, and asks the app to render or export through explicit tools.

## Initial local server

The first server is a local stdio MCP server:

```bash
pnpm build:mcp
GIDEON_STORE_PATH="$HOME/Library/Application Support/Gideon/gideon-store.json" pnpm mcp:server
```

It intentionally starts with safe project operations:

- report server/store status;
- list local projects;
- inspect a project;
- update a script hook, voiceover text, or CTA;
- update a detected moment label/evidence/enabled flag;
- generate a deterministic edit plan from a user instruction.

This works without `OPENAI_API_KEY` or other provider keys because the MCP client does the reasoning.

## Safety rules

- Tools must use explicit schemas and bounded fields.
- MCP output must not expose API keys or provider raw payloads.
- Publishing, deletion, billing changes, and access-control changes are not exposed until implemented with user confirmation and authorization.
- Future render/analysis tools must enqueue Gideon durable jobs instead of bypassing job state.
- Future hosted mode must enforce workspace membership on every MCP call.

## Next steps

- Replace direct JSON-store edits with an app/service bridge so a running desktop app receives live updates.
- Add MCP tools for enqueueing analysis/render jobs once the worker queue has a stable external command surface.
- Add MCP audit events for every agent action.
- Add project-scoped approval gates for destructive actions and future publishing.
