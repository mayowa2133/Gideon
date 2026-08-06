import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { V22_BACKDROPS, V22_TEXT_ZONES, v22CameraTransform } from "../../shared/creatorStoryV22Quality";
import { SOLOMON_CREATOR_STORY_V22_HEADLINES, type SolomonCreatorStoryV22Manifest, type V22AssetId, type V22Caption, type V22Scene } from "../../shared/solomonCreatorStoryV22";
import { MascotLayer } from "./MascotLayer";

const SerifHeadline:React.FC<{sceneId:string;accentColor:string;fontSize:number;top:number;left?:number;right?:number;align?:"left"|"center"}> = ({sceneId,accentColor,fontSize,top,left=70,right=70,align="center"}) => {
  const headline=SOLOMON_CREATOR_STORY_V22_HEADLINES[sceneId];
  if(!headline)return null;
  // Never start inside the caption chip band; clamping here means no scene can
  // reintroduce the headline-on-chip overlap by choosing a small top value.
  const safeTop=Math.max(top,V22_TEXT_ZONES.headlineTopMin);
  return <div data-v22-headline={sceneId} style={{position:"absolute",left,right,top:safeTop,fontFamily:"Fraunces Variable,serif",fontSize,lineHeight:.94,fontWeight:850,textAlign:align,color:"var(--v22-fg)"}}>{headline.primary}{headline.accentItalic&&<><br/><i style={{color:accentColor}}>{headline.accentItalic}</i></>}</div>;
};

// Full-frame kinetic type. V19 proved that swapping words inside a caption chip
// cannot move a whole-frame luma metric: a chip is 1-2% of the pixels. The
// references drive their median frame change with giant words that occupy a large
// share of the frame and scale in one at a time. This renders a scene's headline
// that way -- one word (or a short pair) at a time, sized to the band it is given,
// landing with an overshoot pop.
//
// `maxHeightPx` is required rather than optional: every conceptual scene has
// content below its headline band, and unbounded type is how text ends up over
// the proof. The size is solved from both the width and that height budget.
const KINETIC_MIN_HOLD=12;
const KineticHeadline:React.FC<{sceneId:string;accentColor:string;top:number;maxHeightPx:number;duration:number;widthPx?:number}> = ({sceneId,accentColor,top,maxHeightPx,duration,widthPx=940}) => {
  const headline=SOLOMON_CREATOR_STORY_V22_HEADLINES[sceneId];
  const frame=useCurrentFrame();
  if(!headline)return null;
  const words=[...headline.primary.split(/\s+/).filter(Boolean).map((text)=>({text,accent:false})),
               ...headline.accentItalic.split(/\s+/).filter(Boolean).map((text)=>({text,accent:true}))];
  if(words.length===0)return null;
  // Chunk so every chunk holds at least KINETIC_MIN_HOLD frames. One word at a
  // time only works when the scene is long enough: friction has six words in
  // thirty frames, which at one-per-swap gave an 8-frame hold against a 7-frame
  // pop -- the word was permanently mid-animation, and the last two words never
  // appeared at all. Chunks stack vertically so shortening the swap list does not
  // shrink the type; size is solved from the longest word, not the whole line.
  const chunkCount=Math.max(1,Math.min(words.length,Math.floor(duration/KINETIC_MIN_HOLD)));
  const perChunk=Math.ceil(words.length/chunkCount);
  const chunks:{text:string;accent:boolean}[][]=[];
  for(let index=0;index<words.length;index+=perChunk)chunks.push(words.slice(index,index+perChunk));
  const hold=Math.max(KINETIC_MIN_HOLD,Math.floor(duration/chunks.length));
  const index=Math.min(chunks.length-1,Math.floor(frame/hold));
  const chunk=chunks[index]!;
  const sinceSwap=frame-index*hold;
  const pop=spring({frame:Math.max(0,sinceSwap),fps:30,config:{damping:11,stiffness:210},durationInFrames:7});
  const GLYPH_EM=.68;
  const longest=Math.max(3,...chunk.map(({text})=>text.length));
  const size=Math.max(52,Math.min(widthPx/(longest*GLYPH_EM),maxHeightPx/chunk.length));
  return <div data-v22-kinetic-headline={sceneId} data-v22-kinetic-word={chunk.map(({text})=>text).join(" ")} style={{position:"absolute",left:0,right:0,top,display:"flex",flexDirection:"column",alignItems:"center",pointerEvents:"none"}}>
    {chunk.map(({text,accent})=><div key={text} style={{fontFamily:"Fraunces Variable,serif",fontSize:size,lineHeight:.92,fontWeight:900,textAlign:"center",whiteSpace:"nowrap",color:accent?accentColor:"var(--v22-fg)",transform:`scale(${.62+.38*pop})`,opacity:Math.min(1,.25+pop*1.3),filter:`blur(${Math.max(0,(1-pop)*6)}px)`}}>{text}</div>)}
  </div>;
};

const INK="#07111f", PAPER="#fbf8f0", WHITE="#fff", MINT="#39f2b5", GREEN="#087052", CORAL="#ff6f61", AMBER="#ff9d18";
const FILES:Record<V22AssetId,string>={tracker_before:"proof-tracker-before.mp4",tracker_after:"proof-tracker-after.mp4",opportunity:"proof-opportunity.mp4",contact:"proof-contact.mp4",outreach_blank:"proof-outreach-blank.mp4",outreach_complete:"proof-outreach-complete.mp4"};
type Crop={x:number;y:number;width:number;height:number;trim:number};
const CROPS={
  trackerBefore:{x:72,y:178,width:560,height:310,trim:145},trackerAfter:{x:258,y:178,width:560,height:310,trim:155},trackerControl:{x:940,y:285,width:430,height:390,trim:105},
  opportunityHeader:{x:72,y:75,width:760,height:265,trim:52},opportunityPanel:{x:75,y:95,width:900,height:520,trim:142},
  contactCard:{x:86,y:510,width:430,height:390,trim:130},contactProof:{x:104,y:610,width:390,height:265,trim:140},
  outreachBlank:{x:82,y:175,width:520,height:590,trim:85},message:{x:594,y:185,width:755,height:560,trim:180},messageDraftEdit:{x:594,y:185,width:755,height:560,trim:75},messageEdit:{x:594,y:185,width:755,height:560,trim:20}
} satisfies Record<string,Crop>;

export const SolomonCreatorStoryV22:React.FC<SolomonCreatorStoryV22Manifest> = (manifest) => <AbsoluteFill style={{background:INK,color:INK,fontFamily:"Manrope Variable,Manrope,sans-serif",overflow:"hidden"}}>
  {manifest.scenes.map((scene)=><Sequence key={scene.id} from={scene.from} durationInFrames={scene.to-scene.from} premountFor={30} name={scene.id}><Scene scene={scene}/></Sequence>)}
  <MascotLayer scenes={manifest.scenes}/>
  {manifest.captions.map((caption)=><Sequence key={caption.id} from={caption.from} durationInFrames={caption.to-caption.from} premountFor={10}><Caption caption={caption}/></Sequence>)}
  <Sequence from={42} durationInFrames={897}><Disclosure/></Sequence>
  <Audio src={staticFile("narration.wav")}/><Audio src={staticFile("sound-design.wav")}/>
</AbsoluteFill>;

// The backdrop lives on the scene record, not the scene component: two shots of
// the same family (the three signature splits) must be able to sit on different
// tiers, and a per-shot luma change is what makes each boundary read as a cut.
const Backdrop:React.FC<React.PropsWithChildren<{token:keyof typeof V22_BACKDROPS}>> = ({token,children}) => {
  const backdrop=V22_BACKDROPS[token];
  return <AbsoluteFill style={{background:backdrop.css,["--v22-fg" as string]:backdrop.foreground}}>{children}</AbsoluteFill>;
};
const Scene:React.FC<{scene:V22Scene}> = ({scene}) => <EditorialCamera scene={scene}><Backdrop token={scene.backdrop}><SceneContent scene={scene}/></Backdrop></EditorialCamera>;

// A ProductBand wrapper was tried here and removed. The idea was to crop each
// scene's content into its declared product rect so the mascot could take the
// lower half of the frame. It cannot work, and the reason is worth recording so
// it is not attempted again:
//
// Measured from the V21 master, scene content occupies 65-83% of frame height in
// every split scene (status .17-.99, grounded .17-1.00, control .17-.98). A band
// of 31% can show at most a third of that, so any crop clips the proof — the spot
// render showed "APPLIED" sliced off mid-word and the Jobs card cut through.
// Re-centring the crop does not help; there is no window position that contains
// content taller than the window.
//
// The scenes are authored as full-frame compositions. A genuine 20-25% presenter
// needs them re-composed as short, wide ones — which is real work on thirteen
// components, not a wrapper.

const SceneContent:React.FC<{scene:V22Scene}> = ({scene}) => {
  if(scene.family==="hook")return <Hook scene={scene}/>;
  if(scene.family==="status")return <Status scene={scene}/>;
  if(scene.family==="contact")return <Contact scene={scene} reasons={false}/>;
  if(scene.family==="reasons"&&scene.id==="reasons")return <Contact scene={scene} reasons/>;
  if(scene.family==="friction")return <Friction scene={scene}/>;
  if(scene.family==="five_surfaces")return <FiveSurfaces scene={scene}/>;
  if(scene.family==="collapse")return <Collapse scene={scene}/>;
  if(scene.family==="role")return <Role scene={scene}/>;
  if(scene.family==="reasons")return <Reason scene={scene}/>;
  if(scene.family==="signature")return <Signature scene={scene}/>;
  if(scene.family==="draft")return <Draft scene={scene}/>;
  if(scene.family==="grounded")return <Grounded scene={scene}/>;
  if(scene.family==="control")return <Control scene={scene}/>;
  if(scene.family==="payoff")return <Payoff scene={scene}/>;
  if(scene.family==="result")return <Result scene={scene}/>;
  if(scene.family==="cta")return <Cta scene={scene}/>;
  return <Sting scene={scene}/>;
};

const Hook:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),flash=interpolate(frame,[0,5,12,20],[.2,1,.55,.15]);return <AbsoluteFill ><div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50% 38%,rgba(57,242,181,${flash*.24}),transparent 48%)`}}/><SerifHeadline sceneId="hook" accentColor={GREEN} fontSize={69} top={1430}/></AbsoluteFill>;};

const Status:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),swap=frame>=10,p=spring({frame:Math.max(0,frame-8),fps:30,config:{damping:14,stiffness:210},durationInFrames:8});return <EvidenceBackground><div style={{position:"absolute",left:70,right:70,top:265,height:600}}><EvidenceCard><EvidenceCrop asset={swap?"tracker_after":"tracker_before"} crop={swap?CROPS.trackerAfter:CROPS.trackerBefore} width={940} height={600}/></EvidenceCard></div><div style={{position:"absolute",left:120,right:120,top:920,display:"flex",alignItems:"center",justifyContent:"center",gap:22,fontSize:34,fontWeight:950}}><StatePill text="APPLIED" active={!swap}/><span style={{fontSize:54,color:GREEN}}>→</span><StatePill text="INTERVIEWING" active={swap}/></div><Cursor frame={frame} from={{x:875,y:980}} to={{x:727,y:1005}} clickAt={9}/>{swap&&<div style={{position:"absolute",left:680,top:445,width:180,height:180,borderRadius:999,border:`8px solid ${MINT}`,opacity:1-p,transform:`scale(${.4+p*1.4})`}}/>}</EvidenceBackground>;};

const Contact:React.FC<{scene:V22Scene;reasons:boolean}> = ({scene,reasons}) => {const frame=useCurrentFrame(),card=spring({frame,fps:30,config:{damping:16,stiffness:180},durationInFrames:8});return <EvidenceBackground accent={reasons?"#dff9f0":"#eef8f4"}><div style={{position:"absolute",left:reasons?55:340,top:reasons?280:300,width:reasons?970:680,height:reasons?690:700,transform:`translateX(${(1-card)*(reasons?-100:140)}px) scale(${.86+.14*card})`}}><EvidenceCard><EvidenceCrop asset="contact" crop={reasons?CROPS.contactProof:CROPS.contactCard} width={reasons?970:680} height={reasons?760:810}/></EvidenceCard></div>{reasons?<ReasonStack frame={frame}/>:<div style={{position:"absolute",left:350,right:55,top:1005,display:"grid",gap:13}}><ProofLabel text="AVERY CHEN" primary/><ProofLabel text="SENIOR TECHNICAL RECRUITER"/><ProofLabel text="NORTHSTAR LABS"/></div>}</EvidenceBackground>;};

const Friction:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <AbsoluteFill ><KineticHeadline sceneId="friction" accentColor={CORAL} top={228} maxHeightPx={258} duration={30}/>{["JOB","PROFILE","NOTES","CONTACT","EMAIL"].map((label,index)=><div key={label} style={{position:"absolute",left:65+(index%2)*460,top:500+Math.floor(index/2)*250,width:420,height:205,padding:26,borderRadius:27,background:WHITE,border:"2px solid #efc4bb",boxShadow:"0 22px 50px rgba(103,44,32,.15)",transform:`translate(${interpolate(frame,[0,10+index*2],[index%2?-430:430,0],{extrapolateRight:"clamp"})}px,${Math.sin((frame+index*7)/8)*5}px) rotate(${index%2?-3:3}deg)`}}><div style={{fontSize:22,fontWeight:950,color:CORAL}}>0{index+1}</div><div style={{fontSize:36,fontWeight:950,marginTop:22}}>{label}</div><div style={{height:10,width:`${52+index*7}%`,background:"#f1ddd8",borderRadius:8,marginTop:24}}/></div>)}</AbsoluteFill>;};

const FiveSurfaces:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),copy=interpolate(frame,[28,70],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});const cards=[{label:"JOB POST",asset:"opportunity" as const,crop:CROPS.opportunityHeader},{label:"PROFILE",asset:"contact" as const,crop:CROPS.contactCard},{label:"NOTES",asset:"opportunity" as const,crop:CROPS.opportunityPanel},{label:"CONTACTS",asset:"contact" as const,crop:CROPS.contactProof},{label:"BLANK MESSAGE",asset:"outreach_blank" as const,crop:CROPS.outreachBlank}];return <AbsoluteFill ><div style={{position:"absolute",left:55,top:105,fontFamily:"Fraunces Variable,serif",fontSize:170,fontWeight:900,color:CORAL,lineHeight:.75}}>5×</div><KineticHeadline sceneId="five" accentColor={CORAL} top={218} maxHeightPx={150} duration={90}/>{cards.map((item,index)=>{const x=52+(index%2)*490,y=390+Math.floor(index/2)*320,enter=spring({frame:Math.max(0,frame-index*7),fps:30,config:{damping:16,stiffness:170},durationInFrames:8});return <div key={item.label} style={{position:"absolute",left:x,top:y,width:450,height:260,borderRadius:25,overflow:"hidden",background:WHITE,border:"2px solid #e8b8ae",boxShadow:"0 20px 45px rgba(103,44,32,.14)",opacity:enter,transform:`scale(${.78+.22*enter})`}}><EvidenceCrop asset={item.asset} crop={item.crop} width={450} height={260}/><div style={{position:"absolute",left:13,bottom:13,padding:"9px 13px",borderRadius:11,background:INK,color:WHITE,fontSize:19,fontWeight:950}}>{item.label}</div></div>})}<div style={{position:"absolute",left:265,top:1170,width:550,height:90,borderRadius:22,background:WHITE,border:`4px solid ${CORAL}`,display:"grid",placeItems:"center",fontSize:28,fontWeight:950,opacity:copy,transform:`translateY(${(1-copy)*80}px)`}}>PRODUCT ENGINEER · NORTHSTAR LABS</div></AbsoluteFill>;};

const Collapse:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),p=spring({frame,fps:30,config:{damping:16,stiffness:160},durationInFrames:8});return <EvidenceBackground>{[0,1,2,3,4].map((index)=>{const angle=index*Math.PI*2/5-Math.PI/2,x=390+Math.cos(angle)*330*(1-p),y=690+Math.sin(angle)*460*(1-p);return <div key={index} style={{position:"absolute",left:x,top:y,width:300,height:170,background:WHITE,border:"2px solid #c8d7d0",borderRadius:18,opacity:1-p*.78,transform:`scale(${1-p*.45}) rotate(${index*4-8}deg)`}}/>})}<div style={{position:"absolute",left:145,top:555,width:790,height:470,opacity:p,transform:`scale(${.65+.35*p})`}}><EvidenceCard border={GREEN}><EvidenceCrop asset="opportunity" crop={CROPS.opportunityHeader} width={790} height={470}/></EvidenceCard></div><KineticHeadline sceneId="collapse" accentColor={GREEN} top={1076} maxHeightPx={190} duration={39}/></EvidenceBackground>;};

const Role:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <EvidenceBackground><div style={{position:"absolute",left:55,top:300,width:700,height:620}}><EvidenceCard><EvidenceCrop asset="opportunity" crop={CROPS.opportunityHeader} width={700} height={620}/></EvidenceCard></div><div style={{position:"absolute",left:80,top:970,width:620,display:"grid",gap:15}}><ProofLabel text="PRODUCT ENGINEER" primary/><ProofLabel text="NORTHSTAR LABS"/></div><Connector frame={frame} from={{x:410,y:930}} to={{x:410,y:970}}/></EvidenceBackground>;};

const Reason:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <EvidenceBackground><div style={{position:"absolute",left:340,top:280,width:690,height:780}}><EvidenceCard><EvidenceCrop asset="contact" crop={CROPS.contactCard} width={690} height={780}/></EvidenceCard></div><div style={{position:"absolute",left:350,right:55,top:1000,display:"grid",gap:12}}>{["WORKS AT NORTHSTAR LABS","RELEVANT RECRUITING ROLE","SUPPORTING EVIDENCE INCLUDED"].map((text,index)=><ProofLabel key={text} text={text} primary={index===0} delay={index*7} frame={frame}/>)}</div></EvidenceBackground>;};

const Signature:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame()+(scene.from-scene.groupFrom),phase=Math.min(3,Math.floor(frame/28)),travel=(frame%28)/28;const tokens=[{label:"JOB",x:65,asset:"opportunity" as const,crop:CROPS.opportunityHeader},{label:"PERSON",x:315,asset:"contact" as const,crop:CROPS.contactCard},{label:"PROOF",x:565,asset:"contact" as const,crop:CROPS.contactProof},{label:"MESSAGE",x:815,asset:"outreach_complete" as const,crop:CROPS.message}];return <AbsoluteFill ><KineticHeadline sceneId="signature" accentColor={GREEN} top={250} maxHeightPx={300} duration={55}/>{tokens.map((token,index)=>{const active=index<=phase,enter=spring({frame:Math.max(0,frame-index*26),fps:30,config:{damping:16,stiffness:170},durationInFrames:8});return <div key={token.label} style={{position:"absolute",left:token.x,top:720,width:200,height:300,borderRadius:24,overflow:"hidden",background:WHITE,border:`4px solid ${active?GREEN:"#b9cbc4"}`,boxShadow:"0 20px 45px rgba(7,17,31,.15)",opacity:.25+.75*enter,transform:`translateY(${(1-enter)*80}px) scale(${.75+.25*enter})`}}><EvidenceCrop asset={token.asset} crop={token.crop} width={200} height={300}/><div style={{position:"absolute",left:10,right:10,bottom:10,padding:"10px 5px",borderRadius:11,background:index===3?MINT:INK,color:index===3?INK:WHITE,textAlign:"center",fontSize:20,fontWeight:950}}>{token.label}</div></div>})}{phase<3&&<div data-v22-context-dot style={{position:"absolute",left:tokens[phase]!.x+160+(tokens[phase+1]!.x-tokens[phase]!.x-40)*travel,top:1062,width:42,height:42,borderRadius:999,background:MINT,boxShadow:"0 0 24px rgba(57,242,181,.9)"}}/>}</AbsoluteFill>;};

const Draft:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),complete=frame>=18,p=spring({frame:Math.max(0,frame-14),fps:30,config:{damping:16,stiffness:180},durationInFrames:8});return <EvidenceBackground><div style={{position:"absolute",left:55,top:310,width:970,height:850}}><EvidenceCard border={complete?GREEN:undefined}><EvidenceCrop asset={complete?"outreach_complete":"outreach_blank"} crop={complete?CROPS.messageDraftEdit:CROPS.outreachBlank} width={970} height={850}/></EvidenceCard></div>{complete&&<><div style={{position:"absolute",left:94,top:995,width:870,height:16,borderRadius:9,background:MINT,opacity:.85*p,transform:`scaleX(${p})`,transformOrigin:"left"}}/><div style={{position:"absolute",left:95,top:1185,padding:"13px 19px",borderRadius:14,background:INK,color:WHITE,fontSize:29,fontWeight:950,opacity:p}}>SAVE EDIT · DRAFT NOT SENT</div></>}</EvidenceBackground>;};

// The grounded beat introduces a new idea (generic → grounded), so its boundary
// is a real cut: the card arrives with a fast slide rather than morphing
// continuously out of the draft scene, which is what the declared match_cut says.
const Grounded:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),reveal=interpolate(frame,[10,55],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),arrive=spring({frame,fps:30,config:{damping:18,stiffness:220},durationInFrames:7});return <EvidenceBackground accent="#e6f6ee"><div style={{position:"absolute",left:55,top:300,width:970,height:820,transform:`translateX(${(1-arrive)*640}px)`}}><EvidenceCard border={GREEN}><EvidenceCrop asset="outreach_complete" crop={CROPS.message} width={970} height={820}/><div style={{position:"absolute",left:67,top:328,width:760*reveal,height:72,borderRadius:12,background:"rgba(57,242,181,.24)",borderBottom:`7px solid ${MINT}`}}/></EvidenceCard></div><div style={{position:"absolute",left:80,right:80,top:1115,display:"flex",gap:18,alignItems:"center",justifyContent:"center",fontSize:29,fontWeight:950}}><span style={{padding:"14px 18px",borderRadius:14,background:"#ffe2dc",color:CORAL,textDecoration:"line-through"}}>GENERIC OPENER</span><span style={{fontSize:52}}>→</span><span style={{padding:"14px 18px",borderRadius:14,background:MINT}}>ROLE + RELEVANCE</span></div></EvidenceBackground>;};

const Control:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <EvidenceBackground><div style={{position:"absolute",left:330,top:275,width:700,height:720}}><EvidenceCard border={GREEN}><EvidenceCrop asset="outreach_complete" crop={CROPS.messageEdit} width={700} height={830} playback/></EvidenceCard></div><div style={{position:"absolute",left:350,right:55,top:1010,display:"grid",gap:12}}><ProofLabel text="SAVE EDIT" primary/><ProofLabel text="CANCEL · SEND UNTOUCHED"/><div style={{padding:"16px 20px",borderRadius:15,background:INK,color:WHITE,fontSize:27,fontWeight:950}}>NOTHING SENDS WITHOUT YOU</div></div><Cursor frame={frame} from={{x:890,y:1040}} to={{x:660,y:985}} clickAt={78}/></EvidenceBackground>;};

const Payoff:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),collapse=interpolate(frame,[0,42],[0,1],{extrapolateRight:"clamp"}),result=spring({frame:Math.max(0,frame-35),fps:30,config:{damping:15,stiffness:155},durationInFrames:8});const windows=[{asset:"tracker_after" as const,crop:CROPS.trackerAfter,x:30,y:330},{asset:"opportunity" as const,crop:CROPS.opportunityHeader,x:560,y:300},{asset:"contact" as const,crop:CROPS.contactCard,x:65,y:870},{asset:"outreach_complete" as const,crop:CROPS.message,x:565,y:850},{asset:"outreach_blank" as const,crop:CROPS.outreachBlank,x:310,y:1230}];return <AbsoluteFill >{windows.map((item,index)=><div key={index} style={{position:"absolute",left:item.x+(390-item.x)*collapse,top:item.y+(610-item.y)*collapse,width:480,height:300,borderRadius:23,overflow:"hidden",background:WHITE,border:"2px solid #b9cbc4",opacity:1-collapse,transform:`scale(${1-collapse*.55}) rotate(${index%2?-4:4}deg)`}}><EvidenceCrop asset={item.asset} crop={item.crop} width={480} height={300}/></div>)}<div data-v22-connected-result style={{position:"absolute",left:42,top:285,width:996,height:1010,borderRadius:36,background:WHITE,border:`7px solid ${GREEN}`,boxShadow:"0 32px 90px rgba(7,17,31,.22)",opacity:result,transform:`scale(${.7+.3*result})`,overflow:"hidden"}}><ConnectedBoard frame={frame}/></div><div style={{opacity:result}}><KineticHeadline sceneId="payoff" accentColor={GREEN} top={1344} maxHeightPx={210} duration={105}/></div></AbsoluteFill>;};

const Result:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),pulse=1+Math.sin(frame/9)*.012;return <EvidenceBackground accent="#d5f8ec"><div data-v22-connected-result style={{position:"absolute",left:45,top:260,width:990,height:780,borderRadius:36,background:WHITE,border:`7px solid ${GREEN}`,boxShadow:"0 32px 90px rgba(7,17,31,.22)",transform:`scale(${pulse})`,overflow:"hidden"}}><ConnectedBoard frame={frame+80}/></div><SerifHeadline sceneId="result" accentColor={GREEN} fontSize={54} top={1055}/></EvidenceBackground>;};

const ConnectedBoard:React.FC<{frame:number}> = ({frame}) => <div style={{position:"absolute",inset:0,padding:32,display:"grid",gridTemplateRows:"170px 275px 1fr",gap:18,background:"linear-gradient(145deg,#fff,#f2fbf7)"}}><div style={{position:"relative",overflow:"hidden",borderRadius:22,border:`3px solid ${GREEN}`}}><EvidenceCrop asset="tracker_after" crop={CROPS.trackerAfter} width={932} height={170}/><div style={{position:"absolute",left:14,bottom:12,padding:"9px 14px",borderRadius:11,background:INK,color:WHITE,fontSize:22,fontWeight:950}}>PRODUCT ENGINEER · INTERVIEWING</div></div><div style={{display:"grid",gridTemplateColumns:".9fr 1.1fr",gap:16}}><div style={{position:"relative",overflow:"hidden",borderRadius:22,border:"2px solid #c9d8d1"}}><EvidenceCrop asset="contact" crop={CROPS.contactCard} width={410} height={275}/><div style={{position:"absolute",left:12,bottom:12,padding:"8px 12px",borderRadius:10,background:INK,color:WHITE,fontSize:18,fontWeight:950}}>AVERY CHEN</div></div><div style={{position:"relative",overflow:"hidden",borderRadius:22,border:"2px solid #c9d8d1"}}><EvidenceCrop asset="contact" crop={CROPS.contactProof} width={506} height={275}/><div style={{position:"absolute",right:12,bottom:12,padding:"8px 12px",borderRadius:10,background:MINT,color:INK,fontSize:18,fontWeight:950}}>SUPPORTING EVIDENCE</div></div></div><div style={{position:"relative",overflow:"hidden",borderRadius:22,border:"2px solid #c9d8d1"}}><EvidenceCrop asset="outreach_complete" crop={CROPS.message} width={932} height={497}/><div style={{position:"absolute",left:14,bottom:14,display:"flex",gap:9}}><span style={{padding:"9px 14px",borderRadius:10,background:GREEN,color:WHITE,fontSize:18,fontWeight:950}}>EDITABLE · UNSENT</span><span style={{padding:"9px 14px",borderRadius:10,background:WHITE,border:"2px solid #c9d8d1",fontSize:18,fontWeight:900}}>Save Edit · Cancel</span></div><div style={{position:"absolute",right:14,bottom:22,fontSize:18,fontWeight:850,color:GREEN,opacity:interpolate(frame,[40,55],[0,1],{extrapolateRight:"clamp"})}}>Nothing sends automatically</div></div><div style={{position:"absolute",right:44,top:9,fontSize:12,fontWeight:900,letterSpacing:2,color:GREEN}}>CONCEPTUAL ASSEMBLY · APPROVED PRODUCT EVIDENCE</div></div>;

// Stacked bands, matching the declared `cta` layout rects exactly:
//   headline 212-344 | mascot 422-1181 (rig fitted, antenna tops out at 437)
//   comment 1238-1536 | handle 1622-1718
// V16 put the comment box at y1190 under a mascot whose torso reached y1471, so
// the box was hidden behind the rig. The dim overlay is gone too: 42% ink over a
// pale mint gradient is what made the frame read muddy rather than deliberately
// dimmed. Background now comes from the scene backdrop.
const Cta:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),type=spring({frame:Math.max(0,frame-38),fps:30,config:{damping:14,stiffness:190},durationInFrames:8}),pulse=frame>=58?1+Math.sin((frame-58)/4)*.05*Math.max(0,1-(frame-58)/48):1;return <AbsoluteFill><SerifHeadline sceneId="cta" accentColor={MINT} fontSize={70} top={212}/><div data-v22-comment-box style={{position:"absolute",left:130,right:130,top:1252,transform:`scale(${pulse})`}}><div style={{padding:"22px 28px",borderRadius:24,background:"rgba(255,255,255,.94)",border:`4px solid ${MINT}`,boxShadow:`0 0 ${34+type*46}px rgba(57,242,181,${.2+.35*type})`,display:"flex",alignItems:"center",gap:16}}><div style={{width:52,height:52,borderRadius:999,background:INK,display:"grid",placeItems:"center",color:MINT,fontSize:26,fontWeight:950}}>S</div><div style={{fontSize:38,fontWeight:950,letterSpacing:1,color:INK}}>{"SOLOMON".slice(0,Math.max(1,Math.round(type*7)))}<span style={{opacity:.35}}>|</span></div></div><div style={{marginTop:18,textAlign:"center",fontSize:24,fontWeight:900,color:"var(--v22-fg)",opacity:.92}}>COMMENT AND THE DEMO ARRIVES IN YOUR DMS</div></div><div style={{position:"absolute",left:365,right:365,top:1636,padding:"10px 14px",borderRadius:999,background:INK,color:WHITE,textAlign:"center",fontSize:23,fontWeight:900,letterSpacing:2}}>@SOLOMON</div></AbsoluteFill>;};

const Sting:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),p=spring({frame,fps:30,config:{damping:15,stiffness:175},durationInFrames:8});return <AbsoluteFill style={{display:"grid",placeItems:"center"}}><div style={{fontFamily:"Fraunces Variable,serif",fontSize:120,fontWeight:900,color:WHITE,transform:`scale(${.8+.2*p})`,opacity:p}}>{(SOLOMON_CREATOR_STORY_V22_HEADLINES["sting"]?.primary??"SOLOMON.").replace(/\.$/,"")}<span style={{color:AMBER}}>.</span></div></AbsoluteFill>;};

const EvidenceCrop:React.FC<{asset:V22AssetId;crop:Crop;width:number;height:number;playback?:boolean}> = ({asset,crop,width,height,playback=false}) => {const scale=Math.max(width/crop.width,height/crop.height),videoWidth=1440*scale,videoHeight=900*scale,focusScale=1.02;return <div data-v22-product={asset} style={{position:"absolute",inset:0,overflow:"hidden",background:WHITE}}><Video src={staticFile(FILES[asset])} trimBefore={crop.trim} muted playbackRate={playback?1:0.35} style={{position:"absolute",left:-crop.x*scale,top:-crop.y*scale,width:videoWidth,height:videoHeight,maxWidth:"none",transform:`scale(${focusScale})`,transformOrigin:`${(crop.x+crop.width/2)/14.4}% ${(crop.y+crop.height/2)/9}%`}}/></div>;};
const EvidenceCard:React.FC<React.PropsWithChildren<{border?:string}>> = ({children,border}) => <div style={{position:"absolute",inset:0,overflow:"hidden",borderRadius:32,background:WHITE,border:`${border?5:2}px solid ${border??"rgba(7,17,31,.12)"}`,boxShadow:"0 28px 70px rgba(7,17,31,.18)"}}>{children}</div>;
// Background now comes from the scene backdrop; this is only a positioning shell.
const EvidenceBackground:React.FC<React.PropsWithChildren<{accent?:string}>> = ({children}) => <AbsoluteFill>{children}</AbsoluteFill>;
// Camera stays inside V22_CAMERA_ENVELOPE so no layout rect can cross the frame
// edge. V22 locks it off: the continuous sine sway is gone and the declared push
// is quantized to whole pixels.
//
// Through V20 this element applied a translate AND a scale that both changed on
// every single frame, to every scene. Calm damping only applied to
// product_annotation scenes, so most of the film ran at damp .75 — sway of
// +/-4.5px and +/-3.75px, never landing on a whole pixel. Measured on the V20
// master, the headline text churned at a mean per-frame delta of ~3.0 against a
// truly static backdrop's 0.01, roughly 4.5x the mascot's own drift. Type has
// the densest edges in the frame, so it suffered most.
//
// This is the same finding V18 reached about EvidenceCrop's sine pan, one level
// up: decorative per-frame drift that no metric could see, because
// measureV22Motion decodes at 180x320 and 5fps and averages it away. The
// reference videos hold their shots and let the cut supply the energy.
//
// The transform itself lives in creatorStoryV22Quality as the pure function
// v22CameraTransform, so HeldStability.test can assert frame-to-frame identity
// without a Remotion context. This component is only the wiring.
const EditorialCamera:React.FC<React.PropsWithChildren<{scene:V22Scene}>> = ({scene,children}) => {
  const frame=useCurrentFrame();
  const camera=v22CameraTransform(scene,frame);
  return <AbsoluteFill data-v22-camera={scene.camera.recipe} data-v22-calm={camera.calm?"true":"false"} style={{transform:camera.transform,transformOrigin:`${scene.camera.focus.x*100}% ${scene.camera.focus.y*100}%`}}>{children}</AbsoluteFill>;
};
const Disclosure=()=> <div data-v22-disclosure style={{position:"absolute",left:26,top:26,zIndex:80,padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,.84)",border:"1px solid rgba(7,112,82,.25)",color:GREEN,fontSize:14,fontWeight:900,letterSpacing:2}}>DEMO DATA</div>;
const StatePill:React.FC<{text:string;active:boolean}> = ({text,active}) => <div style={{padding:"18px 25px",borderRadius:18,background:active?GREEN:WHITE,color:active?WHITE:INK,border:`3px solid ${active?GREEN:"#c9d8d1"}`,boxShadow:active?"0 12px 30px rgba(7,112,82,.22)":"none"}}>{text}</div>;
const ProofLabel:React.FC<{text:string;primary?:boolean;delay?:number;frame?:number}> = ({text,primary=false,delay=0,frame=30}) => {const p=spring({frame:Math.max(0,frame-delay),fps:30,config:{damping:16,stiffness:190},durationInFrames:8});return <div style={{padding:"15px 20px",borderRadius:15,background:primary?INK:WHITE,color:primary?WHITE:INK,border:`2px solid ${primary?INK:"#c9d8d1"}`,fontSize:25,fontWeight:950,opacity:p,transform:`translateX(${(1-p)*45}px)`}}>{text}</div>;};
const ReasonStack:React.FC<{frame:number}> = ({frame}) => <div style={{position:"absolute",left:90,right:90,top:960,display:"grid",gap:13}}>{["WORKS AT NORTHSTAR LABS","RELEVANT RECRUITING ROLE","SUPPORTING EVIDENCE INCLUDED"].map((text,index)=><ProofLabel key={text} text={text} primary={index===0} delay={index*7} frame={frame}/>)}</div>;
const Cursor:React.FC<{frame:number;from:{x:number;y:number};to:{x:number;y:number};clickAt:number}> = ({frame,from,to,clickAt}) => {const p=interpolate(frame,[0,Math.max(1,clickAt-2)],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),click=interpolate(frame,[clickAt-1,clickAt,clickAt+4],[1,.8,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});return <svg viewBox="0 0 40 52" width="56" height="73" style={{position:"absolute",left:from.x+(to.x-from.x)*p,top:from.y+(to.y-from.y)*p,zIndex:60,transform:`scale(${click})`,filter:"drop-shadow(0 4px 4px rgba(0,0,0,.42))"}}><path d="M4 3 L4 39 L14 30 L22 48 L30 44 L22 27 L36 27 Z" fill="#fff" stroke="#111827" strokeWidth="3"/></svg>;};
const Connector:React.FC<{frame:number;from:{x:number;y:number};to:{x:number;y:number}}> = ({frame,from,to}) => {const p=interpolate(frame,[4,25],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});return <svg width="1080" height="1920" style={{position:"absolute",inset:0}}><path d={`M${from.x} ${from.y} Q${(from.x+to.x)/2+70} ${(from.y+to.y)/2} ${to.x} ${to.y}`} fill="none" stroke={MINT} strokeWidth="9" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-p}/></svg>;};

const Caption:React.FC<{caption:V22Caption}> = ({caption}) => {const frame=useCurrentFrame(),{durationInFrames}=useVideoConfig(),enter=spring({frame,fps:30,config:{damping:17,stiffness:185},durationInFrames:9}),opacity=interpolate(frame,[Math.max(0,durationInFrames-4),durationInFrames],[1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  // Kinetic typography: instead of holding one chip for the whole window (up to
  // 3.4s, which reads as a label), swap 1-2 word groups every ~14 frames with a
  // scale pop, so the words on screen track the words being spoken. This is the
  // reference pattern and the source of their high median frame change - the
  // picture still rests between swaps, so calm is preserved.
  const local=frame+caption.from;
  const group=caption.wordGroups.find((item)=>local>=item.from&&local<item.to)??caption.wordGroups.at(-1);
  if(!group)return null;
  const sinceSwap=local-group.from;
  const pop=spring({frame:Math.max(0,sinceSwap),fps:30,config:{damping:13,stiffness:260},durationInFrames:6});
  const text=group.text;
  const highlightIndex=caption.highlight?text.toLowerCase().indexOf(caption.highlight.toLowerCase()):-1;
  const pre=highlightIndex>=0?text.slice(0,highlightIndex):text;
  const highlighted=highlightIndex>=0?text.slice(highlightIndex,highlightIndex+(caption.highlight?.length??0)):undefined;
  const post=highlightIndex>=0?text.slice(highlightIndex+(caption.highlight?.length??0)):"";
  const scale=(.82+.18*pop)*(group.emphasis?1.12:1);
  return <div data-v22-caption={caption.id} data-v22-word-group={group.text} style={{position:"absolute",left:45,right:45,[caption.zone==="top"?"top":"bottom"]:caption.zone==="top"?82:92,display:"flex",justifyContent:"center",zIndex:70,opacity,transform:`translateY(${(1-enter)*(caption.zone==="top"?-25:25)}px)`}}><div style={{padding:"12px 18px",borderRadius:14,background:"rgba(7,17,31,.91)",color:WHITE,fontSize:group.emphasis?44:40,lineHeight:1.06,textAlign:"center",fontWeight:950,boxShadow:"0 12px 30px rgba(0,0,0,.18)",transform:`scale(${scale})`,transformOrigin:caption.zone==="top"?"50% 0%":"50% 100%"}}>{pre}{highlighted&&<span style={{color:MINT}}>{highlighted}</span>}{post}</div></div>;};
