import { z } from "zod";

export const V10_MASCOT_GEOMETRY_VERSION="solomon-baby-schema-v10.1" as const;
export const V10_MASCOT_MATERIAL_VERSION="solomon-soft-gloss-performance-v2" as const;

export const v10FaceSchema=z.enum(["friendly","surprised","focused","happy","concerned","direct_cta","skeptical","wink"]);
export const v10MouthSchema=z.enum(["closed_smile","small_open","wide_open","surprised_circle","concerned_curve","neutral_dash","thinking_wave","confident_smile"]);
export const v10GestureSchema=z.enum(["rest_mitt","true_point_left","true_point_right","point_down","open_palm","presentation_palm","stop_palm","approval","thinking_hand","bookmark_hold","bookmark_tap","wave","celebration"]);

export const v10LimbTimingSchema=z.object({start:z.number().int().nonnegative(),peak:z.number().int().positive(),recover:z.number().int().positive(),wristRotation:z.number().min(-90).max(90)}).superRefine((value,context)=>{if(!(value.start<value.peak&&value.peak<value.recover))context.addIssue({code:"custom",message:"Limb timing must progress start → peak → recover."});});

export const v10MascotPerformanceSchema=z.object({
  sceneId:z.string().min(1),
  role:z.enum(["hero_close","host","cameo_left","cameo_right","absent"]),
  narrativePurpose:z.enum(["emotion","interpretation","attention","transition","payoff_reaction","cta","none"]),
  face:v10FaceSchema,
  mouthBias:v10MouthSchema,
  gazePath:z.array(z.object({frame:z.number().int().nonnegative(),target:z.enum(["camera","product","caption","cta"]),x:z.number().min(0).max(1),y:z.number().min(0).max(1)})).min(1),
  head:z.object({turn:z.number().min(-1).max(1),tilt:z.number().min(-1).max(1),beats:z.array(z.number().int().nonnegative())}),
  torso:z.object({lean:z.number().min(-1).max(1),rotate:z.number().min(-1).max(1),recoil:z.number().min(0).max(1)}),
  left:z.object({gesture:v10GestureSchema,timing:v10LimbTimingSchema}),
  right:z.object({gesture:v10GestureSchema,timing:v10LimbTimingSchema}),
  blinkFrames:z.array(z.number().int().nonnegative()),
  audioFrames:z.array(z.object({frame:z.number().int().nonnegative(),rms:z.number().min(0).max(1),speaking:z.boolean(),onset:z.number().min(0).max(1),phraseBoundary:z.boolean()})).min(1),
  interactionTarget:z.object({elementId:z.string().min(1),x:z.number().min(0).max(1),y:z.number().min(0).max(1),action:z.string().min(1)}).optional()
}).superRefine((value,context)=>{
  if(value.role!=="absent"&&value.narrativePurpose==="none")context.addIssue({code:"custom",message:"Visible mascot requires a narrative purpose."});
  if(value.role!=="absent"&&!value.interactionTarget)context.addIssue({code:"custom",message:"Visible mascot requires an interaction target."});
  if(value.left.timing.peak===value.right.timing.peak)context.addIssue({code:"custom",message:"Hands must have independent peak timing."});
  const productGaze=value.gazePath.find(({target})=>target!=="camera");
  if(productGaze&&productGaze.frame>=Math.min(value.left.timing.peak,value.right.timing.peak))context.addIssue({code:"custom",message:"Gaze must arrive before gesture peak."});
});

export type V10Face=z.infer<typeof v10FaceSchema>;
export type V10Mouth=z.infer<typeof v10MouthSchema>;
export type V10Gesture=z.infer<typeof v10GestureSchema>;
export type V10LimbTiming=z.infer<typeof v10LimbTimingSchema>;
export type V10MascotPerformance=z.infer<typeof v10MascotPerformanceSchema>;

export const SOLOMON_MASCOT_V10_GEOMETRY={totalHeight:900,headHeight:460,headWidth:620,bodyWidth:510,bodyHeight:390,screenWidth:510,screenHeight:330,screenCornerRadius:160,eyeWidth:128,eyeCenterYRatio:.45,badgeWidth:78,visorColor:"#030914",faceColor:"#39f2b5",orangeAccent:"#ff9d18"} as const;

export const V10_FACE_PATH_IDS:Record<V10Face,string>={friendly:"arch-soft",surprised:"round-large",focused:"bar-narrow",happy:"crescent-up",concerned:"inner-raised",direct_cta:"bright-symmetric",skeptical:"asymmetric-narrow",wink:"single-closed"};
export const V10_GESTURE_SILHOUETTE_IDS:Record<V10Gesture,string>={rest_mitt:"rest",true_point_left:"index-left",true_point_right:"index-right",point_down:"index-down",open_palm:"open-five",presentation_palm:"palm-up",stop_palm:"stop-five",approval:"thumb-approval",thinking_hand:"chin-touch",bookmark_hold:"bookmark-grip",bookmark_tap:"bookmark-index",wave:"wave-open",celebration:"arms-up"};

export function auditMascotPerformanceV10(plans:V10MascotPerformance[]){
  const visible=plans.filter(({role})=>role!=="absent");
  const faces=new Set(visible.map(({face})=>V10_FACE_PATH_IDS[face]));
  const gestures=new Set(visible.flatMap(({left,right})=>[V10_GESTURE_SILHOUETTE_IDS[left.gesture],V10_GESTURE_SILHOUETTE_IDS[right.gesture]]).filter((value)=>value!=="rest"));
  const decorative=visible.filter(({narrativePurpose})=>narrativePurpose==="none").map(({sceneId})=>sceneId);
  const synchronized=visible.filter(({left,right})=>left.timing.peak===right.timing.peak).map(({sceneId})=>sceneId);
  const gazeOrder=visible.filter((plan)=>{const firstTarget=plan.gazePath.find(({target})=>target!=="camera");return firstTarget&&firstTarget.frame>=Math.min(plan.left.timing.peak,plan.right.timing.peak);}).map(({sceneId})=>sceneId);
  return{passed:faces.size>=6&&gestures.size>=8&&decorative.length===0&&synchronized.length===0&&gazeOrder.length===0,faceCount:faces.size,gestureCount:gestures.size,decorative,synchronized,gazeOrder};
}

export function sampleMascotAudioV10(frames:V10MascotPerformance["audioFrames"],frame:number){return frames.reduce((best,current)=>Math.abs(current.frame-frame)<Math.abs(best.frame-frame)?current:best,frames[0]!);}

