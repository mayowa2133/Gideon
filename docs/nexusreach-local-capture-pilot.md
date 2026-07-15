# NexusReach local capture pilot

Status: verified locally on July 14, 2026 against the guarded NexusReach demo environment.

This pilot is an internal concierge command for exercising Gideon's real capture pipeline against one explicitly approved loopback product. It does not enable local browser execution for hosted or remote products.

## Run the pilot

In one terminal, start the blank onboarding fixture:

```sh
cd /Users/mayowaadesanya/Documents/Projects/NexusReach
./scripts/demo_start.sh --scenario onboarding
```

In another terminal, run Gideon:

```sh
cd /Users/mayowaadesanya/Documents/Projects/Gideon
pnpm capture:pilot
```

The command refuses target drift from `/Users/mayowaadesanya/Documents/Projects/NexusReach` and `http://127.0.0.1:5173`. It requires NexusReach to be reachable before it starts, recreates `tmp/capture-pilot/nexusreach`, and writes files with private local permissions.

## What it composes

The command creates an in-process local workspace and project, a `local_preview` environment, a validated environment version, and the synthetic `Jordan Demo` persona. It extracts bounded repository evidence using Gideon's normal exclusions, imports the checked-in onboarding scenario as a draft, records explicit revision-bound approval, and queues a capture run.

The capture worker invokes only the approved `demo_reset.sh onboarding` reset, once before the dry run and once before recording. It replays the approved flow with the `local_test` Playwright runtime, adding human-readable holds, a rendered pointer with click feedback, smooth movement to each approved target, and character-by-character typing while keeping the dry run fast. It verifies the final Profile route and synthetic field values, normalizes the browser recording to H.264, performs visual QA, creates private source/clip/assembly artifacts, and calculates coverage. It then verifies persisted state through NexusReach's loopback API.

The pilot intentionally does not start discovery, upload a resume, connect a network, perform outreach, use external credentials, or access a non-loopback host. The local state and complete report are persisted as `pilot-state.json` and `pilot-report.json`; media remains under `private-artifacts` and is ignored by Git.

This first supported command is headless rather than a hosted-UI launcher. The production capture API and review UI remain dependency-gated and unchanged. A future operator wrapper can expose this same persisted run through the hosted review UI without changing capture policy.

## Verified result

The onboarding pilot completed its dry run and recording, produced a verified normalized clip, persisted `Jordan Demo` with the requested target roles and locations, and observed `onboarding_completed: true`. Goal, approved-flow, and persona coverage each report one known item covered; dimensions without a trustworthy denominator remain unknown.

Run `pnpm test:capture` for the capture regression suite. NexusReach's independent smoke suite is:

```sh
cd /Users/mayowaadesanya/Documents/Projects/NexusReach/e2e
npm run test:demo
```

## Security boundary

`local_test` remains accepted only for `local_preview`. Production still requires container or microVM isolation, an external secret store, private object storage, durable queues, and the other dependencies listed in [product-flow-capture-implementation.md](./product-flow-capture-implementation.md).
