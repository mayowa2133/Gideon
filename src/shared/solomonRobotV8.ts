import { z } from "zod";

export const v8RobotPoseSchema = z.enum(["rest","forward_lean","recoil","point","presentation_palm","open_palm","stop_approval","save","wave"]);
export const v8RobotExpressionSchema = z.enum(["alert","surprised","concerned","focused","skeptical","relieved","confident","wink"]);
export const v8RobotRoleSchema = z.enum(["host","cameo_left","cameo_right","split_left","absent"]);
export const v8GazeSchema = z.enum(["camera","product_left","product_right","down_cta"]);
export const v8AudioFrameSchema = z.object({ frame:z.number().int().nonnegative(),rms:z.number().min(0).max(1),speaking:z.boolean(),onset:z.number().min(0).max(1),phraseBoundary:z.boolean(),emphasized:z.boolean(),pitchDelta:z.number().min(-1).max(1) });

export const v8RobotDirectionSchema = z.object({
  sceneId:z.string().min(1),role:v8RobotRoleSchema,pose:v8RobotPoseSchema,expression:v8RobotExpressionSchema,gaze:v8GazeSchema,
  gazeArrivalFrame:z.number().int().nonnegative(),gestureStartFrame:z.number().int().nonnegative(),gesturePeakFrame:z.number().int().positive(),recoveryFrame:z.number().int().positive(),
  shoulderAsymmetry:z.number().min(-1).max(1),lean:z.number().min(-1).max(1),audioFrames:z.array(v8AudioFrameSchema).min(1),skin:z.literal("solomon_s")
}).superRefine((value,context)=>{if(value.role!=="absent"&&value.gazeArrivalFrame>=value.gesturePeakFrame)context.addIssue({code:"custom",message:"V8 gaze must arrive before gesture peak."});if(value.recoveryFrame<=value.gesturePeakFrame)context.addIssue({code:"custom",message:"V8 recovery must follow gesture peak."});});

export type V8RobotDirection=z.infer<typeof v8RobotDirectionSchema>;
export type V8AudioFrame=z.infer<typeof v8AudioFrameSchema>;

export function directV8Robot(value:Omit<V8RobotDirection,"skin">):V8RobotDirection{return v8RobotDirectionSchema.parse({...value,skin:"solomon_s"});}
export function sampleV8Audio(frames:V8AudioFrame[],frame:number):V8AudioFrame{return frames.reduce((best,item)=>Math.abs(item.frame-frame)<Math.abs(best.frame-frame)?item:best,frames[0]!);}

export function auditV8RobotDirections(directions:V8RobotDirection[]){
  const visible=directions.filter(({role})=>role!=="absent");
  const repeated=visible.slice(1).flatMap((direction,index)=>{const previous=visible[index]!;return direction.pose===previous.pose&&direction.expression===previous.expression?[`${previous.sceneId}->${direction.sceneId}`]:[];});
  const poses=new Set(visible.map(({pose})=>pose));const expressions=new Set(visible.map(({expression})=>expression));
  const required=["forward_lean","recoil","point","open_palm","save"].filter((pose)=>!poses.has(pose as V8RobotDirection["pose"]));
  return{passed:poses.size>=6&&expressions.size>=4&&repeated.length===0&&required.length===0,poseCount:poses.size,expressionCount:expressions.size,repeated,missingRequiredPoses:required};
}
