import { compileSolomonV22DemoContent } from "./solomonDemoContentV22";
import { describe,expect,it } from "vitest";
import { auditSolomonCreatorStoryV22, createSolomonCreatorStoryV22Manifest, SOLOMON_CREATOR_STORY_V22_CTA, SOLOMON_CREATOR_STORY_V22_CTA_SPOKEN, SOLOMON_CREATOR_STORY_V22_HOOK, type V22AssetId } from "./solomonCreatorStoryV22";

const ids:V22AssetId[]=["tracker_before","tracker_after","opportunity","contact","outreach_blank","outreach_complete"];
const inputs=ids.map((id)=>({id,path:`/${id}.webm`,sha256:id.padEnd(64,"0"),domEvidence:[{elementId:id,role:"region",text:id,box:{x:0,y:0,width:100,height:100}}]}));

describe("Solomon Creator Story V22",()=>{
  it("is isolated, locked, evidence-bound, performance-directed, and safe",()=>{
    const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64)),audit=auditSolomonCreatorStoryV22(manifest);
    expect(audit.passed).toBe(true);expect(audit.words).toBeGreaterThanOrEqual(112);expect(audit.words).toBeLessThanOrEqual(122);expect(audit.wpm).toBeGreaterThanOrEqual(170);expect(audit.wpm).toBeLessThanOrEqual(192);expect(manifest.creativeDirector.hook).toBe(SOLOMON_CREATOR_STORY_V22_HOOK);expect(manifest.distributionObjective.ctaText).toBe(SOLOMON_CREATOR_STORY_V22_CTA);expect(manifest.regenerationLineage.parentVersion).toBe("21");expect(manifest.release.publicReleaseApproved).toBe(false);
  });
  it("locks the viewer-outcome hook and comment-gated CTA templates",()=>{
    const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64)),audit=auditSolomonCreatorStoryV22(manifest);
    expect(audit.hook.passed).toBe(true);expect(SOLOMON_CREATOR_STORY_V22_HOOK.toLowerCase()).toContain("your");expect(SOLOMON_CREATOR_STORY_V22_HOOK.startsWith("This")).toBe(false);
    expect(manifest.distributionObjective.action).toBe("comment");expect(manifest.distributionObjective.ctaKeyword).toBe("SOLOMON");expect(manifest.distributionObjective.ctaSpoken.toLowerCase()).toContain("comment solomon");
    expect(audit.cta.passed).toBe(true);expect(audit.cta.deliveryVerificationPending).toBe(true);
    expect(audit.captionLints.passed).toBe(true);expect(audit.numeralAnchors.passed).toBe(true);
  });
  it("fails a story-state contradiction",()=>{const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64));Reflect.set(manifest.demoContent.opportunity,"resultStage","Applied");expect(auditSolomonCreatorStoryV22(manifest).passed).toBe(false);});
  it("fails banned proof language",()=>{const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64));Reflect.set(manifest.demoContent.message,"body","Seeded fixture; no model was called");expect(auditSolomonCreatorStoryV22(manifest).passed).toBe(false);});
  it("fails CTA churn away from the comment template",()=>{const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64));Reflect.set(manifest.distributionObjective,"action","save");expect(auditSolomonCreatorStoryV22(manifest).passed).toBe(false);});
  it("fails a caption chip over four words",()=>{const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64));Reflect.set(manifest.captions[0]!,"beatText","THIS CHIP HAS FIVE WORDS");expect(auditSolomonCreatorStoryV22(manifest).passed).toBe(false);});
  it("fails a numeral graphic with no spoken anchor",()=>{const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64));Reflect.set(manifest,"numeralAnchors",[{graphic:"5×",spokenToken:"nonexistentword",sceneId:"five"}]);expect(auditSolomonCreatorStoryV22(manifest).passed).toBe(false);});
});

describe("claims are grounded in product pixels",()=>{
  // `relevance` used to require demoContent.contact.reasons -- the exact strings
  // the ReasonStack chips draw -- so it checked Gideon's own overlay against
  // itself and would have passed with a blank recording behind it. Nothing
  // detected that: every gate was green. This locks the property that a claim's
  // evidence has to be text the product rendered, not text we drew over it.
  const manifest=createSolomonCreatorStoryV22Manifest(inputs,"9".repeat(64));
  const overlayCopy=compileSolomonV22DemoContent().contact.reasons.map((value)=>value.toLowerCase());
  it("never requires our own caption copy as claim evidence",()=>{
    for(const claim of manifest.claims){
      for(const required of claim.requiredReadableText){
        expect(overlayCopy).not.toContain(required.toLowerCase());
      }
    }
  });
  it("grounds relevance in the product's own proof rows",()=>{
    const claim=manifest.claims.find((item)=>item.id==="relevance")!;
    // "Recruiting title at the target company" is on the card, but tesseract
    // reads it as "Why matched title atthe target company" -- it drops the first
    // word and fuses "at the". Requiring a phrase the reader cannot reproduce
    // fails on OCR, not on evidence, so the claim asks for the part that survives.
    expect(claim.requiredReadableText).toEqual(["target company","Current role at Northstar Labs"]);
  });
  // Every claim is now grounded: the two that were not have been re-grounded
  // (relevance) and narrowed (control). This asserts the general property rather
  // than a list of known exceptions, so a new self-referential claim fails here.
  it("requires no editorial copy of ours as claim evidence",()=>{
    const ourCopy=[...compileSolomonV22DemoContent().contact.reasons,manifest.creativeDirector.trustBoundary].map((value)=>value.toLowerCase());
    const leaked=manifest.claims.flatMap((claim)=>claim.requiredReadableText.filter((text)=>ourCopy.includes(text.toLowerCase())));
    expect(leaked).toEqual([]);
  });
  it("keeps control on the product's own controls",()=>{
    const claim=manifest.claims.find((item)=>item.id==="control")!;
    // The product has no "Save Edit" or "Cancel" button -- those are chips the
    // film draws over it, so the claim was proving itself with its own overlay.
    // The product's own words for the same assurance are "Stage this email as a
    // draft in your inbox - you review and send it manually".
    expect(claim.requiredReadableText).toEqual(["draft"]);
  });
});

describe("the CTA says what it shows",()=>{
  // The display line read "COMMENT SOLOMON FOR THE DEMO" while the narration says
  // "Comment SOLOMON and I'll send you the demo" -- two hand-typed strings that
  // drifted apart, and nothing compared them. auditV22Cta only checks that both
  // contain the keyword, so it passed throughout.
  it("renders the spoken words, not a paraphrase of them",()=>{
    const normalise=(value:string)=>value.toLowerCase().replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim();
    expect(normalise(SOLOMON_CREATOR_STORY_V22_CTA)).toBe(normalise(SOLOMON_CREATOR_STORY_V22_CTA_SPOKEN));
  });
});
