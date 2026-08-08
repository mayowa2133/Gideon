import { compileSolomonV22DemoContent } from "./solomonDemoContentV22";
import { describe,expect,it } from "vitest";
import { auditSolomonCreatorStoryV22, createSolomonCreatorStoryV22Manifest, SOLOMON_CREATOR_STORY_V22_CTA, SOLOMON_CREATOR_STORY_V22_HOOK, type V22AssetId } from "./solomonCreatorStoryV22";

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
    expect(claim.requiredReadableText).toEqual(["Recruiting title at the target company","Current role at Northstar Labs"]);
  });
  // Known exception, deliberately visible rather than silently tolerated:
  // `control` still requires "Nothing sends without you", which is our own line
  // and appears in no capture. It is the film's trust promise, spoken in the
  // narration, but it is not product evidence -- so this claim is only two
  // thirds grounded and should be re-grounded or narrowed.
  it("reports the one claim string that is still ours, not the product's",()=>{
    const ungrounded=manifest.claims.flatMap((claim)=>claim.requiredReadableText.filter((text)=>/nothing sends without you/i.test(text)));
    expect(ungrounded).toEqual(["Nothing sends without you"]);
  });
});
