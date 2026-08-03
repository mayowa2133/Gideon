import type { V9MascotPerformance } from "../../shared/solomonMascotV9";

export function interactionLine(plan:V9MascotPerformance,frame:number){
  const target=plan.interactionTarget;
  if(!target||frame<plan.gazeArrivalFrame)return null;
  const reveal=Math.min(1,(frame-plan.gazeArrivalFrame)/8);
  return{x:target.x*1080,y:target.y*1920,opacity:reveal*.42};
}
