import { describe, expect, it } from "vitest";
import { auditV10BannedStrings, auditV10CompositionSimilarity, auditV10Cta, auditV10PhoneScale, auditV10StoryConsistency, auditV10Transitions } from "./creatorStoryV10Quality";
import { compileSolomonV10DemoContent } from "./solomonDemoContentV10";

const content=compileSolomonV10DemoContent();

describe("Creator Story V10 quality gates",()=>{
  it("accepts one concise disclosure and rejects internal fixture strings",()=>{
    expect(auditV10BannedStrings("Product Engineer at Northstar Labs","DEMO DATA").passed).toBe(true);
    expect(auditV10BannedStrings("Seeded fixture; no model was called","DEMO DATA").passed).toBe(false);
    expect(auditV10BannedStrings("Product Engineer","DEMO DATA · DEMO DATA").passed).toBe(false);
  });
  it("requires state-consistent proof and human control",()=>{
    const input={previousStage:content.opportunity.previousStage,resultStage:content.opportunity.resultStage,resultInterviewingCount:1,actionVisible:true,contact:content.contact,opportunity:content.opportunity,message:content.message};
    expect(auditV10StoryConsistency(input).passed).toBe(true);
    expect(auditV10StoryConsistency({...input,resultInterviewingCount:0}).passed).toBe(false);
    expect(auditV10StoryConsistency({...input,message:{...content.message,sent:true}}).passed).toBe(false);
  });
  it("locks the safe save CTA",()=>{
    expect(auditV10Cta({text:"SAVE FOR YOUR NEXT JOB SEARCH",action:"save",brand:"Solomon",accountIdentity:"SOLOMON",destinationVerified:false,commentDeliveryVerified:false}).passed).toBe(true);
    expect(auditV10Cta({text:"COMMENT SOLOMON AND I WILL DM YOU",action:"save",brand:"Solomon",accountIdentity:"SOLOMON",destinationVerified:false,commentDeliveryVerified:false}).passed).toBe(false);
  });
  it("enforces decisive transition and phone-scale policies",()=>{
    expect(auditV10Transitions([{type:"cut",purpose:"beat"},{type:"dissolve",purpose:"memory"},{type:"slide",purpose:"causal"}]).passed).toBe(true);
    expect(auditV10Transitions(Array.from({length:3},()=>({type:"dissolve" as const,purpose:"float"}))).passed).toBe(false);
    expect(auditV10PhoneScale({requiredTextCoverage:1,primaryFocalPoints:2,contactReadable:true,messageReadable:true,mascotFaceReadable:true,captionCollisionCount:0,evidencePixelsArePrimary:false}).passed).toBe(true);
  });
  it("rejects unchanged compositions beyond two seconds",()=>{
    const shared={product:null,mascot:null,background:"mint",cameraScale:1,semanticState:"hold"};
    expect(auditV10CompositionSimilarity([{frame:0,...shared},{frame:90,...shared}]).passed).toBe(false);
  });
});

