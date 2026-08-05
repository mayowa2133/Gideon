import { z } from "zod";

export const V21_MASCOT_GEOMETRY_VERSION="solomon-baby-schema-v21.1" as const;
export const V21_MASCOT_MATERIAL_VERSION="solomon-soft-gloss-performance-v2" as const;

export const v21FaceSchema=z.enum(["friendly","surprised","focused","happy","concerned","direct_cta","skeptical","wink"]);
export const v21MouthSchema=z.enum(["closed_smile","small_open","wide_open","surprised_circle","concerned_curve","neutral_dash","thinking_wave","confident_smile"]);
export const v21GestureSchema=z.enum(["rest_mitt","true_point_left","true_point_right","point_down","open_palm","presentation_palm","stop_palm","approval","thinking_hand","bookmark_hold","bookmark_tap","wave","celebration"]);

export const v21LimbTimingSchema=z.object({start:z.number().int().nonnegative(),peak:z.number().int().positive(),recover:z.number().int().positive(),wristRotation:z.number().min(-90).max(90)}).superRefine((value,context)=>{if(!(value.start<value.peak&&value.peak<value.recover))context.addIssue({code:"custom",message:"Limb timing must progress start → peak → recover."});});

export const v21MascotPerformanceSchema=z.object({
  sceneId:z.string().min(1),
  role:z.enum(["hero_close","host","cameo_left","cameo_right","absent"]),
  narrativePurpose:z.enum(["emotion","interpretation","attention","transition","payoff_reaction","cta","none"]),
  face:v21FaceSchema,
  mouthBias:v21MouthSchema,
  gazePath:z.array(z.object({frame:z.number().int().nonnegative(),target:z.enum(["camera","product","caption","cta"]),x:z.number().min(0).max(1),y:z.number().min(0).max(1)})).min(1),
  head:z.object({turn:z.number().min(-1).max(1),tilt:z.number().min(-1).max(1),beats:z.array(z.number().int().nonnegative())}),
  torso:z.object({lean:z.number().min(-1).max(1),rotate:z.number().min(-1).max(1),recoil:z.number().min(0).max(1)}),
  left:z.object({gesture:v21GestureSchema,timing:v21LimbTimingSchema}),
  right:z.object({gesture:v21GestureSchema,timing:v21LimbTimingSchema}),
  blinkFrames:z.array(z.number().int().nonnegative()),
  faceAccents:z.array(z.object({atFrame:z.number().int().nonnegative(),face:v21FaceSchema,holdFrames:z.number().int().min(1).max(9)})).max(2).optional(),
  audioFrames:z.array(z.object({frame:z.number().int().nonnegative(),rms:z.number().min(0).max(1),speaking:z.boolean(),onset:z.number().min(0).max(1),phraseBoundary:z.boolean()})).min(1),
  interactionTarget:z.object({elementId:z.string().min(1),x:z.number().min(0).max(1),y:z.number().min(0).max(1),action:z.string().min(1)}).optional()
}).superRefine((value,context)=>{
  if(value.role!=="absent"&&value.narrativePurpose==="none")context.addIssue({code:"custom",message:"Visible mascot requires a narrative purpose."});
  if(value.role!=="absent"&&!value.interactionTarget)context.addIssue({code:"custom",message:"Visible mascot requires an interaction target."});
  if(value.left.timing.peak===value.right.timing.peak)context.addIssue({code:"custom",message:"Hands must have independent peak timing."});
  if(value.face==="surprised")context.addIssue({code:"custom",message:"Surprised is an accent face (max 9 frames via faceAccents), never a resting base face."});
  const productGaze=value.gazePath.find(({target})=>target!=="camera");
  if(productGaze&&productGaze.frame>=Math.min(value.left.timing.peak,value.right.timing.peak))context.addIssue({code:"custom",message:"Gaze must arrive before gesture peak."});
});

export type V21Face=z.infer<typeof v21FaceSchema>;
export type V21Mouth=z.infer<typeof v21MouthSchema>;
export type V21Gesture=z.infer<typeof v21GestureSchema>;
export type V21LimbTiming=z.infer<typeof v21LimbTimingSchema>;
export type V21MascotPerformance=z.infer<typeof v21MascotPerformanceSchema>;

export const SOLOMON_MASCOT_V21_GEOMETRY={totalHeight:900,headHeight:460,headWidth:620,bodyWidth:510,bodyHeight:390,screenWidth:510,screenHeight:330,screenCornerRadius:160,eyeWidth:128,eyeCenterYRatio:.45,badgeWidth:78,visorColor:"#030914",faceColor:"#39f2b5",orangeAccent:"#ff9d18",neckOverlapPx:16,cameoFingerDetails:false,roundedSilhouette:true,eggBody:true,antennaClearancePx:48,surprisedAccentMaxFrames:9} as const;

export function luminanceContrast(first:string,second:string){
  const channel=(hex:string,offset:number)=>{const value=Number.parseInt(hex.slice(offset,offset+2),16)/255;return value<=.03928?value/12.92:(((value+.055)/1.055)**2.4);};
  const luminance=(hex:string)=>.2126*channel(hex,1)+.7152*channel(hex,3)+.0722*channel(hex,5);
  const firstLuminance=luminance(first),secondLuminance=luminance(second);
  const bright=Math.max(firstLuminance,secondLuminance),dark=Math.min(firstLuminance,secondLuminance);
  return (bright+.05)/(dark+.05);
}

export function auditSolomonMascotV21(geometry:typeof SOLOMON_MASCOT_V21_GEOMETRY=SOLOMON_MASCOT_V21_GEOMETRY){
  const headRatio=geometry.headHeight/geometry.totalHeight;
  const failures=[
    !(headRatio>=.45&&headRatio<=.55)?"head_height_ratio":undefined,
    !(geometry.headWidth>=geometry.bodyWidth*1.05)?"head_wider_than_body":undefined,
    !(geometry.screenWidth>=geometry.headWidth*.8)?"screen_width_coverage":undefined,
    !(geometry.screenHeight>=geometry.headHeight*.65)?"screen_height_coverage":undefined,
    !(geometry.screenCornerRadius>=geometry.headWidth*.25)?"screen_corner_radius":undefined,
    !(geometry.eyeWidth>=geometry.screenWidth*.24)?"eye_size":undefined,
    !(geometry.eyeCenterYRatio>=.4&&geometry.eyeCenterYRatio<=.5)?"eye_centering":undefined,
    !(geometry.badgeWidth<=geometry.bodyWidth*.2)?"badge_size":undefined,
    geometry.cameoFingerDetails!==false?"cameo_fingers":undefined,
    !(geometry.roundedSilhouette&&geometry.eggBody)?"rounded_silhouette":undefined,
    !(geometry.neckOverlapPx>=10)?"neck_overlap":undefined,
    !(geometry.antennaClearancePx>=40)?"antenna_clearance":undefined,
    !(geometry.surprisedAccentMaxFrames<=9)?"surprised_accent_budget":undefined,
    !(luminanceContrast(geometry.faceColor,geometry.visorColor)>=7)?"face_contrast":undefined,
  ].filter((value):value is string=>Boolean(value));
  return{passed:failures.length===0,failures,headRatio,contrast:luminanceContrast(geometry.faceColor,geometry.visorColor)};
}

export const V21_FACE_PATH_IDS:Record<V21Face,string>={friendly:"arch-soft",surprised:"round-large",focused:"bar-narrow",happy:"crescent-up",concerned:"inner-raised",direct_cta:"bright-symmetric",skeptical:"asymmetric-narrow",wink:"single-closed"};
export const V21_GESTURE_SILHOUETTE_IDS:Record<V21Gesture,string>={rest_mitt:"rest",true_point_left:"index-left",true_point_right:"index-right",point_down:"index-down",open_palm:"open-five",presentation_palm:"palm-up",stop_palm:"stop-five",approval:"thumb-approval",thinking_hand:"chin-touch",bookmark_hold:"bookmark-grip",bookmark_tap:"bookmark-index",wave:"wave-open",celebration:"arms-up"};

export function auditMascotPerformanceV21(plans:V21MascotPerformance[]){
  const visible=plans.filter(({role})=>role!=="absent");
  const faces=new Set(visible.flatMap((plan)=>[V21_FACE_PATH_IDS[plan.face],...(plan.faceAccents??[]).map(({face})=>V21_FACE_PATH_IDS[face])]));
  const gestures=new Set(visible.flatMap(({left,right})=>[V21_GESTURE_SILHOUETTE_IDS[left.gesture],V21_GESTURE_SILHOUETTE_IDS[right.gesture]]).filter((value)=>value!=="rest"));
  const decorative=visible.filter(({narrativePurpose})=>narrativePurpose==="none").map(({sceneId})=>sceneId);
  const synchronized=visible.filter(({left,right})=>left.timing.peak===right.timing.peak).map(({sceneId})=>sceneId);
  const gazeOrder=visible.filter((plan)=>{const firstTarget=plan.gazePath.find(({target})=>target!=="camera");return firstTarget&&firstTarget.frame>=Math.min(plan.left.timing.peak,plan.right.timing.peak);}).map(({sceneId})=>sceneId);
  return{passed:faces.size>=6&&gestures.size>=8&&decorative.length===0&&synchronized.length===0&&gazeOrder.length===0,faceCount:faces.size,gestureCount:gestures.size,decorative,synchronized,gazeOrder};
}

export function sampleMascotAudioV21(frames:V21MascotPerformance["audioFrames"],frame:number){return frames.reduce((best,current)=>Math.abs(current.frame-frame)<Math.abs(best.frame-frame)?current:best,frames[0]!);}

// Idle float, quantized to whole canvas pixels.
//
// Through V20 this lived inside the rig as a raw sine sum feeding a CSS
// translate. Measured on the V20 master it moved the rig 0.006-0.335 px per
// frame - always fractional, never zero, never repeating. That is the worst
// available amplitude: too small to read as motion, too large to be free.
// Every frame every edge of the character re-rasterized at a new sub-pixel
// phase, so the high-contrast mint-on-ink face shimmered continuously and the
// robot never looked solid. Rounding to whole pixels turns the same curve into
// a staircase that holds for several frames at a time - how limited animation
// has always worked - and makes consecutive held frames byte-identical.
//
// The canvas is 1080x1920 rendered 1:1, so whole canvas pixels are whole device
// pixels. This must therefore be applied by the layer that positions in canvas
// space (MascotLayer's left/top), never inside a scaled parent, or the rounding
// buys nothing.
export const V21_IDLE_FLOAT={amplitudeX:2.8,amplitudeY:3.6,speedX:.17,speedY:.13} as const;

export function mascotIdleSeed(value:string){return [...value].reduce((sum,char)=>((sum*31)+char.charCodeAt(0))%997,17);}
export function unevenV21(seed:number,frame:number,speed:number){return Math.sin(frame*speed+seed*.13)*.58+Math.sin(frame*speed*.43+seed*.29)*.28+Math.sin(frame*speed*.19+seed*.41)*.14;}

export function mascotIdleFloat(sceneId:string,frame:number){
  const seed=mascotIdleSeed(sceneId);
  return{
    x:Math.round(unevenV21(seed,frame,V21_IDLE_FLOAT.speedX)*V21_IDLE_FLOAT.amplitudeX),
    y:Math.round(unevenV21(seed+17,frame,V21_IDLE_FLOAT.speedY)*V21_IDLE_FLOAT.amplitudeY),
  };
}

