# Gideon design system

**System name:** Gideon Signal

**Last updated:** 2026-06-24

**Design goal:** A confident, fast product-marketing workspace that feels premium and capable without looking corporate, childish, or “AI magical.”

## Brand personality

- **Strategic:** show decisions, evidence, and next actions.
- **Direct:** short labels and plain explanations.
- **Capable:** dense enough for real work, never toy-like.
- **Founder-friendly:** low ceremony and visible time savings.
- **Trustworthy:** private-by-default cues, review states, version history, no fake certainty.
- **Energetic:** strong contrast, quick transitions, decisive accent color.

The “small force, large impact” metaphor appears as one source branching into many outputs. Avoid armies, shields, biblical imagery, robots, sparkle icons, glowing brains, magic wands, and purple-gradient AI clichés.

## Voice and tone

### Product voice

- Specific and active: “Generate 10 ideas,” not “Unlock content possibilities.”
- Calm during failure: “Your script is saved. Retry voice generation.”
- Honest about AI: “Gideon inferred this result from the dashboard change,” not “Gideon knows everything about your product.”
- Outcome-led: “Three drafts are ready,” not “Processing successfully completed.”
- Founder-native examples: “I recorded my SaaS once, and got 10 posts,” not “Revolutionize your marketing workflow.”

### Terminology

| Use | Avoid |
|---|---|
| Recording | Asset ingestion |
| Idea / concept | AI content artifact |
| Detected moment | Semantic segmentation |
| Draft video | Generated media output |
| Focus area | Spatial saliency target |
| Try again | Reinvoke pipeline |
| Needs review | Low-confidence inference state |

## Logo direction

Wordmark-forward. A compact optional mark may combine one vertical source bar splitting into three forward-moving cuts. It must remain legible at 16px and work in one color. Do not use a play button alone; it is generic and positions Gideon as a player/recorder.

## Color system

The primary experience is a warm charcoal workspace with a high-visibility signal green. The green communicates selection, readiness, and forward action; it is not used for every decorative accent.

### Core palette

| Token | Hex | Use |
|---|---|---|
| `ink-950` | `#0B0D0C` | Dark app background |
| `ink-900` | `#121513` | Raised dark surface |
| `ink-800` | `#1C211E` | Hover/selected dark surface |
| `ink-700` | `#303832` | Dark borders/dividers |
| `paper-50` | `#F7F8F3` | Light app background |
| `paper-100` | `#EFF1E9` | Light secondary surface |
| `paper-200` | `#DDE1D5` | Light borders |
| `paper-700` | `#424A43` | Secondary light text |
| `signal-400` | `#B8F34A` | Primary accent on dark |
| `signal-500` | `#9DDA2B` | Primary light-mode action |
| `signal-600` | `#7CB51B` | Hover/pressed light action |
| `blue-500` | `#4F7CFF` | Informational/progress |
| `amber-500` | `#D99722` | Warning/stale/attention |
| `red-500` | `#D94B4B` | Destructive/error |
| `green-600` | `#2D9B62` | Completed success, distinct from brand accent |

### Semantic tokens

```css
:root {
  --bg: #F7F8F3;
  --surface: #FFFFFF;
  --surface-subtle: #EFF1E9;
  --text: #111411;
  --text-muted: #596158;
  --border: #DDE1D5;
  --primary: #7CB51B;
  --primary-contrast: #0B0D0C;
  --info: #4F7CFF;
  --success: #2D9B62;
  --warning: #D99722;
  --danger: #D94B4B;
  --focus: #4F7CFF;
}

[data-theme="dark"] {
  --bg: #0B0D0C;
  --surface: #121513;
  --surface-subtle: #1C211E;
  --text: #F5F7F0;
  --text-muted: #A7B0A7;
  --border: #303832;
  --primary: #B8F34A;
  --primary-contrast: #0B0D0C;
}
```

### Rules

- Primary signal green is reserved for one dominant action, selections, and key active markers.
- Success uses `green-600`, so “completed” is not confused with “click here.”
- Status colors always pair with an icon and text.
- Gradients may appear in video canvas backgrounds and landing art, not as default button/card decoration.
- All text/background pairs must meet WCAG AA; body text targets 4.5:1.

## Typography

### Families

- **UI and body:** Inter Variable, fallback `ui-sans-serif, system-ui, -apple-system, sans-serif`.
- **Display:** Manrope Variable for landing headlines and major empty states.
- **Technical/timecode:** Geist Mono or `ui-monospace, SFMono-Regular, monospace`.

Fonts must be self-hosted/pinned for the app and rendering workers. A render manifest records font family and version; no render depends on a live Google Fonts request.

### Type scale

| Token | Size/line | Weight | Use |
|---|---|---:|---|
| `display-xl` | 64/68 | 700 | Landing hero desktop |
| `display-lg` | 48/52 | 700 | Landing section lead |
| `heading-xl` | 32/38 | 650 | Page title |
| `heading-lg` | 24/30 | 650 | Major panel heading |
| `heading-md` | 18/24 | 600 | Card heading |
| `body-lg` | 16/25 | 450 | Primary form/marketing body |
| `body-md` | 14/21 | 450 | Default app copy |
| `body-sm` | 12/18 | 500 | Metadata/help |
| `label` | 12/16 | 650 | Controls/status; no all-caps by default |
| `mono-sm` | 12/18 | 500 | Timecodes, IDs, technical metadata |

Use sentence case. Avoid excessive bold; hierarchy should come from size, spacing, and contrast.

## Spacing and layout

Base unit: 4px.

`space-1: 4`, `2: 8`, `3: 12`, `4: 16`, `5: 20`, `6: 24`, `8: 32`, `10: 40`, `12: 48`, `16: 64`, `20: 80`, `24: 96`.

### App layout

- Navigation rail: 240px expanded, 72px collapsed.
- Content maximum: 1440px; reading forms 720px; prose 760px.
- Page gutter: 24px tablet, 32px desktop, 16px mobile.
- Dense work panels use 16–20px padding; primary cards use 24px.
- Split video/editor pages use a 7/5 or 8/4 grid depending on control density.

### Landing layout

- 12-column, max 1280px.
- Hero top/bottom padding 96–128px desktop, 56–72px mobile.
- Each section has one claim and one visual proof; no generic logo-cloud wall before product explanation.

## Shape, borders, and elevation

- Default radius: 10px.
- Large cards/modals: 14px.
- Pills/status chips: 999px, used sparingly.
- Inputs/buttons: 9px.
- Video canvases: 12px with neutral matte.
- Borders: 1px semantic `border`; selected cards use 2px primary inset ring without layout shift.
- Shadows are subtle and neutral: `0 8px 30px rgba(11,13,12,.10)` in light mode; dark mode relies more on borders/surface contrast.
- No excessive glassmorphism. Blur is reserved for overlays over video or landing hero art.

## Motion

- Fast control feedback: 120–160ms.
- Panel/card transitions: 180–220ms.
- Drawers/modals: 220–280ms.
- Easing: `cubic-bezier(.2,.8,.2,1)`; spring only for timeline focus/zoom demonstrations.
- Progress indicators animate only the active stage.
- Respect `prefers-reduced-motion`: replace translation/scale with opacity and remove looping shimmer.

## Icon style

Use Lucide-style 1.75–2px rounded strokes, 16/20/24px grid. Icons clarify actions and status; they do not replace labels for core workflow actions. Custom product icons should use simple directional cuts, focus frames, captions, and branching outputs. Avoid sparkles as the generic AI icon.

## Core components

### Buttons

#### Primary

- Signal fill, dark text, 40px default height/48px large.
- One primary button per decision region.
- Hover darkens 6–8%; pressed translates at most 1px.
- Loading retains width and uses spinner plus action verb, e.g. `Generating ideas…`.

#### Secondary

- Surface fill and border; text uses primary text.
- Used for reversible alternate actions.

#### Tertiary

- Text/icon only; hover surface.

#### Destructive

- Red fill only in confirmation modal; initial destructive entry may be red text/border.

Disabled buttons remain readable and pair with nearby explanation when the reason is not obvious. Prefer not rendering unavailable future actions.

### Forms

- Label above input, optional badge beside label, help below.
- 44px minimum control height; textareas resize vertically.
- Focus ring: 2px `focus` plus 2px surface offset.
- Errors appear below field with icon and specific correction.
- Success checks only where confirmation matters (upload verified, handle available), not every valid field.
- Character guidance appears before hard limit and uses plain language.

### Cards

Three densities:

- **Project card:** 24px padding; thumbnail, stage, next action.
- **Concept card:** 20px padding; format badge, title, evidence, selection control.
- **Compact status card:** 12–16px padding; job/artifact metadata.

Cards are not all clickable by default. If the whole card is interactive, it has a visible focus state and no nested conflicting targets.

### Status chip

- Dot/icon + label: Queued, Processing, Needs review, Ready, Failed, Canceled, Stale.
- Background is a low-chroma tint; text meets contrast.
- Processing may pulse the dot, not the entire chip.

### Stepper

- Horizontal on desktop, compact vertical/list on mobile.
- Completed uses check + success, current uses primary ring, issue uses warning/danger icon.
- Step labels remain text; do not show numbers alone.

### Tabs

- Underline or segmented surface depending on context.
- Script concepts use vertical rail on desktop and dropdown/tab list on narrow screens.
- Preserve keyboard arrow navigation.

### Toasts

- Only for transient confirmation (`Script saved`) or background event (`Draft ready`).
- Persistent failures live inline on the affected job/card.
- Maximum two visible; no critical information exclusively in a toast.

### Modal

- Use for consequential confirmation or short focused selection.
- Default max width 480px; impact summary precedes buttons.
- Destructive action is rightmost only if platform convention and clear labeling are maintained; never rely on color.

## Upload zone

- Minimum desktop height 220px, dashed 1px border, surface-subtle background.
- Centered upload icon, `Choose video` button, drag/drop text, limits.
- Drag active: solid primary border and restrained primary tint.
- Selected file becomes a file card with preview, size, type, replace/remove.
- Upload progress uses a determinate bar with numeric percent/bytes; validation becomes a distinct stage.
- Error state retains the file name only when safe/useful and puts the corrective action next to the message.

## Timeline and video preview UI

The MVP is a constrained beat editor, not a general NLE.

### Player

- Neutral dark surround and 9:16 canvas centered.
- Controls: play/pause, seek, current/total time, mute/volume, captions toggle, safe-area toggle, playback speed.
- Frame never stretches; source placement uses explicit contain/crop treatment.

### Beat strip

- Single source filmstrip with detected-moment blocks above and caption/overlay cues below.
- Active playhead is signal green and 2px.
- Selected range uses a translucent signal tint.
- Time ticks use mono type.
- Users can adjust bounded start/end and focus markers; no arbitrary track creation/keyframes in MVP.

### Safe areas

- Toggle overlays top/bottom interaction zones and center-readable area for target platform.
- Captions/CTA snap to safe presets.
- Collisions become warnings before render, not merely visual hints.

## Generated video cards

- 9:16 thumbnail (120×213 minimum desktop) or responsive aspect-ratio container.
- Title and concept format.
- Duration, version, template/style, status.
- Primary `Review`; compact overflow for duplicate/delete.
- Stale state overlays an amber badge, never dims content so far that it appears disabled.
- Failed card shows affected stage and a retry action; no raw technical trace.

## Caption system

MVP presets:

1. **Signal:** bold white, dark rounded background, current word signal green.
2. **Clean:** white semibold with subtle dark shadow/outline.
3. **Editorial:** sentence case, off-white, restrained lower-third block.

Rules:

- Maximum two lines.
- Target 28–36 characters per line at 1080×1920, validated by measured glyph width.
- Default 54–72px depending on font/format; never scale below accessibility floor to fit excessive text.
- Current-word highlighting is optional; avoid frantic one-word-only captions for professional/LinkedIn variants.
- Captions stay inside selected safe-area preset and avoid the CTA overlay.

## Loading states

### Skeletons

Use for short initial data fetches only. Match final layout; no long full-page shimmer during media jobs.

### Long-running jobs

- Stage name, concise explanation, status, and leave-page reassurance.
- Determinate progress only when backed by bytes/frames/stages.
- Show completed artifacts early (one video card may be ready while another renders).
- Avoid fake AI phrases such as “Adding magic.”

## Empty states

- Small directional illustration or product UI schematic, not mascots.
- One outcome-focused headline, one explanation, one primary action.
- Context-specific: no projects, no recording, no selected concepts, no exports.
- Avoid huge blank cards or tables with only “No data.”

## Error states

- Inline near the affected item.
- Red reserved for actual failure/destructive risk; warnings/stale use amber.
- Message structure: outcome → preserved work → next action.
- Example: “Voice generation failed. Your approved script is saved. Retry or render without voiceover.”
- Reference ID is copyable in mono text under `Details` without exposing internals.

## Navigation

- App logo/workspace at top.
- Primary: Projects.
- Secondary/later: Templates, Brand kit may remain hidden until implemented.
- Bottom: Usage, Settings, Help, user menu.
- Project-level stepper belongs in page header, not global nav.

## Landing page direction

### Hero visual

Show a realistic source-recording strip entering a central Gideon analysis plane and branching into three vertical video cards with different hooks. The visual must communicate multiplicity and control, not synthetic video generation.

### Page sequence

1. Promise and CTA.
2. Source-to-many proof visual.
3. Three-step workflow: upload, choose angles, export drafts.
4. Concept quality section with bad/good copy comparison.
5. Review/edit control section.
6. Platform-native outputs.
7. Privacy/security and FAQ.
8. Final CTA.

### Art direction

- Warm off-white marketing canvas with charcoal sections and signal green cuts.
- Product screenshots dominate over stock photography.
- Thin motion paths and timecode/grid details create a production-tool feel.
- Avoid 3D chrome robots, floating glass orbs, neon purple, and generic creator stock photos.

## Data visualization

Only use charts where they help decisions: usage over allowance, job duration, future performance analytics. Use signal green for the selected/current series, blue for comparison, semantic warning/danger thresholds. Charts must provide text/table alternatives.

## Accessibility and internationalization

- WCAG 2.2 AA target.
- 44×44px minimum primary touch target.
- Visible focus for every interactive component.
- Semantic HTML before ARIA.
- Captions and transcript are keyboard-navigable.
- Do not encode status by color alone.
- UI strings support 30–50% expansion; avoid fixed-width text containers.
- Time, dates, numbers, and file sizes use locale-aware formatters.
- Render templates must support Unicode font coverage and right-to-left evaluation before claiming language support.

## Design quality gates

- Primary user action is identifiable within five seconds on every workflow page.
- No page has more than one competing primary action in a decision region.
- All long-job pages survive refresh and explain whether leaving is safe.
- Video overlays pass safe-area and measured text-fit validation at 1080×1920.
- Light/dark themes meet contrast checks.
- Empty/error/loading states are designed before a feature is complete.
- Motion passes reduced-motion review.
- Marketing copy contains none of the prohibited generic phrases.
