// Whether a failed stage means "try a different posting" or "stop".
//
// The daily runner retries up to three candidate cards because not every card in
// a feed can be framed -- a card with another tight above and below leaves a crop
// no room to grow. That retry is only right for failures the *card* caused.
//
// Everything else must abort. A capture that crashed because the dev server is
// down, or because Playwright could not launch, produces no JSON at all; treating
// that as a card rejection spends three attempts and then reports "no card in
// this feed could be framed", which is a confident and completely wrong
// diagnosis. So is retrying `scroll_anchor_missing`, which is a surface problem
// that the next card will hit identically.
//
// Kept here, exported and tested, because it is a judgement rather than a
// mechanism -- and the wrong judgement is invisible until someone reads a log at
// six in the morning and believes it.

/** @returns {"retry"|"abort"} */
export function retryPolicy({ parsed, payload, cardClaimIds }) {
  // No JSON means the stage did not get far enough to have an opinion.
  if (!parsed) return "abort";

  const issues = payload?.issues ?? [];
  if (!issues.length && payload?.ok !== false) return "retry"; // caller decides success separately
  if (!issues.length) return "abort";

  // Retry only when every complaint is about the claim that names the card.
  // A single issue from elsewhere means the next card meets the same wall.
  const owned = new Set(cardClaimIds);
  return issues.every((issue) => issue.claimId && owned.has(issue.claimId)) ? "retry" : "abort";
}

/** The claims whose subject is a card the angle chose, i.e. the ones a different card could fix. */
export function cardClaimIds(requirements) {
  return (requirements ?? [])
    .filter((requirement) => Object.keys(requirement.fixture ?? {}).some((path) => path.startsWith("job.")))
    .map((requirement) => requirement.id);
}
