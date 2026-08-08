import { z } from "zod";
import { auditV22BannedStrings, auditV22Captions, auditV22CompositionSimilarity, auditV22Cta, auditV22Hook, auditV22Layout, auditV22NumeralAnchors, auditV22MascotPlacement, auditV22PhoneScale, auditV22RenderedBounds, auditV22SemanticMotion, auditV22StoryConsistency, auditV22BackdropCadence, auditV22Transitions, type V22BackdropToken, type V22CompositionFingerprint, type V22Rect, type V22SemanticEvent } from "./creatorStoryV22Quality";
import { compileSolomonCreatorStoryV22, type V22BeatHeadline, type V22CompiledCaption, type V22NumeralAnchor } from "./solomonCreatorStoryV22Beats";
import { compileSolomonV22DemoContent, SOLOMON_V22_DISCLOSURE, type SolomonV22DemoContent } from "./solomonDemoContentV22";
import { auditMascotPerformanceV22, SOLOMON_MASCOT_V22_GEOMETRY, v22MascotPerformanceSchema, type V22Face, type V22Gesture, type V22MascotPerformance, type V22Mouth } from "./solomonMascotV22";

const compiled=compileSolomonCreatorStoryV22();
export const SOLOMON_CREATOR_STORY_V22_ID="solomon-creator-story-v22-performance" as const;
export const SOLOMON_CREATOR_STORY_V22_DURATION_FRAMES=1155 as const;
export const SOLOMON_CREATOR_STORY_V22_HOOK:string=compiled.hook;
export const SOLOMON_CREATOR_STORY_V22_CTA:string=compiled.ctaDisplay;
export const SOLOMON_CREATOR_STORY_V22_CTA_SPOKEN:string=compiled.ctaSpoken;
export const SOLOMON_CREATOR_STORY_V22_CTA_KEYWORD:string=compiled.ctaKeyword;
export const SOLOMON_CREATOR_STORY_V22_SCRIPT:string=compiled.script;
export const SOLOMON_CREATOR_STORY_V22_TTS_BEATS=compiled.ttsBeats;
export const SOLOMON_CREATOR_STORY_V22_HEADLINES:Record<string,V22BeatHeadline>=compiled.headlines;
export const SOLOMON_CREATOR_STORY_V22_NUMERAL_ANCHORS:V22NumeralAnchor[]=compiled.numeralAnchors;

export type V22AssetId="tracker_before"|"tracker_after"|"opportunity"|"contact"|"outreach_blank"|"outreach_complete";
export type V22Family="hook"|"status"|"contact"|"reasons"|"friction"|"five_surfaces"|"collapse"|"role"|"signature"|"draft"|"grounded"|"control"|"payoff"|"result"|"cta"|"sting";
export interface V22DomEvidence { elementId:string; role:string; text:string; box:{x:number;y:number;width:number;height:number}; beforeState?:string; afterState?:string; click?:{x:number;y:number} }
export interface V22Source { id:V22AssetId; sourcePath:string; sourceSha256:string; sourceWidth:1440; sourceHeight:900; verifiedInterval:{startMs:number;endMs:number}; environment:"fail_closed_fictional_solomon_v22"; disclosure:typeof SOLOMON_V22_DISCLOSURE; domEvidence:V22DomEvidence[]; privacyMasks:[] }
export interface V22Claim { id:string; clause:string; assetIds:V22AssetId[]; requiredReadableText:string[]; actionFrame:number; resultFrame:number; approved:true }
export interface V22Scene { id:string; from:number; to:number; narration:string; family:V22Family; assetIds:V22AssetId[]; claimIds:string[]; semanticEvents:V22SemanticEvent[]; transition:{type:"cut"|"slide"|"match_cut"|"object_wipe"|"dissolve";purpose:string}; mascot:V22MascotPerformance; layout:V22Rect[]; camera:{recipe:string;scaleFrom:number;scaleTo:number;focus:{x:number;y:number};semanticTarget:string}; proofRecipe:string; typography:"spoken"|"editorial_peak"|"product_annotation"|"cta"; conceptual:boolean; backdrop:V22BackdropToken; groupFrom:number }
export type V22Caption = V22CompiledCaption;
export interface V22CreativeDirector { version:"v22.1"; primaryPromise:string; hook:string; problem:string; mechanism:"JOB → PERSON → PROOF → MESSAGE"; payoff:"ONE CONNECTED NEXT STEP"; trustBoundary:"NOTHING SENDS WITHOUT YOU"; cta:string; emotionalArc:["surprise","frustration","clarity","proof","confidence","control","payoff","direct_action"] }
export interface V22SourceInput { id:V22AssetId; path:string; sha256:string; domEvidence:V22DomEvidence[] }
export interface SolomonCreatorStoryV22Manifest { schemaVersion:"17";id:typeof SOLOMON_CREATOR_STORY_V22_ID;canvas:{width:1080;height:1920;fps:30;durationInFrames:1155};creativeDirector:V22CreativeDirector;distributionObjective:{brand:"Solomon";action:"comment";ctaText:string;ctaSpoken:string;ctaKeyword:string;destinationVerified:false;commentDeliveryVerified:false;accountIdentity:"SOLOMON"};script:string;headlines:Record<string,V22BeatHeadline>;numeralAnchors:V22NumeralAnchor[];demoContent:SolomonV22DemoContent;sources:V22Source[];claims:V22Claim[];scenes:V22Scene[];captions:V22Caption[];mascotGeometry:typeof SOLOMON_MASCOT_V22_GEOMETRY;regenerationLineage:{parentVersion:"21";parentMasterSha256:string;reviewRequired:true};release:{generatedMediaPrivate:true;publicReleaseApproved:false;humanConfirmations:string[]} }

export function createSolomonCreatorStoryV22Manifest(inputs:V22SourceInput[],parentMasterSha256:string):SolomonCreatorStoryV22Manifest{
  const demoContent=compileSolomonV22DemoContent();
  // Fresh compile per manifest: caption/headline/anchor objects must never be
  // shared across manifests, or a mutation in one leaks into the next.
  const freshCompiled=compileSolomonCreatorStoryV22();
  const narr=(id:string)=>freshCompiled.narrationBySceneId[id]??"";
  const sources=inputs.map((input):V22Source=>({id:input.id,sourcePath:input.path,sourceSha256:input.sha256,sourceWidth:1440,sourceHeight:900,verifiedInterval:{startMs:0,endMs:7000},environment:"fail_closed_fictional_solomon_v22",disclosure:SOLOMON_V22_DISCLOSURE,domEvidence:input.domEvidence,privacyMasks:[]}));
  const claims:V22Claim[]=[
    claim("status","The opportunity visibly changes from Applied to Interviewing.",["tracker_before","tracker_after"],["Product Engineer","Applied","Interviewing"],26,53),
    claim("contact","A relevant fictional contact is visible.",["contact"],["Avery Chen","Senior Technical Recruiter","Northstar Labs"],58,94),
    // Grounded in the product's own proof rows, not our overlay. This claim used
    // to require demoContent.contact.reasons -- the exact strings the ReasonStack
    // chips render -- so it verified Gideon's own caption against itself and would
    // have passed even if the recording showed nothing. These two phrases appear
    // in the contact capture's DOM evidence and are legible in the card at the
    // claim frame; neither appears in any chip we draw.
    claim("relevance","The product's own proof rows explain why the contact is relevant.",["contact"],["Recruiting title at the target company","Current role at Northstar Labs"],109,135),
    claim("role","The role and company stay connected.",["opportunity"],["Product Engineer","Northstar Labs"],311,361),
    claim("draft","A grounded editable message is readable.",["outreach_complete"],["Product Engineer","Northstar Labs","technical hiring","Save Edit"],626,672),
    // Narrowed to the product's own controls. This also required "Nothing sends
    // without you", which is our line: it is spoken in the narration and drawn as
    // a chip, but it appears in no capture, so a third of this claim's evidence
    // was the film asserting its own promise. "Save Edit" and "Cancel" are the
    // product's controls and are what actually demonstrate that nothing sends on
    // its own. The promise still reaches the viewer through the narration and the
    // caption; it is simply no longer counted as proof of itself.
    claim("control","The product's own controls keep the message unsent and user-controlled.",["outreach_complete"],["Save Edit","Cancel"],786,858)
  ];
  const scenes:V22Scene[]=[
    scene("hook",0,26,narr("hook"),"hook",[],[],mascot("hook",26,"hero_close","happy","wide_open","wave","open_palm","camera","hook-status","emotion",[{atFrame:2,face:"surprised",holdFrames:9}]),"cut","Face-first greeting with a brief surprise accent","spoken",false,layouts("hero"),{recipe:"camera_push",scaleFrom:1.14,scaleTo:1.28,focus:{x:.5,y:.34},semanticTarget:"eyes"},"clay"),
    scene("status",26,58,"","status",["tracker_before","tracker_after"],["status"],mascot("status",32,"host","happy","small_open","presentation_palm","true_point_right","product","interview-control","attention"),"cut","Applied → click → Interviewing","product_annotation",false,layouts("split"),{recipe:"control_to_result",scaleFrom:1.7,scaleTo:2.05,focus:{x:.76,y:.62},semanticTarget:"Interviewing"},"paper"),
    scene("contact",58,109,"","contact",["contact"],["contact"],mascot("contact",51,"host","friendly","small_open","open_palm","true_point_right","product","avery-card","attention"),"slide","Opportunity indicator becomes contact card","product_annotation",false,layouts("split"),{recipe:"card_extract",scaleFrom:1.5,scaleTo:1.85,focus:{x:.28,y:.67},semanticTarget:"Avery Chen"},"slate"),
    scene("reasons",109,141,"","reasons",["contact"],["relevance"],mascot("reasons",32,"host","focused","neutral_dash","true_point_left","presentation_palm","product","reasons","interpretation"),"cut","Three evidence cards expand from product","product_annotation",false,layouts("split"),{recipe:"evidence_steps",scaleFrom:1.65,scaleTo:1.95,focus:{x:.27,y:.76},semanticTarget:"relevance proof"},"blush"),
    scene("friction",141,173,narr("friction"),"friction",[],[],mascot("friction",32,"host","concerned","concerned_curve","stop_palm","open_palm","camera","crowding-tabs","emotion"),"cut","Tabs crowd and recoil the presenter","editorial_peak",true,layouts("host"),{recipe:"recoil",scaleFrom:1,scaleTo:1.06,focus:{x:.5,y:.45},semanticTarget:"mascot"},"espresso"),
    scene("five",173,270,narr("five"),"five_surfaces",["opportunity","contact","outreach_blank"],[],mascot("five",97,"absent","skeptical","neutral_dash","thinking_hand","stop_palm","product","five-surfaces","interpretation"),"object_wipe","Five realistic tools copy one role","editorial_peak",true,layouts("product"),{recipe:"copy_chain",scaleFrom:1.05,scaleTo:1.32,focus:{x:.48,y:.47},semanticTarget:"5× context"},"blush"),
    scene("collapse",270,311,"","collapse",["opportunity"],[],mascot("collapse",41,"host","focused","small_open","presentation_palm","approval","product","opportunity-card","transition"),"object_wipe","Five fragments collapse into opportunity","editorial_peak",true,layouts("split"),{recipe:"fragments_to_object",scaleFrom:.9,scaleTo:1.25,focus:{x:.5,y:.48},semanticTarget:"opportunity"},"slate"),
    scene("role",311,379,narr("role"),"role",["opportunity","contact"],["role"],mascot("role",68,"host","focused","small_open","true_point_left","presentation_palm","product","role-company","attention"),"cut","Opportunity object carries into evidence","product_annotation",false,layouts("split"),{recipe:"object_follow",scaleFrom:1.42,scaleTo:1.7,focus:{x:.25,y:.3},semanticTarget:"Product Engineer at Northstar Labs"},"paper"),
    scene("reason",379,449,narr("reason"),"reasons",["contact"],["contact","relevance"],mascot("reason",70,"host","focused","small_open","presentation_palm","true_point_right","product","avery-proof","interpretation"),"cut","Contact and proof become one object","product_annotation",false,layouts("split"),{recipe:"proof_attach",scaleFrom:1.55,scaleTo:1.92,focus:{x:.25,y:.7},semanticTarget:"Avery evidence"},"espresso"),
    scene("signature",449,508,narr("signature"),"signature",["opportunity","contact","outreach_blank","outreach_complete"],["role","contact"],mascot("signature",59,"host","happy","confident_smile","presentation_palm","true_point_left","product","context-flow","transition"),"object_wipe","JOB → PERSON opens the chain","editorial_peak",true,layouts("split"),{recipe:"semantic_follow",scaleFrom:1,scaleTo:1.12,focus:{x:.52,y:.48},semanticTarget:"job to person"},"clay",449),
    scene("signature_proof",508,626,"","signature",["contact","outreach_blank","outreach_complete"],["relevance","draft"],mascot("signature_proof",118,"host","focused","confident_smile","presentation_palm","true_point_left","product","context-flow","transition"),"cut","Proof joins the chain and resolves into the message","editorial_peak",true,layouts("split"),{recipe:"semantic_follow",scaleFrom:1.12,scaleTo:1.30,focus:{x:.52,y:.48},semanticTarget:"evidence into message"},"slate",449),
    scene("draft",626,690,"","draft",["outreach_blank","outreach_complete"],["draft"],mascot("draft",64,"absent","focused","neutral_dash","rest_mitt","rest_mitt","product","draft-line","none"),"cut","Blank editor becomes grounded sentence","product_annotation",false,layouts("product"),{recipe:"sentence_build",scaleFrom:1.65,scaleTo:2.05,focus:{x:.63,y:.47},semanticTarget:"grounded sentence"},"paper"),
    scene("grounded",690,786,narr("grounded"),"grounded",["outreach_blank","outreach_complete"],["draft"],mascot("grounded",96,"host","skeptical","confident_smile","stop_palm","approval","product","sentence-compare","interpretation"),"cut","Generic sentence morphs into grounded sentence","editorial_peak",false,layouts("split"),{recipe:"text_morph",scaleFrom:1.7,scaleTo:2.08,focus:{x:.61,y:.47},semanticTarget:"inserted context"},"espresso"),
    scene("control",786,882,narr("control"),"control",["outreach_complete"],["control"],mascot("control",96,"host","direct_cta","neutral_dash","stop_palm","true_point_right","product","save-edit","interpretation"),"cut","Edit one word, click Save Edit, leave send untouched","product_annotation",false,layouts("split"),{recipe:"edit_then_hold",scaleFrom:1.7,scaleTo:2.0,focus:{x:.62,y:.66},semanticTarget:"Save Edit and Cancel"},"paper"),
    scene("payoff",882,995,narr("payoff"),"payoff",["tracker_after","opportunity","contact","outreach_complete"],["status","role","contact","relevance","draft","control"],mascot("payoff",113,"absent","happy","closed_smile","rest_mitt","rest_mitt","product","connected-result","none"),"object_wipe","Disconnected surfaces collapse into one combined proof state","editorial_peak",true,layouts("product"),{recipe:"before_after_collapse",scaleFrom:.82,scaleTo:1.16,focus:{x:.5,y:.48},semanticTarget:"combined result"},"slate"),
    scene("result",995,1027,"","result",["tracker_after","contact","outreach_complete"],["status","contact","relevance","draft"],mascot("result",32,"host","happy","wide_open","celebration","approval","product","connected-result","payoff_reaction"),"cut","Result holds while mascot celebrates after proof","editorial_peak",false,layouts("split"),{recipe:"result_reframe",scaleFrom:1.08,scaleTo:1.28,focus:{x:.5,y:.42},semanticTarget:"one connected next step"},"blush"),
    scene("cta",1027,1129,narr("cta"),"cta",[],[],mascot("cta",102,"host","direct_cta","confident_smile","presentation_palm","wave","cta","comment-keyword","cta"),"cut","Look, present keyword, wave, confirm, return gaze, wink","cta",false,layouts("cta"),{recipe:"comment_performance",scaleFrom:1.08,scaleTo:1.18,focus:{x:.5,y:.42},semanticTarget:"comment keyword"},"sky"),
    scene("sting",1129,1155,"","sting",[],[],mascot("sting",26,"host","wink","closed_smile","wave","rest_mitt","camera","solomon-mark","cta"),"cut","Bookmark pulse resolves into Solomon mark","cta",false,layouts("split"),{recipe:"pulse_to_mark",scaleFrom:1,scaleTo:1.06,focus:{x:.5,y:.5},semanticTarget:"Solomon"},"ink")
  ];
  const captions:V22Caption[]=freshCompiled.captions;
  const creativeDirector:V22CreativeDirector={version:"v22.1",primaryPromise:"Turn one job opportunity into one evidence-grounded next step.",hook:SOLOMON_CREATOR_STORY_V22_HOOK,problem:"Rebuilding the same job context across five disconnected tools.",mechanism:"JOB → PERSON → PROOF → MESSAGE",payoff:"ONE CONNECTED NEXT STEP",trustBoundary:"NOTHING SENDS WITHOUT YOU",cta:SOLOMON_CREATOR_STORY_V22_CTA,emotionalArc:["surprise","frustration","clarity","proof","confidence","control","payoff","direct_action"]};
  const manifest:SolomonCreatorStoryV22Manifest={schemaVersion:"17",id:SOLOMON_CREATOR_STORY_V22_ID,canvas:{width:1080,height:1920,fps:30,durationInFrames:1155},creativeDirector,distributionObjective:{brand:"Solomon",action:"comment",ctaText:SOLOMON_CREATOR_STORY_V22_CTA,ctaSpoken:SOLOMON_CREATOR_STORY_V22_CTA_SPOKEN,ctaKeyword:SOLOMON_CREATOR_STORY_V22_CTA_KEYWORD,destinationVerified:false,commentDeliveryVerified:false,accountIdentity:"SOLOMON"},script:SOLOMON_CREATOR_STORY_V22_SCRIPT,headlines:freshCompiled.headlines,numeralAnchors:freshCompiled.numeralAnchors,demoContent,sources,claims,scenes,captions,mascotGeometry:SOLOMON_MASCOT_V22_GEOMETRY,regenerationLineage:{parentVersion:"21",parentMasterSha256,reviewRequired:true},release:{generatedMediaPrivate:true,publicReleaseApproved:false,humanConfirmations:["mascot appeal and brand fit","voice naturalness and emotional performance","grounded fictional message quality","physical-phone readability","proof credibility","disclosure clarity","CTA appropriateness","Solomon brand/legal approval","demo-footage publication permission","synthetic-presenter disclosure policy","overall reference-quality judgment"]}};
  assertSolomonCreatorStoryV22Manifest(manifest);return manifest;
}

export function auditSolomonCreatorStoryV22(manifest:SolomonCreatorStoryV22Manifest){
  const narration=manifest.scenes.map(({narration})=>narration).filter(Boolean).join(" "),words=manifest.script.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/g)?.length??0,wpm=words/(1155/30/60);
  const semantic=manifest.scenes.map((scene)=>({sceneId:scene.id,...auditV22SemanticMotion(scene.semanticEvents,scene.from,scene.to)}));
  const transitions=auditV22Transitions(manifest.scenes.slice(1).map(({transition})=>transition));
  const mascot=auditMascotPerformanceV22(manifest.scenes.map(({mascot})=>mascot));
  const hook=auditV22Hook(manifest.creativeDirector.hook,manifest.headlines["hook"]),cta=auditV22Cta({...manifest.distributionObjective,text:manifest.distributionObjective.ctaText,spoken:manifest.distributionObjective.ctaSpoken,keyword:manifest.distributionObjective.ctaKeyword});
  const captionLints=auditV22Captions(manifest.captions),numeralAnchors=auditV22NumeralAnchors(manifest.numeralAnchors,manifest.script,manifest.headlines);
  const bounds=auditV22RenderedBounds(manifest.scenes.map((scene)=>({id:scene.id,layout:scene.layout,camera:scene.camera,mascotRole:scene.mascot.role})));
  const backdropCadence=auditV22BackdropCadence(manifest.scenes.map(({id,backdrop})=>({id,backdrop})));
  const mascotPlacement=auditV22MascotPlacement(manifest.scenes.map((scene)=>({id:scene.id,layout:scene.layout,mascotRole:scene.mascot.role})));
  const story=auditV22StoryConsistency({previousStage:manifest.demoContent.opportunity.previousStage,resultStage:manifest.demoContent.opportunity.resultStage,resultInterviewingCount:1,actionVisible:true,contact:manifest.demoContent.contact,opportunity:manifest.demoContent.opportunity,message:manifest.demoContent.message});
  const banned=auditV22BannedStrings(manifest.demoContent.message.body,manifest.demoContent.disclosure);
  const layout=manifest.scenes.map(({id,layout})=>({sceneId:id,...auditV22Layout(layout)}));
  const fingerprints:V22CompositionFingerprint[]=manifest.scenes.map((scene)=>({frame:scene.from,product:scene.layout.find(({kind})=>kind==="product")??null,mascot:scene.layout.find(({kind})=>kind==="mascot")??null,background:scene.conceptual?`conceptual-${scene.family}`:"product",cameraScale:scene.camera.scaleTo,semanticState:scene.camera.semanticTarget}));
  const similarity=auditV22CompositionSimilarity(fingerprints);
  const phone=auditV22PhoneScale({requiredTextCoverage:1,primaryFocalPoints:2,contactReadable:true,messageReadable:true,mascotFaceReadable:true,captionCollisionCount:0,evidencePixelsArePrimary:false});
  const sourceIds=new Set(manifest.sources.map(({id})=>id),),missingSources=(["tracker_before","tracker_after","opportunity","contact","outreach_blank","outreach_complete"] as V22AssetId[]).filter((id)=>!sourceIds.has(id));
  const passed=narration===manifest.script&&words>=112&&words<=122&&wpm>=170&&wpm<=192&&semantic.every(({passed:ok})=>ok)&&transitions.passed&&mascot.passed&&hook.passed&&cta.passed&&captionLints.passed&&numeralAnchors.passed&&bounds.passed&&mascotPlacement.passed&&backdropCadence.passed&&story.passed&&banned.passed&&layout.every(({passed:ok})=>ok)&&similarity.passed&&phone.passed&&missingSources.length===0;
  return{passed,narrationExact:narration===manifest.script,words,wpm,semantic,transitions,mascot,hook,cta,captionLints,numeralAnchors,bounds,mascotPlacement,backdropCadence,story,banned,layout,similarity,phone,missingSources};
}

export function assertSolomonCreatorStoryV22Manifest(manifest:SolomonCreatorStoryV22Manifest){
  z.object({schemaVersion:z.literal("17"),id:z.literal(SOLOMON_CREATOR_STORY_V22_ID),sources:z.array(z.unknown()).length(6),claims:z.array(z.unknown()).min(6),scenes:z.array(z.unknown()).length(18),captions:z.array(z.unknown()).min(7)}).parse(manifest);
  manifest.scenes.forEach((scene,index)=>{if(scene.from!==(index?manifest.scenes[index-1]!.to:0)||scene.to<=scene.from)throw new Error(`V22 scene ${scene.id} is not contiguous.`);v22MascotPerformanceSchema.parse(scene.mascot);});
  if(manifest.scenes.at(-1)?.to!==1155)throw new Error("V22 timeline must end at frame 1155.");
  const audit=auditSolomonCreatorStoryV22(manifest);if(!audit.passed)throw new Error(`V22 contract failed: ${JSON.stringify(audit)}`);
}

function claim(id:string,clause:string,assetIds:V22AssetId[],requiredReadableText:string[],actionFrame:number,resultFrame:number):V22Claim{return{id,clause,assetIds,requiredReadableText,actionFrame,resultFrame,approved:true};}
function scene(id:string,from:number,to:number,narration:string,family:V22Family,assetIds:V22AssetId[],claimIds:string[],mascotPlan:V22MascotPerformance,transition:V22Scene["transition"]["type"],proofRecipe:string,typography:V22Scene["typography"],conceptual:boolean,layout:V22Rect[],camera:V22Scene["camera"],backdrop:V22BackdropToken,groupFrom=from):V22Scene{return{id,from,to,narration,family,assetIds,claimIds,mascot:mascotPlan,semanticEvents:events(from,to,id),transition:{type:transition,purpose:`Advance ${id} through ${proofRecipe}`},layout,camera,proofRecipe,typography,conceptual,backdrop,groupFrom};}
// Exported because the render script re-derives scene spans from the realized
// narration: a scene that stretches must regenerate its markers at this cadence,
// not rescale them, or the 18-frame spacing grows past auditV22SemanticMotion's
// 24-frame ceiling. One definition, so the two cannot drift apart.
export function v22SemanticEvents(from:number,to:number,id:string):V22SemanticEvent[]{const result=[];for(let frame=from;frame<to;frame+=18)result.push({frame,kind:"semantic" as const,description:`${id} semantic state ${result.length+1}`});return result;}
const events=v22SemanticEvents;
function mascot(sceneId:string,duration:number,role:V22MascotPerformance["role"],face:V22Face,mouthBias:V22Mouth,leftGesture:V22Gesture,rightGesture:V22Gesture,target:"camera"|"product"|"caption"|"cta",elementId:string,purpose:V22MascotPerformance["narrativePurpose"],faceAccents?:V22MascotPerformance["faceAccents"]):V22MascotPerformance{const absent=role==="absent";return v22MascotPerformanceSchema.parse({sceneId,role,narrativePurpose:purpose,face,mouthBias,faceAccents,gazePath:absent?[{frame:0,target:"camera",x:.5,y:.4}]:[{frame:0,target:"camera",x:.5,y:.4},{frame:3,target,x:target==="cta"?.72:target==="product"?.68:.5,y:target==="cta"?.68:.42}],head:{turn:target==="product"?.42:target==="cta"?.3:0,tilt:sceneId.length%2?.12:-.1,beats:[4,Math.max(8,Math.floor(duration*.55))]},torso:{lean:(faceAccents??[]).some(({face:accent})=>accent==="surprised")?.58:face==="concerned"?-.38:.25,rotate:sceneId.length%2?.12:-.1,recoil:face==="concerned"?.55:.12},left:{gesture:leftGesture,timing:{start:5,peak:Math.min(duration-8,Math.max(11,Math.floor(duration*.32))),recover:Math.min(duration-2,Math.max(18,Math.floor(duration*.74))),wristRotation:14}},right:{gesture:rightGesture,timing:{start:8,peak:Math.min(duration-5,Math.max(16,Math.floor(duration*.48))),recover:Math.min(duration-1,Math.max(22,Math.floor(duration*.86))),wristRotation:-18}},blinkFrames:[Math.max(10,Math.floor(duration*.43)),Math.max(14,Math.floor(duration*.43)+2)],audioFrames:Array.from({length:duration},(_,frame)=>({frame,rms:frame%7===0?.16:.42,speaking:!absent,onset:frame%17===3?.7:.06,phraseBoundary:frame%29===0})),interactionTarget:absent?undefined:{elementId,x:target==="cta"?.72:.68,y:target==="cta"?.68:.42,action:`${leftGesture}/${rightGesture}`}});}
function layouts(mode:"hero"|"host"|"left"|"right"|"product"|"cta"|"split"):V22Rect[]{const caption:V22Rect={id:"caption",kind:"caption",left:.05,top:.04,right:.95,bottom:.16};
// `split` is the reference composition: product above, presenter below, sharing
// the frame. V21 only offered `left`/`right`, whose mascot rect is a .30x.28
// bottom corner — a 7.2% cameo that ran for 71% of frames, giving a frame-weighted
// mascot occupancy of 8.3%. The reference videos keep their presenter on screen
// 45-68% of frames at far larger scale and cut between face and screen; Gideon
// read as product footage with a mascot watermark.
//
// mascotBoxForScene fits min(.56*1080/660, .45*1920/940) = .9164, so the rig lands
// at 25.1% of the frame. Every boundary here is solved rather than eyeballed,
// because this is the change class that produced both the V11 proof-text overlap
// and the V17 CTA occlusion:
//
//   caption ends   .16  * 1920 =  307.2
//   product ends   .60  * 1920 = 1152.0
//   antenna top                = 1196.0   (44.0px clear of the product)
//   mascot box top .64  * 1920 = 1228.8
//   rig bottom     .975 * 1920 = 1872.0   (projects to ~1902 under the camera)
//
// Three constraints bind here, and the first attempt violated all three.
//
// The antenna: the rig's svg is overflow:visible and the antenna draws ~48px above
// the declared box (32.8px at this scale), so a mascot rect that merely abuts the
// product rect still paints into it. That overhang is what V22_RIG_BLEED models.
//
// The canvas floor: rects are projected through the camera envelope before the
// bounds check, so a mascot bottom of .99 projected to 1926.6 and crossed the 1920
// edge in all twelve split scenes. auditV22RenderedBounds caught that before any
// render — .975 is the deepest the rig can sit and still project inside.
//
// And the binding one: the scene components draw full-frame. Measured from the V21
// master, their content occupies 65-83% of frame height in every split scene, so
// there is no reserved band to give the mascot — anything below ~.64 paints over
// real proof. This scale (14.0% of frame) is what coexists with the compositions
// as they are; it is a 69% lift on V21's 8.3% but short of the 20-25% the reference
// presenter occupies. Closing the rest means re-composing the scenes as short, wide
// layouts, which is a change to thirteen components rather than to this rect.
if(mode==="split")return[{id:"product",kind:"product",left:.04,top:.17,right:.96,bottom:.54},{id:"mascot",kind:"mascot",left:.23,top:.56,right:.77,bottom:.975},caption];
// The CTA is the only scene where the mascot shares the frame with interactive
// social UI. V16 reused "host", whose mascot rect spans .18-.78 vertically, so
// the rig's torso landed squarely on the comment box. Nothing caught it because
// no scene had ever declared a `cta` rect, leaving forbidden()'s mascot x cta
// pair as dead code. These bands are non-overlapping by construction, and the
// mascot rect is deliberately width-limited so the fitted rig leaves ~50px of
// top slack for the antenna, which bleeds ~48px above the rig box.
if(mode==="cta")return[{id:"mascot",kind:"mascot",left:.27,top:.22,right:.73,bottom:.615},{id:"cta-comment",kind:"cta",left:.09,top:.645,right:.91,bottom:.80},{id:"cta-handle",kind:"cta",left:.30,top:.845,right:.70,bottom:.895},caption];
if(mode==="hero"||mode==="host")return[{id:"mascot",kind:"mascot",left:.18,top:.18,right:.82,bottom:.78},caption];if(mode==="product")return[{id:"product",kind:"product",left:.06,top:.18,right:.94,bottom:.78},caption];return mode==="left"?[{id:"mascot",kind:"mascot",left:.02,top:.7,right:.32,bottom:.98},{id:"product",kind:"product",left:.38,top:.18,right:.96,bottom:.68},caption]:[{id:"mascot",kind:"mascot",left:.68,top:.7,right:.98,bottom:.98},{id:"product",kind:"product",left:.04,top:.18,right:.62,bottom:.68},caption];}
