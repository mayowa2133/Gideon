import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { sampleMascotAudioV10, type V10Face, type V10Gesture, type V10MascotPerformance, type V10Mouth } from "../../shared/solomonMascotV10";

const MINT="#39f2b5", INK="#030914", AMBER="#ff9d18";

export const RobotMascotV10:React.FC<{plan:V10MascotPerformance}> = ({plan}) => {
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  if(plan.role==="absent")return null;
  const enter=spring({frame,fps,config:{damping:17,stiffness:155},durationInFrames:13});
  const seed=hash(plan.sceneId),leftAmount=limbCurve(frame,plan.left.timing),rightAmount=limbCurve(frame,plan.right.timing);
  const gaze=gazeAt(plan,frame),headGaze=gazeAt(plan,Math.max(0,frame-3)),torsoGaze=gazeAt(plan,Math.max(0,frame-6));
  const audio=sampleMascotAudioV10(plan.audioFrames,frame),mouth=mouthFor(plan.face,plan.mouthBias,audio);
  const blink=blinkScale(frame,plan.blinkFrames,plan.face),phraseBeat=plan.head.beats.reduce((sum,beat)=>sum+Math.max(0,1-Math.abs(frame-beat)/5),0);
  const hoverX=uneven(seed,frame,.17)*2.8,hoverY=uneven(seed+17,frame,.13)*3.6;
  const lean=plan.torso.lean*10*(.35+.65*Math.max(leftAmount,rightAmount)),recoil=plan.torso.recoil*interpolate(frame,[0,8,18],[0,1,0],{extrapolateRight:"clamp"})*12;
  const rotation=plan.torso.rotate*4+torsoGaze.dx*2.2+uneven(seed+31,frame,.09)*.45;
  const layout=roleLayout(plan.role),antenna=audio.onset*9+phraseBeat*3;
  return <div data-v10-mascot={plan.sceneId} data-v10-face={plan.face} data-v10-left={plan.left.gesture} data-v10-right={plan.right.gesture} style={{position:"absolute",width:660,height:940,zIndex:32,...layout,opacity:enter,transform:`${layout.transform??""} translate(${hoverX+torsoGaze.dx*lean}px,${hoverY+(1-enter)*50-recoil}px) rotate(${rotation}deg)`,transformOrigin:"50% 78%"}}>
    <svg viewBox="0 0 660 940" width="660" height="940" style={{overflow:"visible",filter:"drop-shadow(0 34px 45px rgba(3,9,20,.24))"}}>
      <defs>
        <linearGradient id={`${plan.sceneId}-body`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff"/><stop offset=".56" stopColor="#edf3f8"/><stop offset="1" stopColor="#b9c8d7"/></linearGradient>
        <linearGradient id={`${plan.sceneId}-shell`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff"/><stop offset=".46" stopColor="#eef4fa"/><stop offset="1" stopColor="#bac9d8"/></linearGradient>
        <radialGradient id={`${plan.sceneId}-gloss`} cx="24%" cy="12%" r="76%"><stop stopColor="#fff" stopOpacity=".96"/><stop offset=".42" stopColor="#fff" stopOpacity=".12"/><stop offset="1" stopColor="#7f93a8" stopOpacity=".22"/></radialGradient>
      </defs>
      <Torso id={plan.sceneId}/>
      <Arm side="left" gesture={plan.left.gesture} amount={leftAmount} wristRotation={plan.left.timing.wristRotation}/>
      <Arm side="right" gesture={plan.right.gesture} amount={rightAmount} wristRotation={plan.right.timing.wristRotation}/>
      <g transform={`translate(330 250) rotate(${plan.head.tilt*7+headGaze.dy*2+phraseBeat*1.5}) translate(-330 -250)`}>
        <rect x="20" y="48" width="620" height="460" rx="170" fill={`url(#${plan.sceneId}-shell)`} stroke="#fff" strokeWidth="10"/>
        <rect x="40" y="66" width="580" height="420" rx="150" fill={`url(#${plan.sceneId}-gloss)`}/>
        <path d="M68 126 Q154 72 250 84" fill="none" stroke="#fff" strokeOpacity=".84" strokeWidth="24" strokeLinecap="round"/>
        <rect x="75" y="112" width="510" height="330" rx="160" fill={INK}/>
        <path d="M102 154 Q162 120 232 128" fill="none" stroke="#42546a" strokeOpacity=".42" strokeWidth="12" strokeLinecap="round"/>
        <Face face={plan.face} gazeX={gaze.dx*28} gazeY={gaze.dy*13} blink={blink}/>
        <Mouth state={mouth}/>
        <rect x="294" y="18" width="72" height="52" rx="26" fill="#d4dce6"/>
        <rect x="319" y={-4-antenna*.22} width="22" height={35+antenna*.22} rx="11" fill="#92a6bb"/>
        <circle cx="330" cy={-13-antenna} r={18+audio.onset*2} fill={AMBER} style={{filter:"drop-shadow(0 0 10px rgba(255,157,24,.65))"}}/>
      </g>
    </svg>
  </div>;
};

const Torso:React.FC<{id:string}> = ({id}) => <g>
  <ellipse cx="330" cy="720" rx="255" ry="195" fill={`url(#${id}-body)`} stroke="#fff" strokeWidth="10"/>
  <ellipse cx="330" cy="865" rx="94" ry="14" fill={AMBER}/>
  <path d="M150 650 Q185 558 270 540" fill="none" stroke="#fff" strokeOpacity=".86" strokeWidth="22" strokeLinecap="round"/>
  <circle cx="330" cy="705" r="39" fill={INK}/><text x="330" y="720" textAnchor="middle" fill={MINT} fontFamily="Manrope" fontWeight="900" fontSize="43">S</text>
  <ellipse cx="330" cy="910" rx="190" ry="24" fill="#07111f" opacity=".18"/>
</g>;

const Face:React.FC<{face:V10Face;gazeX:number;gazeY:number;blink:number}> = ({face,gazeX,gazeY,blink}) => {
  const transform=`translate(${gazeX} ${gazeY}) scale(1 ${blink})`,origin="330px 270px";
  const glow={filter:"drop-shadow(0 0 15px rgba(57,242,181,.9))"};
  if(face==="surprised")return <g transform={transform} style={{transformOrigin:origin,...glow}}><circle cx="206" cy="270" r="66" fill={MINT}/><circle cx="454" cy="270" r="66" fill={MINT}/><circle cx="206" cy="270" r="24" fill="#baffea"/><circle cx="454" cy="270" r="24" fill="#baffea"/></g>;
  if(face==="focused")return <g transform={transform} style={{transformOrigin:origin,...glow}}><path d="M140 245 Q205 216 270 248 L262 284 Q205 260 148 280Z" fill={MINT}/><path d="M390 248 Q455 216 520 245 L512 280 Q455 260 398 284Z" fill={MINT}/></g>;
  if(face==="concerned")return <g transform={transform} style={{transformOrigin:origin,...glow}}><path d="M142 278 Q205 224 270 263 L262 298 Q205 274 148 300Z" fill={MINT}/><path d="M390 263 Q455 224 518 278 L512 300 Q455 274 398 298Z" fill={MINT}/></g>;
  if(face==="skeptical")return <g transform={transform} style={{transformOrigin:origin,...glow}}><path d="M142 255 Q205 219 270 254 L264 290 Q205 269 148 291Z" fill={MINT}/><path d="M394 275 Q455 250 514 270 L510 299 Q455 286 400 301Z" fill={MINT}/></g>;
  if(face==="wink")return <g transform={transform} style={{transformOrigin:origin,...glow}}><path d="M142 278 Q206 216 270 278 L270 298 L142 298Z" fill={MINT}/><path d="M394 282 Q454 310 516 282" fill="none" stroke={MINT} strokeWidth="15" strokeLinecap="round"/></g>;
  if(face==="happy")return <g transform={transform} style={{transformOrigin:origin,...glow}}><path d="M140 286 Q206 216 272 286 Q206 268 140 286Z" fill={MINT}/><path d="M388 286 Q454 216 520 286 Q454 268 388 286Z" fill={MINT}/></g>;
  if(face==="direct_cta")return <g transform={transform} style={{transformOrigin:origin,...glow}}><path d="M140 276 A66 67 0 0 1 272 276 L272 298 L140 298Z" fill={MINT}/><path d="M388 276 A66 67 0 0 1 520 276 L520 298 L388 298Z" fill={MINT}/><circle cx="222" cy="256" r="11" fill="#d7fff2"/><circle cx="470" cy="256" r="11" fill="#d7fff2"/></g>;
  return <g transform={transform} style={{transformOrigin:origin,...glow}}><path d="M142 278 A64 68 0 0 1 270 278 L270 298 L142 298Z" fill={MINT}/><path d="M390 278 A64 68 0 0 1 518 278 L518 298 L390 298Z" fill={MINT}/></g>;
};

const Mouth:React.FC<{state:V10Mouth}> = ({state}) => {
  const style={filter:"drop-shadow(0 0 13px rgba(57,242,181,.9))"};
  if(state==="surprised_circle")return <ellipse cx="330" cy="360" rx="31" ry="39" fill={MINT} style={style}/>;
  if(state==="concerned_curve")return <path d="M280 382 Q330 335 380 382" fill="none" stroke={MINT} strokeWidth="14" strokeLinecap="round" style={style}/>;
  if(state==="neutral_dash")return <path d="M286 365 H374" stroke={MINT} strokeWidth="14" strokeLinecap="round" style={style}/>;
  if(state==="thinking_wave")return <path d="M270 365 Q300 344 330 365 Q360 386 390 365" fill="none" stroke={MINT} strokeWidth="12" strokeLinecap="round" style={style}/>;
  if(state==="closed_smile")return <path d="M278 352 Q330 402 382 352" fill="none" stroke={MINT} strokeWidth="14" strokeLinecap="round" style={style}/>;
  if(state==="confident_smile")return <path d="M278 350 Q334 406 390 345 Q359 398 328 399 Q297 396 278 350Z" fill={MINT} style={style}/>;
  const height=state==="wide_open"?78:48;
  return <path d={`M278 345 Q330 ${345+height} 382 345 Q374 ${374+height*.3} 330 ${381+height*.45} Q286 ${374+height*.3} 278 345Z`} fill={MINT} style={style}/>;
};

const Arm:React.FC<{side:"left"|"right";gesture:V10Gesture;amount:number;wristRotation:number}> = ({side,gesture,amount,wristRotation}) => {
  const sign=side==="left"?-1:1,shoulderX=side==="left"?120:540;
  const target=gestureTarget(gesture,side),elbowX=shoulderX+sign*interpolate(amount,[0,1],[28,target.dx*.48]),elbowY=650+interpolate(amount,[0,1],[70,target.dy*.48]);
  const handX=shoulderX+sign*interpolate(amount,[0,1],[60,target.dx]),handY=760+interpolate(amount,[0,1],[20,target.dy]);
  return <g data-v10-gesture={`${side}-${gesture}`}>
    <path d={`M${shoulderX} 625 Q${elbowX} ${elbowY} ${handX} ${handY}`} fill="none" stroke="#e6eef5" strokeWidth="70" strokeLinecap="round"/>
    <g transform={`translate(${handX} ${handY}) rotate(${sign*wristRotation*amount})`}><HandShape gesture={gesture} side={side}/></g>
  </g>;
};

const HandShape:React.FC<{gesture:V10Gesture;side:"left"|"right"}> = ({gesture,side}) => {
  const flip=side==="left"?-1:1;
  if(gesture.startsWith("true_point"))return <g transform={`scale(${flip} 1)`}><ellipse rx="48" ry="48" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7"/><path d="M18 -10 L90 -52" stroke="#f8fbfd" strokeWidth="27" strokeLinecap="round"/><path d="M18 -10 L90 -52" stroke="#acbed0" strokeWidth="7" strokeLinecap="round"/></g>;
  if(gesture==="point_down"||gesture==="bookmark_tap")return <g><ellipse rx="48" ry="48" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7"/><path d="M8 25 L8 108" stroke="#f8fbfd" strokeWidth="27" strokeLinecap="round"/><path d="M8 25 L8 108" stroke="#acbed0" strokeWidth="7" strokeLinecap="round"/></g>;
  if(gesture==="approval")return <g transform={`scale(${flip} 1)`}><ellipse rx="50" ry="46" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7"/><path d="M8 -18 L46 -91" stroke="#f8fbfd" strokeWidth="31" strokeLinecap="round"/><path d="M8 -18 L46 -91" stroke="#acbed0" strokeWidth="7" strokeLinecap="round"/></g>;
  if(gesture==="bookmark_hold")return <g><path d="M-46 -58 H46 V64 L0 36 L-46 64Z" fill={INK} stroke={MINT} strokeWidth="9"/><ellipse cx="-52" cy="5" rx="24" ry="38" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6"/><ellipse cx="52" cy="5" rx="24" ry="38" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6"/></g>;
  if(gesture==="thinking_hand")return <g transform="rotate(-24)"><ellipse rx="48" ry="53" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7"/><circle cx="20" cy="-42" r="21" fill="#f8fbfd" stroke="#acbed0" strokeWidth="6"/></g>;
  if(gesture==="open_palm"||gesture==="presentation_palm"||gesture==="stop_palm"||gesture==="wave"||gesture==="celebration")return <g transform={`rotate(${gesture==="presentation_palm"?-90:gesture==="wave"?18:0})`}><ellipse rx="52" ry="56" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7"/>{[-34,-12,12,34].map((x,index)=><path key={x} d={`M${x} -32 L${x+(index-1.5)*3} -${82-Math.abs(index-1.5)*8}`} stroke="#f8fbfd" strokeWidth="18" strokeLinecap="round"/>)}</g>;
  return <ellipse rx="52" ry="54" fill="#f8fbfd" stroke="#acbed0" strokeWidth="7"/>;
};

function gestureTarget(gesture:V10Gesture,side:"left"|"right"){
  if(gesture==="celebration"||gesture==="wave")return{dx:145,dy:-250};
  if(gesture==="stop_palm")return{dx:150,dy:-180};
  if(gesture==="thinking_hand")return{dx:side==="left"?-110:110,dy:-250};
  if(gesture==="point_down"||gesture==="bookmark_tap")return{dx:95,dy:40};
  if(gesture==="bookmark_hold")return{dx:110,dy:-45};
  if(gesture.startsWith("true_point"))return{dx:175,dy:-155};
  if(gesture==="presentation_palm"||gesture==="open_palm"||gesture==="approval")return{dx:140,dy:-105};
  return{dx:60,dy:20};
}
function limbCurve(frame:number,timing:V10MascotPerformance["left"]["timing"]){if(frame<=timing.start)return 0;if(frame<=timing.peak)return ease((frame-timing.start)/(timing.peak-timing.start));if(frame>=timing.recover)return 0;return 1-ease((frame-timing.peak)/(timing.recover-timing.peak));}
function ease(value:number){return value*value*(3-2*value);}
function gazeAt(plan:V10MascotPerformance,frame:number){const prior=[...plan.gazePath].filter((item)=>item.frame<=frame).at(-1)??plan.gazePath[0]!,next=plan.gazePath.find((item)=>item.frame>frame)??prior,p=next.frame===prior.frame?1:Math.min(1,(frame-prior.frame)/(next.frame-prior.frame));const x=prior.x+(next.x-prior.x)*p,y=prior.y+(next.y-prior.y)*p;return{dx:(x-.5)*2,dy:(y-.4)*2};}
function mouthFor(face:V10Face,bias:V10Mouth,audio:ReturnType<typeof sampleMascotAudioV10>):V10Mouth{if(!audio.speaking)return bias;if(face==="surprised"&&audio.onset>.45)return"surprised_circle";if(face==="concerned")return audio.rms>.45?"small_open":"concerned_curve";if(face==="skeptical"&&audio.rms<.32)return"thinking_wave";if(audio.onset>.55||audio.rms>.62)return"wide_open";return audio.rms>.3?"small_open":bias;}
function blinkScale(frame:number,blinkFrames:number[],face:V10Face){if(face==="surprised")return 1;const distance=Math.min(...blinkFrames.map((beat)=>Math.abs(frame-beat)),999);return distance===0?.07:distance===1?.26:1;}
function uneven(seed:number,frame:number,speed:number){return Math.sin(frame*speed+seed*.13)*.58+Math.sin(frame*speed*.43+seed*.29)*.28+Math.sin(frame*speed*.19+seed*.41)*.14;}
function hash(value:string){return [...value].reduce((sum,char)=>((sum*31)+char.charCodeAt(0))%997,17);}
function roleLayout(role:V10MascotPerformance["role"]):React.CSSProperties{if(role==="hero_close")return{left:210,top:320,transform:"scale(1.12)"};if(role==="cameo_left")return{left:-128,bottom:-68,transform:"scale(.48)"};if(role==="cameo_right")return{right:-128,bottom:-68,transform:"scale(.48)"};return{left:210,top:420,transform:"scale(1)"};}
