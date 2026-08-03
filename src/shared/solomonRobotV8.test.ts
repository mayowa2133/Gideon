import {describe,expect,it} from "vitest";
import {auditV8RobotDirections,directV8Robot,sampleV8Audio} from "./solomonRobotV8";

const audio=[{frame:0,rms:0,speaking:false,onset:0,phraseBoundary:true,emphasized:false,pitchDelta:0},{frame:6,rms:.8,speaking:true,onset:1,phraseBoundary:false,emphasized:true,pitchDelta:.3}];
describe("Solomon V8 robot direction",()=>{
  it("requires gaze before gesture and uses decoded narration samples",()=>{const result=directV8Robot({sceneId:"hook",role:"host",pose:"forward_lean",expression:"alert",gaze:"camera",gazeArrivalFrame:2,gestureStartFrame:5,gesturePeakFrame:9,recoveryFrame:18,shoulderAsymmetry:.3,lean:.8,audioFrames:audio});expect(result.skin).toBe("solomon_s");expect(sampleV8Audio(audio,5).rms).toBe(.8);});
  it("rejects repeated sticker poses",()=>{const make=(sceneId:string)=>directV8Robot({sceneId,role:"host",pose:"rest",expression:"alert",gaze:"camera",gazeArrivalFrame:1,gestureStartFrame:2,gesturePeakFrame:5,recoveryFrame:10,shoulderAsymmetry:0,lean:0,audioFrames:audio});expect(auditV8RobotDirections([make("a"),make("b")]).passed).toBe(false);});
});
