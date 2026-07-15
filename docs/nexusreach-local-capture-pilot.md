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

The command loads and runtime-validates `capture-pilots/nexusreach.json`. It refuses target drift from the repository root and loopback origin registered in trusted adapter code, refuses manifest-provided commands, and requires NexusReach to be reachable before capture starts. Each invocation creates an immutable directory below `tmp/capture-pilot/nexusreach/runs` and updates a private `latest.json` pointer without deleting earlier runs.

## What it composes

The generic pilot runner creates an in-process local workspace and project, a `local_preview` environment, a validated environment version, and the synthetic `Jordan Demo` persona from the manifest. It extracts bounded repository evidence using Gideon's normal exclusions, imports each declarative scenario as a draft, records explicit revision-bound approval, and queues one independently reset capture run per workflow.

The capture worker invokes only registered `demo_reset.sh onboarding` or `demo_reset.sh returning` adapters, once before each dry run and once before each recording. It replays the approved flows with the `local_test` Playwright runtime, adding human-readable holds, a rendered arrow cursor with click feedback, smooth movement to each approved target, and character-by-character typing while keeping dry runs fast. It verifies browser outcomes, normalizes each recording to H.264, performs visual QA, creates private source/clip/assembly artifacts, and calculates aggregate pilot coverage. Registered loopback API checks independently verify the persisted synthetic state and restore the tracker fixture after its approved mutation.

The pilot intentionally does not start discovery, upload a resume, connect a network, perform outreach, use external credentials, or access a non-loopback host. The versioned local state and complete report are persisted as `pilot-state.json` and `pilot-report.json`; private failure reports include bounded worker diagnostics, media remains under `private-artifacts`, and all run output is ignored by Git.

This first supported command is headless rather than a hosted-UI launcher. The production capture API and review UI remain dependency-gated and unchanged. The local JSON history is an operator aid, not a replacement for the PostgreSQL-backed hosted persistence required before self-service rollout.

## Verified result

The pilot completes dry runs and clean recordings for five approved workflows: onboarding, browsing/filtering jobs, reviewing saved contacts, updating the local job tracker, and reviewing a seeded unsent outreach draft. It produces one verified normalized clip per workflow and independently verifies the expected synthetic API state. Aggregate coverage reports all five declared goals and all five current approved flow revisions covered, plus the requested persona covered; dimensions without a trustworthy denominator remain unknown.

Run `pnpm test:capture` for the capture regression suite. NexusReach's independent smoke suite is:

```sh
cd /Users/mayowaadesanya/Documents/Projects/NexusReach/e2e
npm run test:demo
```

## Security boundary

`local_test` remains accepted only for `local_preview`. Production still requires container or microVM isolation, an external secret store, private object storage, durable queues, and the other dependencies listed in [product-flow-capture-implementation.md](./product-flow-capture-implementation.md).
