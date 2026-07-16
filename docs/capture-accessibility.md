# Hosted capture accessibility and responsive contract

The hosted structured-capture workspace treats accessibility as a release gate, not a styling pass. `pnpm test:accessibility` runs a real Chromium audit against synthetic API data and writes `tmp/capture-accessibility/accessibility-evidence.json` with mode `0600`.

## Automated contract

- axe-core WCAG 2 A/AA checks at desktop 1440×900, tablet 768×1024, and mobile 390×844;
- no page-level horizontal overflow at those viewports;
- a first-focus skip link and logical navigation order;
- `aria-current="step"` on the active workflow stage;
- focus restoration to the new page heading after keyboard stage changes;
- visible `:focus-visible` indication for links, buttons, and fields;
- native required/type validation focuses the associated labeled field;
- errors use alerts, notices/progress use polite status announcements, and progress retains a text stage;
- disabled setup actions reference visible explanations through `aria-describedby`;
- private silent-source previews expose native keyboard controls, an accessible name, and a descriptive framing note;
- generated caption tracks remain part of the approved rendered-video artifact, not the silent source-clip preview;
- reduced-motion media preferences collapse animation and transition durations; and
- screenshots are stored only under ignored `output/playwright/` for local visual review.

The report stores counts, viewport sizes, rule IDs and impacts only when violations occur. It omits DOM, page text, URLs, selectors, screenshots, credentials, media, and project content.

## Human review still required

Automated results do not prove usability with VoiceOver, NVDA, TalkBack, switch control, voice control, or browser/OS high-contrast modes. Before general availability, humans must review complete workflows with representative assistive technology, 200–400% zoom and reflow, touch targets/ergonomics, real display contrast, caption accuracy and comprehension, and cognitive pacing. The silent source preview has no audio and therefore no caption track; caption accessibility must also be reviewed on the final approved edit where the WebVTT track exists.
