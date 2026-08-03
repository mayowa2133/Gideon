import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { sampleMascotAudioV9, type V9MascotMouth, type V9MascotPerformance } from "../../shared/solomonMascotV9";
import { MascotHands } from "./MascotHands";
import { MascotHead } from "./MascotHead";
import { MascotTorso } from "./MascotTorso";
import { interactionLine } from "./InteractionPlanner";
import { planMascotFrame } from "./PerformancePlanner";

export const RobotMascotV9:React.FC<{plan:V9MascotPerformance}> = ({plan}) => {
  const frame=useCurrentFrame(),{fps}=useVideoConfig(),motion=planMascotFrame(plan,frame),audio=sampleMascotAudioV9(plan.audioFrames,frame),layout=roleLayout(plan.role),line=interactionLine(plan,frame);
  if(plan.role==="absent")return null;
  const enter=spring({frame,fps,config:{damping:16,stiffness:140},durationInFrames:15}),blink=audio.speaking?1:(frame+plan.sceneId.length*11)%97<3?.07:1;
  const mouth:V9MascotMouth=audio.speaking?audio.mouth:"smile_rest";
  return <><div data-v9-mascot={plan.sceneId} data-face={plan.emotion} data-material={plan.material} style={{position:"absolute",width:660,height:940,zIndex:30,...layout,opacity:enter,transform:`${layout.transform??""} translate(${motion.torsoX}px,${motion.torsoY+(1-enter)*55}px) rotate(${motion.rotation}deg)`,transformOrigin:"50% 78%"}}><svg viewBox="0 0 660 940" width="660" height="940" style={{overflow:"visible",filter:"drop-shadow(0 34px 45px rgba(3,9,20,.24))"}}><MascotTorso id={plan.sceneId}/><MascotHands left={plan.leftGesture} right={plan.rightGesture} amount={motion.gesture}/><MascotHead id={plan.sceneId} face={plan.emotion} mouth={mouth} gazeX={(plan.gazePath.at(-1)?.target==="product"?18:0)*motion.gaze} blink={blink} tilt={plan.head.tilt*7+motion.headBeat*2}/></svg></div>{line&&<svg width="1080" height="1920" style={{position:"absolute",inset:0,zIndex:25,pointerEvents:"none"}}><defs><marker id={`arrow-${plan.sceneId}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="#39f2b5"/></marker></defs><path d={`M${layout.left?Number(layout.left)+330:540} ${layout.top?Number(layout.top)+470:1200} Q540 980 ${line.x} ${line.y}`} fill="none" stroke="#39f2b5" strokeWidth="5" strokeDasharray="10 14" opacity={line.opacity} markerEnd={`url(#arrow-${plan.sceneId})`}/></svg>}</>;
};
function roleLayout(role:V9MascotPerformance["role"]):React.CSSProperties{if(role==="cameo_left")return{left:-125,bottom:-55,transform:"scale(.46)"};if(role==="cameo_right")return{right:-125,bottom:-55,transform:"scale(.46)"};if(role==="split_left")return{left:-65,bottom:40,transform:"scale(.56)"};if(role==="split_right")return{right:-65,bottom:40,transform:"scale(.56)"};return{left:210,top:400,transform:"scale(1)"};}
