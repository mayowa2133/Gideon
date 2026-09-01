# Meet Solomon motion and editorial audit

Audit date: August 31, 2026. Scope: the three benefit-led real-internship V2
cuts (finance, software and legal operations), the supplied Meet-style
references, and the resulting V3 implementation. This audit does not alter or
replace V1 or V2.

## What was holding the films back

The V2 scripts improved the sales argument, but the image system did not keep
up. The repository's decoded-media analysis found 27–33 static windows in each
V2 cut and a longest static run of 2.8–3.0 seconds. The metric uses 5fps,
180×320 BT.709 luma differences, so it is only a motion proxy, but it matches
the visual review: proof cards appeared and then sat still, the mascot held
nearly one pose, the background carried no continuous action, the CTA was a
fixed end card, and most captions used one sans-serif treatment.

That created five editorial problems:

1. The narration moved faster than the composition. A new sentence often
   changed only the words at the top of the same basic layout.
2. Product evidence behaved like a pasted screenshot. It did not enter, float,
   tilt, or react to the presenter, so it lacked the object-like treatment in
   the references.
3. The mascot became decoration. It was present, but had too little travel,
   scale change, or reaction to direct attention.
4. Typography did not mark changes in thought. Hooks, resets, cautions, and
   proof explanations shared almost the same visual voice.
5. The CTA stopped the film instead of completing its momentum. It was readable
   but visually inert.

The underlying source discipline was strong and remains intact: each factual
claim used an approved crop from the selected Solomon listing; employer pages
were checked separately; figures were not invented; and the final copy avoided
guarantees. The revision therefore changes motion and hierarchy around the
evidence rather than replacing product proof with conceptual art.

## V3 changes

`meet-solomon-real-internships-v3` is an independently selectable version. The
renderer enables the following behavior only for V3, leaving all earlier
masters and their compositions unchanged.

- Every scene has a low-opacity motion field with traveling lines, an orbiting
  circle, and a rotating category-colored block.
- Product crops spring in, float on separate paths, scale subtly, and receive a
  small card-specific tilt and shadow. Their pixels and crop coordinates remain
  unchanged.
- The mouthless Solomon presenter enters with vertical travel and continually
  shifts position, scale, and angle. The visor remains character decoration and
  never implies lip sync or product evidence.
- Caption phrases animate independently. Editorial pivots use the Fraunces
  serif in italics, while direct product claims keep the heavier sans-serif.
- Concept tiles arrive in staggered order instead of appearing as a single
  static block.
- A category-colored progress rail maintains forward motion and makes the
  remaining runtime legible.
- The CTA keeps every required word visible for its full audited hold while its
  four lines move on separate low-amplitude paths. This avoids an unreadable
  entrance at either endpoint.

## Measured result

The same decoded-media method was run against each V2 and V3 master. Mean luma
difference increased by 66.6–82.3%, and the 2.8–3.0 second static runs were
removed, without changing the real listing, narration, evidence crop, or CTA
claim.

| Audience | Mean motion V2 → V3 | Static windows V2 → V3 | Longest static V2 → V3 | V3 duration | Alignment |
| --- | ---: | ---: | ---: | ---: | ---: |
| Finance interns | 6.69 → 11.15 (+66.6%) | 27 → 1 | 2.8s → 0.2s | 36.30s | 98.9% |
| Software interns | 6.31 → 11.38 (+80.5%) | 30 → 0 | 2.8s → 0s | 35.73s | 97.8% |
| Legal-operations interns | 6.25 → 11.40 (+82.3%) | 33 → 0 | 3.0s → 0s | 37.03s | 98.9% |

The metric does not determine whether motion is tasteful, so every encoded
scene was also reviewed in contact sheets. First and last CTA frames were OCR
checked. All V3 cuts remain near -14.5 LUFS, and the decoded-media gate found no
audio clicks. Narration remains the
local stock Chatterbox voice at native tempo; no voice was cloned. Its synthetic
character is reduced by shorter three-scene passages, but it is still audible
and should be replaced with a human read for a paid campaign.

## New audience: recent graduates

The first audience extension is a recent graduate beginning a first full-time
job search. It uses a real Solomon import of Cerebras Systems' **Software
Engineer - New Grad 2026** role in Toronto, checked against the employer's live
Ashby page on August 31, 2026. The film demonstrates two product benefits that
fit this audience: jobs populate from target occupations in the profile, and
opportunities can be tracked through Solomon's stages.

The role, employer, location, automatic-feed explanation, and stage control are
all shown with unmodified current-product pixels from one capture. The video
also directs the viewer to confirm every requirement on the employer page and
states that listings can change. It makes no claim about freshness, eligibility,
application outcome, or automatic applying. The role was posted about three
months before verification but its employer page still displayed an application
control when checked. No form was filled or submitted.

## Remaining opportunities

The V3 motion language is a meaningful step, but it should not become a single
template used forever. Future cuts should vary the opening device, allow the
mascot's gesture to determine proof-card travel, and use sound accents tied to
specific actions. A human voice performance would create the largest remaining
quality gain. Any new category still needs its own current Solomon capture and
employer verification; changing the label or accent color alone is not enough.
