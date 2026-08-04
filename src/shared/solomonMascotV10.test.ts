import { describe,expect,it } from "vitest";
import { auditMascotPerformanceV10, SOLOMON_MASCOT_V10_GEOMETRY, V10_FACE_PATH_IDS, V10_GESTURE_SILHOUETTE_IDS, v10MascotPerformanceSchema } from "./solomonMascotV10";

const plan=(sceneId:string,index:number)=>v10MascotPerformanceSchema.parse({sceneId,role:"host",narrativePurpose:index%2?"attention":"emotion",face:Object.keys(V10_FACE_PATH_IDS)[index%8],mouthBias:"small_open",gazePath:[{frame:0,target:"camera",x:.5,y:.4},{frame:3,target:"product",x:.7,y:.4}],head:{turn:.25,tilt:.1,beats:[4,16]},torso:{lean:.3,rotate:.1,recoil:.2},left:{gesture:Object.keys(V10_GESTURE_SILHOUETTE_IDS)[(index+1)%13],timing:{start:5,peak:12+index,recover:25+index,wristRotation:15}},right:{gesture:Object.keys(V10_GESTURE_SILHOUETTE_IDS)[(index+5)%13],timing:{start:7,peak:18+index,recover:31+index,wristRotation:-12}},blinkFrames:[28,67],audioFrames:[{frame:0,rms:.2,speaking:true,onset:.2,phraseBoundary:false}],interactionTarget:{elementId:"proof",x:.7,y:.4,action:"present"}});

describe("Solomon mascot V10",()=>{
  it("preserves the V9 baby-schema identity",()=>{expect(SOLOMON_MASCOT_V10_GEOMETRY.headHeight/SOLOMON_MASCOT_V10_GEOMETRY.totalHeight).toBeGreaterThanOrEqual(.45);expect(SOLOMON_MASCOT_V10_GEOMETRY.headWidth).toBeGreaterThan(SOLOMON_MASCOT_V10_GEOMETRY.bodyWidth);});
  it("requires perceptually distinct faces, gestures, gaze order, and independent hands",()=>{const plans=Array.from({length:8},(_,index)=>plan(`scene-${index}`,index));expect(auditMascotPerformanceV10(plans).passed).toBe(true);});
  it("rejects synchronized hands",()=>{const input=structuredClone(plan("bad",0));input.right.timing.peak=input.left.timing.peak;expect(()=>v10MascotPerformanceSchema.parse(input)).toThrow();});
});

