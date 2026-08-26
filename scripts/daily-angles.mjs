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

/**
 * First `count` words of a title, for a beat that must name the role.
 *
 * Trailing punctuation is dropped because the cut lands mid-title as often as
 * not: "Staff Software Engineer, AI Foundations" clipped to three words is
 * "Staff Software Engineer," and every template that interpolates it adds its
 * own separator straight after, so the line reads "Staff Software Engineer,,
 * posted 22 hours ago." Nothing catches it -- the word count is identical and
 * every gate still passes -- it just reads as a typo and makes the narrator
 * stumble.
 */
const words = (text, count) =>
  String(text ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(" ")
    .replace(/[\s,;:|\-\u2013\u2014/]+$/, "");

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

/**
 * The topmost card this run has not already featured, or undefined if none is left.
 *
 * `keep` is for an angle whose closing beat needs something the feed does not
 * always print. The overnight film ends on how long ago a posting went up, and
 * the product renders a company cell with no date at all when the source gave
 * none -- so "topmost unspent" and "topmost unspent that can end this film" are
 * different questions, and only the angle knows which it is asking.
 */
const unspent = (feed, spent, keep = () => true) =>
  (feed.top ?? []).find((card) => keep(card) && !spent.has(cardKey(card)));

/** A card claim, framed on the headline block that holds role, employer and place. */
const cardRequirement = (id, surface, region, card, says, pattern = "evidence_band") => ({
  id,
  surfaceId: surface,
  regionId: region,
  pattern,
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

  // The one angle whose argument is a time.
  //
  // The other four are listicles: a count, a role, and a sort control, in any
  // order, because each beat stands on its own. This one is a chain -- postings
  // go up while you are offline, you cannot watch every careers page, so the
  // feed watches by arrival time, so the top of it is last night, and here is
  // last night's newest. Rewritten from the listicle version after a reading
  // that the films were additive where they should be causal; the beat plan did
  // not have to change at all, which is the useful part. `planBeats` spreads
  // three claims over slots 1, 3 and 5 either way. What changed is which claim
  // is last: the old cut ended on `Newest First`, spending its closing beat on
  // a preference menu, and this one ends on the job.
  "overnight": {
    surface: "job_feed_overnight",
    topic: "Jobs that went up while you were asleep",
    seconds: 18,
    slug: "found-overnight",
    plan: (feed, spent = new Set()) => {
      // The newest posting that still says how old it is, and is named in
      // enough words to close a beat.
      //
      // `age` because the closing line *is* the age: a card the source dated
      // renders "temporaltechnologies - 22 hours ago" and one it did not renders
      // just the company, leaving the film's last beat with nothing to say. Two
      // title words because that beat is `<title>, posted <age>.` and a
      // one-word role against a one-word age ("Engineer, posted Today.") is
      // three words, under the four-word floor every beat has.
      const top = unspent(feed, spent, (card) =>
        Boolean(card.age) && String(card.title ?? "").split(/\s+/).filter(Boolean).length >= 2);
      // Nothing new since yesterday is not a thin overnight film, it is no
      // overnight film: the count beat would have no second figure to speak and
      // the premise would be false. Say so and let the runner report the gap.
      // `Number(...) > 0`, not just a truthiness check: `fresh` is the string the
      // header regex captured, and "0" is truthy in JS. Today the product only
      // prints "(N new)" when N is above zero, so a truthy check happens to be
      // right -- but that is the product's rendering decision, not this
      // template's, and a film that says "0 landed since yesterday" would be the
      // kind of thing nothing else here would catch.
      if (!top || !(Number(feed.fresh) > 0)) return null;
      return {
        spent: [cardKey(top)],
        requirements: [
          countRequirement("job_feed_overnight", "overnightFeedCount",
            "How many roles matched, and how many are new since yesterday"),
          // Second, not last. Sorting is how the film answers its own objection,
          // not what the film is for.
          { id: "sort", surfaceId: "job_feed_overnight", regionId: "overnightFeedSort", pattern: "wide_strip",
            says: "The feed is ordered newest first, so the night's arrivals sit on top", fixture: {} },
          // `wide_strip`, not the `evidence_band` every other card claim takes.
          // The band's 2.47 aspect turns this 430px headline block into a 174px
          // crop, and the top card of this feed sits about 120px under the count
          // strip, so the crop reaches words it may not cut and verify rejects it
          // as `no_fit_without_cutting_words`. At 5.5 the same block needs 78px
          // and still renders at 24px, over the 20px floor. Measured, not
          // guessed: it failed at `evidence_band` first.
          cardRequirement("newest", "job_feed_overnight", "overnightFeedCard", top,
            "The newest posting, with the role, the employer and how long ago it went up",
            "wide_strip")
        ],
        script: [
          { id: "hook", vo: "Hiring does not stop when you sleep." },
          { id: "beat-0", vo: "Postings go up while you are offline." },
          { id: "proof-matched-1", claimId: "matched", vo: `${feed.matched} match you. ${feed.fresh} landed since yesterday.` },
          // The objection, and it is deliberately about the viewer's own morning
          // rather than about Solomon. `sortBy: "date"` is the product's default,
          // so nothing is buried in it -- an earlier draft of this line said new
          // postings open underneath older ones, which would have been a false
          // claim about the thing being filmed.
          { id: "beat-2", vo: "Checking every careers page yourself is impossible." },
          { id: "proof-sort-3", claimId: "sort", vo: "Newest first puts last night on top." },
          { id: "beat-4", vo: "One glance covers everything that appeared overnight." },
          // The close. `top.age` is the product's own wording ("22 hours ago",
          // "1 day ago", "Today"), so any figure in it is already on the crop the
          // beat is shown over, which is what keeps the numeral grounded.
          { id: "proof-newest-5", claimId: "newest", vo: `${words(top.title, 3)}, posted ${top.age}.` },
          { id: "cta", vo: "Follow @solomonhq. Check yours before breakfast." }
        ]
      };
    }
  }
};
