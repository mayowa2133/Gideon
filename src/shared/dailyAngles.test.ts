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
  top: [
    { title: "Senior/Staff Fullstack Engineer", company: "WarpBuild", location: "Remote" },
    { title: "Workflow and Process Designer", company: "notion", location: "Remote" },
    { title: "Paid Social Specialist", company: "webflow", location: "Remote" }
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
              location: "Toronto, ON, Canada"
            },
            {
              title: "Strategic Partnerships and Alliances Lead",
              company: "Berkshire Hathaway Specialty Insurance",
              location: "Toronto, ON, Canada"
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
