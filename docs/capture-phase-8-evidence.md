# Capture autonomy Phase 8 evidence

Date: 2026-07-16

## Proven locally

- The Playwright 1.61.1 Noble image is pinned to `sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48`.
- The canonical version-1 isolation policy hash is `8fc8d8b1674a406a2e6d33458f75516a2b1112f1d3a80191500cb846f562bfc5`.
- Static validation checks non-root execution, read-only roots, all-capability drop, no-new-privileges, bounded CPU/memory/PIDs/tmpfs, internal browser network, mandatory proxy, no host volumes/socket, exact entrypoints, cleanup policy, and source presence.
- Unit tests prove public allowlisted resolution and denial of loopback, cloud metadata, private resolution, disallowed domains, malformed authorities, and unapproved ports before a tunnel opens.
- Filesystem tests prove workspace boundaries, traversal/symlink/duplicate-session denial, private permissions, and deletion of profile, cookie, cache, clipboard, output scratch, and temporary state.
- Isolated-runtime tests prove manifest hash binding, fixture-grant separation/revocation, image/policy/workspace/execution attestation binding, privacy revalidation, and fail-closed response handling.

## External gate

`pnpm capture:isolation:check` reported `staticPolicy: passed` and `runtime.available: false` with reason `docker_engine_unavailable`. The Docker client exists, but its engine did not respond. No claim is made that kernel/container controls, the live proxy topology, resource ceilings, or container removal were exercised on this machine. `pnpm capture:isolation:runtime:check` intentionally fails until that engine/deployment gate is available.

## Verification record

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:capture`: 58 files and 206 tests passed.
- `pnpm test`: 123 files passed, one skipped; 611 tests passed, one skipped.
- `pnpm test:web`: three files and nine tests passed.
- `pnpm test:e2e`: two Chromium journeys passed.
- `pnpm build`: Electron main/renderer, MCP, and hosted Next.js builds passed.
- `pnpm capture:hostile:check`: five approved flows passed, seventeen prohibited flows remained blocked, and side effects remained zero.
- `pnpm capture:isolation:check`: static policy passed; Docker runtime unavailable.
- `pnpm capture:isolation:runtime:check`: failed as designed with `docker_engine_unavailable`.

An earlier deliberately parallel invocation of the full and capture suites exceeded existing Chromium/FFmpeg test timeouts and raced cleanup. Both suites passed when rerun independently; only the independent results above are accepted as evidence.
