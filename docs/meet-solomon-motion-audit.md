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

## Follow-up: V3 moved too much

Follow-up review on September 1, 2026 confirmed that the first motion response
overshot. V3 removed static runs by keeping the background, proof cards,
presenter container, progress rail, and CTA moving at the same time. The motion
score improved, but the eye had no dependable resting point. Product evidence
was especially affected: once a crop became readable, it continued to float,
scale, and rotate instead of holding still long enough to inspect.

The corrected `meet-solomon-real-opportunities-v4` profile uses a simpler rule:
one dominant entrance movement, then a stable reading hold. Background forms
finish their travel after 18 frames. Product cards spring in and settle without
ongoing drift. The presenter container stops moving, and the mascot animation
freezes after 32 frames. The continuous progress rail is removed. CTA copy is
fully visible and stationary for the complete CTA scene.

The first V4 cut has a mean decoded-motion score of 8.09, between V2's
6.25–6.69 and V3's 11.15–11.40. Its median interval is 0.31, compared with
5.96–6.27 in V3, which reflects the intended pattern of a short entrance
followed by a quiet hold. Its longest static run is 1.6 seconds: deliberate
reading time rather than an unattended composition. Cut changes still keep the
film moving forward.

## New audience: customer-facing career switchers

The V4 film targets people with customer-facing experience who want to move
toward a technology customer-success role. It uses a real Solomon import of
Recharge's **Customer Success Manager (Toronto)** position, checked against the
employer's Ashby page on September 1, 2026. The product capture shows the exact
role, employer, Toronto location, profile-driven job population, opportunity
stages, and employer-page control.

The story frames existing customer skills as transferable, then shows how
Solomon can keep the new direction focused and track the opportunity. It does
not claim that the role is entry level or that any career changer is qualified.
The employer page states experience requirements, so the film explicitly tells
the viewer to confirm every requirement before applying. No application was
started or submitted.

## Opportunity-feed scroll

The opportunity-scroll cut responds to the request for a video that feels full
of jobs without returning to V3's competing motion. It has one continuous
movement: a vertical editorial scroll through 17 unmodified cards from three
real Solomon job-feed captures. Headline changes do not animate independently,
the cards do not float or rotate, and the final CTA stops the scroll for a
4.4-second reading hold.

The captures were produced on August 31, 2026 and show Solomon feeds with 200
jobs across software, new-grad, internship, marketing, design, and human
resources results. The film dates and labels the composite as an editorial
scroll. It also says listings can change and directs the viewer to confirm the
employer posting. Because Solomon's product copy identifies public sources such
as JSearch, Adzuna, Remotive, Dice, and newgrad-jobs.com, the requested
"exclusive jobs" wording is not supportable. The approved CTA is: **Want easy
access to more opportunities? Join Solomon.**

The final 23.53-second master has two measured shots: the 19.13-second scrolling
product section and the stationary CTA. Its decoded video is 1080×1920,
30 fps, H.264/YUV420p/BT.709; audio measures -14.42 LUFS with no detected clicks.
Whisper small.en decoded the exact approved narration, and CTA OCR matched at
both the first and final review frames.

The follow-up V2 robot cut keeps that motion structure. The mouthless Solomon
mascot appears only as a small head cameo in the hook and as a full-character
CTA cameo below the copy. It is absent from the entire opportunity scroll. Both
appearances perform one short gesture and settle, so the mascot adds warmth
without creating a second continuous movement or obscuring product evidence.
The approved V1 master remains byte-identical.

V3 removes the colored panels around both mascot cameos. The hook now crops the
robot directly against the ivory canvas, and the CTA uses the full character
with only its built-in cast shadow. This keeps the mascot integrated with the
film instead of presenting it as a separate sticker card. The mascot remains
absent from the scrolling product section.
