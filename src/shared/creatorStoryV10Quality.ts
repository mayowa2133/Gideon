export const V10_BANNED_PRIMARY_STRINGS = [
  "seeded fixture",
  "no model was called",
  "synthetic proof attached",
  "demo draft",
  "placeholder",
  "conceptual connection"
] as const;

export interface V10SemanticEvent { frame: number; kind: "semantic" | "decorative"; description: string }
export interface V10Rect { id: string; kind: "mascot" | "caption" | "editorial" | "product" | "annotation" | "cta" | "social_ui"; left: number; top: number; right: number; bottom: number }
export interface V10CompositionFingerprint { frame: number; product: V10Rect | null; mascot: V10Rect | null; background: string; cameraScale: number; semanticState: string }

export function auditV10BannedStrings(primaryOcr: string, disclosureOcr: string) {
  const normalized = normalize(primaryOcr);
  const matches = V10_BANNED_PRIMARY_STRINGS.filter((value) => normalized.includes(normalize(value)));
  const disclosureMatches = disclosureOcr.match(/demo\s+data/gi) ?? [];
  return { passed: matches.length === 0 && disclosureMatches.length === 1, matches, disclosureCount: disclosureMatches.length };
}

export function auditV10StoryConsistency(input: {
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

export function auditV10Hook(spoken: string, locked: string) {
  return { passed: normalize(spoken) === normalize(locked), spoken: normalize(spoken), locked: normalize(locked) };
}

export function auditV10Cta(input: { text: string; action: string; brand: string; accountIdentity: string; destinationVerified: boolean; commentDeliveryVerified: boolean }) {
  const unsafeDelivery = /comment|dm|send you|link in bio|download|https?:\/\//i.test(input.text) && !(input.destinationVerified || input.commentDeliveryVerified);
  const passed = normalize(input.text) === "save for your next job search" && input.action === "save" && input.brand === "Solomon" && input.accountIdentity === "SOLOMON" && !unsafeDelivery;
  return { passed, unsafeDelivery };
}

export function auditV10SemanticMotion(events: V10SemanticEvent[], start: number, end: number, maximumGapFrames = 24) {
  const semantic = events.filter(({kind,frame}) => kind === "semantic" && frame >= start && frame <= end).sort((a,b) => a.frame-b.frame);
  const frames = [start, ...semantic.map(({frame}) => frame), end];
  const gaps = frames.slice(1).map((to,index) => ({from:frames[index]!,to,gap:to-frames[index]!})).filter(({gap}) => gap > maximumGapFrames);
  return { passed: semantic.length > 0 && gaps.length === 0, semanticCount:semantic.length, decorativeCount:events.filter(({kind}) => kind === "decorative").length, gaps };
}

export function auditV10Transitions(transitions: Array<{type:"cut"|"slide"|"match_cut"|"object_wipe"|"dissolve";purpose:string}>, maximumDissolves = 2) {
  const dissolves = transitions.filter(({type}) => type === "dissolve");
  const decisive = transitions.filter(({type}) => type === "cut" || type === "slide" || type === "match_cut" || type === "object_wipe");
  const failures = [dissolves.length > maximumDissolves ? "dissolve_budget" : undefined, decisive.length < transitions.length-maximumDissolves ? "insufficient_decisive_transitions" : undefined, transitions.some(({purpose})=>!purpose.trim()) ? "missing_transition_purpose" : undefined].filter((value):value is string=>Boolean(value));
  return { passed:failures.length===0,dissolveCount:dissolves.length,decisiveCount:decisive.length,failures };
}

export function auditV10Layout(rectangles: V10Rect[]) {
  const collisions = rectangles.flatMap((left,index)=>rectangles.slice(index+1).flatMap((right)=>intersects(left,right)&&forbidden(left.kind,right.kind)?[{left:left.id,right:right.id,leftKind:left.kind,rightKind:right.kind}]:[]));
  return { passed:collisions.length===0,collisionCount:collisions.length,collisions };
}

export function auditV10CompositionSimilarity(fingerprints: V10CompositionFingerprint[], maximumUnchangedFrames = 60) {
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

export function auditV10PhoneScale(input:{requiredTextCoverage:number;primaryFocalPoints:number;contactReadable:boolean;messageReadable:boolean;mascotFaceReadable:boolean;captionCollisionCount:number;evidencePixelsArePrimary:boolean}){
  const failures=[input.requiredTextCoverage<.9?"required_text":undefined,input.primaryFocalPoints>2?"too_many_focal_points":undefined,!input.contactReadable?"contact_small":undefined,!input.messageReadable?"message_small":undefined,!input.mascotFaceReadable?"mascot_face_small":undefined,input.captionCollisionCount>0?"caption_collision":undefined,input.evidencePixelsArePrimary?"labels_replace_proof":undefined].filter((value):value is string=>Boolean(value));
  return{passed:failures.length===0,failures};
}

function sameFingerprint(left:V10CompositionFingerprint,right:V10CompositionFingerprint){return left.background===right.background&&left.semanticState===right.semanticState&&Math.abs(left.cameraScale-right.cameraScale)<.03&&sameRect(left.product,right.product)&&sameRect(left.mascot,right.mascot);}
function sameRect(left:V10Rect|null,right:V10Rect|null){if(!left||!right)return left===right;return Math.abs(left.left-right.left)<.03&&Math.abs(left.top-right.top)<.03&&Math.abs(left.right-right.right)<.03&&Math.abs(left.bottom-right.bottom)<.03;}
function intersects(left:V10Rect,right:V10Rect){return left.left<right.right&&left.right>right.left&&left.top<right.bottom&&left.bottom>right.top;}
function forbidden(left:V10Rect["kind"],right:V10Rect["kind"]){const pair=new Set([left,right]);return pair.has("mascot")&&(pair.has("caption")||pair.has("editorial")||pair.has("product")||pair.has("annotation")||pair.has("cta"))||pair.has("product")&&(pair.has("caption")||pair.has("annotation")||pair.has("social_ui"));}
function normalize(value:string){return value.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();}

