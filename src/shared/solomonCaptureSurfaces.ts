import { type ProductSurfaceMap } from "./creatorCapturePlan";

// The Jobs page's persisted filter object, as the product writes it.
//
// Restated here rather than imported because Solomon is a separate repository:
// these three surfaces write this object into localStorage before the route
// loads, and a field the product has since renamed would be dropped by its own
// `getStoredJobsFilters`, which merges field-by-field over its defaults. That
// is the safe failure -- the filter reverts, the film shows an unfiltered feed,
// and the claim about the count fails verification rather than passing while
// describing the wrong feed.
const FEED_FILTER_DEFAULTS = {
  searchFilter: "",
  stageFilter: "",
  employmentTypeFilter: "",
  experienceLevelFilter: "",
  countryFilter: "",
  nearLocationFilter: "",
  radiusKmFilter: "50",
  includeRemoteInRadius: false,
  starredFilter: false,
  remoteFilter: false,
  startupFilter: false,
  salaryMinFilter: "",
  sortBy: "date"
} as const;

// Every path of Solomon a creator video can be shot on, and what each one shows.
//
// This is the answer to "Gideon should know every single path of the product and
// then know what to record for what instances of the product". The screen
// inventory could not be that answer: it is one capture run's leftovers, so it
// knows six stills and nothing about how to produce a seventh. A map of routes,
// the data each route displays, and the element on it that carries each fact is
// the thing an angle can be planned against before any browser opens.
//
// Nothing here is invented. The routes, the reach steps and the locators are the
// ones `scripts/capture-solomon-v22-demo.mjs` already drives, restated as data
// so an angle can select from them; the field paths follow the demo-content
// seed's own shape (`solomonDemoContentV10.ts`), collapsing its reason tuple to
// the single line the contact card actually renders.
//
// `sourceTextPx` is measured, not chosen: it is the median OCR word height of
// that region in `fixtures/creator-story/solomon-screen-inventory.json`, rounded
// down where the band straddled a pixel. Solomon's body copy comes back at 9-10
// source pixels at 1440x900 and its headings at 11-12, and understating it is
// the safe direction -- a smaller number buys a tighter framing budget.
export const SOLOMON_SURFACES: ProductSurfaceMap = {
  product: "Solomon",
  // The framing budgets below are only true at this size, because
  // `sourceTextPx` was measured here. Recapture at another viewport and the
  // numbers move with the layout.
  // 1440x900. A narrower viewport was tried and reverted: it cuts both ways,
  // and only one way was reasoned about. Rendered legibility improved -- the
  // tracker claim went 31.8px to 41.3px, because a card is a larger share of a
  // narrower frame -- while the screenshot handed tesseract fewer source pixels,
  // so the card's own text stopped being readable back. "Marketing Intern" and
  // "Northstar Labs" fell out of the OCR, the fixture check correctly failed,
  // and the film ended up with no claims at all.
  //
  // Legibility on the frame is worth nothing if the capture cannot prove what it
  // recorded. Raise this only alongside a way to verify fixtures that does not
  // depend on OCR of the same pixels.
  viewport: { width: 1440, height: 900 },
  fields: [
    { path: "opportunity.title", shownAs: "the role on the tracked opportunity" },
    { path: "opportunity.company", shownAs: "the company hiring for it" },
    { path: "opportunity.location", shownAs: "where the role is" },
    { path: "opportunity.previousStage", shownAs: "the pipeline stage it starts in" },
    { path: "opportunity.resultStage", shownAs: "the pipeline stage it moves to" },
    { path: "contact.name", shownAs: "the saved contact's name" },
    { path: "contact.role", shownAs: "the saved contact's job title" },
    { path: "contact.company", shownAs: "where the contact works" },
    { path: "contact.reason", shownAs: "why Solomon surfaced this contact" },
    { path: "message.subject", shownAs: "the draft's subject line" },
    // The job feed's contents are not seeded, they are whatever Solomon pulled
    // in. A daily film has to be planned against the feed it will actually
    // shoot, so these two are filled per run by scripts/plan-daily-jobs-film.mjs
    // from the same query the page makes.
    { path: "job.title", shownAs: "the role on the posting the film opens with" },
    { path: "job.company", shownAs: "the company hiring for it" },
    // One posting, opened. The id is in the route, so it is filled from the
    // angle's fixture the same way a locator is.
    { path: "job.id", shownAs: "which posting the film opens" },
    { path: "job.duty", shownAs: "one thing the posting says the job does" },
    { path: "job.duty2", shownAs: "a second thing the posting says the job does" }
  ],
  surfaces: [
    {
      id: "tracker_before",
      route: "/tracker",
      purpose: "the pipeline before the move, so the after has something to be after",
      reach: [
        "Set the tracked opportunity to opportunity.previousStage through the fixture API.",
        "Open /tracker and wait for the Application Tracker heading.",
        "Click the opportunity's card so its stage controls are on screen."
      ],
      regions: [
        {
          id: "trackerCardBefore",
          purpose: "the opportunity as it stands, named and staged",
          locator: { role: "button", name: "{opportunity.title} {opportunity.company}" },
          fields: ["opportunity.title", "opportunity.company", "opportunity.location"],
          sourceTextPx: 10
        },
        {
          id: "trackerStageBefore",
          purpose: "the stage it is in before anything moves",
          locator: { role: "button", name: "{opportunity.previousStage}" },
          fields: ["opportunity.previousStage"],
          sourceTextPx: 10
        }
      ]
    },
    {
      id: "tracker_after",
      route: "/tracker",
      purpose: "the same pipeline after the user moves the opportunity on",
      // The largest movement Solomon has, and the one the film's opening
      // product shot was drawing as a photograph.
      //
      // A settled route differs by 0.000 between consecutive screenshots, so
      // every unfilmed surface is a still. This is two changes in one gesture:
      // the detail column goes from "Select a job to..." to a filled panel, and
      // then the card leaves one stage column for another and the counters above
      // it change with it. `motion_did_not_move` decides whether that is true,
      // not this comment.
      motion: {
        shows: "a card opening into its detail panel",
        actions: [
          { kind: "click", locator: { role: "button", name: "{opportunity.title} {opportunity.company}" } }
        ]
      },
      reach: [
        "Reset the tracked opportunity to opportunity.previousStage.",
        "Open /tracker, click the opportunity's card, then click the opportunity.resultStage control.",
        "Hold on the card once it has re-rendered in its new stage."
      ],
      regions: [
        {
          id: "trackerCardAfter",
          // The card carries the role and the company. It does not carry the
          // stage: the stage is the column the card sits in, drawn outside the
          // card's own box. Declaring it here made the planner demand a fixture
          // the region can never show, and the capture proved it -- the recorded
          // box reads "Marketing Intern Northstar Labs Toronto, Canada" and
          // nothing about Interviewing.
          purpose: "the opportunity as it appears in the stage the user just chose",
          // The detail panel the click opens, not the kanban card it opens from.
          //
          // The card is the obvious region and it stops being readable the moment
          // the film moves: clicking it tints its background, and the company
          // line is muted grey, so OCR came back with "Growth Marketing Manager
          // Toronto, Canada" and the claim was dropped for a fixture the frame
          // plainly showed. Legible to a person, invisible to the pipeline, and
          // the pipeline is right to refuse what it cannot read.
          //
          // The panel is the better region anyway: same two facts at text-base
          // and text-sm rather than a card's small type, on an untinted
          // background, and it exists BECAUSE of the interaction rather than in
          // spite of it.
          locator: { role: "heading", name: "{opportunity.title}", container: "div.space-y-1" },
          fields: ["opportunity.title", "opportunity.company"],
          sourceTextPx: 12
        },
        {
          id: "trackerStageAfter",
          purpose: "the control the user pressed, so the move is the user's",
          locator: { role: "button", name: "{opportunity.resultStage}" },
          fields: ["opportunity.resultStage"],
          sourceTextPx: 10
        },
        {
          id: "trackerTotalActive",
          purpose: "the pipeline counted in one place, above the columns",
          locator: { role: "text", name: "Total Active" },
          fields: [],
          sourceTextPx: 9
        }
      ]
    },
    {
      // What the product will and will not do on your behalf.
      id: "settings_control",
      route: "/settings",
      purpose: "the choices the product hands back to the user",
      reach: [
        "Open /settings and wait for the Resume AI Assist panel.",
        "No interaction: both panels render with the route."
      ],
      regions: [
        {
          id: "controlInferred",
          purpose: "that the user decides how far the AI may go on their resume",
          locator: { role: "text", name: "Control how aggressively" },
          fields: [],
          sourceTextPx: 14
        },
        {
          id: "controlData",
          purpose: "that the account and its data can be exported or deleted outright",
          locator: { role: "text", name: "Export your data or permanently delete" },
          fields: [],
          sourceTextPx: 14
        }
      ]
    },
    {
      // What the product thinks each opening is worth your effort.
      //
      // The counters are buttons, which is why they are claimable: a button is
      // sized to its content, and a block element spans its container however
      // short its text. That is the difference between a region that can carry a
      // claim and one that cannot -- not the words, the box.
      id: "triage",
      route: "/triage",
      purpose: "openings ranked by where effort actually pays off",
      reach: [
        "Open /triage and wait for the ROI counters.",
        "No interaction: the ranked queue renders with the route."
      ],
      regions: [
        {
          id: "triageLowRoi",
          purpose: "how many openings the product rates as low return",
          locator: { role: "button", name: "Low ROI" },
          fields: [],
          sourceTextPx: 16
        },
        {
          id: "triageMediumRoi",
          purpose: "how few are worth the effort, beside how many are not",
          locator: { role: "button", name: "Medium ROI" },
          fields: [],
          sourceTextPx: 16
        },
        {
          id: "triageJobScore",
          purpose: "the score on the opening the angle is about",
          locator: { role: "text", name: "48", container: "div.flex-col" },
          fields: [],
          sourceTextPx: 16
        }
      ]
    },
    {
      // A saved contact, as a row rather than a page.
      id: "people_saved",
      route: "/people",
      purpose: "the people already found, with what the product thinks of each",
      reach: [
        "Open /people and wait for the Saved Contacts panel.",
        "No interaction: saved contacts render with the route."
      ],
      regions: [
        {
          id: "savedContact",
          purpose: "one saved person: who they are and what they do",
          locator: { role: "text", name: "{contact.name}", container: "div.flex-col" },
          fields: ["contact.name"],
          sourceTextPx: 14
        },
        {
          id: "savedMatchQuality",
          purpose: "the product's own grading of how useful this person is",
          locator: { role: "text", name: "Direct Match", container: "div.items-center" },
          fields: [],
          sourceTextPx: 14
        }
      ]
    },
    {
      // Where the pipeline comes from, before any one opening is opened.
      id: "job_discovery",
      route: "/jobs",
      purpose: "that the jobs arrive from somewhere rather than being typed in",
      reach: [
        "Open /jobs and wait for the Jobs heading.",
        "No interaction: the feed and both search panels render with the route."
      ],
      regions: [
        {
          id: "discoveryPurpose",
          purpose: "what this page is for, in the product's words",
          locator: { role: "text", name: "Discover opportunities across multiple sources" },
          fields: [],
          sourceTextPx: 13
        },
        {
          id: "discoverySources",
          // The sources named. A claim that jobs "come from everywhere" proves
          // nothing; a claim that names the boards is checkable by a viewer.
          purpose: "the boards the product actually searches, named",
          locator: { role: "text", name: "Search across JSearch" },
          fields: [],
          sourceTextPx: 11
        },
        {
          id: "discoveryCareerPage",
          purpose: "that a company's own careers page is a source too",
          locator: { role: "text", name: "Search Company Career Page" },
          fields: [],
          sourceTextPx: 13
        }
      ]
    },
    {
      // The queue that tells you who is owed a reply, and when.
      id: "outreach_cadence",
      route: "/outreach",
      purpose: "the follow-ups the user would otherwise forget",
      reach: [
        "Open /outreach and wait for the Needs attention panel.",
        "No interaction: the queue renders with the route."
      ],
      regions: [
        {
          id: "cadenceAttention",
          purpose: "that the product keeps a list of what is owed a nudge",
          locator: { role: "text", name: "Needs attention" },
          fields: [],
          sourceTextPx: 11
        },
        {
          id: "cadenceStale",
          purpose: "the product's own sentence about a draft going stale",
          locator: { role: "text", name: "send or edit before it goes stale" },
          fields: [],
          sourceTextPx: 10
        }
      ]
    },
    {
      id: "opportunity",
      route: "/jobs",
      purpose: "one opportunity opened, with the role and the company stated",
      reach: [
        "Open /jobs and wait for the Jobs heading.",
        "Click the opportunity by its title to open the detail view."
      ],
      regions: [
        {
          id: "opportunityTitle",
          purpose: "the role, at heading size",
          locator: { role: "heading", name: "{opportunity.title}" },
          fields: ["opportunity.title"],
          sourceTextPx: 12
        },
        {
          id: "opportunityCompany",
          purpose: "the company the role is at",
          locator: { role: "text", name: "{opportunity.company}" },
          fields: ["opportunity.company"],
          sourceTextPx: 11
        }
      ]
    },
    {
      id: "contact",
      route: "/people",
      purpose: "the saved contact Solomon suggests reaching, and why",
      // Typing the company into the filter, which is the one thing measured to
      // move on this route: the saved-contact list narrows as the letters land,
      // at a frame-to-frame delta of 1.16 against 0.00 for the settled page.
      // Filmed rather than merely performed, because a still of a filtered list
      // and a still of an unfiltered one are both photographs -- what reads as
      // the product working is the narrowing itself.
      motion: {
        shows: "the saved contacts narrowing to one company as the name is typed",
        actions: [
          { kind: "type", locator: { role: "textbox", name: "Filter saved contacts by company" }, text: "{contact.company}" }
        ]
      },
      reach: [
        "Open /people and wait for the People heading.",
        "Filter saved contacts by contact.company.",
        "Scroll the contact into view before recording its boxes."
      ],
      regions: [
        {
          // The whole card, not a line inside it. A region bounded by denser
          // content can never be cropped: expanding contactRole -- 116x20, with
          // the name above it and the chips below -- to any aspect at all cuts a
          // neighbouring word, and all four content patterns refused it. A card
          // is bounded by its own whitespace, which is why the tracker's claim
          // resolves and the contact's did not.
          id: "contactCard",
          purpose: "the contact as a whole: who they are and what they do",
          // The card carries no role and no accessible name -- it is a plain
          // div -- so it is addressed as the container holding the contact's
          // name rather than by role. Without this the locator returns the
          // 116x20 name line, which is the region that could not be cropped.
          locator: { role: "text", name: "{contact.name}", container: "[class*='group/card']" },
          fields: ["contact.name", "contact.role"],
          sourceTextPx: 9
        },
        {
          id: "contactName",
          purpose: "who the contact is",
          locator: { role: "text", name: "{contact.name}" },
          fields: ["contact.name"],
          sourceTextPx: 9
        },
        {
          // Still uncroppable, and now for a measured reason rather than a
          // guessed one. `wide_strip` was added on the theory that 116x20 fails
          // only because 2.47 grows it vertically into its neighbours, and at
          // 5.5 there is indeed no vertical growth -- the padded 144x48 becomes
          // 264x48 and keeps its height. It is still refused, because the
          // padding alone is more clearance than this card has: OCR puts the
          // name's box at 501-531 and the role's words at 531-544, touching, and
          // a divider glyph one pixel below at 545. Snapping clear of the name
          // leaves a 29px crop whose top edge sits on the glyph tops, so the
          // composition's 1.02 focus scale would shave them.
          //
          // Nothing about the aspect fixes that. The fix is a product with more
          // air between its rows, or a region that is bounded by whitespace --
          // which is what the card is and why the card resolves.
          id: "contactRole",
          purpose: "the contact's title -- the fact an angle most often needs to be its own",
          locator: { role: "text", name: "{contact.role}" },
          fields: ["contact.role"],
          sourceTextPx: 9
        },
        {
          // The proof block, not the one line inside it.
          //
          // The reason is a 262x16 row in a four-row grid, 16.4 wide, and every
          // container is narrower -- so the crop has to grow vertically into the
          // rows above and below, and `no_fit_without_cutting_words` refused it
          // at every aspect from 5.5 down to 1.2. The card has no vertical room
          // to give, which is the same wall `contactRole` hits.
          //
          // The block has the room and is the better evidence anyway: Solomon
          // does not just state why it picked this person, it states what it
          // checked -- why matched, company trust, email safety, warm path -- and
          // a claim about the product showing its reasoning should show the
          // reasoning rather than one line of it.
          id: "contactReason",
          purpose: "Solomon's stated reason for surfacing this person",
          locator: { role: "definition", name: "{contact.reason}", container: "dl" },
          fields: ["contact.reason"],
          sourceTextPx: 9
        }
      ]
    },
    {
      // The product's own account of what it does, on the route that states it.
      //
      // Every surface above this one is a record: a job, a person, a draft. Two
      // records is all a film about landing a role needs, and a film needs more
      // than two shots -- the last generated cut had sixteen of eighteen scenes
      // showing a presenter on a colour because nothing else was capturable
      // without clicking through the product first.
      //
      // These regions are static copy, which is why they carry no fields. That
      // is not a weaker kind of evidence: "Review before it reaches Gmail or
      // Outlook" is the product asserting the control claim in its own words, on
      // its own screen, and the reference film made that claim by drawing a chip
      // over the top of a screen that never said it.
      id: "first_win_path",
      route: "/dashboard",
      purpose: "Solomon's own four-step path, and what it promises at the end of it",
      reach: [
        "Open /dashboard and wait for the First Win Path panel.",
        "No interaction: the panel renders with the workspace."
      ],
      regions: [
        {
          id: "pathPromise",
          purpose: "the whole loop in one line, in the product's words",
          locator: { role: "text", name: "Job to staged draft, with proof carried through each step." },
          fields: [],
          sourceTextPx: 10
        },
        {
          // The title line, and it draws two icon fragments along its top edge.
          //
          // The line is 269x20, which is 13.5 wide; every container is narrower,
          // so the crop grows vertically to reach one and arrives in the row of
          // status icons above. The rendered band carries half a checkmark and
          // the tail of an icon. No word-clearing gate can prevent it: an icon
          // has no OCR box, so the crop is provably clear of every word the
          // inventory knows about and still cuts ink.
          //
          // Framing the step card instead -- `container: "a.rounded-lg"` -- was
          // tried and reverted. It fixes the fragments and measures 295x110,
          // whose OCR text runs on into the panel's footer note, so `stage` and
          // `review` came back requiring the same two words and the film would
          // have made one claim twice. A cosmetic edge beats two claims that are
          // secretly one. The fix that would work is an ink-aware crop -- the
          // compiler seeing pixels rather than word boxes -- which is a larger
          // change than this shot is worth.
          id: "pathStepStage",
          purpose: "the last step of the path, named by the product, with what it promises",
          locator: { role: "text", name: "Stage the draft", container: "a.rounded-lg" },
          fields: [],
          sourceTextPx: 10
        },
        {
          // The step card, like the stage step beside it.
          //
          // A step's title is a 269x20 line -- 13.4 wide -- and no container is
          // that wide, so the crop grows vertically and every one of these
          // resolved to the same thin strip. Four claims on this panel drew four
          // near-identical shots. The card is 295x110, and it carries the step's
          // detail line as well, so one shot says both halves of the step.
          id: "pathStepContact",
          purpose: "the step that replaces applying with knowing someone, and what it means",
          locator: { role: "text", name: "Find a trusted contact", container: "a.rounded-lg" },
          fields: [],
          sourceTextPx: 10
        },
        {
          id: "pathStageNote",
          // The control claim, sourced from the product rather than asserted
          // over it. `draftAssurance` is the same sentence one screen deeper and
          // needs a draft generated first, which the capture runner cannot reach.
          purpose: "the product's sentence saying a draft is reviewed before it goes anywhere",
          locator: { role: "text", name: "Review before it reaches Gmail or Outlook" },
          fields: [],
          sourceTextPx: 9
        }
      ]
    },
    {
      // The screen that answers "who, and how do I reach them" at once.
      //
      // Every other route shows one half. The tracker has the role, /people has
      // a contact card too cramped to crop, and the outreach log has a row of
      // drafts at nine pixels. Here the person Solomon picked, the reason it
      // picked them, the job the draft references and the unsent draft itself
      // are all on one page at a size a vertical frame can hold -- and getting
      // there is four controls and a button, which is why it needed a capture
      // that can act rather than only navigate.
      id: "outreach_draft",
      route: "/messages",
      purpose: "the person Solomon found for this role, and the message waiting on the user",
      motion: {
        shows: "the composer filling in and the draft being written",
        actions: [
          { kind: "select", locator: { role: "combobox", name: "Person" }, text: "{contact.name} — {contact.role}" },
          { kind: "select", locator: { role: "combobox", name: "Target Job (Optional)" }, text: "{opportunity.title} — {opportunity.company}" },
          { kind: "select", locator: { role: "combobox", name: "Channel" }, text: "Email" },
          { kind: "click", locator: { role: "button", name: "Generate Draft" } }
        ]
      },
      reach: [
        "Open /messages and wait for the New Draft panel.",
        "Pick the contact, the job the draft should reference, and the email channel.",
        "Generate the draft and hold once it has rendered, unsent."
      ],
      regions: [
        {
          // Who, and why. The panel that appears once a person is chosen: name,
          // title, the badge Solomon assigned, its strategy for approaching them
          // and the address it verified.
          //
          // Every line in it is a 434px column of 9px type, which is 19.5px on a
          // 462px crop against a 20px floor. Half a pixel, and no container fixes
          // it: the width is the panel's, not the crop's. The header row below
          // carries the same fact -- who this message is for -- at 15px type, so
          // that is the region the angle should claim.
          id: "draftPerson",
          purpose: "the person Solomon chose for this role, with its reason",
          locator: { role: "text", name: "Recruiter strategy" },
          fields: [],
          sourceTextPx: 9
        },
        {
          // The header row, not the heading inside it.
          //
          // The heading alone is 175x22 of 15px type and would render at 73px --
          // and cannot be cropped, because "Email -- Interview Path" sits
          // directly beneath it with no gap at all. The row that contains both,
          // plus the DRAFT -- NOT SENT badge, is bounded by the card's own edges
          // and says more: who the message is for, and that it has not been sent.
          id: "draftHeading",
          purpose: "who the message is addressed to, and that it is still a draft",
          locator: { role: "text", name: "Message to {contact.name}", container: "[class*='justify-between']" },
          fields: ["contact.name"],
          sourceTextPx: 15
        },
        {
          // The product's own control sentence, on the screen where it matters.
          id: "draftAssurance",
          purpose: "that the draft is staged for the user to send, not sent",
          locator: { role: "text", name: "Stage this email as a draft in your inbox" },
          fields: [],
          sourceTextPx: 9
        },
        {
          // The message itself.
          //
          // The film's central claim is that Solomon writes the outreach, and
          // every shot of it framed the header -- who it is to, what channel,
          // DRAFT NOT SENT -- and never a word of what it says. Claiming and
          // demonstrating are different, and this is the region that
          // demonstrates.
          //
          // Located by the company name rather than by any of the message's own
          // wording, because the body is written by a model at capture time and
          // the only thing reliably in it is what it was written about.
          id: "draftBody",
          purpose: "the message Solomon actually wrote, in full",
          locator: { role: "text", name: "{opportunity.company}", container: "div.whitespace-pre-wrap" },
          fields: ["opportunity.company"],
          sourceTextPx: 14
        }
      ]
    },
    {
      id: "people_search",
      route: "/people",
      purpose: "what the product says it will go and find, before it has found it",
      reach: [
        "Open /people and wait for the Search by Company panel.",
        "No interaction: the panel is the top of the route."
      ],
      regions: [
        {
          id: "peoplePurpose",
          purpose: "who the product looks for -- the answer to 'apply to whom'",
          locator: { role: "text", name: "Find recruiters, managers, and peers." },
          fields: [],
          sourceTextPx: 10
        },
        {
          id: "peopleSearchHeading",
          purpose: "that the search starts from a company rather than a job board",
          locator: { role: "text", name: "Search by Company" },
          fields: [],
          sourceTextPx: 11
        }
      ]
    },
    {
      id: "outreach_queue",
      route: "/outreach",
      purpose: "the queue of drafts waiting on the user, which is where they stay",
      // The same filter interaction the contact route has, declared here because
      // this is a route the film actually reaches. Motion is only worth filming
      // on a screen the cut shows: the contact route moves beautifully and the
      // generated film never opens it, because no region on it can carry a claim.
      motion: {
        shows: "the outreach log narrowing to one company as the name is typed",
        actions: [
          { kind: "type", locator: { role: "textbox", name: "Filter contacts by company" }, text: "{contact.company}" }
        ]
      },
      reach: [
        "Open /outreach and wait for the Needs attention list.",
        "No interaction: the queue renders with the workspace."
      ],
      regions: [
        {
          // Captured once and unusable: OCR returns no words inside the badge at
          // all, so the region grades 0px and can carry no claim. Kept declared
          // because it is a true description of the surface, and the inventory is
          // the right place for that verdict to be recorded rather than a comment.
          id: "queueUnsent",
          purpose: "the state a generated draft sits in until a person sends it",
          locator: { role: "text", name: "Unsent draft" },
          fields: [],
          sourceTextPx: 9
        },
        {
          // The tile, not the label.
          //
          // This was `{ role: "text", name: "Response Rate" }`, which addresses
          // the label text node, and the label is a 223x20 strip with the
          // number outside it. The film then said "it tracks your response rate"
          // over a band reading "Response Rate" and nothing else -- a metric's
          // name with no metric, which proves the claim to nobody.
          //
          // Nothing caught it because nothing could: a crop is graded on whether
          // the words that carry the claim are legible inside it, and they were.
          // The words that carry this claim are the label AND its value, and only
          // the region declaration knows that.
          id: "queueResponseRate",
          purpose: "that the product counts replies, not sends",
          locator: { role: "text", name: "Response Rate", container: ".grid-cols-2 > div" },
          fields: [],
          sourceTextPx: 10
        }
      ]
    },
    {
      id: "outreach_blank",
      route: "/messages",
      purpose: "the composer before anything is written, so the draft has a before",
      // And this names what it becomes, so the film can show the change rather
      // than only the result.
      becomes: "outreach_draft",
      reach: [
        "Open /messages and wait for the Messages heading.",
        "Leave the person and job selects empty."
      ],
      regions: [
        {
          id: "outreachPersonSelect",
          purpose: "the empty person select, which is what makes the next shot a change",
          locator: { role: "combobox", name: "Person" },
          // No fields: this region proves a state, not one of the angle's facts.
          // Requiring a value here would make the plan demand the contact's name
          // inside a select that has deliberately not been used yet.
          fields: [],
          sourceTextPx: 10
        }
      ]
    },
    {
      id: "outreach_complete",
      route: "/messages",
      purpose: "a generated draft, edited by the user, and still unsent",
      reach: [
        "Open /messages and pick contact.name.",
        "Generate the draft, click Edit, change a word, and Save Edit.",
        "Hold on the saved draft so the unsent status is on screen."
      ],
      regions: [
        {
          id: "draftStatus",
          purpose: "that the draft is not sent -- the product's own control claim",
          locator: { role: "status", name: "DRAFT — NOT SENT" },
          fields: [],
          sourceTextPx: 9
        },
        {
          id: "draftSubject",
          purpose: "what the draft is about, in the angle's own words",
          locator: { role: "text", name: "{message.subject}" },
          fields: ["message.subject"],
          sourceTextPx: 10
        },
        {
          id: "draftAssurance",
          // The reference film never framed this and drew its own chip over the
          // top instead, which is how a claim about user control ended up being
          // proved by the film's own caption rather than by the product.
          purpose: "the product's sentence saying the user sends it, not Solomon",
          locator: { role: "text", name: "Stage this email as a draft in your inbox" },
          fields: [],
          sourceTextPx: 9
        }
      ]
    },
    // The job feed, shot three ways.
    //
    // These are the only surfaces here whose content is not seeded. Everything
    // else in this map films demo data that was written on purpose; the feed
    // films whatever the ingest pulled in this morning, which is the entire
    // point of a daily film and also the reason each of these carries a
    // `prepare`. Solomon decides a job is NEW by comparing it against the stamp
    // of your last visit, so on a fresh browser profile -- which is what
    // Playwright always is -- nothing is ever new and the header reads
    // "(0 new)" over a feed that just took in two thousand jobs.
    //
    // What is seeded is the *cause*: you last looked yesterday. The product
    // does the counting.
    {
      id: "job_feed_remote",
      route: "/jobs",
      purpose: "the remote engineering roles that arrived since the user last looked",
      reach: [
        "Write yesterday's timestamp as the Jobs page's last visit, and clear the occupation chips.",
        "Open /jobs and wait for the feed to settle.",
        "Click the Software Engineering chip so the feed narrows to engineering roles."
      ],
      prepare: {
        because: "a returning user who last opened the Jobs tab yesterday, with the remote filter already on",
        localStorage: [
          { key: "nexusreach-jobs-last-visited", isoHoursAgo: 24 },
          { key: "nexusreach-jobs-occupations", value: "[]" },
          { key: "nexusreach-jobs-filters", value: JSON.stringify({ ...FEED_FILTER_DEFAULTS, remoteFilter: true }) }
        ],
        // The feed list itself, held a little below the top of the frame so
        // the count above it stays in shot.
        scrollTo: { selector: "span.ml-auto", offsetPx: 120 }
      },
      motion: {
        shows: "the feed narrowing to engineering roles as the chip is picked",
        actions: [{ kind: "click", locator: { role: "button", name: "Software Engineering" } }]
      },
      regions: [
        {
          id: "remoteFeedCount",
          // Two numbers in one 99px box: how many match, and how many of those
          // are new since yesterday. The claim a daily film exists to make.
          purpose: "how many roles match and how many arrived since the last visit",
          locator: { role: "text", name: "jobs", container: "span.ml-auto" },
          fields: [],
          sourceTextPx: 13
        },
        {
          id: "remoteFeedCard",
          purpose: "one whole posting as the feed lists it, role and company and tags together",
          // The headline block inside the card -- role over company -- rather
          // than the card itself. The card runs 490-518px wide depending on
          // whether the feed column has a scrollbar, and at 518 the claim reads
          // 19.3px against a 20px floor, so the same shot passed on one film and
          // failed on the next two. This block excludes the logo and the star
          // button, so it is narrower and does not move with them.
          locator: { role: "text", name: "{job.title}", container: "div.min-w-0.flex-1" },
          fields: ["job.title", "job.company"],
          sourceTextPx: 11
        },
        {
          id: "remoteFeedRole",
          purpose: "the role on the newest posting, by itself",
          locator: { role: "text", name: "{job.title}", container: "div.font-medium.text-sm.truncate" },
          fields: ["job.title"],
          sourceTextPx: 11
        },
        {
          id: "remoteFeedDatedCard",
          // A second posting, chosen because its company cell carries an age.
          //
          // Declared but NOT currently claimable, and both halves of that are
          // measured. The age line on its own fails `no_fit_without_cutting
          // _words`: a 16px line inside a card has no vertical room to reach any
          // container aspect without cutting the line above or below it, and
          // `snapClearOfWords` correctly refuses. Framed as the whole card it
          // fits, and then reads 19.3px on a 518px crop against a 20px floor --
          // the claim tokens sit at opposite ends of the card, so the crop grows
          // to span them and the type shrinks with it.
          //
          // Left here because it is a real region and 0.7px from usable: a
          // narrower card column, or a claim whose two tokens sit closer
          // together, brings it over. Do not lower the floor to take it.
          purpose: "a second posting, with how long ago it went up",
          locator: { role: "text", name: "{job.company}", container: "div[data-slot=\"card\"]" },
          fields: ["job.company"],
          sourceTextPx: 11
        },
        {
          id: "remoteFeedSort",
          // "Newest First", which is the whole premise of a daily film: the
          // feed is in the order things arrived, so the top of it is today.
          // Two words, which matters -- a claim needs two distinct readable
          // tokens, and every badge on this page is one word.
          purpose: "that the feed is ordered by arrival, newest at the top",
          locator: { role: "text", name: "Newest First", container: "select" },
          fields: [],
          sourceTextPx: 11
        },
        {
          id: "remoteFeedPosted",
          // Company and posting age in one 258px cell, because the product
          // renders them as one line: "WarpBuild · 2 days ago". A film that
          // claims a role is recent needs the product to be the thing saying
          // so, and this is the only place on the feed that says it.
          purpose: "who is hiring, and how long ago they posted it",
          locator: { role: "text", name: "{job.company}", container: "div.text-xs.text-muted-foreground" },
          fields: ["job.company"],
          sourceTextPx: 12
        },
        {
          id: "remoteFeedBadge",
          purpose: "the product's own mark that the role is remote",
          locator: { role: "text", name: "Remote", container: "span[data-slot=\"badge\"]" },
          fields: [],
          sourceTextPx: 8
        },
        {
          id: "remoteFeedNewBadge",
          purpose: "the mark that says this one was not here yesterday",
          locator: { role: "text", name: "NEW", container: "span[data-slot=\"badge\"]" },
          fields: [],
          sourceTextPx: 8
        }
      ]
    },
    {
      id: "job_feed_newgrad",
      route: "/jobs",
      purpose: "startup roles open to new graduates, with the backer named on the card",
      reach: [
        "Write yesterday's timestamp as the last visit, select engineering, and turn the Startup filter on.",
        "Open /jobs and wait for the feed to settle.",
        "Choose New Grad / Entry in the Level filter so the feed narrows to roles a graduate can take."
      ],
      prepare: {
        because: "a returning graduate who already filters to startups and engineering",
        localStorage: [
          { key: "nexusreach-jobs-last-visited", isoHoursAgo: 24 },
          { key: "nexusreach-jobs-occupations", value: "[]" },
          { key: "nexusreach-jobs-filters", value: JSON.stringify({ ...FEED_FILTER_DEFAULTS, experienceLevelFilter: "new_grad", startupFilter: true }) }
        ],
        // The feed list itself, held a little below the top of the frame so
        // the count above it stays in shot.
        scrollTo: { selector: "span.ml-auto", offsetPx: 120 }
      },
      // The graduate level and the startup filter are set before the load, and
      // the occupation chip is what gets filmed.
      //
      // Two things were tried first and measured. Choosing the level from the
      // native select moved 0.144 against a 0.5 floor -- it repaints one row of
      // text and the list re-renders after the burst has already finished, so
      // the capture is twelve frames of a page that has not changed yet.
      // Toggling the Startup chip with the level already applied moved 0.248,
      // because by then only a handful of cards are left to remove. Going from
      // every occupation to one takes the column from hundreds of cards to
      // eighteen, which is a change worth filming.
      motion: {
        shows: "the feed narrowing from every field to engineering as the chip is picked",
        actions: [{ kind: "click", locator: { role: "button", name: "Software Engineering" } }]
      },
      regions: [
        {
          id: "newGradFeedCount",
          purpose: "how many graduate-level startup roles match, and how many are new",
          locator: { role: "text", name: "jobs", container: "span.ml-auto" },
          fields: [],
          sourceTextPx: 13
        },
        {
          id: "newGradFeedCard",
          purpose: "one graduate-level startup posting as the feed lists it",
          // The headline block inside the card -- role over company -- rather
          // than the card itself. The card runs 490-518px wide depending on
          // whether the feed column has a scrollbar, and at 518 the claim reads
          // 19.3px against a 20px floor, so the same shot passed on one film and
          // failed on the next two. This block excludes the logo and the star
          // button, so it is narrower and does not move with them.
          locator: { role: "text", name: "{job.title}", container: "div.min-w-0.flex-1" },
          fields: ["job.title", "job.company"],
          sourceTextPx: 11
        },
        {
          id: "newGradFeedRole",
          purpose: "the role a graduate can actually apply for",
          locator: { role: "text", name: "{job.title}", container: "div.font-medium.text-sm.truncate" },
          fields: ["job.title"],
          sourceTextPx: 11
        },
        {
          id: "newGradFeedDatedCard",
          // A second posting, chosen because its company cell carries an age.
          // The age line cannot be claimed on its own -- a 16px line inside a
          // card has no vertical room to reach any container aspect without
          // cutting the line above or below it, which `snapClearOfWords`
          // correctly refuses. Framed as the whole card, it has room.
          purpose: "a second posting, with how long ago it went up",
          locator: { role: "text", name: "{job.company}", container: "div[data-slot=\"card\"]" },
          fields: ["job.company"],
          sourceTextPx: 11
        },
        {
          id: "newGradFeedSort",
          // "Newest First", which is the whole premise of a daily film: the
          // feed is in the order things arrived, so the top of it is today.
          // Two words, which matters -- a claim needs two distinct readable
          // tokens, and every badge on this page is one word.
          purpose: "that the feed is ordered by arrival, newest at the top",
          locator: { role: "text", name: "Newest First", container: "select" },
          fields: [],
          sourceTextPx: 11
        },
        {
          id: "newGradFeedPosted",
          // Company and posting age in one 258px cell, because the product
          // renders them as one line: "WarpBuild · 2 days ago". A film that
          // claims a role is recent needs the product to be the thing saying
          // so, and this is the only place on the feed that says it.
          purpose: "who is hiring, and how long ago they posted it",
          locator: { role: "text", name: "{job.company}", container: "div.text-xs.text-muted-foreground" },
          fields: ["job.company"],
          sourceTextPx: 12
        },
        {
          id: "newGradFeedBacker",
          // The badge is the whole reason this angle beats a job board: the
          // product already knows which ecosystem the company came out of.
          purpose: "the accelerator the hiring company came out of, named by the product",
          locator: { role: "text", name: "Y Combinator", container: "span[data-slot=\"badge\"]" },
          fields: [],
          sourceTextPx: 8
        },
        {
          id: "newGradFeedStartupBadge",
          purpose: "the product's own mark that this is a startup rather than a large employer",
          locator: { role: "text", name: "Startup", container: "span[data-slot=\"badge\"]" },
          fields: [],
          sourceTextPx: 8
        }
      ]
    },
    {
      id: "job_feed_overnight",
      route: "/jobs",
      purpose: "everything the overnight ingest added, counted against the last visit",
      reach: [
        "Write yesterday's timestamp as the last visit and select engineering.",
        "Open /jobs and wait for the feed to settle.",
        "Click the Startup chip so the feed narrows to the startup roles that arrived."
      ],
      prepare: {
        because: "a returning user opening the tab the morning after an overnight ingest",
        localStorage: [
          { key: "nexusreach-jobs-last-visited", isoHoursAgo: 24 },
          { key: "nexusreach-jobs-occupations", value: JSON.stringify(["software_engineering"]) },
          { key: "nexusreach-jobs-filters", value: JSON.stringify(FEED_FILTER_DEFAULTS) }
        ],
        // The feed list itself, held a little below the top of the frame so
        // the count above it stays in shot.
        scrollTo: { selector: "span.ml-auto", offsetPx: 120 }
      },
      motion: {
        shows: "the feed narrowing to startup roles as the chip is picked",
        actions: [{ kind: "click", locator: { role: "button", name: "Startup" } }]
      },
      regions: [
        {
          id: "overnightFeedCount",
          purpose: "the count of roles found, and how many of them are new since yesterday",
          locator: { role: "text", name: "jobs", container: "span.ml-auto" },
          fields: [],
          sourceTextPx: 13
        },
        {
          id: "overnightFeedCard",
          purpose: "one of the postings that arrived overnight, as the feed lists it",
          // The headline block inside the card -- role over company -- rather
          // than the card itself. The card runs 490-518px wide depending on
          // whether the feed column has a scrollbar, and at 518 the claim reads
          // 19.3px against a 20px floor, so the same shot passed on one film and
          // failed on the next two. This block excludes the logo and the star
          // button, so it is narrower and does not move with them.
          locator: { role: "text", name: "{job.title}", container: "div.min-w-0.flex-1" },
          fields: ["job.title", "job.company"],
          sourceTextPx: 11
        },
        {
          id: "overnightFeedDatedCard",
          // A second posting, chosen because its company cell carries an age.
          // The age line cannot be claimed on its own -- a 16px line inside a
          // card has no vertical room to reach any container aspect without
          // cutting the line above or below it, which `snapClearOfWords`
          // correctly refuses. Framed as the whole card, it has room.
          purpose: "a second posting, with how long ago it went up",
          locator: { role: "text", name: "{job.company}", container: "div[data-slot=\"card\"]" },
          fields: ["job.company"],
          sourceTextPx: 11
        },
        {
          id: "overnightFeedSort",
          // "Newest First", which is the whole premise of a daily film: the
          // feed is in the order things arrived, so the top of it is today.
          // Two words, which matters -- a claim needs two distinct readable
          // tokens, and every badge on this page is one word.
          purpose: "that the feed is ordered by arrival, newest at the top",
          locator: { role: "text", name: "Newest First", container: "select" },
          fields: [],
          sourceTextPx: 11
        },
        {
          id: "overnightFeedPosted",
          // Company and posting age in one 258px cell, because the product
          // renders them as one line: "WarpBuild · 2 days ago". A film that
          // claims a role is recent needs the product to be the thing saying
          // so, and this is the only place on the feed that says it.
          purpose: "who is hiring, and how long ago they posted it",
          locator: { role: "text", name: "{job.company}", container: "div.text-xs.text-muted-foreground" },
          fields: ["job.company"],
          sourceTextPx: 12
        },
        {
          id: "overnightFeedNewBadge",
          purpose: "the mark that says this posting was not in the feed yesterday",
          locator: { role: "text", name: "NEW", container: "span[data-slot=\"badge\"]" },
          fields: [],
          sourceTextPx: 8
        },
        {
          id: "overnightFeedRole",
          purpose: "the role on one of the overnight arrivals",
          locator: { role: "text", name: "{job.title}", container: "div.font-medium.text-sm.truncate" },
          fields: ["job.title"],
          sourceTextPx: 11
        }
      ]
    },
    // One posting, opened.
    //
    // Everything claimed here is above the fold and inline: the pay, the posting
    // age, the ecosystem the company came from, and the product's own name for
    // the panel it puts on top. Inline spans and badges are the shapes that come
    // out narrow -- a block element is as wide as its column, whatever its text.
    //
    // What is NOT here, and why: the description itself.
    //
    // The description was worth fixing and is now readable -- it used to render
    // as escaped markup -- but readable to a person is not the same as claimable
    // by a film. At the 1440 capture viewport its container has `max-w-none`, so
    // every paragraph and list item is a block 1226px wide carrying one 14px
    // line, which crops to 8.8px against a 20px floor. Measured, not assumed.
    // Narrowing that column to the `prose` plugin's own default would put it at
    // 530px, which crops to about 19.7px -- still under, and still a product
    // decision about how job descriptions should read rather than a filming one.
    //
    // No motion: a posting is a document. Its only controls are Apply, which
    // leaves the product, and a star. Inventing an interaction here would film
    // Gideon rather than Solomon.
    {
      id: "job_posting",
      route: "/jobs/{job.id}",
      purpose: "one posting, with what it pays and what the product makes of it",
      reach: [
        "Open the posting's own page and wait for the title.",
        "No interaction and no scroll: everything claimed sits above the fold."
      ],
      regions: [
        {
          id: "postingSalary",
          // The value's own span, not the row that holds it. The row is a block
          // and comes out 1248px wide -- it reads 10.2px, while the span reads
          // fine. This is the difference between what the product displays and
          // the box the DOM reports for it.
          purpose: "what the role pays, in the product's own words",
          locator: { role: "text", name: "From", container: "span.font-medium" },
          fields: [],
          sourceTextPx: 12
        },
        {
          id: "postingPosted",
          purpose: "how long ago the posting went up",
          locator: { role: "text", name: "Posted", container: "span[data-slot=\"badge\"]" },
          fields: [],
          sourceTextPx: 10
        },
        {
          id: "postingSource",
          purpose: "the ecosystem the hiring company was found in",
          locator: { role: "text", name: "Curated Startups", container: "span[data-slot=\"badge\"]" },
          fields: [],
          sourceTextPx: 10
        },
        {
          id: "postingCommandCentre",
          purpose: "the product's own name for what it puts on top of a posting",
          locator: { role: "text", name: "Job Command Center", container: "h2" },
          fields: [],
          sourceTextPx: 14
        }
      ]
    },
    // Name one company, get its whole board.
    //
    // A different mechanism from the feed surfaces: those film what discovery
    // already brought in, this films the user asking for something specific. The
    // pair exists because the ask and the answer are 2000px apart on one route.
    //
    // The footage behind it is real. Searching figma's Greenhouse board through
    // the product returned 162 roles, and the film's `figma` filter is showing
    // exactly those. The capture types the company name rather than pressing
    // Search, for two reasons: the endpoint is rate limited to 5/minute and
    // charges a daily action budget, and the runner performs a surface's motion
    // once per shot -- so filming the click would spend three real searches to
    // record one. Typing is the part that moves anyway; a native button click
    // moved 0.161 when it was measured, against a 0.5 floor.
    {
      id: "career_page_search",
      route: "/jobs",
      purpose: "the user naming a company instead of waiting for discovery to find it",
      reach: [
        "Open /jobs with the feed already filtered to the company that was searched.",
        "Type the company's board name into the career-page field."
      ],
      prepare: {
        because: "a user who has just searched one company's careers page and is looking at what came back",
        localStorage: [
          { key: "nexusreach-jobs-last-visited", isoHoursAgo: 24 },
          { key: "nexusreach-jobs-occupations", value: "[]" },
          { key: "nexusreach-jobs-filters", value: JSON.stringify({ ...FEED_FILTER_DEFAULTS, searchFilter: "figma" }) }
        ]
      },
      // No motion. Typing the company name into the career-page field moved
      // 0.482 against a 0.5 floor -- five characters land in one 584px input and
      // nothing else on the page reacts until the request comes back. The floor
      // is right and the interaction is simply not a filmable one; the feed
      // narrowing on the results surface is where this product visibly moves.
      regions: [
        {
          id: "careerPanel",
          purpose: "that a company's own careers page is something you can point the product at",
          locator: { role: "text", name: "Search Company Career Page" },
          fields: [],
          sourceTextPx: 13
        },
        {
          id: "careerSources",
          // Named platforms rather than "we search everywhere". A viewer can
          // check a list; they cannot check a boast.
          purpose: "the career-page platforms the product can read, named",
          locator: { role: "text", name: "Paste a job posting URL" },
          fields: [],
          sourceTextPx: 12
        }
      ]
    },
    {
      id: "career_page_results",
      route: "/jobs",
      purpose: "the whole board that came back from naming one company",
      reach: [
        "Open /jobs with the feed filtered to the company that was searched.",
        "Scroll the results into frame."
      ],
      prepare: {
        because: "the same session, looking at what the career-page search returned",
        localStorage: [
          { key: "nexusreach-jobs-last-visited", isoHoursAgo: 24 },
          { key: "nexusreach-jobs-occupations", value: "[]" },
          { key: "nexusreach-jobs-filters", value: JSON.stringify({ ...FEED_FILTER_DEFAULTS, searchFilter: "figma" }) }
        ],
        scrollTo: { selector: "span.ml-auto", offsetPx: 120 }
      },
      // No motion here either, after three attempts, all measured:
      //
      //  - Typing the company into the career-page field moved 0.482 against a
      //    0.5 floor. Five characters land in one input and nothing else reacts
      //    until the request returns.
      //  - Typing it into the feed's own search box is the pattern that moved
      //    1.161 on the People page, but here `type` times out: the Jobs feed
      //    polls while its results warm, the filter bar remounts under the
      //    cursor, and the located input detaches between keystrokes.
      //  - Clicking an occupation chip would narrow the results to nothing.
      //    Jobs stored by the career-page search carry no tags at all -- a
      //    separate defect, filed rather than worked around here -- so all 162
      //    of them are invisible to every chip.
      //
      // A film is allowed to be stills. Manufacturing an interaction the product
      // does not really have would be filming Gideon instead of Solomon.
      regions: [
        {
          id: "careerFoundCount",
          purpose: "how many roles one company search returned, and that all of them are new",
          locator: { role: "text", name: "jobs", container: "span.ml-auto" },
          fields: [],
          sourceTextPx: 13
        },
        {
          id: "careerFoundCard",
          // The headline block, not the card: the card runs 490-518px wide and
          // reads 19.3px against a 20px floor at the wider end. This block drops
          // the logo and the star button and holds the line that matters here --
          // the company and how long ago it posted.
          purpose: "one of the returned roles, with the company and how recently it posted",
          locator: { role: "text", name: "{job.title}", container: "div.min-w-0.flex-1" },
          fields: ["job.title", "job.company"],
          sourceTextPx: 11
        }
      ]
    },
    // Jobs near one city, which the product decides by distance rather than by
    // matching the word.
    //
    // Worth knowing before trusting this surface: the feed's own search box
    // matches title and company only -- `Job.title.ilike(term) |
    // Job.company_name.ilike(term)` -- so typing "Toronto" into it returns
    // nothing at all. `Near:` is the control that understands places. It
    // resolves through an in-process gazetteer (Toronto is a hard-coded entry)
    // and filters on each job's stored `location_lat`/`location_lng`, so no
    // network geocode happens at request time and the same filter returns the
    // same set every run -- which is what makes it safe to plan a film against.
    {
      id: "job_feed_toronto",
      route: "/jobs",
      purpose: "the roles within commuting distance of one city, for a graduate who lives there",
      reach: [
        "Open /jobs with the near-location filter set to Toronto and a 50km radius.",
        "Click the Software Engineering chip so the feed narrows to engineering roles."
      ],
      prepare: {
        because: "a graduate in Toronto who has set the near-location filter and is looking at what is in reach",
        localStorage: [
          { key: "nexusreach-jobs-last-visited", isoHoursAgo: 24 },
          { key: "nexusreach-jobs-occupations", value: "[]" },
          { key: "nexusreach-jobs-filters", value: JSON.stringify({ ...FEED_FILTER_DEFAULTS, nearLocationFilter: "Toronto" }) }
        ],
        scrollTo: { selector: "span.ml-auto", offsetPx: 120 }
      },
      motion: {
        shows: "the feed narrowing from every field to engineering as the chip is picked",
        actions: [{ kind: "click", locator: { role: "button", name: "Software Engineering" } }]
      },
      regions: [
        {
          id: "torontoFeedCount",
          purpose: "how many engineering roles are within reach of the city",
          locator: { role: "text", name: "jobs", container: "span.ml-auto" },
          fields: [],
          sourceTextPx: 13
        },
        // Three postings rather than one, because this angle is a list: the
        // claim is that there are several, and one card cannot carry that. Each
        // is framed on the headline block, which holds the role, the employer
        // and the place together -- the place being the whole point here.
        {
          id: "torontoFeedFirst",
          purpose: "one graduate-level engineering role, with the city it is in",
          locator: { role: "text", name: "{job.title}", container: "div.min-w-0.flex-1" },
          fields: ["job.title", "job.company"],
          sourceTextPx: 11
        },
        {
          id: "torontoFeedSecond",
          purpose: "a second role, so the list reads as a list",
          locator: { role: "text", name: "{job.title}", container: "div.min-w-0.flex-1" },
          fields: ["job.title", "job.company"],
          sourceTextPx: 11
        },
        {
          id: "torontoFeedThird",
          purpose: "a third role, from a different employer again",
          locator: { role: "text", name: "{job.title}", container: "div.min-w-0.flex-1" },
          fields: ["job.title", "job.company"],
          sourceTextPx: 11
        }
      ]
    }
  ]
};
