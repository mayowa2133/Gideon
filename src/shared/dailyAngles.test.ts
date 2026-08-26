import { describe, expect, it } from "vitest";
// The angle templates are plain data + a pure function, so they can be checked
// without a browser, a database or a render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { DAILY_ANGLES } = (await import("../../scripts/daily-angles.mjs")) as any;

// What `generate-creator-story brief` will impose: 170-192 wpm over the film.
const budgetFor = (seconds: number) => ({
  min: Math.ceil((seconds * 170) / 60),
  max: Math.floor((seconds * 192) / 60)
});

const wordsIn = (script: { vo: string }[]) =>
  script.reduce((total, beat) => total + beat.vo.split(/\s+/).filter(Boolean).length, 0);

/** A feed read, with the fields the templates interpolate. */
const feed = (over: Partial<Record<string, unknown>> = {}) => ({
  header: "81 jobs (73 new)",
  matched: "81",
  fresh: "73",
  // Several cards, with distinct employers, because angles differ in what they
  // need: most take the topmost card, while the non-engineering listicle needs
  // two different employers and refuses developer titles. A one-card fixture
  // silently returned null for that angle rather than testing it.
  // `age` is what the product printed in the company cell. Most angles ignore
  // it; the overnight film ends on it, and a fixture without it silently made
  // that angle return null instead of being tested.
  top: [
    { title: "Senior/Staff Fullstack Engineer", company: "WarpBuild", location: "Remote", age: "22 hours ago" },
    { title: "Workflow and Process Designer", company: "notion", location: "Remote", age: "1 day ago" },
    { title: "Paid Social Specialist", company: "webflow", location: "Remote", age: "Today" }
  ],
  ...over
});

describe("daily angle templates", () => {
  const angles = Object.entries(DAILY_ANGLES) as [string, any][];

  it("covers every angle the runner offers", () => {
    expect(angles.length).toBeGreaterThan(0);
  });

  for (const [id, angle] of angles) {
    describe(id, () => {
      it("lands inside the film's word budget on a typical feed", () => {
        const { script } = angle.plan(feed(), new Set());
        const { min, max } = budgetFor(angle.seconds);
        const total = wordsIn(script);
        expect(total, `${id}: ${total} words against ${min}-${max}`).toBeGreaterThanOrEqual(min);
        expect(total, `${id}: ${total} words against ${min}-${max}`).toBeLessThanOrEqual(max);
      });

      it("still fits when the feed hands it long names", () => {
        // The role beat interpolates a title and a company, and neither is the
        // template author's to choose: "General Motors" is two words where
        // "figma" is one, and a five-figure count is one word where a
        // three-figure count is also one. This is the shape that would break a
        // run at six in the morning rather than at commit time.
        const { script } = angle.plan(feed({
          matched: "1200",
          fresh: "1198",
          top: [
            {
              title: "Associate Solutions Consultant | Healthcare Platform",
              company: "General Motors Financial Services",
              location: "Toronto, ON, Canada",
              age: "22 hours ago"
            },
            {
              title: "Strategic Partnerships and Alliances Lead",
              company: "Berkshire Hathaway Specialty Insurance",
              location: "Toronto, ON, Canada",
              age: "1 day ago"
            }
          ]
        }), new Set());
        const { min, max } = budgetFor(angle.seconds);
        const total = wordsIn(script);
        expect(total, `${id}: ${total} words against ${min}-${max}`).toBeGreaterThanOrEqual(min);
        expect(total, `${id}: ${total} words against ${min}-${max}`).toBeLessThanOrEqual(max);
      });

      it("names its claim in the beat that carries it", () => {
        // `beat_does_not_mention_claim` is a compile gate; catching it here means
        // finding out when the template is edited rather than mid-run.
        const { script, requirements } = angle.plan(feed(), new Set());
        const claimIds = new Set(requirements.map((r: any) => r.id));
        for (const beat of script.filter((b: any) => b.claimId)) {
          expect(claimIds, `${id}: beat ${beat.id} names an unknown claim`).toContain(beat.claimId);
          expect(beat.vo.trim().length, `${id}: beat ${beat.id} is silent`).toBeGreaterThan(0);
        }
      });

      it("hands its claims out in the order the beat plan will", () => {
        // Requirements order and proof-beat order are one fact written twice.
        // `planBeats` walks `claimIds` in array order and drops them onto
        // ascending slots, and the brief then demands the script's beat ids
        // match its own, in its order -- so a template that lists its claims in
        // one order and numbers its beats in another dies at `beat_mismatch`,
        // at seven in the morning, with nothing else having complained. Found
        // by reordering the overnight angle's claims and watching every other
        // test still pass.
        const { script, requirements } = angle.plan(feed(), new Set());
        const claimOrder = requirements.map((r: any) => r.id);
        const proofOrder = script.filter((b: any) => b.claimId).map((b: any) => b.claimId);
        expect(proofOrder, `${id}: claims are listed in a different order than the beats name them`)
          .toEqual(claimOrder);
        const slots = script.filter((b: any) => b.claimId).map((b: any) => Number(b.id.split("-").at(-1)));
        expect(slots, `${id}: proof beats are not numbered in ascending slot order`)
          .toEqual([...slots].sort((a, b) => a - b));
      });

      it("does not double a separator when the title is clipped mid-phrase", () => {
        // Real titles carry their own punctuation and the three-word cut lands
        // on it often: "Staff Software Engineer, AI Foundations (AI Agent
        // Optimization)" becomes "Staff Software Engineer," and the template
        // appends its own comma. Word budgets and claim gates all still pass --
        // the line just reads wrong and the narrator stumbles over it.
        const { script } = angle.plan(feed({
          top: [
            { title: "Staff Software Engineer, AI Foundations", company: "temporaltechnologies", location: "Remote", age: "22 hours ago" },
            { title: "Growth Marketing Lead - Enterprise", company: "Agave", location: "Remote", age: "1 day ago" },
            { title: "Paid Social Specialist | Retail", company: "webflow", location: "Remote", age: "Today" }
          ]
        }), new Set());
        for (const beat of script) {
          expect(beat.vo, `${id}: ${beat.id} doubles a separator: ${beat.vo}`)
            .not.toMatch(/[,;:|]\s*[,;:|]|\s[,;:.]/);
        }
      });

      it("asks for a surface that exists, and regions that surface has", async () => {
        const { SOLOMON_SURFACES } = await import("./solomonCaptureSurfaces");
        const { requirements } = angle.plan(feed(), new Set());
        for (const requirement of requirements) {
          const surface = SOLOMON_SURFACES.surfaces.find((s) => s.id === requirement.surfaceId);
          expect(surface, `${id}: no surface ${requirement.surfaceId}`).toBeDefined();
          const region = surface!.regions.find((r) => r.id === requirement.regionId);
          expect(region, `${id}: ${requirement.surfaceId} has no region ${requirement.regionId}`).toBeDefined();
        }
      });
    });
  }
});

describe("cross-angle exclusion", () => {
  // The defect this guards actually shipped: on the first real batch, two of the
  // day's three films opened their proof beat on the same Agave role with a
  // different caption over it. Neither film was internally wrong -- the crop
  // check only looks within one film -- so nothing caught it but looking.
  const twoCards = () => feed({
    top: [
      { title: "Growth Marketing Lead", company: "Agave", location: "Remote" },
      { title: "Customer Enablement Manager", company: "Prequel", location: "New York City" },
      { title: "Paid Social Specialist", company: "webflow", location: "Remote" }
    ]
  });

  it("gives two angles different postings from the same feed", async () => {
    const { DAILY_ANGLES: angles, cardKey } = (await import("../../scripts/daily-angles.mjs")) as any;
    const [first, second] = Object.values(angles) as any[];
    const spent = new Set<string>();

    const one = first.plan(twoCards(), spent);
    one.spent.forEach((key: string) => spent.add(key));
    const two = second.plan(twoCards(), spent);

    expect(one.spent[0]).toBe(cardKey({ company: "Agave", title: "Growth Marketing Lead" }));
    expect(two.spent[0]).not.toBe(one.spent[0]);
  });

  it("says so rather than repeating itself when the feed is exhausted", async () => {
    const { DAILY_ANGLES: angles, cardKey } = (await import("../../scripts/daily-angles.mjs")) as any;
    const angle = Object.values(angles)[0] as any;
    const only = feed({ top: [{ title: "Only Role", company: "Solo", location: "Remote" }] });
    const spent = new Set<string>([cardKey({ company: "Solo", title: "Only Role" })]);
    // Returning null is what makes the runner report an incomplete run. Falling
    // back to a spent card would be the bug wearing a different hat.
    expect(angle.plan(only, spent)).toBeNull();
  });

  it("treats the same posting as the same regardless of casing or padding", async () => {
    const { cardKey } = (await import("../../scripts/daily-angles.mjs")) as any;
    expect(cardKey({ company: " Agave ", title: "Full-Stack Software Engineer" }))
      .toBe(cardKey({ company: "agave", title: "full-stack software engineer" }));
  });
});

// The overnight film is the one angle whose argument is a chain rather than a
// list, so it has requirements the other four do not: it must end on the job,
// and it can only run on a card the product actually dated.
describe("overnight", () => {
  const overnight = () => (DAILY_ANGLES as any).overnight;
  const dated = (over: Record<string, unknown> = {}) => feed(over);

  it("closes on the posting, not on the sort control", () => {
    // The defect this rewrite exists for. The listicle version ended on
    // `Newest First` -- an 18-second film spending its last beat on a
    // preference menu -- and nothing failed, because a sort control is a
    // perfectly legible claim. Only the running order was wrong.
    const { script } = overnight().plan(dated(), new Set());
    const proofs = script.filter((b: any) => b.claimId);
    expect(proofs.at(-1)!.claimId, "the last claim beat must be the job").toBe("newest");
    expect(proofs.map((b: any) => b.claimId)).toEqual(["matched", "sort", "newest"]);
  });

  it("speaks the product's own wording for the age", () => {
    const { script } = overnight().plan(dated(), new Set());
    const close = script.find((b: any) => b.claimId === "newest")!;
    // Not a computed duration: any figure spoken here has to be one the crop
    // already shows, and `age` is the string the card rendered.
    expect(close.vo).toContain("22 hours ago");
  });

  it("will not run on a feed the product never dated", () => {
    const undatedCards = dated({
      top: [
        { title: "Senior Software Engineer", company: "Prequel", location: "Remote" },
        { title: "Founding Engineer", company: "Heaviai", location: "Remote" }
      ]
    });
    expect(overnight().plan(undatedCards, new Set())).toBeNull();
  });

  it("will not claim an overnight arrival on a morning with nothing new", () => {
    expect(overnight().plan(dated({ fresh: null }), new Set())).toBeNull();
    // "0" is a truthy string. The product does not currently render "(0 new)",
    // so this only bites if that rendering changes -- which is exactly the kind
    // of coupling worth not having.
    expect(overnight().plan(dated({ fresh: "0" }), new Set())).toBeNull();
  });

  it("skips a one-word role, which cannot fill the closing beat", () => {
    // "Engineer, posted Today." is three words against a four-word floor, so the
    // card is unusable for this angle even though it is dated.
    const { script, spent } = overnight().plan(dated({
      top: [
        { title: "Engineer", company: "Solo", location: "Remote", age: "Today" },
        { title: "Growth Marketing Lead", company: "Agave", location: "Remote", age: "3 hours ago" }
      ]
    }), new Set());
    expect(spent[0]).toContain("agave");
    expect(script.find((b: any) => b.claimId === "newest")!.vo).toContain("3 hours ago");
  });

  it("fits the budget whether the age is one word or three", () => {
    const { min, max } = budgetFor(overnight().seconds);
    for (const age of ["Today", "Just now", "22 hours ago", "1 day ago"]) {
      const { script } = overnight().plan(dated({
        top: [{ title: "Staff Software Engineer", company: "temporaltechnologies", location: "Remote", age }]
      }), new Set());
      const total = wordsIn(script);
      expect(total, `age "${age}": ${total} words against ${min}-${max}`).toBeGreaterThanOrEqual(min);
      expect(total, `age "${age}": ${total} words against ${min}-${max}`).toBeLessThanOrEqual(max);
    }
  });

  it("keeps every numeral it speaks inside a beat that shows one", () => {
    // `ungrounded_numeral` is a compile gate: a non-proof beat may not contain a
    // figure at all, because there is no evidence under it to check against.
    const { script } = overnight().plan(dated(), new Set());
    for (const beat of script.filter((b: any) => !b.claimId)) {
      expect(/\d/.test(beat.vo), `${beat.id} speaks a figure it cannot prove: ${beat.vo}`).toBe(false);
    }
  });
});
