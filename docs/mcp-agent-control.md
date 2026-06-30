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
- inspect recent audit events for a project/workspace;
- update a script hook, voiceover text, or CTA;
- update a detected moment label/evidence/enabled flag;
- generate a deterministic edit plan from a user instruction.
- enqueue analysis/render jobs through the running desktop app when its local control socket is available.

This works without `OPENAI_API_KEY` or other provider keys because the MCP client does the reasoning.

When the desktop app is running, MCP tools prefer the live local control socket:

```bash
GIDEON_CONTROL_SOCKET="$HOME/Library/Application Support/Gideon/gideon-control.sock" pnpm mcp:server
```

The socket path defaults to the macOS Gideon app data folder. Direct JSON-store access remains a fallback for safe inspection and bounded copy edits when the app is not running, but the intended path is the live bridge so edits flow through Gideon’s in-memory store and durable worker queue.

## Hosted MCP mode

Hosted deployments can use the same MCP server without giving Gideon model-provider API keys. Set the hosted API base URL and the user's active Gideon session cookie:

```bash
GIDEON_MCP_HOSTED_API_BASE_URL="https://app.gideon.example" \
GIDEON_MCP_HOSTED_SESSION_COOKIE="gideon_session=..." \
pnpm mcp:server
```

When these variables are present, MCP tools prefer the hosted API service layer:

- `gideon_list_projects` calls the authenticated project list route.
- `gideon_get_project` calls the sanitized project MCP context route.
- `gideon_get_audit_log` reads the project-scoped audit events from that context.
- `gideon_update_script` and `gideon_update_moment` call CSRF-protected hosted edit routes.
- `gideon_enqueue_analysis` and `gideon_enqueue_render` call the hosted job routes.

The MCP server can discover the CSRF token from `GET /api/v1/auth/session`, or you can provide `GIDEON_MCP_HOSTED_CSRF_TOKEN`. Hosted project context includes script and moment revisions. Edit tools send a revision precondition automatically unless the agent provides an explicit `revision` argument. Stale edits fail with `409 revision_conflict` instead of overwriting newer user or teammate changes. This mode keeps workspace authorization, CSRF checks, bounded field updates, job queues, optimistic concurrency, and audit records inside Gideon's authoritative hosted service layer while Codex/Claude Code supplies the reasoning externally.

## Safety rules

- Tools must use explicit schemas and bounded fields.
- MCP output must not expose API keys or provider raw payloads.
- Publishing, deletion, billing changes, and access-control changes are not exposed until implemented with user confirmation and authorization.
- Render/analysis tools must enqueue Gideon durable jobs instead of bypassing job state.
- Local MCP mutations are checked against the active user's workspace role. Viewers can inspect projects but cannot apply MCP edits.
- Live MCP edits and direct JSON-store fallback edits write audit events with `actorType: "mcp_agent"` so Codex/Claude changes are visible in the app and inspectable through MCP.
- Hosted mode enforces workspace membership through the authoritative service layer on every MCP call, uses CSRF-protected routes for mutations, and requires revision preconditions for script/moment review edits.

## Next steps

- Run hosted MCP through staging SSO/session policy and load tests.
- Add project-scoped approval gates for destructive actions and future publishing.
