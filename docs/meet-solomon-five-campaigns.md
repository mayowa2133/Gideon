# Meet Solomon five-film campaign

This campaign implements five independently selectable short-form videos from
planned Solomon captures. It uses one validated Remotion composition with a
different motion device, palette, script, proof sequence, and CTA for each
audience. The shared treatment keeps the films recognizable as a set without
turning them into reskins.

| Film | Editorial motion | Product proof | CTA |
| --- | --- | --- | --- |
| Stop wasting applications | Application funnel | Triage ROI lanes and tracked role | Want to stop wasting applications? Join Solomon. |
| One company, every opportunity | Career-page cascade | Supported career-page search, captured Figma count and role | Want one place to explore a company’s openings? Join Solomon. |
| The follow-up you forgot | 24-hour timer | Needs Attention and stale-draft text | Want your next follow-up kept in view? Join Solomon. |
| Jobs within your real commute | City radius and pins | Toronto result count, new-grad and co-op cards | Want opportunities that fit your real life? Join Solomon. |
| AI under your control | User-control console | Resume-assist settings, data controls, unsent draft | Want AI help with you in control? Join Solomon. |

## Evidence boundary

The render command verifies the capture plan before it constructs a story. Each
product crop comes from an approved inventory region and retains the source PNG
hash, capture time, dimensions, source text, and crop rectangle. The renderer
copies those exact bytes into the film-specific public directory so one film
cannot read another film's captures.

The animated funnel, cascade, timer, map, and control console are labelled
**Editorial illustration**. They organize the idea but never stand in for
product evidence. Product crops carry a separate **Actual product** label.

The two job-listing films state that listings can change and ask viewers to
confirm the employer posting. The campaign does not claim exclusive inventory,
guaranteed outcomes, automatic sending, application submission, a public URL,
or autonomous publishing. Every output is a private review cut.

## Motion and mascot treatment

Movement is concentrated in the hook device and entrances. Product evidence
settles for reading, the payoff holds, and the CTA remains stable for at least
four seconds. The mouthless Solomon mascot appears only at the hook, payoff,
and CTA. It has a transparent surrounding canvas and stays clear of captions,
product crops, and CTA text.

## Render

The local capture directories are `tmp/film-triage`, `tmp/film-company`,
`tmp/film-cadence`, `tmp/film-toronto`, and `tmp/film-control`. They must include
the requirements, capture plan, capture run, inventory, and source PNGs.

```bash
npm run creator:meet:solomon:campaigns
```

One or more angles can also be rendered directly:

```bash
node scripts/render-meet-solomon-campaigns.mjs \
  --angle company-opportunities,follow-up-cadence \
  --out renders/meet-solomon/campaigns
```

The renderer uses local Chatterbox narration at native tempo, aligns the exact
approved script with Whisper `small.en`, enforces at least 90% word coverage,
masters audio to -14 LUFS, and verifies the final decoded video and audio. It
reuses an existing voice pass only when `TRANSCRIPT.txt` exactly matches the
current script.

Each local archive contains the story and film manifests, source captures,
capture verification, source review, narration provenance, alignment, stills,
decoded-media report, CTA OCR report, transcript, render receipt, and master.
Large generated artifacts remain ignored by Git.
