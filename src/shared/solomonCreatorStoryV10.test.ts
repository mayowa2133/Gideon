import { describe,expect,it } from "vitest";
import { auditSolomonCreatorStoryV10, createSolomonCreatorStoryV10Manifest, SOLOMON_CREATOR_STORY_V10_CTA, SOLOMON_CREATOR_STORY_V10_HOOK, type V10AssetId } from "./solomonCreatorStoryV10";

const ids:V10AssetId[]=["tracker_before","tracker_after","opportunity","contact","outreach_blank","outreach_complete"];
const inputs=ids.map((id)=>({id,path:`/${id}.webm`,sha256:id.padEnd(64,"0"),domEvidence:[{elementId:id,role:"region",text:id,box:{x:0,y:0,width:100,height:100}}]}));

describe("Solomon Creator Story V10",()=>{
  it("is isolated, locked, evidence-bound, performance-directed, and safe",()=>{
    const manifest=createSolomonCreatorStoryV10Manifest(inputs,"9".repeat(64)),audit=auditSolomonCreatorStoryV10(manifest);
    expect(audit.passed).toBe(true);expect(audit.words).toBeGreaterThanOrEqual(112);expect(audit.words).toBeLessThanOrEqual(122);expect(audit.wpm).toBeGreaterThanOrEqual(185);expect(audit.wpm).toBeLessThanOrEqual(205);expect(manifest.creativeDirector.hook).toBe(SOLOMON_CREATOR_STORY_V10_HOOK);expect(manifest.distributionObjective.ctaText).toBe(SOLOMON_CREATOR_STORY_V10_CTA);expect(manifest.regenerationLineage.parentVersion).toBe("9");expect(manifest.release.publicReleaseApproved).toBe(false);
  });
  it("fails a story-state contradiction",()=>{const manifest=createSolomonCreatorStoryV10Manifest(inputs,"9".repeat(64));Reflect.set(manifest.demoContent.opportunity,"resultStage","Applied");expect(auditSolomonCreatorStoryV10(manifest).passed).toBe(false);});
  it("fails banned proof language",()=>{const manifest=createSolomonCreatorStoryV10Manifest(inputs,"9".repeat(64));Reflect.set(manifest.demoContent.message,"body","Seeded fixture; no model was called");expect(auditSolomonCreatorStoryV10(manifest).passed).toBe(false);});
  it("fails unsafe CTA churn",()=>{const manifest=createSolomonCreatorStoryV10Manifest(inputs,"9".repeat(64));Reflect.set(manifest.distributionObjective,"ctaText","COMMENT SOLOMON AND I WILL DM YOU");expect(auditSolomonCreatorStoryV10(manifest).passed).toBe(false);});
});

