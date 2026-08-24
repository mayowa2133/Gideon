// The angles a daily film can be cut from, and how each one reads today's feed.
//
// A daily series is a fixed format whose numbers change. That is the only reason
// this can be automated at all: the pipeline's rule is that no model writes the
// script, and nothing here breaks it. Each angle carries a script *template*
// that a person wrote once, and the runner fills it with the product's own
// counts and the roles the feed actually drew this morning.
//
// Every template is still checked by the same gates as a hand-written script --
// word budget, grounded numerals, and "the beat must say the claim's own words".
// A template that stops fitting the data fails loudly at compile rather than
// shipping a film that says the wrong thing.
//
// `plan(feed)` receives the feed read (see plan-daily-jobs-film.mjs) and returns
// the requirements and the script for today.

/** First `count` words of a title, for a beat that must name the role. */
const words = (text, count) => String(text ?? "").split(/\s+/).filter(Boolean).slice(0, count).join(" ");

/**
 * What counts as the same posting across two films.
 *
 * Company and role, because that is what a viewer recognises. Two angles that
 * both sort newest-first over overlapping filters will top out on the same card
 * whenever one posting is the freshest thing in the workspace, and on the first
 * real batch that happened: two of the day's three films opened their proof beat
 * on the same Agave role with a different caption over it. Nothing was wrong with
 * either film -- the crop check only looks within one film -- and that is exactly
 * why it needed a key that spans them.
 */
export const cardKey = (card) => {
  // Each part normalised, not the joined string: trimming the join leaves the
  // padding sitting against the separator, so " Agave " and "agave" produced two
  // different keys for one posting -- the exact failure this key exists to stop.
  const part = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return `${part(card?.company)}|${part(card?.title)}`;
};

/** The topmost card this run has not already featured, or undefined if none is left. */
const unspent = (feed, spent) => (feed.top ?? []).find((card) => !spent.has(cardKey(card)));

/** A card claim, framed on the headline block that holds role, employer and place. */
const cardRequirement = (id, surface, region, card, says) => ({
  id,
  surfaceId: surface,
  regionId: region,
  pattern: "evidence_band",
  says,
  fixture: { "job.title": card.title, "job.company": card.company }
});

const countRequirement = (surface, region, says) => ({
  id: "matched", surfaceId: surface, regionId: region, pattern: "wide_strip", says, fixture: {}
});

export const DAILY_ANGLES = {
  "remote-today": {
    surface: "job_feed_remote",
    topic: "Remote engineering jobs I found today",
    seconds: 18,
    slug: "remote-engineering-today",
    plan: (feed, spent = new Set()) => {
      const top = unspent(feed, spent);
      if (!top) return null;
      return {
        spent: [cardKey(top)],
        requirements: [
          countRequirement("job_feed_remote", "remoteFeedCount", "It counts what matched and what is new"),
          cardRequirement("role", "job_feed_remote", "remoteFeedCard", top, "One posting, with the role and the company on it"),
          { id: "sort", surfaceId: "job_feed_remote", regionId: "remoteFeedSort", pattern: "wide_strip",
            says: "The feed is ordered newest first", fixture: {} }
        ],
        script: [
          { id: "hook", vo: "Remote engineering jobs, found while you slept." },
          { id: "beat-0", vo: "You do not have to go looking." },
          { id: "proof-matched-1", claimId: "matched", vo: `${feed.matched} matched today, ${feed.fresh} of them new.` },
          { id: "beat-2", vo: "Each one is a real open posting." },
          { id: "proof-role-3", claimId: "role", vo: `${words(top.title, 3)}, hiring at ${top.company}.` },
          { id: "beat-4", vo: "The newest ones sit at the top." },
          { id: "proof-sort-5", claimId: "sort", vo: "Sorted newest first, so today leads." },
          { id: "cta", vo: "Follow @solomonhq for tomorrow's list." }
        ]
      };
    }
  },

  "newgrad-week": {
    surface: "job_feed_newgrad",
    topic: "Startup jobs for new grads this week",
    seconds: 18,
    slug: "newgrad-startups-this-week",
    plan: (feed, spent = new Set()) => {
      const top = unspent(feed, spent);
      if (!top) return null;
      return {
        spent: [cardKey(top)],
        requirements: [
          countRequirement("job_feed_newgrad", "newGradFeedCount", "Every graduate-level startup role here is new this week"),
          cardRequirement("role", "job_feed_newgrad", "newGradFeedCard", top, "A role open to a new graduate"),
          { id: "sort", surfaceId: "job_feed_newgrad", regionId: "newGradFeedSort", pattern: "wide_strip",
            says: "Ordered newest first, so the top is this week", fixture: {} }
        ],
        script: [
          { id: "hook", vo: "Startups are hiring new graduates right now." },
          { id: "beat-0", vo: "Not one of these is a big name." },
          { id: "proof-matched-1", claimId: "matched", vo: `${feed.matched} matched, and ${feed.fresh} are new.` },
          { id: "beat-2", vo: "New this week, not last spring." },
          { id: "proof-role-3", claimId: "role", vo: `A ${words(top.title, 3)} role at ${top.company}.` },
          { id: "beat-4", vo: "Graduate level, at a company still small." },
          { id: "proof-sort-5", claimId: "sort", vo: "Newest first, so this week stays visible." },
          { id: "cta", vo: "Follow @solomonhq for this week's list." }
        ]
      };
    }
  },

  "overnight": {
    surface: "job_feed_overnight",
    topic: "What Solomon found overnight",
    seconds: 18,
    slug: "found-overnight",
    plan: (feed, spent = new Set()) => {
      const top = unspent(feed, spent);
      if (!top) return null;
      return {
        spent: [cardKey(top)],
        requirements: [
          countRequirement("job_feed_overnight", "overnightFeedCount", "How many roles matched, and how many are new"),
          cardRequirement("role", "job_feed_overnight", "overnightFeedCard", top, "One of the postings that arrived overnight"),
          { id: "sort", surfaceId: "job_feed_overnight", regionId: "overnightFeedSort", pattern: "wide_strip",
            says: "Newest first, so the overnight arrivals are on top", fixture: {} }
        ],
        script: [
          { id: "hook", vo: "This all arrived while you were asleep." },
          { id: "beat-0", vo: "One search ran overnight, on its own." },
          { id: "proof-matched-1", claimId: "matched", vo: `${feed.matched} roles matched. ${feed.fresh} were not there yesterday.` },
          { id: "beat-2", vo: "You wake up to a filled feed." },
          { id: "proof-role-3", claimId: "role", vo: `A ${words(top.title, 3)} role at ${top.company}.` },
          { id: "beat-4", vo: "Every one is tagged and ready." },
          { id: "proof-sort-5", claimId: "sort", vo: "Newest first, so overnight arrivals lead." },
          { id: "cta", vo: "Follow @solomonhq and check tomorrow morning." }
        ]
      };
    }
  }
};
