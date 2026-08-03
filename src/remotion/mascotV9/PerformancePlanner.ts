import type { V9MascotPerformance } from "../../shared/solomonMascotV9";

export function planMascotFrame(plan:V9MascotPerformance,frame:number){
  const gesture=curve(frame,plan.gestureStartFrame,plan.gesturePeakFrame,plan.recoveryFrame);
  const gaze=frame>=plan.gazeArrivalFrame?1:Math.max(0,frame/Math.max(1,plan.gazeArrivalFrame));
  const beat=plan.head.beats.reduce((sum,item)=>sum+Math.max(0,1-Math.abs(frame-item)/5),0);
  return{gesture,gaze,headBeat:beat,torsoX:Math.sin(frame/11)*2.6+plan.torso.shiftX*12,torsoY:Math.sin(frame/15)*3.2+plan.torso.shiftY*10,rotation:plan.torso.rotate*4+Math.sin(frame/19)*.7};
}
function curve(frame:number,start:number,peak:number,end:number){if(frame<=start)return 0;if(frame<=peak)return ease((frame-start)/(peak-start));if(frame>=end)return 0;return 1-ease((frame-peak)/(end-peak));}
function ease(value:number){return value*value*(3-2*value);}
