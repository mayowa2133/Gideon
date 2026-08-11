import { type ProductSurfaceMap } from "./creatorCapturePlan";

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
    { path: "message.subject", shownAs: "the draft's subject line" }
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
      reach: [
        "Reset the tracked opportunity to opportunity.previousStage.",
        "Open /tracker, click the opportunity's card, then click the opportunity.resultStage control.",
        "Hold on the card once it has re-rendered in its new stage."
      ],
      regions: [
        {
          id: "trackerCardAfter",
          purpose: "the opportunity showing the stage the user just chose",
          locator: { role: "button", name: "{opportunity.title} {opportunity.company}" },
          fields: ["opportunity.title", "opportunity.company", "opportunity.resultStage"],
          sourceTextPx: 10
        },
        {
          id: "trackerStageAfter",
          purpose: "the control the user pressed, so the move is the user's",
          locator: { role: "button", name: "{opportunity.resultStage}" },
          fields: ["opportunity.resultStage"],
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
      reach: [
        "Open /people and wait for the People heading.",
        "Filter saved contacts by contact.company.",
        "Scroll the contact into view before recording its boxes."
      ],
      regions: [
        {
          id: "contactName",
          purpose: "who the contact is",
          locator: { role: "text", name: "{contact.name}" },
          fields: ["contact.name"],
          sourceTextPx: 9
        },
        {
          id: "contactRole",
          purpose: "the contact's title -- the fact an angle most often needs to be its own",
          locator: { role: "text", name: "{contact.role}" },
          fields: ["contact.role"],
          sourceTextPx: 9
        },
        {
          id: "contactReason",
          purpose: "Solomon's stated reason for surfacing this person",
          locator: { role: "definition", name: "{contact.reason}" },
          fields: ["contact.reason"],
          sourceTextPx: 9
        }
      ]
    },
    {
      id: "outreach_blank",
      route: "/messages",
      purpose: "the composer before anything is written, so the draft has a before",
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
    }
  ]
};
