import { z } from "zod";

export const V18_MASCOT_GEOMETRY_VERSION="solomon-baby-schema-v18.1" as const;
export const V18_MASCOT_MATERIAL_VERSION="solomon-soft-gloss-performance-v2" as const;

export const v18FaceSchema=z.enum(["friendly","surprised","focused","happy","concerned","direct_cta","skeptical","wink"]);
export const v18MouthSchema=z.enum(["closed_smile","small_open","wide_open","surprised_circle","concerned_curve","neutral_dash","thinking_wave","confident_smile"]);
export const v18GestureSchema=z.enum(["rest_mitt","true_point_left","true_point_right","point_down","open_palm","presentation_palm","stop_palm","approval","thinking_hand","bookmark_hold","bookmark_tap","wave","celebration"]);

export const v18LimbTimingSchema=z.object({start:z.number().int().nonnegative(),peak:z.number().int().positive(),recover:z.number().int().positive(),wristRotation:z.number().min(-90).max(90)}).superRefine((value,context)=>{if(!(value.start<value.peak&&value.peak<value.recover))context.addIssue({code:"custom",message:"Limb timing must progress start → peak → recover."});});

export const v18MascotPerformanceSchema=z.object({
  sceneId:z.string().min(1),
  role:z.enum(["hero_close","host","cameo_left","cameo_right","absent"]),
  narrativePurpose:z.enum(["emotion","interpretation","attention","transition","payoff_reaction","cta","none"]),
  face:v18FaceSchema,
  mouthBias:v18MouthSchema,
  gazePath:z.array(z.object({frame:z.number().int().nonnegative(),target:z.enum(["camera","product","caption","cta"]),x:z.number().min(0).max(1),y:z.number().min(0).max(1)})).min(1),
  head:z.object({turn:z.number().min(-1).max(1),tilt:z.number().min(-1).max(1),beats:z.array(z.number().int().nonnegative())}),
  torso:z.object({lean:z.number().min(-1).max(1),rotate:z.number().min(-1).max(1),recoil:z.number().min(0).max(1)}),
  left:z.object({gesture:v18GestureSchema,timing:v18LimbTimingSchema}),
  right:z.object({gesture:v18GestureSchema,timing:v18LimbTimingSchema}),
  blinkFrames:z.array(z.number().int().nonnegative()),
  faceAccents:z.array(z.object({atFrame:z.number().int().nonnegative(),face:v18FaceSchema,holdFrames:z.number().int().min(1).max(9)})).max(2).optional(),
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

export type V18Face=z.infer<typeof v18FaceSchema>;
export type V18Mouth=z.infer<typeof v18MouthSchema>;
export type V18Gesture=z.infer<typeof v18GestureSchema>;
export type V18LimbTiming=z.infer<typeof v18LimbTimingSchema>;
export type V18MascotPerformance=z.infer<typeof v18MascotPerformanceSchema>;

export const SOLOMON_MASCOT_V18_GEOMETRY={totalHeight:900,headHeight:460,headWidth:620,bodyWidth:510,bodyHeight:390,screenWidth:510,screenHeight:330,screenCornerRadius:160,eyeWidth:128,eyeCenterYRatio:.45,badgeWidth:78,visorColor:"#030914",faceColor:"#39f2b5",orangeAccent:"#ff9d18",neckOverlapPx:16,cameoFingerDetails:false,roundedSilhouette:true,eggBody:true,antennaClearancePx:48,surprisedAccentMaxFrames:9} as const;

export function luminanceContrast(first:string,second:string){
  const channel=(hex:string,offset:number)=>{const value=Number.parseInt(hex.slice(offset,offset+2),16)/255;return value<=.03928?value/12.92:(((value+.055)/1.055)**2.4);};
  const luminance=(hex:string)=>.2126*channel(hex,1)+.7152*channel(hex,3)+.0722*channel(hex,5);
  const firstLuminance=luminance(first),secondLuminance=luminance(second);
  const bright=Math.max(firstLuminance,secondLuminance),dark=Math.min(firstLuminance,secondLuminance);
  return (bright+.05)/(dark+.05);
}

export function auditSolomonMascotV18(geometry:typeof SOLOMON_MASCOT_V18_GEOMETRY=SOLOMON_MASCOT_V18_GEOMETRY){
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

export const V18_FACE_PATH_IDS:Record<V18Face,string>={friendly:"arch-soft",surprised:"round-large",focused:"bar-narrow",happy:"crescent-up",concerned:"inner-raised",direct_cta:"bright-symmetric",skeptical:"asymmetric-narrow",wink:"single-closed"};
export const V18_GESTURE_SILHOUETTE_IDS:Record<V18Gesture,string>={rest_mitt:"rest",true_point_left:"index-left",true_point_right:"index-right",point_down:"index-down",open_palm:"open-five",presentation_palm:"palm-up",stop_palm:"stop-five",approval:"thumb-approval",thinking_hand:"chin-touch",bookmark_hold:"bookmark-grip",bookmark_tap:"bookmark-index",wave:"wave-open",celebration:"arms-up"};

export function auditMascotPerformanceV18(plans:V18MascotPerformance[]){
  const visible=plans.filter(({role})=>role!=="absent");
  const faces=new Set(visible.flatMap((plan)=>[V18_FACE_PATH_IDS[plan.face],...(plan.faceAccents??[]).map(({face})=>V18_FACE_PATH_IDS[face])]));
  const gestures=new Set(visible.flatMap(({left,right})=>[V18_GESTURE_SILHOUETTE_IDS[left.gesture],V18_GESTURE_SILHOUETTE_IDS[right.gesture]]).filter((value)=>value!=="rest"));
  const decorative=visible.filter(({narrativePurpose})=>narrativePurpose==="none").map(({sceneId})=>sceneId);
  const synchronized=visible.filter(({left,right})=>left.timing.peak===right.timing.peak).map(({sceneId})=>sceneId);
  const gazeOrder=visible.filter((plan)=>{const firstTarget=plan.gazePath.find(({target})=>target!=="camera");return firstTarget&&firstTarget.frame>=Math.min(plan.left.timing.peak,plan.right.timing.peak);}).map(({sceneId})=>sceneId);
  return{passed:faces.size>=6&&gestures.size>=8&&decorative.length===0&&synchronized.length===0&&gazeOrder.length===0,faceCount:faces.size,gestureCount:gestures.size,decorative,synchronized,gazeOrder};
}

export function sampleMascotAudioV18(frames:V18MascotPerformance["audioFrames"],frame:number){return frames.reduce((best,current)=>Math.abs(current.frame-frame)<Math.abs(best.frame-frame)?current:best,frames[0]!);}

