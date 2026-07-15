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

The latest full successful run on July 15, 2026 produced two verified 1440×900 normalized clips, two focused 1080×1920 H.264/AAC derivatives, two editable WebVTT tracks, two private `capture-framing-v1` manifests, two private quality reports, two private JPEG contact sheets, and a current versioned bounded coverage snapshot. Run `2026-07-15T06-45-37-346Z-04b089ed-4d32-4f75-af1b-1348374b7f77` passed both gates with review warnings for captions that remained visible beyond the preferred six-second range; no output failed. It covers two of two goals and flows, one persona, the single bounded route, two starting states, two usage sequences, two outcomes, and the observed approval-required failure state. Live send remains explicitly policy-blocked and the untrusted feature-flag denominator remains unknown. Private output remains below ignored `tmp/capture-pilot/signaldraft/runs` storage.

## Portability finding

The first real attempt failed closed because a Streamlit-rendered classification locator was less stable than the API outcome contract. Gideon retained the failure checkpoint, replaced that UI-specific assertion with a stable result heading while keeping API classification verification, and passed both a targeted retry and the full two-flow run. During the action-aware recapture, current Streamlit rendered heading text in a structure that made an exact text locator ambiguous; the bounded flow was repaired to use the semantic `heading` role and the complete two-flow run passed again. The first quality-gated recapture also failed closed when the detector treated an 11.3-second lingering caption as equivalent to a rushed caption. The policy was corrected and regression-tested: captions below the reading minimum fail, while long readable captions warn for review. This is evidence that accessible roles, UI assertions, persisted outcomes, and presentation severity should remain separate layers.
