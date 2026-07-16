# Structured capture operator guide

`pnpm capture:operator` drives the hosted structured-capture API without direct database access. It is intended for an authenticated founder/operator or a supervised Codex/Claude Code concierge session. It does not bypass human flow approval, create credentials, execute repository code, or delete source evidence.

## Authentication

Provide session material only through the process environment:

```bash
export GIDEON_CAPTURE_API_BASE_URL="https://app.gideon.example"
export GIDEON_CAPTURE_SESSION_COOKIE="gideon_session=..."
# Optional; otherwise discovered from /api/v1/auth/session
export GIDEON_CAPTURE_CSRF_TOKEN="..."
```

Remote API URLs must use HTTPS. Loopback HTTP is accepted only for local development. Never place cookies, passwords, tokens, headers, or shell commands in a capture manifest.

## Workflow

```bash
pnpm capture:operator -- manifest:template > capture-environment.json
pnpm capture:operator -- capabilities
pnpm capture:operator -- environment:create --project PROJECT --manifest capture-environment.json
pnpm capture:operator -- environment:validate --project PROJECT --environment ENVIRONMENT
pnpm capture:operator -- discovery:start --project PROJECT --environment ENVIRONMENT --goals '[{"id":"primary","text":"Show the primary customer outcome","priority":100}]'
pnpm capture:operator -- discovery:status --project PROJECT --run DISCOVERY_RUN
pnpm capture:operator -- flow:list --project PROJECT
pnpm capture:operator -- flow:inspect --project PROJECT --flow FLOW
pnpm capture:operator -- flow:approve --project PROJECT --flow FLOW --revision REVISION
pnpm capture:operator -- capture:start --project PROJECT --environment ENVIRONMENT --flows FLOW
pnpm capture:operator -- capture:status --project PROJECT --run CAPTURE_RUN
pnpm capture:operator -- evidence:inspect --project PROJECT --run CAPTURE_RUN
```

Use `execution:retry --execution EXECUTION` for a bounded failed-flow retry. Use `discovery:cancel`, `capture:cancel`, or `cleanup --resource discovery|capture --id ID` to stop active disposable work. Cleanup is deliberately cancellation-based; it does not delete private evidence or the project.

Every asynchronous creation accepts optional `--idempotency-key`. If omitted, the CLI generates a unique key; automation retrying the same logical request should provide a stable key. Approval and rejection always require `--revision`; a stale revision returns a conflict and must be reviewed again.

Run `pnpm capture:operator -- help` for the complete command list. Equivalent hosted MCP operations are documented in [mcp-agent-control.md](./mcp-agent-control.md). The generated API document is [openapi/capture-api.json](./openapi/capture-api.json).
