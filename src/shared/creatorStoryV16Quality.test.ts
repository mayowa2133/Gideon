import { describe, expect, it } from "vitest";
import { auditV16BannedStrings, auditV16CompositionSimilarity, auditV16Cta, auditV16MascotPlacement, auditV16PhoneScale, auditV16RenderedBounds, auditV16StoryConsistency, auditV16Transitions, evaluateV16MotionBands, mascotBoxForScene } from "./creatorStoryV16Quality";
import { compileSolomonV16DemoContent } from "./solomonDemoContentV16";

const content=compileSolomonV16DemoContent();

describe("Creator Story V16 quality gates",()=>{
  it("accepts one concise disclosure and rejects internal fixture strings",()=>{
    expect(auditV16BannedStrings("Product Engineer at Northstar Labs","DEMO DATA").passed).toBe(true);
    expect(auditV16BannedStrings("Seeded fixture; no model was called","DEMO DATA").passed).toBe(false);
    expect(auditV16BannedStrings("Product Engineer","DEMO DATA · DEMO DATA").passed).toBe(false);
  });
  it("requires state-consistent proof and human control",()=>{
    const input={previousStage:content.opportunity.previousStage,resultStage:content.opportunity.resultStage,resultInterviewingCount:1,actionVisible:true,contact:content.contact,opportunity:content.opportunity,message:content.message};
    expect(auditV16StoryConsistency(input).passed).toBe(true);
    expect(auditV16StoryConsistency({...input,resultInterviewingCount:0}).passed).toBe(false);
    expect(auditV16StoryConsistency({...input,message:{...content.message,sent:true}}).passed).toBe(false);
  });
  it("locks the comment-gated CTA template",()=>{
    const base={text:"COMMENT SOLOMON FOR THE DEMO",spoken:"Comment SOLOMON and I'll send you the demo.",keyword:"SOLOMON",action:"comment",brand:"Solomon",accountIdentity:"SOLOMON",destinationVerified:false,commentDeliveryVerified:false};
    expect(auditV16Cta(base).passed).toBe(true);
    expect(auditV16Cta(base).deliveryVerificationPending).toBe(true);
    expect(auditV16Cta({...base,action:"save"}).passed).toBe(false);
    expect(auditV16Cta({...base,text:"SAVE FOR YOUR NEXT JOB SEARCH"}).passed).toBe(false);
    expect(auditV16Cta({...base,spoken:"Follow for more."}).passed).toBe(false);
  });
  it("fails content that can cross the frame edge under worst-case camera",()=>{
    const camera={scaleFrom:1,scaleTo:1.1,focus:{x:.5,y:.5}};
    const safe=auditV16RenderedBounds([{id:"safe",camera,layout:[{id:"product",kind:"product",left:.1,top:.2,right:.9,bottom:.7}]}]);
    expect(safe.passed).toBe(true);
    const bleeding=auditV16RenderedBounds([{id:"bleed",camera:{...camera,focus:{x:.2,y:.5}},layout:[{id:"product",kind:"product",left:.1,top:.2,right:.995,bottom:.7}]}]);
    expect(bleeding.passed).toBe(false);
    expect(bleeding.failures.some((failure)=>failure.includes("crosses_right"))).toBe(true);
    const cameoPeek=auditV16RenderedBounds([{id:"peek",camera,mascotRole:"cameo_right",layout:[{id:"mascot",kind:"mascot",left:.68,top:.7,right:.999,bottom:.999}]}]);
    expect(cameoPeek.passed).toBe(true);
  });
  it("bands motion on both sides so churn fails as loudly as stillness",()=>{
    const inBand={nearStaticFramePercent:22,medianFrameChange:2.1,continuousMovementExcludingCuts:2.5,longestLowMotionSeconds:1.6,majorTransitionPeakCount:16};
    expect(evaluateV16MotionBands(inBand).passed).toBe(true);
    expect(evaluateV16MotionBands({...inBand,medianFrameChange:7.1,nearStaticFramePercent:.5}).passed).toBe(false);
    expect(evaluateV16MotionBands({...inBand,medianFrameChange:.4,nearStaticFramePercent:71}).passed).toBe(false);
  });
  it("enforces decisive transition and phone-scale policies",()=>{
    expect(auditV16Transitions([{type:"cut",purpose:"beat"},{type:"dissolve",purpose:"memory"},{type:"slide",purpose:"causal"}]).passed).toBe(true);
    expect(auditV16Transitions(Array.from({length:3},()=>({type:"dissolve" as const,purpose:"float"}))).passed).toBe(false);
    expect(auditV16PhoneScale({requiredTextCoverage:1,primaryFocalPoints:2,contactReadable:true,messageReadable:true,mascotFaceReadable:true,captionCollisionCount:0,evidencePixelsArePrimary:false}).passed).toBe(true);
  });
  it("rejects unchanged compositions beyond two seconds",()=>{
    const shared={product:null,mascot:null,background:"mint",cameraScale:1,semanticState:"hold"};
    expect(auditV16CompositionSimilarity([{frame:0,...shared},{frame:90,...shared}]).passed).toBe(false);
  });
});


describe("V16 mascot placement",()=>{
  const rect={id:"mascot",kind:"mascot" as const,left:.68,top:.7,right:.98,bottom:.98};
  it("solves a box that sits inside the declared rect",()=>{
    const box=mascotBoxForScene({layout:[rect]});
    expect(box.scale).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(rect.left*1080-1);
    expect(box.x+660*box.scale).toBeLessThanOrEqual(rect.right*1080+1);
    expect(box.y+940*box.scale).toBeLessThanOrEqual(rect.bottom*1920+1);
  });
  it("passes when every visible scene declares a mascot rect",()=>{
    expect(auditV16MascotPlacement([{id:"a",layout:[rect],mascotRole:"cameo_right"}]).passed).toBe(true);
  });
  it("fails a visible mascot with no declared rect",()=>{
    const audit=auditV16MascotPlacement([{id:"b",layout:[{id:"product",kind:"product",left:.1,top:.2,right:.9,bottom:.7}],mascotRole:"cameo_right"}]);
    expect(audit.passed).toBe(false);
    expect(audit.failures[0]).toContain("mascot_rect_missing");
  });
});
