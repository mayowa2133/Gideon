export const V18_BANNED_PRIMARY_STRINGS = [
  "seeded fixture",
  "no model was called",
  "synthetic proof attached",
  "demo draft",
  "placeholder",
  "conceptual connection"
] as const;

export interface V18SemanticEvent { frame: number; kind: "semantic" | "decorative"; description: string }
export interface V18Rect { id: string; kind: "mascot" | "caption" | "editorial" | "product" | "annotation" | "cta" | "social_ui"; left: number; top: number; right: number; bottom: number }
export interface V18CompositionFingerprint { frame: number; product: V18Rect | null; mascot: V18Rect | null; background: string; cameraScale: number; semanticState: string }

export function auditV18BannedStrings(primaryOcr: string, disclosureOcr: string) {
  const normalized = normalize(primaryOcr);
  const matches = V18_BANNED_PRIMARY_STRINGS.filter((value) => normalized.includes(normalize(value)));
  const disclosureMatches = disclosureOcr.match(/demo\s+data/gi) ?? [];
  return { passed: matches.length === 0 && disclosureMatches.length === 1, matches, disclosureCount: disclosureMatches.length };
}

export function auditV18StoryConsistency(input: {
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

export function auditV18Hook(spoken: string, headline?: { primary: string; accentItalic: string }) {
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

export function auditV18Cta(input: { text: string; spoken: string; keyword: string; action: string; brand: string; accountIdentity: string; destinationVerified: boolean; commentDeliveryVerified: boolean }) {
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

export function auditV18Captions(captions: Array<{ id: string; from: number; to: number; beatText: string; highlight?: string }>) {
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

export function auditV18NumeralAnchors(anchors: Array<{ graphic: string; spokenToken: string; sceneId: string }>, script: string, headlines: Record<string, { primary: string; accentItalic: string }>) {
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

export function auditV18SemanticMotion(events: V18SemanticEvent[], start: number, end: number, maximumGapFrames = 24) {
  const semantic = events.filter(({kind,frame}) => kind === "semantic" && frame >= start && frame <= end).sort((a,b) => a.frame-b.frame);
  const frames = [start, ...semantic.map(({frame}) => frame), end];
  const gaps = frames.slice(1).map((to,index) => ({from:frames[index]!,to,gap:to-frames[index]!})).filter(({gap}) => gap > maximumGapFrames);
  return { passed: semantic.length > 0 && gaps.length === 0, semanticCount:semantic.length, decorativeCount:events.filter(({kind}) => kind === "decorative").length, gaps };
}

export function auditV18Transitions(transitions: Array<{type:"cut"|"slide"|"match_cut"|"object_wipe"|"dissolve";purpose:string}>, maximumDissolves = 2) {
  const dissolves = transitions.filter(({type}) => type === "dissolve");
  const decisive = transitions.filter(({type}) => type === "cut" || type === "slide" || type === "match_cut" || type === "object_wipe");
  const failures = [dissolves.length > maximumDissolves ? "dissolve_budget" : undefined, decisive.length < transitions.length-maximumDissolves ? "insufficient_decisive_transitions" : undefined, transitions.some(({purpose})=>!purpose.trim()) ? "missing_transition_purpose" : undefined].filter((value):value is string=>Boolean(value));
  return { passed:failures.length===0,dissolveCount:dissolves.length,decisiveCount:decisive.length,failures };
}

export function auditV18Layout(rectangles: V18Rect[]) {
  const collisions = rectangles.flatMap((left,index)=>rectangles.slice(index+1).flatMap((right)=>intersects(left,right)&&forbidden(left.kind,right.kind)?[{left:left.id,right:right.id,leftKind:left.kind,rightKind:right.kind}]:[]));
  return { passed:collisions.length===0,collisionCount:collisions.length,collisions };
}

export function auditV18CompositionSimilarity(fingerprints: V18CompositionFingerprint[], maximumUnchangedFrames = 60) {
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

export function auditV18PhoneScale(input:{requiredTextCoverage:number;primaryFocalPoints:number;contactReadable:boolean;messageReadable:boolean;mascotFaceReadable:boolean;captionCollisionCount:number;evidencePixelsArePrimary:boolean}){
  const failures=[input.requiredTextCoverage<.9?"required_text":undefined,input.primaryFocalPoints>2?"too_many_focal_points":undefined,!input.contactReadable?"contact_small":undefined,!input.messageReadable?"message_small":undefined,!input.mascotFaceReadable?"mascot_face_small":undefined,input.captionCollisionCount>0?"caption_collision":undefined,input.evidencePixelsArePrimary?"labels_replace_proof":undefined].filter((value):value is string=>Boolean(value));
  return{passed:failures.length===0,failures};
}

function sameFingerprint(left:V18CompositionFingerprint,right:V18CompositionFingerprint){return left.background===right.background&&left.semanticState===right.semanticState&&Math.abs(left.cameraScale-right.cameraScale)<.03&&sameRect(left.product,right.product)&&sameRect(left.mascot,right.mascot);}
function sameRect(left:V18Rect|null,right:V18Rect|null){if(!left||!right)return left===right;return Math.abs(left.left-right.left)<.03&&Math.abs(left.top-right.top)<.03&&Math.abs(left.right-right.right)<.03&&Math.abs(left.bottom-right.bottom)<.03;}
function intersects(left:V18Rect,right:V18Rect){return left.left<right.right&&left.right>right.left&&left.top<right.bottom&&left.bottom>right.top;}
function forbidden(left:V18Rect["kind"],right:V18Rect["kind"]){const pair=new Set([left,right]);return pair.has("mascot")&&(pair.has("caption")||pair.has("editorial")||pair.has("product")||pair.has("annotation")||pair.has("cta"))||pair.has("product")&&(pair.has("caption")||pair.has("annotation")||pair.has("social_ui"));}
function normalize(value:string){return value.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();}

// Shared by the renderer and the audit: the camera may only move inside this
// envelope, and no content rectangle may leave the safe area under worst-case
// camera displacement. V10 combined a ~1.08 base scale with ±26px sway over
// layouts that already ended near x=1030, so windows crossed the frame edge
// mid-word and nothing measured it.
export const V18_CANVAS={width:1080,height:1920} as const;
// Chrome margins describe where the platform UI sits. They are reported, not
// hard-failed: the declared rectangles are a collision abstraction that
// intentionally reaches close to the edges.
export const V18_SAFE_AREA={marginPx:24,topChromePx:96,bottomChromePx:112} as const;
// The renderer must stay inside this envelope. It is deliberately much tighter
// than V10's effective camera (~1.08 scale with ±26px sway), which is how
// product windows ended up cropped mid-word.
export const V18_CAMERA_ENVELOPE={baseScaleMax:1.012,pushMax:.013,swayXMax:6,swayYMax:5,focusShiftMax:8} as const;

// Top-zone caption chips occupy roughly y 70-200 once padding and line height
// are counted. A serif headline may not start inside that band: in V11 the
// signature scene's headline began at y=125 and collided with its own chip.
export const V18_TEXT_ZONES={captionTopBand:[70,200] as const,headlineTopMin:212} as const;

// The mascot rig's intrinsic size. Its on-screen box is solved from the scene's
// declared mascot rectangle so the renderer and the collision audit share one
// definition of where the host stands; in V11 they were independent and the rig
// drifted onto the proof labels while the audit still passed.
export const V18_RIG={width:660,height:940} as const;

export function mascotBoxForScene(scene:{layout:V18Rect[]}){
  const rect=scene.layout.find(({kind})=>kind==="mascot");
  if(!rect)return{x:0,y:0,scale:0};
  const left=rect.left*V18_CANVAS.width,top=rect.top*V18_CANVAS.height;
  const width=(rect.right-rect.left)*V18_CANVAS.width,height=(rect.bottom-rect.top)*V18_CANVAS.height;
  // Fit inside the declared rect, then bottom-align and centre horizontally so
  // the character stands on the rect's floor rather than floating in it.
  const scale=Math.min(width/V18_RIG.width,height/V18_RIG.height);
  return{x:left+(width-V18_RIG.width*scale)/2,y:top+(height-V18_RIG.height*scale),scale};
}

// Confirms the box the renderer will use stays inside the rect the manifest
// declares — the invariant that makes auditV18Layout's forbidden-pair collision
// check meaningful for what is actually on screen.
// The rig's svg is `overflow:visible` and the antenna draws ~48px above the rig
// box, so a mascot's declared rect understates what it actually paints. This is
// the second reason the V16 CTA broke uncaught: the antenna punched through the
// @SOLOMON pill while the placement audit still saw the box as compliant.
export const V18_RIG_BLEED={topPx:48} as const;

// Backdrop tokens, grouped by luma tier. V16 ran six scenes on an identical
// pale gradient and four more within ~15 luma of it; that pale-on-pale adjacency
// is why its scene boundaries scored 0.10-0.30 and collapsed to almost nothing at
// 0.30, while the reference videos plateau across every threshold. Hue alone does
// not move a scene-change score - luma tier does.
export const V18_BACKDROPS={
  paper:{tier:"bright",luma:243,css:"linear-gradient(145deg,#fdfbf5,#eef2ec)",foreground:"#07111f"},
  blush:{tier:"bright",luma:232,css:"linear-gradient(145deg,#fff3ee,#ffd8cc)",foreground:"#07111f"},
  mint:{tier:"mid",luma:152,css:"radial-gradient(circle at 50% 34%,#8fe6c8,#43ab8c)",foreground:"#07111f"},
  sky:{tier:"mid",luma:165,css:"linear-gradient(150deg,#a9cfe8,#5f93bd)",foreground:"#07111f"},
  teal:{tier:"deep",luma:57,css:"linear-gradient(160deg,#0e6f57,#053327)",foreground:"#f4fffb"},
  slate:{tier:"deep",luma:40,css:"linear-gradient(160deg,#22354a,#0a1522)",foreground:"#f2f7ff"},
  ink:{tier:"deep",luma:15,css:"#07111f",foreground:"#ffffff"},
} as const;
export type V18BackdropToken=keyof typeof V18_BACKDROPS;

// Every boundary must be a real luma change, which is what makes it register as a
// cut. Requiring both a different token and a different tier is the mechanical
// guarantee; without it a future edit can quietly reintroduce pale-on-pale runs.
export function auditV18BackdropCadence(scenes:Array<{id:string;backdrop:V18BackdropToken}>){
  const failures:string[]=[];
  scenes.forEach((scene,index)=>{
    if(index===0)return;
    const previous=scenes[index-1]!;
    if(scene.backdrop===previous.backdrop)failures.push(`${scene.id}:backdrop_repeats_previous`);
    else if(V18_BACKDROPS[scene.backdrop].tier===V18_BACKDROPS[previous.backdrop].tier)failures.push(`${scene.id}:tier_repeats_previous`);
  });
  return{passed:failures.length===0,failures};
}

// Shot density, calibrated from the three reference videos rather than from
// Gideon's own output, and measured after the cut-clustering fix so a 3-frame
// transition counts once. References: 27/18/15 shots over 53/36.3/38.2s =
// 0.392-0.509 shots/s, i.e. 14.1-18.3 shots for a 36s film. Bands carry +-1 shot.
// V16 by contrast sat at 15 shots whose boundaries collapsed above threshold 0.2.
export const V18_SHOT_BANDS={decodedShotCount:[13,20],meanShotSeconds:[1.7,2.7],medianShotSeconds:[1.4,2.4]} as const;

export function evaluateV18ShotBands(shots:{count:number;meanSeconds:number;medianSeconds:number}){
  const checks=[
    {metric:"decodedShotCount",value:shots.count,low:V18_SHOT_BANDS.decodedShotCount[0],high:V18_SHOT_BANDS.decodedShotCount[1]},
    {metric:"meanShotSeconds",value:shots.meanSeconds,low:V18_SHOT_BANDS.meanShotSeconds[0],high:V18_SHOT_BANDS.meanShotSeconds[1]},
    {metric:"medianShotSeconds",value:shots.medianSeconds,low:V18_SHOT_BANDS.medianShotSeconds[0],high:V18_SHOT_BANDS.medianShotSeconds[1]},
  ].map((check)=>({...check,passed:check.value>=check.low&&check.value<=check.high}));
  return{passed:checks.every(({passed})=>passed),checks};
}


export function auditV18MascotPlacement(scenes:Array<{id:string;layout:V18Rect[];mascotRole?:string}>){
  const failures:string[]=[],placements:Array<{sceneId:string;box:ReturnType<typeof mascotBoxForScene>;bleedTop:number}>=[];
  for(const scene of scenes){
    if(scene.mascotRole==="absent")continue;
    const rect=scene.layout.find(({kind})=>kind==="mascot");
    if(!rect){failures.push(`${scene.id}:mascot_rect_missing`);continue;}
    const box=mascotBoxForScene(scene);
    const bleedTop=box.y-V18_RIG_BLEED.topPx*box.scale;
    placements.push({sceneId:scene.id,box,bleedTop});
    if(box.scale<=0){failures.push(`${scene.id}:mascot_box_degenerate`);continue;}
    const right=box.x+V18_RIG.width*box.scale,bottom=box.y+V18_RIG.height*box.scale;
    const tolerance=1;
    if(box.x<rect.left*V18_CANVAS.width-tolerance)failures.push(`${scene.id}:mascot_left_of_declared_rect`);
    if(right>rect.right*V18_CANVAS.width+tolerance)failures.push(`${scene.id}:mascot_right_of_declared_rect`);
    if(box.y<rect.top*V18_CANVAS.height-tolerance)failures.push(`${scene.id}:mascot_above_declared_rect`);
    if(bottom>rect.bottom*V18_CANVAS.height+tolerance)failures.push(`${scene.id}:mascot_below_declared_rect`);
    // Bleed is reported for every scene but only fails against CTA bands: cameo
    // scenes legitimately bleed into empty canvas, whereas social UI is the
    // thing the viewer must act on and can never be crossed.
    for(const cta of scene.layout.filter(({kind})=>kind==="cta")){
      const overlapsY=bleedTop<cta.bottom*V18_CANVAS.height&&bottom>cta.top*V18_CANVAS.height;
      const overlapsX=box.x<cta.right*V18_CANVAS.width&&right>cta.left*V18_CANVAS.width;
      if(overlapsY&&overlapsX)failures.push(`${scene.id}:${cta.id}:mascot_bleed_over_cta`);
    }
  }
  return{passed:failures.length===0,failures,placements};
}

export interface V18CameraPlan{scaleFrom:number;scaleTo:number;focus:{x:number;y:number}}

// Worst-case displacement of a normalized rect under the camera envelope, in
// canvas pixels. Note that scaleFrom/scaleTo on a scene describe the *proof
// recipe* zoom, not the CSS transform the camera applies, so only the envelope
// scale is projected here.
export function projectRectUnderCamera(rect:V18Rect,camera:V18CameraPlan,envelope=V18_CAMERA_ENVELOPE,canvas=V18_CANVAS){
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

export function auditV18RenderedBounds(scenes:Array<{id:string;layout:V18Rect[];camera:V18CameraPlan;mascotRole?:string}>,envelope=V18_CAMERA_ENVELOPE,safeArea=V18_SAFE_AREA,canvas=V18_CANVAS){
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
// Ceilings recalibrated against the three reference videos. Measured on this very
// metric they score medianFrameChange 5.72 / 7.57 / 6.76, continuous 4.60 / 5.07 /
// 4.58 and longestLowMotion 3.4 / 3.2 / 3.2 - so all three would have FAILED V16's
// ceilings of 3.5 / 4 / 2. Those numbers were tuned to Gideon's own output rather
// than to the target, which is how a self-referential gate reported "in band"
// while the film looked nothing like the references.
// Floors are deliberately NOT raised: V18 does not reach reference continuous
// motion, and lifting them would force decorative drift - the exact V10 failure
// these bands were introduced to stop.
export const V18_MOTION_BANDS={nearStaticFramePercent:[10,30],medianFrameChange:[1.2,8],continuousMovementExcludingCuts:[1.2,5.5],longestLowMotionSeconds:[0,4],majorTransitionPeakCount:[12,Number.POSITIVE_INFINITY]} as const;

export function evaluateV18MotionBands(motion:{nearStaticFramePercent:number;medianFrameChange:number;continuousMovementExcludingCuts:number;longestLowMotionSeconds:number;majorTransitionPeakCount:number},bands=V18_MOTION_BANDS){
  const checks=Object.entries(bands).map(([key,[low,high]])=>{
    const value=motion[key as keyof typeof motion];
    return{metric:key,value,low,high,passed:value>=low&&value<=high};
  });
  return{passed:checks.every(({passed})=>passed),checks};
}

