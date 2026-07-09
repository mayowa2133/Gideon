# Gideon product requirements document

**Status:** MVP definition

**Owner:** Product/engineering

**Last updated:** 2026-07-06

**Promise:** Record your product once. Get weeks of short-form content.

## Product summary

Gideon turns one uploaded software walkthrough into multiple editable, ready-to-export short-form marketing videos for TikTok, Instagram Reels, YouTube Shorts, LinkedIn, and related channels. It combines walkthrough understanding with product-marketing strategy: it finds meaningful UI moments, generates distinct content angles, writes specific scripts, and compiles approved ideas into vertical video drafts.

Gideon is not a screen recorder, general AI video generator, or autonomous social publisher. The MVP begins after a user has recorded a walkthrough. Its core loop is:

`upload → understand → propose 10 angles → select 3 → edit scripts → render 3 drafts → review → export`

Creative reference: the target explanation style is creator-led product education in the spirit of Nick Saraev and nivedan.ai, where fast cuts, visible product proof, plain-language benefit framing, and a human-presenter feel make software features understandable and marketable quickly. The MVP approximates this with scripted voiceover, dynamic product footage, captions, overlays, focus moves, and deterministic brand-presenter elements; AI human avatars or imported user likenesses are a future capability, not part of the initial reliable upload-to-export loop.

## Problem statement

Software founders and small product teams understand their products but struggle to turn releases and features into a reliable stream of social content. Each post requires repeated work: recording, finding useful moments, deciding what story to tell, writing a hook, editing, reframing, captioning, narrating, and adapting for a platform. Existing demo tools optimize for one polished walkthrough; generic AI video tools do not understand the product flow or the proof visible on screen.

The consequence is inconsistent marketing, weak generic copy, and underused product footage. A founder may record a useful walkthrough once, publish nothing, or publish one corporate-feeling demo that does not match short-form formats.

## Target users

### Primary

- Indie hackers and solo SaaS founders.
- Dev-tool and AI-tool founders.
- Early-stage startup teams without a dedicated video editor.
- Product and growth marketers at small software companies.

### Secondary

- Agencies producing product demo content for clients.
- Developer advocates and launch teams.
- Larger teams seeking a repeatable first draft before professional editing.

### Explicit non-targets for MVP

- Film/TV editors who need a general nonlinear editor.
- Influencer channels based primarily on talking-head or entertainment footage.
- Users seeking fully synthetic avatar content.
- Social media managers who need scheduling/analytics more than creation.

## Personas

### Maya, solo SaaS founder

- Builds and ships quickly; has no editor.
- Records Loom-style product walkthroughs for users.
- Wants three credible posts for launch week without learning CapCut.
- Success: selects concepts in under 10 minutes and exports three usable drafts.
- Concern: generic AI copy that misrepresents the product.

### Daniel, product marketer

- Supports several features and channels.
- Needs platform-specific angles and brand consistency.
- Wants to edit hooks/captions without redoing the whole video.
- Success: one source becomes a campaign of variants with clear approval history.
- Concern: loss of control, incorrect claims, and inconsistent brand voice.

### Priya, agency operator

- Produces repeatable output for multiple client workspaces.
- Needs isolation, predictable cost, and reviewable deliverables.
- Success: runs concurrent projects without mixing assets or brand kits.
- Concern: tenant leakage, provider cost surprises, and missed deadlines.

## Core value proposition

For software builders who need to market consistently, Gideon converts an existing product walkthrough into several specific, platform-native video drafts. Unlike screen recorders, it creates multiple marketing angles. Unlike generic video generators, its scripts and edits are grounded in visible product moments and user-supplied product context.

## Product principles

1. **One source, many angles.** A walkthrough is raw campaign material, not one final demo.
2. **Evidence before claims.** Scripts reference what the product context and footage actually support.
3. **Human approval before export.** Users can review and edit concepts, scripts, captions, focus, and renders.
4. **Specific beats generic.** Prefer plain, founder-native language and concrete outcomes.
5. **Native, not corporate.** Short hooks, visual proof early, readable captions, tight pacing, and platform safe areas.
6. **Async by default.** Upload, analysis, TTS, and rendering never block an HTTP request or freeze the UI.
7. **Stage-level recovery.** Retry or regenerate a failed stage without restarting the project.
8. **MVP discipline.** Uploaded screen recordings and MP4 export first; recorder, AI avatars, replay, scheduling, and analytics later.
9. **Deterministic execution.** AI proposes structured decisions; validated workers render them.
10. **Private by default.** Source recordings and outputs are private, workspace-scoped objects.

## Jobs to be done

- When I finish a feature or launch, help me identify multiple stories worth posting from one walkthrough.
- When I do not know how to write short-form hooks, give me specific options grounded in my product.
- When I choose an idea, turn it into a concise script and a visual plan that fits my footage.
- When the draft is mostly right, let me correct text or timing without using a professional editor.
- When processing takes time, tell me what is happening and let me leave and return safely.
- When a provider or render fails, preserve completed work and give me an actionable recovery path.
- When I export, produce a standards-compliant MP4 with no watermark and no hidden public URL.

## MVP scope

### Included

1. Email/social sign-in and a single personal workspace model that is team-ready.
2. Project creation with product name, target customer, one-sentence description, tone, and platforms.
3. Signed direct upload for one screen recording per project.
4. Media validation, metadata extraction, audio extraction, frame sampling, and scene/UI-change signals.
5. Transcription when speech exists.
6. AI walkthrough summary and evidence-backed detected moments.
7. Ten distinct video concepts covering several supported formats.
8. Selection of up to three concepts per generation batch.
9. Hook, short script, caption plan, voiceover text, creator template, and visual beat plan for selected concepts.
10. User editing of hook, script/voiceover, captions, template, brand kit, sound design, presenter toggle, and basic crop/focus choices.
11. Up to three 9:16 draft renders from explicitly approved scripts using the uploaded footage, captions, voiceover when enabled, timed overlays, focus punch-ins, callouts, optional generated music/SFX, and optional deterministic brand presenter.
12. Preview, stage-level regeneration, final MP4 export, and deletion.
13. Job progress, failure details safe for users, retry/cancel where supported, and persistent history.
14. Usage events sufficient for limits and future billing; no checkout required.

### Supported MVP content formats

- Product walkthrough.
- Problem/solution.
- Time-saver / “this saves you X”.
- Before/after.
- Founder demo.
- How it works.
- Feature highlight.
- Launch announcement.
- Tutorial.
- Customer pain point.
- POV.
- Three reasons why.
- “I built this because…”
- LinkedIn professional.
- TikTok casual.
- YouTube Shorts educational.

### Non-MVP

- Chrome extension or native recorder.
- rrweb structured capture and Playwright replay.
- Autonomous interaction with a customer’s product.
- AI avatars, synthetic talking presenters, or real-person impersonation beyond the deterministic logo-head brand presenter.
- Founder voice cloning.
- Multitrack general-purpose timeline editing.
- Social posting, scheduling, analytics, or A/B delivery.
- Teams, comments, roles, or external approval links beyond the data-model foundation.
- Template marketplace and advanced brand kits.
- Fully local/offline deployment.
- Generated B-roll from text-to-video models.
- Long-form or landscape-first editing.

## Expected user journey

1. Visitor sees “Turn one product walkthrough into weeks of short-form content.”
2. User signs in and creates a project.
3. User supplies product name, target customer, outcome, preferred tone, and platforms.
4. User uploads a screen recording and sees validation/upload progress.
5. Gideon inspects and analyzes it asynchronously.
6. User reviews the summary and detected moments such as dashboard, key action, output, and success state.
7. Gideon produces ten specific concepts with format, hook direction, audience pain, proof moment, and platform fit.
8. User selects three.
9. Gideon creates scripts/captions/voiceover plans.
10. User edits and approves each script.
11. Gideon renders three vertical drafts.
12. User previews, corrects text/focus, regenerates a stage if needed, and exports MP4.

## User stories and acceptance criteria

### Onboarding and project context

**As a founder, I want to create a project with enough product context that generated ideas are specific.**

- Product name: 1–80 characters.
- Target customer: 3–300 characters.
- Product outcome/description: 10–600 characters.
- Tone: one preset plus optional 300-character guidance.
- Platforms: at least one of TikTok, Instagram Reels, YouTube Shorts, LinkedIn, Other.
- Draft saves locally/server-side; refreshing does not erase completed fields.

### Upload

**As a user, I want to upload a recording without routing a multi-GB file through the app server.**

- Supported containers: MP4, MOV, WebM.
- Default maximum: 2 GB and 30 minutes; plan/config may lower it.
- Direct multipart upload with progress, pause/retry when provider supports it, and checksum/size verification.
- The project cannot analyze an unverified or quarantined object.
- User can replace the recording before approving concepts; replacement invalidates downstream artifacts with confirmation.

### Analysis

**As a user, I want to understand what Gideon detected before it creates marketing ideas.**

- Status advances through upload validation, media inspection, transcription, frame extraction, walkthrough analysis, and ready.
- Summary states the observed flow and differentiates observation from inference.
- Each detected moment has a time range, label, evidence thumbnail, confidence, optional transcript excerpt, inferred focus point, and inferred interaction target when screen evidence supports one.
- User can rename, hide, or adjust a moment before concept generation.
- Silent recordings are supported using visual evidence and supplied context; UI explains lower semantic confidence.

### Concepts

**As a user, I want ten meaningfully distinct ideas rather than paraphrases.**

- Exactly ten valid concepts per completed batch unless analysis cannot support them; otherwise the system reports why and offers context correction.
- Each includes title, format, target pain/desire, hook direction, proof moment(s), platform fit, estimated duration, and rationale.
- At least four distinct format families and no more than two concepts from one family.
- Concepts cite detected moment IDs; unsupported claims fail validation.
- User can select up to three, edit a concept brief, regenerate all, or regenerate one.

### Scripts and captions

**As a user, I want editable scripts that sound specific and natural.**

- Each selected concept yields hook, voiceover/body, on-screen text cues, caption segments, CTA, and visual beats.
- Default target duration: 15–45 seconds; hard MVP maximum: 60 seconds.
- Forbidden generic phrases are blocked or flagged: “revolutionary platform,” “seamlessly streamline,” “unlock your potential,” “game-changing solution,” and “powerful tool designed to.”
- Script includes no claim unsupported by product context/evidence.
- User edits are preserved across render retries and are never silently overwritten by regeneration.

### Rendering

**As a user, I want three usable drafts without learning video editing.**

- Draft is 1080×1920, H.264 video + AAC audio in MP4, with fast-start metadata.
- Source is fit into a readable phone canvas with adaptive crop/scale, background, and basic focus zooms.
- Captions stay within platform-safe areas, remain legible, and do not exceed configured line/character rules.
- Voiceover and caption timing align within the documented QA tolerance.
- Render is validated by ffprobe, duration/stream checks, sampled frames, and audio checks before `completed`.
- Failed jobs preserve manifest and logs, expose a user-safe error, and support retry if failure is transient.

### Review and export

**As a user, I want control over the final draft and a private export.**

- Preview can seek and show current captions/overlays.
- User can edit hook, script, caption text, caption style preset, per-beat source in/out, moment focus, and per-beat script focus/zoom.
- A change marks the prior render stale and clearly shows what must be regenerated.
- Export uses an expiring signed URL after workspace authorization.
- Export has no Gideon watermark by default.
- Deleting a project immediately removes access and schedules all objects/derived data for deletion.

## Feature requirements

### Project and product profile

- Projects belong to one workspace and expose opaque IDs.
- Product profile is versioned so generated artifacts identify the context version used.
- Project lifecycle: `draft`, `uploading`, `analyzing`, `concept_review`, `script_review`, `rendering`, `ready`, `failed`, `archived`, `deleting`.
- Only server-side state transitions are authoritative.

### Media ingestion

- Upload session is created by authenticated API and scoped to workspace/project/object key/size/type.
- Completion endpoint verifies object existence, size, checksum if available, and ownership.
- Worker uses bounded ffprobe before full decode.
- Normalized mezzanine is optional; derived assets never replace the immutable source.
- Extraction produces metadata, audio, frame/contact-sheet artifacts, and timestamps.

### AI analysis

- Inputs are a redacted evidence bundle, not arbitrary storage URLs.
- Model output is schema-validated and tied to prompt/model versions.
- Every moment/concept/script carries evidence references and confidence/warnings.
- Prompt injection text visible in the product or transcript is treated as data and cannot invoke tools.
- Users can correct model interpretation before downstream generation.

### Concepts and scripts

- Diversity validator checks format distribution, repeated hooks, and semantic similarity.
- Specificity validator checks product name/outcome/audience and evidence citations.
- Style validator detects prohibited phrases and unsupported superlatives.
- Platform adaptation changes tone/pacing/CTA without inventing product claims.
- Script drafts use short spoken lines and compile into dense visual beat plans that cycle proof moments for quick-cut pacing.
- Generated scripts start unapproved. Voiceover and render jobs require an approved script associated with a selected concept and no blocking quality warnings.
- Blocking quality warnings include unsupported claims, missing evidence, and caption safe-area overflow risk; advisory copy warnings can remain visible without blocking render.
- Script/profile edits rebuild the render plan and clear stale rendered outputs before another render can be exported.

### TTS and captions

- Voiceover generation occurs only from an approved script version.
- TTS provider/voice/version and timing data are recorded.
- Caption source remains editable structured text; burn-in is a render choice.
- Optional sound design uses deterministic generated tones only; no copyrighted stock music or user-supplied executable audio graphs.
- Users may disable voiceover and retain source audio/captions.

### Render and export

- Immutable render manifest identifies all input versions, template ID/version, and brand-kit ID.
- Caption timing must align to the approved voiceover/render timeline before a render can be exported.
- Render jobs are idempotent by manifest hash.
- Preview and final exports are separate quality profiles but share composition logic.
- Final file is retained under configurable lifecycle policy; access is private and signed.

### Usage and billing readiness

- Meter upload bytes, source minutes accepted, transcription minutes, LLM tokens/cost, TTS characters/seconds/cost, render seconds, exported bytes, and failed/refunded units.
- Enforce quota before expensive stage starts; reserve then settle usage for jobs.
- Billing provider IDs stay on workspace/subscription records; domain logic does not depend on one vendor.
- MVP may expose a static limit/upgrade screen without charging.

## Job behavior

Canonical statuses: `queued`, `processing`, `waiting_for_user`, `completed`, `failed`, `canceled`.

Every job also has stage, progress percent where meaningful, attempt, heartbeat, cancel request, error code, user-safe message, internal diagnostics reference, timestamps, input version, and idempotency key.

- Retry only known transient failures with exponential backoff and jitter.
- Do not retry schema/policy/invalid-media failures without changed input.
- A stale heartbeat permits lease recovery; workers must make effects idempotent.
- Cancellation is cooperative, releases reservations, and cleans partial scratch files.
- Downstream jobs never start until required upstream artifacts are committed.

## Success metrics

### North-star MVP metric

**Weekly projects with at least one exported video accepted without external re-editing.** Initial measurement uses an export follow-up: “Would you post this as-is or after text-only changes?”

### Activation funnel

- ≥60% of signed-in users create a project and begin upload.
- ≥80% of valid uploads reach concept review.
- ≥60% of concept-review users select at least one concept.
- ≥50% of users who select concepts complete at least one render.
- ≥35% of valid-upload projects export at least one video.

### Quality

- ≥70% of first concept batches have at least three concepts rated useful.
- ≥60% of first script batches need only text-level edits, not concept replacement.
- ≥70% of completed drafts are rated “post as-is” or “minor edits.”
- <2% prohibited generic phrase rate after validation.
- <1% completed-render technical defect rate in sampled QA.

### Reliability/performance targets

- Upload completion success ≥98% excluding user cancellation/network loss outside resumable window.
- Analysis pipeline completion ≥95% for valid media.
- Render pipeline completion ≥95% after automatic retry for valid manifests.
- API p95 under 500 ms for non-media/non-generation endpoints.
- Job progress update visible within 10 seconds of stage changes.
- Initial target: 10-minute, 1080p input reaches concept review within 10 minutes p50 and 25 minutes p95; three 30-second drafts complete within 15 minutes p50 and 35 minutes p95. Rebaseline after real workload data.

### Guardrail metrics

- Zero cross-workspace media access incidents.
- Zero secrets/signed URLs in application logs.
- 100% export objects private at rest.
- Provider cost per successful exported minute tracked from day one.

## Edge cases

| Case | Expected behavior |
|---|---|
| Silent walkthrough | Analyze frames/context; disclose lower confidence; allow text-only video |
| No audio track | Skip audio extraction/transcription safely |
| Multiple audio tracks | Select default/first valid track; show choice when ambiguous |
| Variable frame rate | Normalize timestamps or mezzanine before render |
| Portrait source | Preserve portrait layout; do not apply desktop crop assumptions |
| Ultrawide/4K source | Downscale for analysis; render readable focus crops |
| Very small/blurred UI | Warn that proof may be unreadable; request better source |
| Long idle sections | Detect and exclude unless user marks them relevant |
| Recording starts mid-flow | Summary states missing setup; concepts avoid unsupported beginning |
| Private data visible | User warning/redaction path; future automated detection; never public by default |
| Unsupported codec/container | Fail before analysis with conversion guidance |
| Corrupt/truncated file | Quarantine/fail with replace-upload action |
| Duplicate upload | Reuse by checksum only within same workspace and policy |
| Network interrupted | Resume multipart upload or restart only missing parts |
| User edits during generation | Version inputs; running job completes against old version and is marked stale |
| Provider timeout/rate limit | Retry/backoff or fallback where configured; preserve stage |
| Model returns invalid JSON | Bounded repair; fail with internal code, never pass malformed output onward |
| Fewer than ten credible ideas | Ask for more context rather than fill with duplicates |
| TTS duration exceeds visual plan | Re-time within bounds or return to script review |
| Caption overflows | Block render completion or use deterministic fit rules; never silently clip |
| Blank or visually empty render | Sample completed MP4 frames and fail render QA before export |
| User deletes during job | Cancel/deny downstream commits; revoke URLs; schedule object purge |
| Workspace quota reached | Stop before expensive work; show usage and upgrade-ready action |

## Competitive landscape

| Category | Examples | Strength | Gap Gideon targets |
|---|---|---|---|
| Polished screen recorders | Screen Studio, Tella, Arcade; open references OpenScreen/Recordly | Capture polish, cursor/zoom | Usually one demo, not many marketing angles |
| Async video/demo sharing | Loom, Cap | Easy record/share/team workflows | Limited campaign strategy and short-form variants |
| AI short clippers | OpusClip, Vizard; open reference OpenShorts | Repurpose long talking-head content | Transcript-first, weak software-flow understanding |
| AI video generators | Runway, InVideo, Pictory | Synthetic assets and prompt-to-video | Not grounded in a real product workflow |
| General editors | CapCut, Descript, Premiere | Deep control | High effort; user must decide the marketing story |
| Interactive demo tools | Arcade, Supademo, Storylane | Click-through product education | Not ready-to-post social video campaigns |
| Agentic/open video tools | Palmier, OpenMontage, video-use | Emerging agent workflows | Broad tools, not a focused SaaS marketing product |

Gideon’s intended wedge is the intersection of product-flow evidence, marketing-angle generation, and deterministic short-form rendering.

## Roadmap

### MVP: uploaded walkthrough to three drafts

Validate that useful, evidence-backed concepts and editable vertical drafts save founders meaningful time.

### v1.1: quality and brand consistency

- Better focus/zoom suggestions and moment correction.
- Brand kits, fonts, color, logo, caption presets.
- Platform-specific variants from one approved concept.
- Collaboration-lite: shareable review links and comments.
- Cost/latency optimization and provider routing.

### v2: structured product-flow capture

- Browser recorder/extension.
- rrweb capture with redaction.
- Playwright replay from approved flows and disposable accounts.
- Clean cursor telemetry and deterministic demos.
- Reusable product knowledge and feature library.

### v3: distribution and learning

- Social scheduling/posting after platform/security review.
- Performance analytics and hook A/B testing.

### Future: human presenter and avatar marketing

- Optional AI avatar or imported user likeness that can take the role of a creator-style presenter, subject to consent, likeness rights, and safety review.
- Company-logo presenter variants for brands that want a stylized host without using a real person.
- Presenter scripts and gestures aligned to the same evidence-backed product moments, so the avatar explains visible product proof instead of inventing claims.
- Content calendar and campaign planning.
- Team workspaces, approval policies, agency client portals.
- Optional consent-gated founder voice and avatar templates.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Concepts are generic | Product fails its core promise | Evidence citations, diversity/specificity validators, prompt eval set, user corrections |
| UI is unreadable in 9:16 | Drafts are unusable | Focus crops, safe framing, sample-frame QA, manual focus override |
| AI invents claims | Trust/legal harm | Separate observation/inference, evidence-linked claims, human approval |
| Render/transcription is slow/costly | Poor activation/economics | Async UX, quotas, previews, caching by manifest hash, benchmarks, provider adapters |
| Untrusted media exploits worker | Security incident | Sandbox, current FFmpeg, no egress, quotas, quarantine, private storage |
| Cross-tenant access | Critical privacy incident | Workspace-scoped queries/keys, centralized authz, signed URLs after authorization, tests |
| Provider lock-in | Margin/reliability loss | Versioned provider interfaces and artifacts |
| Scope expands into editor/recorder/social suite | MVP stalls | Enforce non-MVP list and outcome metrics |
| Open-source license misuse | Legal/product constraint | Dependency register, exact license/model review, no unapproved copying/forks |
| Voice/avatar abuse | Impersonation and platform harm | Keep out of MVP; consent/revocation/audit/labeling before launch |

## Open questions requiring human decision

1. Which initial LLM and TTS providers meet the desired quality, privacy region, and budget?
2. Is the first market solo founders only, or must agency multi-client UX be visible in MVP?
3. Should source audio be preserved by default, mixed under voiceover, or muted by default?
4. Is 2 GB/30 minutes the right first plan limit, and how long should source/final files be retained?
5. Should LinkedIn output remain 9:16 in MVP or include a 4:5/1:1 variant?
6. What user data may be sent to external AI providers, and is an explicit per-project consent notice required?
7. Which authentication vendor and deployment region are preferred?
8. Are users allowed to upload footage containing third-party products/data, and what attestation is required?
9. At what team point should the Remotion company license be purchased? Current research says four or more people.
10. What is the launch quality bar: “useful first draft” or “post-ready without any external editor”?

## Launch exit criteria

- Ten representative golden walkthroughs across SaaS/dev-tool/AI-tool products complete end to end.
- Each produces ten distinct concepts and three technically valid 9:16 drafts.
- At least seven of ten test users identify three useful concepts.
- At least six of ten export a draft they would post with text-only or no changes.
- Upload, authorization, deletion, queue recovery, and render security tests pass.
- No critical/high unresolved findings in the launch security review.
- Runbook covers stuck jobs, provider outage, storage failure, deletion, and cost spike.
- Product, technical, API, schema, UX, testing, and security documents match the implemented system.
