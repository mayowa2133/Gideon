# Gideon UX flows

**Last updated:** 2026-07-06

**Primary device:** Desktop web; review pages remain usable on tablet

**MVP posture:** Guided workflow, persistent progress, human approval before export

## Information architecture

- `/` — marketing landing page.
- `/sign-in` — authentication.
- `/app` — project dashboard.
- `/app/projects/new` — project context and upload.
- `/app/projects/:projectId/analysis` — progress, summary, detected moments.
- `/app/projects/:projectId/concepts` — ten generated concepts and selection.
- `/app/projects/:projectId/scripts` — selected concept scripts/captions.
- `/app/projects/:projectId/videos` — render queue and generated drafts.
- `/app/projects/:projectId/videos/:videoId` — preview/edit/export.
- `/app/settings` — workspace, data, usage, future billing entry.

A persistent project stepper shows `Context → Recording → Analysis → Ideas → Scripts → Videos`. Completed steps remain revisitable. A user can move forward only when required artifacts for the current version exist; moving back and changing an input explains which downstream artifacts will become stale.

## Global interaction rules

- Autosave text fields after a short idle delay; show `Saving…`, `Saved`, or `Couldn’t save` near the field group.
- Never show indeterminate loading when a meaningful stage is known.
- Long jobs persist across navigation and browser close; dashboard cards show current stage.
- Destructive changes explain downstream impact and require confirmation.
- Regeneration is scoped: idea, script, voiceover, or render, not “redo everything” by default.
- AI output always appears in editable form before its expensive downstream stage.
- Error messages contain what happened, what was preserved, and the next action.
- Keyboard focus, progress announcements, labels, and color contrast meet WCAG 2.2 AA targets.

## Landing and sign-in

### Landing page

1. Hero headline: “Turn one product walkthrough into weeks of short-form content.”
2. Subhead: “Upload a screen recording. Gideon finds the proof, writes ten angles, and turns your three favorites into editable vertical drafts.”
3. Primary CTA: `Create your videos`.
4. Secondary CTA: `See how it works`, scrolling to a three-step visual.
5. Product proof section shows one walkthrough branching into multiple formats, not an avatar montage.
6. “You stay in control” section shows moment review, script editing, and preview/export.
7. Security note: private uploads, expiring links, delete controls.
8. FAQ sets expectations: MVP accepts uploads; no autonomous login/posting; processing takes minutes.

### Sign-in

1. User chooses supported social login or email method.
2. Return path is validated and defaults to `/app`.
3. On first sign-in, create personal workspace and show a one-screen onboarding intro.
4. Auth failure preserves no password/token in URL and offers retry/support.

## Onboarding

### First-run intro

Goal: set the mental model and avoid surprising processing time.

1. Welcome statement and sample outcome: “One 8-minute walkthrough can become ten ideas and three drafts.”
2. Three inputs shown: product context, screen recording, concept choices.
3. Three outputs shown: scripts, captions/voiceover, vertical MP4 drafts.
4. Privacy statement and link to deletion policy.
5. Primary action: `Create first project`; secondary: `Use sample project` if a safe bundled sample exists.

Do not force a multi-step profile survey. Product-specific context belongs to each project.

## Project dashboard

### Populated state

- Top bar: workspace switcher foundation, usage summary, settings, `New project`.
- Project cards: product name, source thumbnail, last update, current stage/status, number of completed videos, contextual next action.
- Filters: All, In progress, Ready, Needs attention, Archived.
- Failed project cards use a visible but non-alarming error treatment and `Resume` action.

### Empty state

- Headline: “Your first walkthrough can become your next three posts.”
- Compact explanation of accepted files and expected processing.
- Primary `Create project` and optional `View sample output`.
- No decorative empty dashboard table.

## Create project and enter product context

Page-level layout: centered 720px form with a right-side “What makes a useful answer?” panel on wide screens.

1. Product name.
2. Target customer, prompted as “Who feels the pain most?”
3. Outcome, prompted as “What can they do after using your product?”
4. Tone preset: Direct/founder-native, Professional, Casual, Educational, Bold; optional custom guidance.
5. Target platforms as multi-select.
6. Live context summary shows how Gideon will phrase the product.
7. `Continue to recording` creates/updates the project.

Validation is inline and explains quality, not only length. Example: “Name the user and outcome—‘helps teams grow’ is too broad.”

## Upload recording

### Initial state

- Large upload zone with `Choose video` and drag/drop.
- Accepted: MP4, MOV, WebM; maximum 2 GB/30 minutes by default.
- Guidance: record one clear flow, pause briefly around key results, hide private data, keep UI readable.
- Optional `I’ll upload later` returns to dashboard with draft state.

### Selected-file preflight

1. Show filename, local size, and local preview when browser supports it.
2. Client checks extension/type/size for fast feedback; copy states server will verify content.
3. User confirms `Upload recording`.

### Uploading

- Determinate byte progress, speed/remaining time when reliable, and safe `Cancel`.
- Multipart upload resumes missing parts after transient network failure.
- Navigating away does not imply cancellation; global progress continues.

### Server validation

- After bytes reach storage, status becomes `Checking recording` rather than falsely showing complete.
- Checks file signature, probe metadata, duration, streams, dimensions, and policy.
- Success shows source thumbnail/metadata and `Analyze walkthrough`.
- User may replace the file before analysis.

### Upload errors

| Error | Message/action |
|---|---|
| Too large/long | State current limit and suggest trimming; `Choose another file` |
| Unsupported content | “This file is named as video but could not be read as MP4, MOV, or WebM.” |
| Corrupt/incomplete | Explain no project work was lost; retry/replace |
| Network interruption | Resume automatically; `Retry now` if exhausted |
| Storage unavailable | Preserve project/context; retry later; incident reference |
| Malware/quarantine | Do not expose detailed scanner internals; reject and support link |

## Start analysis

1. User selects `Analyze walkthrough`.
2. Modal summarizes expected stages and approximate range, not a guaranteed finish time.
3. If quota-ready limit would be exceeded, stop here before cost and show limit/upgrade-ready flow.
4. On confirm, enqueue and navigate to analysis page.

## Video analysis loading state

Page contains source preview/contact thumbnail, stage stepper, friendly explanation, and “You can close this page.”

Stages:

1. `Inspecting recording` — reading duration, dimensions, audio.
2. `Finding useful frames` — sampling UI changes and results.
3. `Transcribing narration` — skipped with an explicit `No speech detected` note.
4. `Understanding the flow` — joining visible steps with product context.
5. `Preparing moments` — validating and ranking evidence.

Each stage has `queued`, `active`, `done`, or `issue`; only the active stage animates. Progress is event-driven with bounded polling fallback. The user can cancel where safe; completed extraction artifacts remain reusable.

### Long-running copy rotation

Use factual messages tied to the stage:

- “We’re comparing frames so repeated idle screens don’t become video beats.”
- “We’re matching your narration to what changes on screen.”
- “We’ll show what we detected before writing concepts.”

Avoid invented pseudo-progress such as “98% done” without a measurable basis.

## Analysis result and detected moments

Page-level layout: summary at top; synchronized video and moments list beneath.

1. `What Gideon saw` summary with a small `AI-generated—review before continuing` label.
2. `Product flow` ordered moments; each card has thumbnail, timestamp range, label, observed description, transcript excerpt if present, confidence indicator, focus controls, and inferred interaction target when available.
3. Selecting a card seeks the video and outlines the active evidence range.
4. User can rename, adjust start/end, hide, or mark `Key proof`.
5. `Missing something? Add moment` lets user scrub and define a range/label.
6. Low-confidence warnings explain likely causes: silent source, blurred UI, repeated screens, missing beginning/result.
7. Primary `Generate 10 ideas`; secondary `Update product context`.

Changing product context or source shows an impact confirmation. Moment edits do not re-run extraction; they create a reviewed moment version.

## Generated content ideas

### Layout

- Header: “Choose the three stories worth telling.”
- Filter chips for format/platform; selection counter `0/3`.
- Ten concept cards in a two-column desktop grid, one column at narrow widths.

### Concept card

- Format badge and platform recommendation.
- Working title.
- Hook direction, written as a concrete first line or pattern.
- Target pain/desire.
- Proof moment thumbnail(s) and estimated duration.
- `Why this could work` rationale.
- Select checkbox and overflow actions: edit brief, regenerate this idea, dismiss.

### Interaction

1. User scans and selects up to three.
2. Selecting a fourth prompts replacement rather than silently deselecting.
3. Similar concepts are visually flagged and offer `Make this more distinct`.
4. `Generate scripts for 3` becomes primary when at least one is selected; copy reflects actual count.
5. `Regenerate all` requires confirmation because dismissed/unedited AI concepts will be replaced; selected concept briefs can be preserved explicitly.

### Idea empty/failure states

- If context/evidence cannot support ten distinct ideas, do not show filler. Ask for one of: clearer outcome, target pain, or missing proof moment.
- Schema/provider failure offers retry and preserves analysis.
- Policy/safety issue identifies the field/source needing correction without exposing internal moderation rules.

## Review generated scripts

Page-level layout: selected concepts as tabs/left rail; structured editor center; source beat plan right.

### Script sections

1. Hook.
2. Voiceover/body.
3. Creator template selection.
4. Explicit `Approved for render` checkbox.
5. Sound design toggle and music mood.
6. On-screen text cues.
7. Caption preview derived from spoken text.
8. CTA.
9. Dense visual beats mapped to moments/time ranges, with repeated proof moments allowed for quick-cut pacing.

### Interaction

- Inline editing with autosave and character/estimated-duration feedback.
- Generated scripts start unapproved. A render job cannot start until at least one script tied to a selected concept is explicitly approved, saved, and free of blocking quality warnings.
- Forbidden generic phrase warnings explain the issue and suggest a specific rewrite.
- Unsupported claim, missing evidence, and caption safe-area overflow warnings block approval until edited or explicitly confirmed with added context.
- `Regenerate section` opens a small instruction field and affects only that section.
- `Preview voice` may synthesize a short sample subject to usage limits.
- Voiceover toggle: AI voice, source audio only, or voiceover plus ducked source audio if supported.
- `Approve & render drafts` summarizes the approved script, template, brand kit, sound-design setting, caption style, and evidence-backed visual plan versions that will be used.

User edits are first-class versions. Regeneration never overwrites without an explicit replace/diff action.

## Render loading state

- One card per approved selected script, each with independent status and retry.
- Stages: preparing assets, generating voiceover, composing video, encoding MP4, checking output.
- Completed cards become previewable while other renders continue.
- User can leave; dashboard and optional in-app notification update.
- Cancel affects only the chosen render unless `Cancel all` is explicitly selected.

## Preview generated videos

### Video gallery

- Cards show thumbnail, concept/title, duration, current version, status, and `Review`.
- Completed, rendering, stale, failed, and exported states are visually distinct and not color-only.

### Review page

Page-level layout: large 9:16 player left; controls right; filmstrip/beat strip below.

- Player shows platform safe-area overlay toggle.
- Right panel tabs: Text, Captions, Framing, Audio.
- Text: hook/CTA copy and overlay timing.
- Captions: text, line breaks, style preset, position preset.
- Framing: source in/out and normalized focus point/zoom intensity; no arbitrary keyframe editor in MVP.
- Audio: voice/source balance and voice selection where supported.
- `Save changes` creates a new manifest and marks current render stale.
- `Render updated draft` is explicit; old render remains accessible as prior version until retention cleanup.
- `Regenerate script` returns to script review with impact warning.

## Editing captions and hooks

1. Select caption segment in list or click visible caption while paused.
2. Edit text; duration is inherited unless user changes segment boundary.
3. Deterministic fit warning appears before overflow: too many characters/lines or safe-area collision.
4. Hook editing shows spoken text and overlay text separately when they differ.
5. `Apply` updates draft manifest; preview uses a fast client approximation marked `Preview`; final server render remains authoritative.
6. Undo/redo covers current editing session; saved versions provide durable rollback.

## Exporting videos

1. User clicks `Export MP4` on a completed, non-stale final render.
2. If only preview quality exists, prompt `Create final export`; start final render.
3. Completed export shows codec/resolution/duration/size and `Download MP4`.
4. Download URL is created after authorization and expires; copy should not imply public sharing.
5. Optional filename is sanitized and affects download disposition only, never storage key.
6. Record export usage and show `Downloaded` timestamp.
7. Future disabled actions `Schedule`/`Publish` may appear only under a clearly labeled “Coming later,” preferably omitted from MVP navigation.

## Error states

### Principles

- Keep the user’s completed work.
- Name the failed stage, not a raw provider/stack error.
- State whether retry is safe and whether usage was charged/refunded.
- Provide an incident/reference ID for support.
- Never reveal object keys, signed URLs, prompts, tokens, internal paths, or stack traces.

### Analysis failure

“We couldn’t finish understanding this recording. Your upload and extracted frames are safe. Retry the analysis, or replace the recording if playback also looks wrong.”

### TTS failure

“The voice service didn’t return usable audio. Your approved script is saved.” Actions: Retry voice, choose another voice, render without voiceover.

### Render failure

“Encoding stopped before a valid MP4 was created. Your script and edit settings are saved.” Actions depend on error: Retry, reset unsupported asset/font, contact support.

### Stale result

“This video was rendered from an older script. You can still preview it, but export the updated version.”

### Permission/deleted state

Use generic not-found behavior for resources outside the user’s workspace. Do not reveal whether another workspace’s ID exists.

## Empty states

- No projects: outcome-led CTA.
- No recording: upload guidance and limits.
- No detected speech: not an error; explain visual-only analysis.
- No concepts selected: show selection guidance, not disabled mystery controls.
- No completed renders: show active jobs or the next required script approval.
- No exports: explain final render/export distinction.
- No usage: show plan allowance and what counts.

## Delete and data controls

### Delete video

1. Confirm video title/version and that scripts/source remain.
2. Revoke access immediately; schedule artifact deletion.
3. Return to gallery with undo only if deletion job has not committed and policy permits.

### Delete project

1. Modal lists source recording, extracted frames/transcript, concepts/scripts, voiceovers, renders, and exports.
2. Require project name confirmation for projects with completed exports.
3. Cancel active jobs, revoke signed access, mark deleting, then purge asynchronously.
4. Dashboard shows `Deleting…`; project cannot be reopened.

## Upgrade/paywall-ready flows

MVP records usage but may not charge. The UX must still fail gracefully at limits.

### Soft warning

- At 80% of an allowance, show non-blocking usage notice with reset date.
- Never interrupt an already reserved/running job because usage crossed the warning threshold.

### Hard limit before expensive action

1. User initiates analysis/render/export that would exceed allowance.
2. Modal states current usage, required units, reset date, and what work remains saved.
3. Primary future action `Upgrade` can link to waitlist/contact or billing when available.
4. Secondary `Back to project`; no hidden charge or partial job starts.

### Billing failure future state

- Existing private media remains accessible according to policy.
- New expensive jobs pause; deletion/export policy must be explicit and fair.
- Do not use dark patterns or countdown pressure.

## Responsive behavior

- Desktop (≥1200): split preview/editor layouts.
- Tablet (768–1199): stacked player then controls; concept grid may remain two columns.
- Mobile (<768): dashboard/status/script text edits are usable; complex framing editor shows “Best on desktop” and read-only preview rather than a broken UI.
- 9:16 players constrain height to viewport and never push primary actions off-screen.

## Accessibility checklist by flow

- Upload zone is a labeled button/input, not drag-only.
- Progress uses text and `aria-live` with throttled announcements.
- Stepper communicates current/completed/error states semantically.
- Concept selection works with keyboard and has a visible counter.
- Video player has keyboard controls, captions, and accessible control names.
- Color is never the sole status/error signal.
- Modal focus is trapped/restored; destructive confirmation is unambiguous.
- Motion respects `prefers-reduced-motion`; loading skeleton shimmer is disabled/reduced.

## Analytics events

Use non-sensitive IDs and enums; never send scripts, transcripts, product descriptions, filenames, or signed URLs to analytics.

- `project_created`
- `product_context_completed`
- `upload_started|completed|failed|canceled`
- `analysis_started|completed|failed|canceled`
- `moment_edited|added|hidden`
- `concepts_generated`
- `concept_selected|edited|regenerated|dismissed`
- `scripts_generated|edited|approved`
- `render_started|completed|failed|canceled`
- `video_text_edited|framing_edited|audio_edited`
- `export_started|completed|downloaded|failed`
- `limit_warning_viewed|limit_blocked`
- `project_delete_requested|completed`

## UX acceptance checklist

- Every required MVP stage has happy, loading, empty, failure, stale, and retry behavior.
- Browser refresh at any stage reconstructs state from the server.
- No long task depends on keeping a page open.
- User edits are versioned and cannot be silently overwritten.
- Every costly action states what will happen and can be canceled where technically safe.
- Output can be reviewed and changed without a general timeline editor.
- Product language remains concrete and avoids the prohibited generic AI phrases.
