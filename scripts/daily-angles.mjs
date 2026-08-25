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

/**
 * Cards a listicle film can actually use, from the part of the feed it can see.
 *
 * Three constraints, each learned by capturing something wrong first:
 *
 *  - **The window.** Every claim on a surface shares one scroll, so the count and
 *    all the cards must sit inside one 900px viewport. That is about five cards;
 *    the sixth reports `region_outside_viewport` and the film loses a beat it has
 *    already written a line for.
 *
 *  - **Distinct, readable employers.** The first five were once five postings
 *    from one insurer whose name the source had stored as "AL" -- three
 *    identical-looking cards and a company that reads as a typo. One card per
 *    employer, and a name too short to be a name is skipped.
 *
 *  - **Titles that do not contradict the angle.** A film about work that is not
 *    software engineering cannot open on a "Web Developer & Digital Marketing
 *    Specialist". The angle says what disqualifies a card; this enforces it.
 *
 * Returns fewer than asked for rather than something that breaks one of those.
 * The caller decides whether fewer is still a film.
 */
export const pickCards = (feed, spent, { window = 5, take = 2, disqualify } = {}) => {
  const seen = new Set();
  const picked = [];
  for (const card of (feed.top ?? []).slice(0, window)) {
    const employer = String(card.company ?? "").trim();
    if (employer.length < 4) continue;
    if (seen.has(employer.toLowerCase())) continue;
    if (spent.has(cardKey(card))) continue;
    if (disqualify && disqualify.test(card.title ?? "")) continue;
    seen.add(employer.toLowerCase());
    picked.push(card);
    if (picked.length === take) break;
  }
  return picked;
};

export const DAILY_ANGLES = {
  "remote-nontech": {
    surface: "job_feed_remote_nontech",
    topic: "Remote jobs that are not software engineering",
    seconds: 18,
    slug: "remote-not-engineering",
    plan: (feed, spent = new Set()) => {
      // Exactly two cards, because the script below is written for two. Asking
      // for three and settling for two would leave a beat with a line and no
      // picture; if two distinct employers cannot be found in the window, this
      // angle has no film today and says so.
      const cards = pickCards(feed, spent, {
        window: 5,
        take: 2,
        // A developer role would contradict the only thing this film claims.
        disqualify: /\b(engineer|engineering|developer|programmer)\b/i
      });
      if (cards.length < 2) return null;
      const [a, b] = cards;
      return {
        spent: cards.map(cardKey),
        requirements: [
          countRequirement("job_feed_remote_nontech", "remoteNonTechCount",
            "How many non-engineering roles can be done from anywhere"),
          cardRequirement("first", "job_feed_remote_nontech", "remoteNonTechFirst", a,
            "One remote role, in a field that is not engineering"),
          cardRequirement("second", "job_feed_remote_nontech", "remoteNonTechSecond", b,
            "A second, at a different company")
        ],
        script: [
          { id: "hook", vo: "Remote work is not just for engineers." },
          { id: "beat-0", vo: "People assume you have to write code." },
          { id: "proof-matched-1", claimId: "matched", vo: `${feed.matched} of them, ${feed.fresh} arrived today.` },
          { id: "beat-2", vo: "Neither of these is an engineering role." },
          // Employer capped at two words as well as the title. This is the only
          // template that names two companies, so it carries twice the length
          // variance of the others -- "Berkshire Hathaway Specialty Insurance"
          // and "General Motors Financial Services" together pushed it to 58
          // against a 57 ceiling. Saying "at General Motors" of a card reading
          // "General Motors Financial Services" is the shortening a person would
          // make out loud, and the compiler still checks the line carries the
          // claim's own words.
          { id: "proof-first-3", claimId: "first", vo: `A ${words(a.title, 3)} role at ${words(a.company, 2)}.` },
          { id: "beat-4", vo: "A different company, same arrangement entirely." },
          { id: "proof-second-5", claimId: "second", vo: `A ${words(b.title, 3)} role at ${words(b.company, 2)}.` },
          { id: "cta", vo: "Follow @solomonhq for tomorrow's list." }
        ]
      };
    }
  },

  "marketing-today": {
    surface: "job_feed_marketing",
    topic: "Marketing jobs hiring right now",
    seconds: 18,
    slug: "marketing-hiring-now",
    plan: (feed, spent = new Set()) => {
      const top = unspent(feed, spent);
      if (!top) return null;
      return {
        spent: [cardKey(top)],
        requirements: [
          countRequirement("job_feed_marketing", "marketingFeedCount", "How many marketing roles match, and how many are new"),
          cardRequirement("role", "job_feed_marketing", "marketingFeedCard", top, "One marketing posting, with the employer on it"),
          { id: "sort", surfaceId: "job_feed_marketing", regionId: "marketingFeedSort", pattern: "wide_strip",
            says: "The feed is ordered newest first", fixture: {} }
        ],
        script: [
          { id: "hook", vo: "Marketing roles, not just engineering ones." },
          { id: "beat-0", vo: "You do not have to code to get hired." },
          { id: "proof-matched-1", claimId: "matched", vo: `${feed.matched} matched, and ${feed.fresh} are new.` },
          { id: "beat-2", vo: "Every one is a real open posting." },
          { id: "proof-role-3", claimId: "role", vo: `A ${words(top.title, 3)} role at ${top.company}.` },
          { id: "beat-4", vo: "Found this morning, not last month." },
          { id: "proof-sort-5", claimId: "sort", vo: "Sorted newest first, so today leads." },
          { id: "cta", vo: "Follow @solomonhq for tomorrow's list." }
        ]
      };
    }
  },

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
