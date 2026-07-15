# SignalDraft local capture pilot

SignalDraft is Gideon's second independent real-product capture pilot. It exercises a Streamlit/FastAPI/SQLite application rather than the React/FastAPI NexusReach stack, uses only synthetic recruiter messages, and preserves SignalDraft's human approval boundary.

## Safety contract

- The registered target is `/Users/mayowaadesanya/Documents/Projects/SignalDraft` at `http://127.0.0.1:8501`, with its API at `http://127.0.0.1:8000`.
- The backend must report environment `pilot`, deterministic heuristic runtime, API authentication enabled, no OpenAI key, and a writable temporary database.
- State is isolated at `/tmp/gideon-signaldraft-pilot/signaldraft.db` and reset through a trusted adapter; the manifest cannot provide commands or credentials.
- The flows may type synthetic messages and run local analysis. They never click Approve Draft, Reject Draft, or Mock Send.
- Post-run verification checks the saved classification and action, confirms status remains `analyzed`, and proves a mock-send request fails with `mock_send_requires_approval`.

## Start the isolated demo

Run the API and UI from the SignalDraft repository in separate terminals. The token below is a disposable local pilot value, not a customer credential.

```bash
env OPENAI_API_KEY= SIGNALDRAFT_ENV=pilot SIGNALDRAFT_LLM_MODE=rules SIGNALDRAFT_FALLBACK_TO_RULES=true SIGNALDRAFT_DB_PATH=/tmp/gideon-signaldraft-pilot/signaldraft.db SIGNALDRAFT_CHECKPOINT_PATH=/tmp/gideon-signaldraft-pilot/checkpoints.db SIGNALDRAFT_API_TOKEN=gideon-pilot-token SIGNALDRAFT_ADMIN_PASSWORD= SIGNALDRAFT_API_BASE_URL=http://127.0.0.1:8000 SIGNALDRAFT_PUBLIC_UI_URL=http://127.0.0.1:8501 SIGNALDRAFT_ALLOWED_ORIGINS=http://127.0.0.1:8501 python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
env OPENAI_API_KEY= SIGNALDRAFT_ENV=pilot SIGNALDRAFT_LLM_MODE=rules SIGNALDRAFT_FALLBACK_TO_RULES=true SIGNALDRAFT_DB_PATH=/tmp/gideon-signaldraft-pilot/signaldraft.db SIGNALDRAFT_CHECKPOINT_PATH=/tmp/gideon-signaldraft-pilot/checkpoints.db SIGNALDRAFT_API_TOKEN=gideon-pilot-token SIGNALDRAFT_ADMIN_PASSWORD= SIGNALDRAFT_API_BASE_URL=http://127.0.0.1:8000 SIGNALDRAFT_PUBLIC_UI_URL=http://127.0.0.1:8501 SIGNALDRAFT_ALLOWED_ORIGINS=http://127.0.0.1:8501 python3 -m streamlit run app/ui/streamlit_app.py --server.address 127.0.0.1 --server.port 8501 --server.headless true --browser.gatherUsageStats false
```

## Capture

```bash
SIGNALDRAFT_API_TOKEN=gideon-pilot-token pnpm capture:pilot:signaldraft
```

Targeted retry remains explicit:

```bash
SIGNALDRAFT_API_TOKEN=gideon-pilot-token pnpm capture:pilot:signaldraft -- --workflow review-sensitive-compensation
```

The full successful run at `2026-07-15T03:19:15Z` produced two verified 1440×900 normalized clips of about 20 seconds each, two 1080×1920 H.264/AAC derivatives, two editable WebVTT tracks, and complete declared goal/flow coverage. Private output is under `tmp/capture-pilot/signaldraft/runs/2026-07-15T03-19-15-459Z-658d63d2-8369-4ce7-95e8-077dc6df77d4` and remains ignored by Git.

## Portability finding

The first real attempt failed closed because a Streamlit-rendered classification locator was less stable than the API outcome contract. Gideon retained the failure checkpoint, replaced that UI-specific assertion with a stable result heading while keeping API classification verification, and passed both a targeted retry and the full two-flow run. This is useful evidence that UI assertions and persisted business outcomes should remain separate layers.
