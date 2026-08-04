import { describe,expect,it } from "vitest";
import { auditSolomonCreatorStoryV11, createSolomonCreatorStoryV11Manifest, SOLOMON_CREATOR_STORY_V11_CTA, SOLOMON_CREATOR_STORY_V11_HOOK, type V11AssetId } from "./solomonCreatorStoryV11";

const ids:V11AssetId[]=["tracker_before","tracker_after","opportunity","contact","outreach_blank","outreach_complete"];
const inputs=ids.map((id)=>({id,path:`/${id}.webm`,sha256:id.padEnd(64,"0"),domEvidence:[{elementId:id,role:"region",text:id,box:{x:0,y:0,width:100,height:100}}]}));

describe("Solomon Creator Story V11",()=>{
  it("is isolated, locked, evidence-bound, performance-directed, and safe",()=>{
    const manifest=createSolomonCreatorStoryV11Manifest(inputs,"9".repeat(64)),audit=auditSolomonCreatorStoryV11(manifest);
    expect(audit.passed).toBe(true);expect(audit.words).toBeGreaterThanOrEqual(112);expect(audit.words).toBeLessThanOrEqual(122);expect(audit.wpm).toBeGreaterThanOrEqual(185);expect(audit.wpm).toBeLessThanOrEqual(205);expect(manifest.creativeDirector.hook).toBe(SOLOMON_CREATOR_STORY_V11_HOOK);expect(manifest.distributionObjective.ctaText).toBe(SOLOMON_CREATOR_STORY_V11_CTA);expect(manifest.regenerationLineage.parentVersion).toBe("10");expect(manifest.release.publicReleaseApproved).toBe(false);
  });
  it("locks the viewer-outcome hook and comment-gated CTA templates",()=>{
    const manifest=createSolomonCreatorStoryV11Manifest(inputs,"9".repeat(64)),audit=auditSolomonCreatorStoryV11(manifest);
    expect(audit.hook.passed).toBe(true);expect(SOLOMON_CREATOR_STORY_V11_HOOK.toLowerCase()).toContain("your");expect(SOLOMON_CREATOR_STORY_V11_HOOK.startsWith("This")).toBe(false);
    expect(manifest.distributionObjective.action).toBe("comment");expect(manifest.distributionObjective.ctaKeyword).toBe("SOLOMON");expect(manifest.distributionObjective.ctaSpoken.toLowerCase()).toContain("comment solomon");
    expect(audit.cta.passed).toBe(true);expect(audit.cta.deliveryVerificationPending).toBe(true);
    expect(audit.captionLints.passed).toBe(true);expect(audit.numeralAnchors.passed).toBe(true);
  });
  it("fails a story-state contradiction",()=>{const manifest=createSolomonCreatorStoryV11Manifest(inputs,"9".repeat(64));Reflect.set(manifest.demoContent.opportunity,"resultStage","Applied");expect(auditSolomonCreatorStoryV11(manifest).passed).toBe(false);});
  it("fails banned proof language",()=>{const manifest=createSolomonCreatorStoryV11Manifest(inputs,"9".repeat(64));Reflect.set(manifest.demoContent.message,"body","Seeded fixture; no model was called");expect(auditSolomonCreatorStoryV11(manifest).passed).toBe(false);});
  it("fails CTA churn away from the comment template",()=>{const manifest=createSolomonCreatorStoryV11Manifest(inputs,"9".repeat(64));Reflect.set(manifest.distributionObjective,"action","save");expect(auditSolomonCreatorStoryV11(manifest).passed).toBe(false);});
  it("fails a caption chip over four words",()=>{const manifest=createSolomonCreatorStoryV11Manifest(inputs,"9".repeat(64));Reflect.set(manifest.captions[0]!,"beatText","THIS CHIP HAS FIVE WORDS");expect(auditSolomonCreatorStoryV11(manifest).passed).toBe(false);});
  it("fails a numeral graphic with no spoken anchor",()=>{const manifest=createSolomonCreatorStoryV11Manifest(inputs,"9".repeat(64));Reflect.set(manifest,"numeralAnchors",[{graphic:"5×",spokenToken:"nonexistentword",sceneId:"five"}]);expect(auditSolomonCreatorStoryV11(manifest).passed).toBe(false);});
});
