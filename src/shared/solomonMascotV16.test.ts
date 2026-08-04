import { describe,expect,it } from "vitest";
import { auditMascotPerformanceV16, auditSolomonMascotV16, luminanceContrast, SOLOMON_MASCOT_V16_GEOMETRY, V16_FACE_PATH_IDS, V16_GESTURE_SILHOUETTE_IDS, v16MascotPerformanceSchema } from "./solomonMascotV16";

const restingFaces=Object.keys(V16_FACE_PATH_IDS).filter((face)=>face!=="surprised");
const plan=(sceneId:string,index:number)=>v16MascotPerformanceSchema.parse({sceneId,role:"host",narrativePurpose:index%2?"attention":"emotion",face:restingFaces[index%restingFaces.length],mouthBias:"small_open",gazePath:[{frame:0,target:"camera",x:.5,y:.4},{frame:3,target:"product",x:.7,y:.4}],head:{turn:.25,tilt:.1,beats:[4,16]},torso:{lean:.3,rotate:.1,recoil:.2},left:{gesture:Object.keys(V16_GESTURE_SILHOUETTE_IDS)[(index+1)%13],timing:{start:5,peak:12+index,recover:25+index,wristRotation:15}},right:{gesture:Object.keys(V16_GESTURE_SILHOUETTE_IDS)[(index+5)%13],timing:{start:7,peak:18+index,recover:31+index,wristRotation:-12}},blinkFrames:[28,67],audioFrames:[{frame:0,rms:.2,speaking:true,onset:.2,phraseBoundary:false}],interactionTarget:{elementId:"proof",x:.7,y:.4,action:"present"}});

describe("Solomon mascot V16",()=>{
  it("preserves the V9 baby-schema identity",()=>{expect(SOLOMON_MASCOT_V16_GEOMETRY.headHeight/SOLOMON_MASCOT_V16_GEOMETRY.totalHeight).toBeGreaterThanOrEqual(.45);expect(SOLOMON_MASCOT_V16_GEOMETRY.headWidth).toBeGreaterThan(SOLOMON_MASCOT_V16_GEOMETRY.bodyWidth);});
  it("restores the full V9 geometry invariant set",()=>{
    const audit=auditSolomonMascotV16();
    expect(audit.passed).toBe(true);expect(audit.failures).toEqual([]);
    expect(audit.headRatio).toBeGreaterThanOrEqual(.45);expect(audit.headRatio).toBeLessThanOrEqual(.55);
    expect(audit.contrast).toBeGreaterThanOrEqual(7);
    expect(SOLOMON_MASCOT_V16_GEOMETRY.cameoFingerDetails).toBe(false);
    expect(SOLOMON_MASCOT_V16_GEOMETRY.neckOverlapPx).toBeGreaterThanOrEqual(10);
  });
  it("fails the geometry audit when cameo finger detail or the neck overlap regresses",()=>{
    expect(auditSolomonMascotV16({...SOLOMON_MASCOT_V16_GEOMETRY,cameoFingerDetails:true}).failures).toContain("cameo_fingers");
    expect(auditSolomonMascotV16({...SOLOMON_MASCOT_V16_GEOMETRY,neckOverlapPx:0}).failures).toContain("neck_overlap");
    expect(auditSolomonMascotV16({...SOLOMON_MASCOT_V16_GEOMETRY,eyeWidth:40}).failures).toContain("eye_size");
    expect(luminanceContrast("#39f2b5","#030914")).toBeGreaterThanOrEqual(7);
  });
  it("requires perceptually distinct faces, gestures, gaze order, and independent hands",()=>{const plans=Array.from({length:8},(_,index)=>plan(`scene-${index}`,index));expect(auditMascotPerformanceV16(plans).passed).toBe(true);});
  it("rejects synchronized hands",()=>{const input=structuredClone(plan("bad",0));input.right.timing.peak=input.left.timing.peak;expect(()=>v16MascotPerformanceSchema.parse(input)).toThrow();});
  it("rejects surprised as a resting base face but allows it as a short accent",()=>{
    const input=structuredClone(plan("hook",0));
    expect(()=>v16MascotPerformanceSchema.parse({...input,face:"surprised"})).toThrow();
    expect(()=>v16MascotPerformanceSchema.parse({...input,faceAccents:[{atFrame:2,face:"surprised",holdFrames:9}]})).not.toThrow();
    expect(()=>v16MascotPerformanceSchema.parse({...input,faceAccents:[{atFrame:2,face:"surprised",holdFrames:14}]})).toThrow();
  });
});
