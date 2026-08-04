export const V11_BANNED_PRIMARY_STRINGS = [
  "seeded fixture",
  "no model was called",
  "synthetic proof attached",
  "demo draft",
  "placeholder",
  "conceptual connection"
] as const;

export interface V11SemanticEvent { frame: number; kind: "semantic" | "decorative"; description: string }
export interface V11Rect { id: string; kind: "mascot" | "caption" | "editorial" | "product" | "annotation" | "cta" | "social_ui"; left: number; top: number; right: number; bottom: number }
export interface V11CompositionFingerprint { frame: number; product: V11Rect | null; mascot: V11Rect | null; background: string; cameraScale: number; semanticState: string }

export function auditV11BannedStrings(primaryOcr: string, disclosureOcr: string) {
  const normalized = normalize(primaryOcr);
  const matches = V11_BANNED_PRIMARY_STRINGS.filter((value) => normalized.includes(normalize(value)));
  const disclosureMatches = disclosureOcr.match(/demo\s+data/gi) ?? [];
  return { passed: matches.length === 0 && disclosureMatches.length === 1, matches, disclosureCount: disclosureMatches.length };
}

export function auditV11StoryConsistency(input: {
  previousStage: string;
  resultStage: string;
  resultInterviewingCount: number;
  actionVisible: boolean;
  contact: { name: string; role: string; company: string; reasons: string[] };
  opportunity: { title: string; company: string };
  message: { body: string; editable: boolean; sent: boolean; controls: string[] };
}) {
  const normalizedMessage = normalize(input.message.body);
  const failures = [
    normalize(input.previousStage) === "interviewing" ? "missing_previous_state" : undefined,
    normalize(input.resultStage) !== "interviewing" || input.resultInterviewingCount < 1 ? "missing_interviewing_result" : undefined,
    !input.actionVisible ? "missing_trigger" : undefined,
    !input.contact.name || !input.contact.role || input.contact.company !== input.opportunity.company || input.contact.reasons.length < 3 ? "incomplete_contact_evidence" : undefined,
    !normalizedMessage.includes(normalize(input.opportunity.title)) || !normalizedMessage.includes(normalize(input.opportunity.company)) || !normalizedMessage.includes("technical hiring") ? "ungrounded_message" : undefined,
    !input.message.editable || input.message.sent || !input.message.controls.includes("Save Edit") || !input.message.controls.includes("Cancel") ? "missing_human_control" : undefined
  ].filter((value): value is string => Boolean(value));
  return { passed: failures.length === 0, failures };
}

export function auditV11Hook(spoken: string, headline?: { primary: string; accentItalic: string }) {
  const normalized = normalize(spoken);
  const words = normalized.split(" ").filter(Boolean);
  const failures = [
    !/\byou\b|\byour\b/.test(normalized) ? "hook_not_second_person" : undefined,
    normalized.startsWith("this ") ? "hook_starts_product_first" : undefined,
    words.length > 14 ? "hook_over_14_words" : undefined,
    headline && !normalized.includes(normalize(`${headline.primary} ${headline.accentItalic}`)) ? "hook_headline_not_spoken" : undefined,
  ].filter((value): value is string => Boolean(value));
  return { passed: failures.length === 0, failures, spoken: normalized };
}

export function auditV11Cta(input: { text: string; spoken: string; keyword: string; action: string; brand: string; accountIdentity: string; destinationVerified: boolean; commentDeliveryVerified: boolean }) {
  const normalizedSpoken = normalize(input.spoken);
  const failures = [
    input.action !== "comment" ? "cta_action_not_comment" : undefined,
    !input.text.includes(input.keyword) ? "cta_display_missing_keyword" : undefined,
    !normalizedSpoken.includes(normalize(input.keyword)) ? "cta_spoken_missing_keyword" : undefined,
    !/\bsend\b|\bshow\b/.test(normalizedSpoken) ? "cta_missing_delivery_promise" : undefined,
    input.brand !== "Solomon" || input.accountIdentity !== "SOLOMON" ? "cta_brand_mismatch" : undefined,
  ].filter((value): value is string => Boolean(value));
  // Comment delivery is a real-world capability, not a template property: it is
  // reported here and enforced as a blocked_external_confirmation render gate.
  const deliveryVerificationPending = !input.commentDeliveryVerified;
  return { passed: failures.length === 0, failures, deliveryVerificationPending };
}

export function auditV11Captions(captions: Array<{ id: string; from: number; to: number; beatText: string; highlight?: string }>) {
  const failures: string[] = [];
  for (const caption of captions) {
    const words = caption.beatText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
    if (words.length > 4) failures.push(`${caption.id}:chip_over_4_words`);
    if (caption.beatText !== caption.beatText.toUpperCase()) failures.push(`${caption.id}:chip_not_uppercase`);
    if (caption.highlight !== undefined) {
      if (!caption.beatText.toLowerCase().includes(caption.highlight.toLowerCase())) failures.push(`${caption.id}:highlight_not_substring`);
    }
    if (!(caption.from < caption.to) || caption.from < 0 || caption.to > 1080) failures.push(`${caption.id}:invalid_window`);
  }
  return { passed: failures.length === 0, failures };
}

export function auditV11NumeralAnchors(anchors: Array<{ graphic: string; spokenToken: string; sceneId: string }>, script: string, headlines: Record<string, { primary: string; accentItalic: string }>) {
  const normalizedScript = normalize(script);
  const failures: string[] = [];
  for (const anchor of anchors) {
    if (!normalizedScript.includes(normalize(anchor.spokenToken))) failures.push(`${anchor.sceneId}:anchor_token_not_spoken`);
  }
  for (const [sceneId, headline] of Object.entries(headlines)) {
    const numerals = `${headline.primary} ${headline.accentItalic}`.match(/\d+×|\b\d+\b/g) ?? [];
    for (const numeral of numerals) {
      if (!anchors.some((anchor) => anchor.graphic === numeral)) failures.push(`${sceneId}:numeral_without_anchor:${numeral}`);
    }
  }
  return { passed: failures.length === 0, failures };
}

export function auditV11SemanticMotion(events: V11SemanticEvent[], start: number, end: number, maximumGapFrames = 24) {
  const semantic = events.filter(({kind,frame}) => kind === "semantic" && frame >= start && frame <= end).sort((a,b) => a.frame-b.frame);
  const frames = [start, ...semantic.map(({frame}) => frame), end];
  const gaps = frames.slice(1).map((to,index) => ({from:frames[index]!,to,gap:to-frames[index]!})).filter(({gap}) => gap > maximumGapFrames);
  return { passed: semantic.length > 0 && gaps.length === 0, semanticCount:semantic.length, decorativeCount:events.filter(({kind}) => kind === "decorative").length, gaps };
}

export function auditV11Transitions(transitions: Array<{type:"cut"|"slide"|"match_cut"|"object_wipe"|"dissolve";purpose:string}>, maximumDissolves = 2) {
  const dissolves = transitions.filter(({type}) => type === "dissolve");
  const decisive = transitions.filter(({type}) => type === "cut" || type === "slide" || type === "match_cut" || type === "object_wipe");
  const failures = [dissolves.length > maximumDissolves ? "dissolve_budget" : undefined, decisive.length < transitions.length-maximumDissolves ? "insufficient_decisive_transitions" : undefined, transitions.some(({purpose})=>!purpose.trim()) ? "missing_transition_purpose" : undefined].filter((value):value is string=>Boolean(value));
  return { passed:failures.length===0,dissolveCount:dissolves.length,decisiveCount:decisive.length,failures };
}

export function auditV11Layout(rectangles: V11Rect[]) {
  const collisions = rectangles.flatMap((left,index)=>rectangles.slice(index+1).flatMap((right)=>intersects(left,right)&&forbidden(left.kind,right.kind)?[{left:left.id,right:right.id,leftKind:left.kind,rightKind:right.kind}]:[]));
  return { passed:collisions.length===0,collisionCount:collisions.length,collisions };
}

export function auditV11CompositionSimilarity(fingerprints: V11CompositionFingerprint[], maximumUnchangedFrames = 60) {
  const repeats=[] as Array<{from:number;to:number;durationFrames:number;semanticState:string}>;
  let start=0;
  for(let index=1;index<=fingerprints.length;index+=1){
    const previous=fingerprints[index-1];
    const current=fingerprints[index];
    if(current&&previous&&sameFingerprint(previous,current))continue;
    if(previous&&index-start>1){const duration=previous.frame-fingerprints[start]!.frame;if(duration>maximumUnchangedFrames)repeats.push({from:fingerprints[start]!.frame,to:previous.frame,durationFrames:duration,semanticState:previous.semanticState});}
    start=index;
  }
  return { passed:repeats.length===0,repeats,maximumUnchangedFrames };
}

export function auditV11PhoneScale(input:{requiredTextCoverage:number;primaryFocalPoints:number;contactReadable:boolean;messageReadable:boolean;mascotFaceReadable:boolean;captionCollisionCount:number;evidencePixelsArePrimary:boolean}){
  const failures=[input.requiredTextCoverage<.9?"required_text":undefined,input.primaryFocalPoints>2?"too_many_focal_points":undefined,!input.contactReadable?"contact_small":undefined,!input.messageReadable?"message_small":undefined,!input.mascotFaceReadable?"mascot_face_small":undefined,input.captionCollisionCount>0?"caption_collision":undefined,input.evidencePixelsArePrimary?"labels_replace_proof":undefined].filter((value):value is string=>Boolean(value));
  return{passed:failures.length===0,failures};
}

function sameFingerprint(left:V11CompositionFingerprint,right:V11CompositionFingerprint){return left.background===right.background&&left.semanticState===right.semanticState&&Math.abs(left.cameraScale-right.cameraScale)<.03&&sameRect(left.product,right.product)&&sameRect(left.mascot,right.mascot);}
function sameRect(left:V11Rect|null,right:V11Rect|null){if(!left||!right)return left===right;return Math.abs(left.left-right.left)<.03&&Math.abs(left.top-right.top)<.03&&Math.abs(left.right-right.right)<.03&&Math.abs(left.bottom-right.bottom)<.03;}
function intersects(left:V11Rect,right:V11Rect){return left.left<right.right&&left.right>right.left&&left.top<right.bottom&&left.bottom>right.top;}
function forbidden(left:V11Rect["kind"],right:V11Rect["kind"]){const pair=new Set([left,right]);return pair.has("mascot")&&(pair.has("caption")||pair.has("editorial")||pair.has("product")||pair.has("annotation")||pair.has("cta"))||pair.has("product")&&(pair.has("caption")||pair.has("annotation")||pair.has("social_ui"));}
function normalize(value:string){return value.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();}

// Shared by the renderer and the audit: the camera may only move inside this
// envelope, and no content rectangle may leave the safe area under worst-case
// camera displacement. V10 combined a ~1.08 base scale with ±26px sway over
// layouts that already ended near x=1030, so windows crossed the frame edge
// mid-word and nothing measured it.
export const V11_CANVAS={width:1080,height:1920} as const;
// Chrome margins describe where the platform UI sits. They are reported, not
// hard-failed: the declared rectangles are a collision abstraction that
// intentionally reaches close to the edges.
export const V11_SAFE_AREA={marginPx:24,topChromePx:96,bottomChromePx:112} as const;
// The renderer must stay inside this envelope. It is deliberately much tighter
// than V10's effective camera (~1.08 scale with ±26px sway), which is how
// product windows ended up cropped mid-word.
export const V11_CAMERA_ENVELOPE={baseScaleMax:1.012,pushMax:.013,swayXMax:6,swayYMax:5,focusShiftMax:8} as const;

export interface V11CameraPlan{scaleFrom:number;scaleTo:number;focus:{x:number;y:number}}

// Worst-case displacement of a normalized rect under the camera envelope, in
// canvas pixels. Note that scaleFrom/scaleTo on a scene describe the *proof
// recipe* zoom, not the CSS transform the camera applies, so only the envelope
// scale is projected here.
export function projectRectUnderCamera(rect:V11Rect,camera:V11CameraPlan,envelope=V11_CAMERA_ENVELOPE,canvas=V11_CANVAS){
  const scale=envelope.baseScaleMax+envelope.pushMax;
  const originX=camera.focus.x*canvas.width,originY=camera.focus.y*canvas.height;
  const scaled=(value:number,origin:number)=>origin+(value-origin)*scale;
  const drift=envelope.swayXMax+envelope.focusShiftMax,driftY=envelope.swayYMax+envelope.focusShiftMax;
  return{
    left:scaled(rect.left*canvas.width,originX)-drift,
    right:scaled(rect.right*canvas.width,originX)+drift,
    top:scaled(rect.top*canvas.height,originY)-driftY,
    bottom:scaled(rect.bottom*canvas.height,originY)+driftY,
  };
}

export function auditV11RenderedBounds(scenes:Array<{id:string;layout:V11Rect[];camera:V11CameraPlan;mascotRole?:string}>,envelope=V11_CAMERA_ENVELOPE,safeArea=V11_SAFE_AREA,canvas=V11_CANVAS){
  const failures:string[]=[],chromeWarnings:string[]=[];
  const projections:Array<{sceneId:string;rectId:string;kind:string;projected:ReturnType<typeof projectRectUnderCamera>}>=[];
  for(const scene of scenes){
    const cameoPeek=scene.mascotRole==="cameo_left"||scene.mascotRole==="cameo_right";
    for(const rect of scene.layout){
      const projected=projectRectUnderCamera(rect,scene.camera,envelope,canvas);
      projections.push({sceneId:scene.id,rectId:rect.id,kind:rect.kind,projected});
      // A cameo mascot deliberately peeks past one edge.
      if(rect.kind==="mascot"&&cameoPeek)continue;
      // Hard failure: content the camera can push outside the canvas, which is
      // what crops a product window mid-word.
      if(projected.left<0)failures.push(`${scene.id}:${rect.id}:crosses_left`);
      if(projected.right>canvas.width)failures.push(`${scene.id}:${rect.id}:crosses_right`);
      if(projected.top<0)failures.push(`${scene.id}:${rect.id}:crosses_top`);
      if(projected.bottom>canvas.height)failures.push(`${scene.id}:${rect.id}:crosses_bottom`);
      if(projected.top<safeArea.topChromePx||projected.bottom>canvas.height-safeArea.bottomChromePx)chromeWarnings.push(`${scene.id}:${rect.id}:under_platform_chrome`);
    }
  }
  return{passed:failures.length===0,failures,chromeWarnings,projections};
}

// Motion is now banded on both sides. V10 inherited "beat the previous version"
// floors (median ≥ 4.5) which forced continuous camera drift and left 0% of
// frames calm; the references sit far lower with real calm windows.
export const V11_MOTION_BANDS={nearStaticFramePercent:[10,30],medianFrameChange:[1.2,3.5],continuousMovementExcludingCuts:[1.2,4],longestLowMotionSeconds:[0,2],majorTransitionPeakCount:[12,Number.POSITIVE_INFINITY]} as const;

export function evaluateV11MotionBands(motion:{nearStaticFramePercent:number;medianFrameChange:number;continuousMovementExcludingCuts:number;longestLowMotionSeconds:number;majorTransitionPeakCount:number},bands=V11_MOTION_BANDS){
  const checks=Object.entries(bands).map(([key,[low,high]])=>{
    const value=motion[key as keyof typeof motion];
    return{metric:key,value,low,high,passed:value>=low&&value<=high};
  });
  return{passed:checks.every(({passed})=>passed),checks};
}

