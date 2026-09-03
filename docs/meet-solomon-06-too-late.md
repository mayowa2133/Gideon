# Meet Solomon 06 — "Too Late"

Beat sheet for the freshness film. Written before capture, because the capture
plan is a function of the beats: every claim below names the surface and region
it will be framed from, and `plan-creator-capture.mjs` computes each one's pixel
budget from the `pattern` chosen here.

Target: 35–38s, ~110 words, 1080×1920.
Story: HOOK → QUESTION → DISCOVERY → ESCALATION → PAYOFF → CTA.

## Evidence this film rests on

Both halves of the contrast are real product states, captured from the live app
rather than composed. They come from two different searches, which is the story
rather than a compromise: the stale posting is the list you were scrolling
before, and the fresh one is what Solomon's own feed has at the top this morning.

| need | feed | surface region | what the product says |
| --- | --- | --- | --- |
| the stale posting | new-grad, this week | `newGradFeedDatedCard`, `newGradFeedPosted` | ages run out to "2 weeks ago" |
| the fresh posting | marketing, today | `overnightFeedPosted`, `overnightFeedNewBadge` | 5 fresh, ages from "3 hours ago" |
| the ordering | marketing, today | `overnightFeedSort` | "Newest First" |
| the count | marketing, today | `overnightFeedCount` | "200 jobs" with today's new count |

Ages are read from whatever the feed reports on the day. Nothing here hardcodes
"12 days" or "18 minutes" — if the feed's oldest card is 9 days old that morning,
the film says 9 days, and the cut still works because the beat is the *gap*
between the two numbers, not either number on its own.

---

## SCENE 1 — `hook` — 0:00–0:04

**What is being said?** "You find the perfect job. Great company. Great role. You actually qualify."

**NEW INFORMATION:** Something good is on screen and it is going well.

**VISUAL METAPHOR:** Qualification as a checklist completing. Three ticks land in
rhythm with the three fragments, each one a promise the film is about to break.

**SOLOMON ACTION:** `hero_close`, face `happy`, gaze to product, `approval` on the
right hand landing with the third tick. Leaning in.

**EVIDENCE:** `postingTitle` — the role and company on the posting page.

**TRANSITION:** The list of things that are right is complete, so the only thing
left to look at is the thing that is wrong.

## SCENE 2 — `beat-0` — 0:04–0:07

**What is being said?** "Then you notice one tiny detail."

**NEW INFORMATION:** There is something wrong with it, and it is small.

**VISUAL METAPHOR:** Everything except one line desaturates. The frame stops
being a job and becomes a single line of small text.

**SOLOMON ACTION:** Face `focused`, head tilt, gaze down toward the line. Hands
`rest_mitt` — the stillness is the point.

**EVIDENCE:** none; this beat is the pause before the reveal.

**TRANSITION:** The film has pointed at the detail without saying it. Saying it is the next cut.

## SCENE 3 — `proof-stale-1` — 0:07–0:11

**What is being said?** "Posted twelve days ago."

**NEW INFORMATION:** The job is old. Everyone has already seen it.

**VISUAL METAPHOR:** Full-screen. The age, alone, enormous, on the darkest frame
in the film. This is the `big_number` composition and it is the reason the
pattern exists — the number *is* the scene.

**SOLOMON ACTION:** `absent`. The spec is right that the reveal is stronger
without him; he comes back to react to it.

**EVIDENCE:** `newGradFeedPosted` — the product's own age line.

**TRANSITION:** The problem is now concrete, so the film can name the fix.

## SCENE 4 — `beat-2` — 0:11–0:14

**What is being said?** "Meet Solomon."

**NEW INFORMATION:** There is a product, and it addresses exactly that.

**VISUAL METAPHOR:** Hard cut to cream. Emptiness after the darkest frame.
Give it room — this is the only unhurried beat.

**SOLOMON ACTION:** Re-enters `hero_close` with a small bounce, face `friendly`,
`wave`. Eyes recover from the previous beat.

**EVIDENCE:** none.

**TRANSITION:** Named, so now show the mechanism.

## SCENE 5 — `beat-3` — 0:14–0:18

**What is being said?** "Instead of repeatedly finding the same old jobs, Solomon can keep watching the search for you."

**NEW INFORMATION:** The search persists after you stop looking.

**VISUAL METAPHOR:** The search condenses into a small watching widget; Solomon
steps to the side of it rather than in front. The widget stays lit while he is
not looking at it.

**SOLOMON ACTION:** `cameo_right`, `true_point_left` toward the widget, gaze to product.

**EVIDENCE:** `overnightFeedSort` — "Newest First", the product's own statement
that the feed is ordered by arrival.

**TRANSITION:** The mechanism is running; now something arrives.

## SCENE 6 — `proof-fresh-4` — 0:18–0:23

**What is being said?** "When something new matches, you can see what just appeared."

**NEW INFORMATION:** A posting arrived hours ago, not days.

**VISUAL METAPHOR:** A card drops in with its NEW badge and its age. The age is
the payload, so the crop tightens onto the line that carries it.

**SOLOMON ACTION:** Face `surprised` as a 9-frame accent on the drop, settling to
`happy`. This is one of the two accents the schema allows per scene.

**EVIDENCE:** `overnightFeedPosted` + `overnightFeedNewBadge`.

**TRANSITION:** One fresh card is an anecdote. The next beat makes it the rule.

## SCENE 7 — `beat-5` — 0:23–0:27

**What is being said?** "Yesterday's jobs stay yesterday's jobs. Today's jobs rise to the top."

**NEW INFORMATION:** The ordering is doing the work, continuously.

**VISUAL METAPHOR:** Two stacks. The old one sinks and desaturates, the new one
rises past it. The callback: the stale age from scene 3 is visible in the
sinking stack, so the viewer sees the thing that hurt them being demoted.

**SOLOMON ACTION:** `host`, gaze tracking the rising stack, `open_palm` presenting it.

**EVIDENCE:** `overnightFeedCount` — the count, with today's new figure.

**TRANSITION:** The behaviour is established, so the film can state the change in the question.

## SCENE 8 — `beat-6` — 0:27–0:31

**What is being said?** "So the question stops being, 'Have I already seen this?' and becomes, 'What changed today?'"

**NEW INFORMATION:** The user's own habit changes, not just the tool.

**VISUAL METAPHOR:** The first question types out and is struck through; the
second replaces it in the same position. One line doing two jobs.

**SOLOMON ACTION:** `hero_close`, face `direct_cta`, `presentation_palm`.

**EVIDENCE:** none — this beat is about the viewer, not the product.

**TRANSITION:** The question is the thesis; the last beat answers why it matters.

## SCENE 9 — `cta` — 0:31–0:36

**What is being said?** "Finding the right job matters. Finding it while it's still new matters too."

**NEW INFORMATION:** The two halves are equally weighted — this is the argument.

**VISUAL METAPHOR:** The two ages from earlier return side by side, the stale one
and the fresh one, and the fresh one is the one still standing. Second callback.

**SOLOMON ACTION:** `hero_close`, relaxed, face `confident_smile` bias, small
`approval`.

**EVIDENCE:** none; both numbers are already established, so re-proving them
would spend four seconds saying something the viewer already accepted.

**TRANSITION:** End card.

---

## Composition ledger

Checked against the spec's "never one template for 38 seconds" rule.

| composition | scenes |
| --- | --- |
| presenter close | 1, 4, 8, 9 |
| evidence over presenter | 5, 7 |
| full-screen proof, mascot absent | 3, 6 |
| big typography | 3, 8 |
| comparison | 7, 9 |

Solomon is absent for 2 of 9 scenes and cameo/host rather than hero in 2 more,
which puts him at roughly 60% hero presence — inside the spec's 50–70% band.

## Callbacks

- Scene 3's stale age returns in scene 7's sinking stack and again in scene 9.
- Scene 2 points at a line without reading it; scene 3 reads it.
- Scene 8's replaced question is answered by scene 9's two numbers.
