import { Audio } from "@remotion/media";
import { Img } from "remotion";
import { AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { V22_BACKDROPS, V22_TEXT_ZONES, v22CameraTransform, v22ProductStillFile, type V22BackdropToken } from "../../shared/creatorStoryV22Quality";
import { SOLOMON_CREATOR_STORY_V22_HEADLINES, type SolomonCreatorStoryV22Manifest, type V22AssetId, type V22Caption, type V22Scene } from "../../shared/solomonCreatorStoryV22";
import { MascotLayer } from "./MascotLayer";


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

// Scene content is pinned to this floor rather than to hand-set tops, so growing
// the presenter can never again slide it over proof text -- which is what dropped
// the `relevance` and `control` claims. The floor clears the antenna, not the
// mascot box: the rig bleeds 48px above its rect (svg overflow is visible), so
// with the band at .56 the real obstacle is y=1027, not y=1075.
// No headlines are rendered. Nine were declared and only four were ever
// spoken -- "THE OLD WAY SCATTERS THE STORY" and four others appeared while the
// narration said something else entirely -- and the four that were spoken drew
// the same phrase the caption was already showing, so those words appeared
// twice at once in two type treatments. The word-synced captions are now the
// only type in the film. The headline records stay in the manifest because
// numeralAnchors and the hook audit bind on them.
const V22_CONTENT_FLOOR_BOTTOM=1920-1015;
const INK="#07111f", PAPER="#fbf8f0", WHITE="#fff", MINT="#39f2b5", GREEN="#087052", AMBER="#ff9d18";
type Crop={x:number;y:number;width:number;height:number;trim:number;motion?:{frames:number;step:number;hold:number}};
// Product proof renders from pre-extracted stills. See V22_PRODUCT_STILLS in
// creatorStoryV22Quality for why: fifteen decoding <Video> elements made the render
// nondeterministic, and byte-identical code produced 19, 19 and 33 shots. There is now no
// decoding element left in the tree at all -- a crop that needs to move plays a
// still sequence instead (the `motion` field on Crop), so nothing here can decode
// differently between runs.
// Edge density: what was tried, what the measurements said, and where it stopped.
//
// The plan was to re-author every crop to match its container's aspect, on the
// theory that cover-fit discarding 40-77% of a region was inflating edge density.
// Measured on source pixels before rendering anything, aspect-matching makes it
// 52% WORSE (area-weighted across the seven severe usages). The reason is the
// opposite of the theory: a large discard means the container shows a small
// centre slice magnified, and a magnified slice carries fewer edges per rendered
// pixel than the whole element shown small. Discard is a composition problem --
// cards showing arbitrary slices -- not an edge-density lever, and fixing it
// costs edge density. Do not re-author for aspect alone.
//
// Magnification does not work either, at any scale. The film-wide
// PRODUCT_FOCUS_SCALE 1.02->1.18 test moved 2.33->2.34; a 1x-3.5x sweep on the
// message panel is non-monotonic (3.36, 2.69, 2.82, 3.00) and only collapses
// past 2.8x because the crop lands on blank space, which is not evidence.
//
// What did work is editorial: the message panels are two-thirds empty box below
// the text, and the Jobs page is mostly a form nobody reads. Showing the part
// that carries the claim, in a band, at a size a phone can read, took the film
// from 2.18% to 2.03% time-weighted. Two corrections along the way, both caught
// on frame and neither by any gate: framing `role`'s title edge-to-edge let
// PRODUCT_FOCUS_SCALE clip the "J" off "Jobs", and widening `control` while
// shortening it held the area constant and raised its density from 2.39 to 2.59.
//
// 2.03% against references at 1.65/1.95/1.96. The remaining 4% gap needs the
// evidence smaller than a phone can read, so it stays. The references film
// people; this films a product.
const CROPS={
  trackerBefore:{x:72,y:178,width:560,height:357,trim:145},trackerAfter:{x:258,y:178,width:560,height:357,trim:155,motion:{frames:12,step:3,hold:4}},trackerControl:{x:940,y:285,width:430,height:390,trim:105},
  opportunityHeader:{x:72,y:75,width:760,height:265,trim:52},opportunityTitle:{x:76,y:88,width:740,height:116,trim:52},opportunityBoard:{x:72,y:75,width:760,height:491,trim:52},opportunityPanel:{x:75,y:95,width:900,height:520,trim:142},
  contactCard:{x:86,y:510,width:430,height:390,trim:130},contactHeader:{x:96,y:556,width:408,height:175,trim:130},contactProof:{x:104,y:610,width:404,height:265,trim:140},
  outreachBlank:{x:82,y:175,width:520,height:590,trim:85},outreachDraftCard:{x:96,y:188,width:490,height:562,trim:85},
  message:{x:602,y:196,width:742,height:330,trim:180,motion:{frames:12,step:3,hold:4}},messageDraftEdit:{x:602,y:196,width:742,height:300,trim:75,motion:{frames:12,step:3,hold:4}},messageEdit:{x:602,y:196,width:742,height:300,trim:53}
} satisfies Record<string,Crop>;

export const SolomonCreatorStoryV22:React.FC<SolomonCreatorStoryV22Manifest> = (manifest) => <AbsoluteFill style={{background:INK,color:INK,fontFamily:"Manrope Variable,Manrope,sans-serif",overflow:"hidden"}}>
  {manifest.scenes.map((scene)=><Sequence key={scene.id} from={scene.from} durationInFrames={scene.to-scene.from} premountFor={30} name={scene.id}><Scene scene={scene}/></Sequence>)}
  <MascotLayer scenes={manifest.scenes}/>
  {manifest.captions.map((caption)=><Sequence key={caption.id} from={caption.from} durationInFrames={caption.to-caption.from} premountFor={10}><Caption caption={caption} scenes={manifest.scenes}/></Sequence>)}
  <Sequence from={45} durationInFrames={959}><Disclosure/></Sequence>
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

const Hook:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),flash=interpolate(frame,[0,5,12,20],[.2,1,.55,.15]);return <AbsoluteFill ><div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50% 38%,rgba(57,242,181,${flash*.24}),transparent 48%)`}}/></AbsoluteFill>;};

const Status:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),swap=frame>=10,p=spring({frame:Math.max(0,frame-8),fps:30,config:{damping:20,stiffness:190},durationInFrames:16});return <EvidenceBackground><div style={{position:"absolute",left:70,right:70,top:265,height:600}}><EvidenceCard><EvidenceCrop asset={swap?"tracker_after":"tracker_before"} crop={swap?CROPS.trackerAfter:CROPS.trackerBefore} width={940} height={600}/></EvidenceCard></div><div style={{position:"absolute",left:120,right:120,top:920,display:"flex",alignItems:"center",justifyContent:"center",gap:22,fontSize:34,fontWeight:950}}><StatePill text="APPLIED" active={!swap}/><span style={{fontSize:54,color:GREEN}}>→</span><StatePill text="INTERVIEWING" active={swap}/></div><Cursor frame={frame} from={{x:875,y:980}} to={{x:727,y:1005}} clickAt={9}/>{swap&&<div style={{position:"absolute",left:680,top:445,width:180,height:180,borderRadius:999,border:`8px solid ${MINT}`,opacity:1-p,transform:`scale(${.4+p*1.4})`}}/>}</EvidenceBackground>;};

const Contact:React.FC<{scene:V22Scene;reasons:boolean}> = ({scene,reasons}) => {const frame=useCurrentFrame(),card=spring({frame,fps:30,config:{damping:16,stiffness:180},durationInFrames:8});return <EvidenceBackground><div style={{position:"absolute",left:reasons?55:340,top:reasons?280:300,width:reasons?970:680,height:reasons?530:510,transform:`translateX(${(1-card)*(reasons?-100:140)}px) scale(${.86+.14*card})`}}><EvidenceCard><EvidenceCrop asset="contact" crop={reasons?CROPS.contactProof:CROPS.contactCard} width={reasons?970:680} height={reasons?530:510}/></EvidenceCard></div>{reasons?<ReasonStack frame={frame}/>:<div style={{position:"absolute",left:350,right:55,bottom:V22_CONTENT_FLOOR_BOTTOM,display:"grid",gap:10}}><ProofLabel text="AVERY CHEN" primary/><ProofLabel text="SENIOR TECHNICAL RECRUITER"/><ProofLabel text="NORTHSTAR LABS"/></div>}</EvidenceBackground>;};

const Friction:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <AbsoluteFill >{/* The surfaces flank the presenter rather than sitting behind or above it.
      Behind was the original layout and the mascot simply covered them: the host
      rig fills y513-1498 at scale 1.047 against cards at y500-1205. Above does
      not fit either -- the caption band runs to 190, the headline to 486 and the
      antenna bleed starts at 465, so a row there lands on the type. The rig only
      spans x194-886, which leaves a clear 190px column down each edge, and
      surfaces pressing in from both sides is what "tabs crowd the presenter"
      meant in the first place. */}
    {[{asset:"opportunity" as const,crop:CROPS.opportunityHeader},{asset:"contact" as const,crop:CROPS.contactCard},{asset:"opportunity" as const,crop:CROPS.opportunityPanel},{asset:"contact" as const,crop:CROPS.contactProof},{asset:"outreach_blank" as const,crop:CROPS.outreachBlank}].map((surface,index)=><div key={`${surface.asset}-${index}`} style={{position:"absolute",left:index%2?888:2,top:520+Math.floor(index/2)*200+(index%2?40:0),width:190,height:150,borderRadius:18,overflow:"hidden",background:WHITE,border:"2px solid #efc4bb",boxShadow:"0 14px 32px rgba(103,44,32,.15)",transform:`translate(${interpolate(frame,[0,10+index*2],[index%2?430:-430,0],{extrapolateRight:"clamp"})}px,${Math.sin((frame+index*7)/8)*5}px) rotate(${index%2?-2:2}deg)`}}><EvidenceCrop asset={surface.asset} crop={surface.crop} width={190} height={150}/></div>)}</AbsoluteFill>;};

const FiveSurfaces:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();const cards=[{label:"JOB POST",asset:"opportunity" as const,crop:CROPS.opportunityHeader},{label:"PROFILE",asset:"contact" as const,crop:CROPS.contactCard},{label:"NOTES",asset:"opportunity" as const,crop:CROPS.opportunityPanel},{label:"CONTACTS",asset:"contact" as const,crop:CROPS.contactProof},{label:"BLANK MESSAGE",asset:"outreach_blank" as const,crop:CROPS.outreachBlank}];return <AbsoluteFill >{cards.map((item,index)=>{const x=52+(index%2)*490,y=390+Math.floor(index/2)*320,enter=spring({frame:Math.max(0,frame-index*7),fps:30,config:{damping:20,stiffness:170},durationInFrames:16});return <div key={item.label} style={{position:"absolute",left:x,top:y,width:450,height:260,borderRadius:25,overflow:"hidden",background:WHITE,border:"2px solid #e8b8ae",boxShadow:"0 20px 45px rgba(103,44,32,.14)",opacity:enter,transform:`scale(${.78+.22*enter})`}}><EvidenceCrop asset={item.asset} crop={item.crop} width={450} height={260}/></div>})}</AbsoluteFill>;};

const Collapse:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),p=spring({frame,fps:30,config:{damping:16,stiffness:160},durationInFrames:8});return <EvidenceBackground>{[0,1,2,3,4].map((index)=>{const angle=index*Math.PI*2/5-Math.PI/2,x=390+Math.cos(angle)*330*(1-p),y=690+Math.sin(angle)*460*(1-p);const surface=placeholderSurface(scene.backdrop);return <div key={index} style={{position:"absolute",left:x,top:y,width:300,height:170,background:surface.background,border:`2px solid ${surface.border}`,borderRadius:18,opacity:1-p*.78,transform:`scale(${1-p*.45}) rotate(${index*4-8}deg)`}}/>})}<div style={{position:"absolute",left:60,top:736,width:960,height:620,opacity:p,transform:`scale(${.65+.35*p})`}}><EvidenceCard border={GREEN}><EvidenceCrop asset="opportunity" crop={CROPS.opportunityBoard} width={960} height={620}/></EvidenceCard></div></EvidenceBackground>;};

const Role:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <EvidenceBackground><div style={{position:"absolute",left:40,top:400,width:1000,height:157}}><EvidenceCard><EvidenceCrop asset="opportunity" crop={CROPS.opportunityTitle} width={1000} height={157}/></EvidenceCard></div><div style={{position:"absolute",left:44,top:590,width:620,display:"grid",gap:10}}><ProofLabel text="PRODUCT ENGINEER" primary/><ProofLabel text="NORTHSTAR LABS"/></div></EvidenceBackground>;};

const Reason:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <EvidenceBackground><div style={{position:"absolute",left:110,top:330,width:860,height:369}}><EvidenceCard><EvidenceCrop asset="contact" crop={CROPS.contactHeader} width={860} height={369}/></EvidenceCard></div><div style={{position:"absolute",left:120,right:110,bottom:V22_CONTENT_FLOOR_BOTTOM,display:"grid",gap:10}}>{["WORKS AT NORTHSTAR LABS","RELEVANT RECRUITING ROLE","SUPPORTING EVIDENCE INCLUDED"].map((text,index)=><ProofLabel key={text} text={text} primary={index===0} delay={index*7} frame={frame}/>)}</div></EvidenceBackground>;};

// The token cards showed whole product surfaces at 200px wide, rendering their
// 10px UI text at 7px. The composite check reads 27-38px and no four-across
// token can reach it -- even a 420px card only gets to 14px -- so these were
// unreadable by arithmetic rather than by accident, and the critic flagged all
// four frames of them.
//
// They are tokens, so they say what they are. The label was already present at
// 15px in the card's foot; it is the card now. No claim result frame falls in
// these scenes, so no evidence is lost -- the travelling dot still carries the
// beat, which is four things connecting rather than four things being read.
const Signature:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame()+(scene.from-scene.groupFrom),phase=Math.min(3,Math.floor(frame/28)),travel=(frame%28)/28;const tokens=[{label:"JOB",x:65,asset:"opportunity" as const,crop:CROPS.opportunityHeader},{label:"PERSON",x:315,asset:"contact" as const,crop:CROPS.contactCard},{label:"PROOF",x:565,asset:"contact" as const,crop:CROPS.contactProof},{label:"MESSAGE",x:815,asset:"outreach_complete" as const,crop:CROPS.message}];return <AbsoluteFill >{tokens.map((token,index)=>{const active=index<=phase,enter=spring({frame:Math.max(0,frame-index*26),fps:30,config:{damping:20,stiffness:170},durationInFrames:16});return <div key={token.label} style={{position:"absolute",left:token.x,top:620,width:200,height:300,borderRadius:24,overflow:"hidden",background:WHITE,border:`4px solid ${active?GREEN:"#b9cbc4"}`,boxShadow:"0 20px 45px rgba(7,17,31,.15)",opacity:.25+.75*enter,transform:`translateY(${(1-enter)*80}px) scale(${.75+.25*enter})`}}><div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",padding:14,textAlign:"center",fontSize:34,fontWeight:950,letterSpacing:1,lineHeight:1.05,color:active?GREEN:"#7d9088"}}>{token.label}</div></div>})}{phase<3&&<div data-v22-context-dot style={{position:"absolute",left:tokens[phase]!.x+160+(tokens[phase+1]!.x-tokens[phase]!.x-40)*travel,top:962,width:42,height:42,borderRadius:999,background:MINT,boxShadow:"0 0 24px rgba(57,242,181,.9)"}}/>}</AbsoluteFill>;};

const Draft:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),complete=frame>=18,p=spring({frame:Math.max(0,frame-14),fps:30,config:{damping:20,stiffness:180},durationInFrames:16});return <EvidenceBackground><div style={complete?{position:"absolute",left:55,top:420,width:970,height:392}:{position:"absolute",left:220,top:300,width:640,height:734}}><EvidenceCard border={complete?GREEN:undefined}>{complete?<EvidenceCrop asset="outreach_complete" crop={CROPS.messageDraftEdit} width={970} height={392}/>:<EvidenceCrop asset="outreach_blank" crop={CROPS.outreachDraftCard} width={640} height={734}/>}</EvidenceCard></div>{complete&&<><div style={{position:"absolute",left:94,top:838,width:870,height:16,borderRadius:9,background:MINT,opacity:.85*p,transform:`scaleX(${p})`,transformOrigin:"left"}}/><div style={{position:"absolute",left:95,top:886,padding:"13px 19px",borderRadius:14,background:INK,color:WHITE,fontSize:29,fontWeight:950,opacity:p}}>SAVE EDIT · DRAFT NOT SENT</div></>}</EvidenceBackground>;};

// The grounded beat introduces a new idea (generic → grounded), so its boundary
// is a real cut: the card arrives with a fast slide rather than morphing
// continuously out of the draft scene, which is what the declared match_cut says.
const Grounded:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),reveal=interpolate(frame,[10,55],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),arrive=spring({frame,fps:30,config:{damping:18,stiffness:220},durationInFrames:7});return <EvidenceBackground><div style={{position:"absolute",left:55,top:360,width:970,height:431,transform:`translateX(${(1-arrive)*640}px)`}}><EvidenceCard border={GREEN}><EvidenceCrop asset="outreach_complete" crop={CROPS.message} width={970} height={431}/><div style={{position:"absolute",left:34,top:305,width:900*reveal,height:88,borderRadius:12,background:"rgba(57,242,181,.24)",borderBottom:`7px solid ${MINT}`}}/></EvidenceCard></div><div style={{position:"absolute",left:80,right:80,bottom:V22_CONTENT_FLOOR_BOTTOM,display:"flex",gap:18,alignItems:"center",justifyContent:"center",fontSize:29,fontWeight:950}}><span style={{padding:"14px 18px",borderRadius:14,background:"#ffe2dc",color:MINT,textDecoration:"line-through"}}>GENERIC OPENER</span><span style={{fontSize:52}}>→</span><span style={{padding:"14px 18px",borderRadius:14,background:MINT}}>ROLE + RELEVANCE</span></div></EvidenceBackground>;};

const Control:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame();return <EvidenceBackground><div style={{position:"absolute",left:160,top:360,width:760,height:307}}><EvidenceCard border={GREEN}><EvidenceCrop asset="outreach_complete" crop={CROPS.messageEdit} width={760} height={307}/></EvidenceCard></div><div style={{position:"absolute",left:90,right:90,bottom:V22_CONTENT_FLOOR_BOTTOM,display:"grid",gap:10}}><ProofLabel text="SAVE EDIT" primary/><ProofLabel text="CANCEL · SEND UNTOUCHED"/><div style={{padding:"16px 20px",borderRadius:15,background:INK,color:WHITE,fontSize:27,fontWeight:950}}>NOTHING SENDS WITHOUT YOU</div></div><Cursor frame={frame} from={{x:890,y:1040}} to={{x:660,y:985}} clickAt={78}/></EvidenceBackground>;};

const Payoff:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),collapse=interpolate(frame,[0,42],[0,1],{extrapolateRight:"clamp"}),result=spring({frame:Math.max(0,frame-35),fps:30,config:{damping:20,stiffness:155},durationInFrames:16});const windows=[{asset:"tracker_after" as const,crop:CROPS.trackerAfter,x:30,y:330},{asset:"opportunity" as const,crop:CROPS.opportunityHeader,x:560,y:300},{asset:"contact" as const,crop:CROPS.contactCard,x:65,y:870},{asset:"outreach_complete" as const,crop:CROPS.message,x:565,y:850},{asset:"outreach_blank" as const,crop:CROPS.outreachBlank,x:310,y:1230}];return <AbsoluteFill >{windows.map((item,index)=><div key={index} style={{position:"absolute",left:item.x+(390-item.x)*collapse,top:item.y+(610-item.y)*collapse,width:480,height:300,borderRadius:23,overflow:"hidden",background:WHITE,border:"2px solid #b9cbc4",opacity:1-collapse,transform:`scale(${1-collapse*.55}) rotate(${index%2?-4:4}deg)`}}><EvidenceCrop asset={item.asset} crop={item.crop} width={480} height={300}/></div>)}<div data-v22-connected-result style={{position:"absolute",left:42,top:285,width:996,height:1010,borderRadius:36,background:WHITE,border:`7px solid ${GREEN}`,boxShadow:"0 32px 90px rgba(7,17,31,.22)",opacity:result,transform:`scale(${.7+.3*result})`,overflow:"hidden"}}><ConnectedBoard frame={frame}/></div><div style={{opacity:result}}></div></AbsoluteFill>;};

const Result:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),pulse=1+Math.sin(frame/9)*.012;return <EvidenceBackground><div data-v22-connected-result style={{position:"absolute",left:45,top:260,width:990,height:700,borderRadius:36,background:WHITE,border:`7px solid ${GREEN}`,boxShadow:"0 32px 90px rgba(7,17,31,.22)",transform:`scale(${pulse})`,overflow:"hidden"}}><ConnectedBoard frame={frame+80}/></div></EvidenceBackground>;};

const ConnectedBoard:React.FC<{frame:number}> = ({frame}) => <div style={{position:"absolute",inset:0,padding:32,display:"grid",gridTemplateRows:"170px 275px 1fr",gap:18,background:"linear-gradient(145deg,#fff,#f2fbf7)"}}><div style={{position:"relative",overflow:"hidden",borderRadius:22,boxShadow:`inset 0 0 0 3px ${GREEN}`}}><EvidenceCrop asset="tracker_after" crop={CROPS.trackerAfter} width={932} height={170}/><div style={{position:"absolute",left:14,bottom:12,padding:"9px 14px",borderRadius:11,background:INK,color:WHITE,fontSize:22,fontWeight:950}}>PRODUCT ENGINEER · INTERVIEWING</div></div><div style={{display:"grid",gridTemplateColumns:".9fr 1.1fr",gap:16}}><div style={{position:"relative",overflow:"hidden",borderRadius:22}}><EvidenceCrop asset="contact" crop={CROPS.contactCard} width={410} height={275}/><div style={{position:"absolute",left:12,bottom:12,padding:"8px 12px",borderRadius:10,background:INK,color:WHITE,fontSize:18,fontWeight:950}}>AVERY CHEN</div></div><div style={{position:"relative",overflow:"hidden",borderRadius:22}}><EvidenceCrop asset="contact" crop={CROPS.contactProof} width={506} height={275}/><div style={{position:"absolute",right:12,bottom:12,padding:"8px 12px",borderRadius:10,background:MINT,color:INK,fontSize:18,fontWeight:950}}>SUPPORTING EVIDENCE</div></div></div><div style={{position:"relative",overflow:"hidden",borderRadius:22}}><EvidenceCrop asset="outreach_complete" crop={CROPS.message} width={932} height={497}/><div style={{position:"absolute",left:14,bottom:14,display:"flex",gap:9}}><span style={{padding:"9px 14px",borderRadius:10,background:GREEN,color:WHITE,fontSize:18,fontWeight:950}}>EDITABLE · UNSENT</span><span style={{padding:"9px 14px",borderRadius:10,background:WHITE,border:"2px solid #c9d8d1",fontSize:18,fontWeight:900}}>Save Edit · Cancel</span></div><div style={{position:"absolute",right:14,bottom:22,fontSize:18,fontWeight:850,color:GREEN,opacity:interpolate(frame,[40,55],[0,1],{extrapolateRight:"clamp"})}}>Nothing sends automatically</div></div><div style={{position:"absolute",right:44,top:9,fontSize:12,fontWeight:900,letterSpacing:2,color:GREEN}}>CONCEPTUAL ASSEMBLY · APPROVED PRODUCT EVIDENCE</div></div>;

// Stacked bands, matching the declared `cta` layout rects exactly:
//   headline 212-344 | mascot 422-1181 (rig fitted, antenna tops out at 437)
//   comment 1238-1536 | handle 1622-1718
// V16 put the comment box at y1190 under a mascot whose torso reached y1471, so
// the box was hidden behind the rig. The dim overlay is gone too: 42% ink over a
// pale mint gradient is what made the frame read muddy rather than deliberately
// dimmed. Background now comes from the scene backdrop.
const Cta:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),type=spring({frame:Math.max(0,frame-38),fps:30,config:{damping:20,stiffness:190},durationInFrames:16}),pulse=frame>=58?1+Math.sin((frame-58)/4)*.05*Math.max(0,1-(frame-58)/48):1;return <AbsoluteFill><div data-v22-comment-box style={{position:"absolute",left:130,right:130,top:1252,transform:`scale(${pulse})`}}><div style={{padding:"22px 28px",borderRadius:24,background:"rgba(255,255,255,.94)",border:`4px solid ${MINT}`,boxShadow:`0 0 ${34+type*46}px rgba(57,242,181,${.2+.35*type})`,display:"flex",alignItems:"center",gap:16}}><div style={{width:52,height:52,borderRadius:999,background:INK,display:"grid",placeItems:"center",color:MINT,fontSize:26,fontWeight:950}}>S</div><div style={{fontSize:38,fontWeight:950,letterSpacing:1,color:INK}}>{"SOLOMON".slice(0,Math.max(1,Math.round(type*7)))}<span style={{opacity:.35}}>|</span></div></div></div><div style={{position:"absolute",left:365,right:365,top:1636,padding:"10px 14px",borderRadius:999,background:INK,color:WHITE,textAlign:"center",fontSize:23,fontWeight:900,letterSpacing:2}}>@SOLOMON</div></AbsoluteFill>;};

const Sting:React.FC<{scene:V22Scene}> = ({scene}) => {const frame=useCurrentFrame(),p=spring({frame,fps:30,config:{damping:15,stiffness:175},durationInFrames:8});return <AbsoluteFill><div style={{position:"absolute",inset:0,background:`radial-gradient(circle at 50% 62%,rgba(57,242,181,${.10+.10*p}),transparent 55%)`}}/></AbsoluteFill>;};

// Product crops sit tighter than the authored rect. Measured against the three
// references, V22 ran edge density 7.5 against their 5.69-6.12 — and the source
// recordings themselves measure 2.17-6.36, BELOW the references. The excess was
// never the footage: it is that we show a whole dense UI at small scale where the
// references show a few large elements. Chrome reduction alone barely moved it
// (7.50 -> 7.57), because the edges are in the product pixels, not our borders.
// Zooming the crop shows fewer elements larger, which is both the reference look
// and better at phone scale.
// Tried at 1.30 to show fewer, larger elements the way the references do. It
// bought only 0.15 of edge density (7.57 -> 7.42, against a target of 5.69-6.12)
// and cost proof readability: the composite gate fell to 0.94 claim coverage and
// 0.90 OCR because the tighter frame cropped required text out. Proof credibility
// is worth more than a stylistic metric, so this stays at the authored framing.
// Closing edge density needs the scenes re-composed around fewer elements, not a
// tighter window onto the same dense ones.
// Edge density is measured per band, and the product recording is the whole of
// it: presenter 1.57% and captions 1.89% both sit at or under the references
// (1.65% / 1.96%), while the content band runs 3.60% and holds 58% of the film's
// edge pixels. Every product scene measures 2.0-3.2%; the two scenes with no
// product (hook 1.24%, sting 1.03%) sit well under the references.
//
// Zooming the crops does NOT help, which is worth recording because it is the
// obvious fix and it has now been tried: at 1.18 the film measured 2.34% against
// 2.33% at 1.02 -- no change -- while pushing required text out of frame and
// failing requiredOcr, composite and phoneScale. Enlarging UI thickens each
// glyph's strokes about as fast as it removes glyphs, so the edge *fraction* is
// invariant to zoom. The remaining gap is intrinsic to filming dense app UI
// rather than a person, and closing it means showing less evidence.
const PRODUCT_FOCUS_SCALE=1.02;
const EvidenceCrop:React.FC<{asset:V22AssetId;crop:Crop;width:number;height:number}> = ({asset,crop,width,height}) => {
  // A still sequence indexed by scene-local frame, not a video. See
  // V22_PRODUCT_STILLS: freezing product proof was never the requirement,
  // determinism was, and a list of PNGs cannot decode differently between runs.
  // Clamps on the last frame rather than looping, so a long scene settles
  // instead of replaying the same few seconds.
  const localFrame=useCurrentFrame();
  const trim=crop.motion?crop.trim+Math.min(crop.motion.frames-1,Math.floor(Math.max(0,localFrame)/crop.motion.hold))*crop.motion.step:crop.trim;
  const scale=Math.max(width/crop.width,height/crop.height),videoWidth=1440*scale,videoHeight=900*scale,focusScale=PRODUCT_FOCUS_SCALE;
  // Same box for both paths; only the source differs.
  const frame={position:"absolute" as const,left:-crop.x*scale,top:-crop.y*scale,width:videoWidth,height:videoHeight,maxWidth:"none",transform:`scale(${focusScale})`,transformOrigin:`${(crop.x+crop.width/2)/14.4}% ${(crop.y+crop.height/2)/9}%`};
  return <div data-v22-product={asset} style={{position:"absolute",inset:0,overflow:"hidden",background:WHITE}}>
    <Img src={staticFile(v22ProductStillFile(asset,trim))} style={frame}/>
  </div>;};
const EvidenceCard:React.FC<React.PropsWithChildren<{border?:string}>> = ({children,border}) => <div style={{position:"absolute",inset:0,overflow:"hidden",borderRadius:32,background:WHITE,border:border?`5px solid ${border}`:"none",boxShadow:"0 28px 70px rgba(7,17,31,.18)"}}>{children}</div>;
// Empty decorative rectangles -- the scattered cards that collapse into one proof
// -- carry no text, so unlike the evidence crops they can follow the backdrop.
// They have to: on the deepened deep tier a white 300x170 placeholder is the
// brightest thing in the shot and reads as the subject, which is precisely
// backwards for a card that exists to be swept away.
function placeholderSurface(token:V22BackdropToken){
  return V22_BACKDROPS[token].tier==="deep"?{background:"rgba(255,255,255,.07)",border:"rgba(255,255,255,.22)"}:{background:WHITE,border:"#c8d7d0"};
}
// Background now comes from the scene backdrop; this is only a positioning shell.
const EvidenceBackground:React.FC<React.PropsWithChildren> = ({children}) => <AbsoluteFill>{children}</AbsoluteFill>;
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
const ProofLabel:React.FC<{text:string;primary?:boolean;delay?:number;frame?:number}> = ({text,primary=false,delay=0,frame=30}) => {const p=spring({frame:Math.max(0,frame-delay),fps:30,config:{damping:20,stiffness:190},durationInFrames:16});return <div style={{padding:"10px 18px",borderRadius:13,background:primary?INK:WHITE,color:primary?WHITE:INK,boxShadow:"0 6px 18px rgba(7,17,31,.10)",fontSize:22,fontWeight:950,opacity:p,transform:`translateX(${(1-p)*45}px)`}}>{text}</div>;};
const ReasonStack:React.FC<{frame:number}> = ({frame}) => <div style={{position:"absolute",left:90,right:90,bottom:V22_CONTENT_FLOOR_BOTTOM,display:"grid",gap:10}}>{["WORKS AT NORTHSTAR LABS","RELEVANT RECRUITING ROLE","SUPPORTING EVIDENCE INCLUDED"].map((text,index)=><ProofLabel key={text} text={text} primary={index===0} delay={index*7} frame={frame}/>)}</div>;
const Cursor:React.FC<{frame:number;from:{x:number;y:number};to:{x:number;y:number};clickAt:number}> = ({frame,from,to,clickAt}) => {const p=interpolate(frame,[0,Math.max(1,clickAt-2)],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),click=interpolate(frame,[clickAt-1,clickAt,clickAt+4],[1,.8,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});return <svg viewBox="0 0 40 52" width="56" height="73" style={{position:"absolute",left:from.x+(to.x-from.x)*p,top:from.y+(to.y-from.y)*p,zIndex:60,transform:`scale(${click})`,filter:"drop-shadow(0 4px 4px rgba(0,0,0,.42))"}}><path d="M4 3 L4 39 L14 30 L22 48 L30 44 L22 27 L36 27 Z" fill="#fff" stroke="#111827" strokeWidth="3"/></svg>;};
// The mint Connector is gone. It drew a 9px arc from the card bottom to the
// proof labels, on hardcoded coordinates (410,930)->(410,970) that assumed the
// labels sat at top:970. Pinning the stacks to the content floor moved them to
// ~895 and the card now ends at ~890, so there was no gap left to bridge and the
// arc simply hung beside the "PRODUCT ENGINEER" chip, connecting nothing --
// reported as "green lines sometimes". V13 removed the mascot interaction line
// and V14 the signature arc for exactly this: at short lengths a connector reads
// as a stray stroke rather than a relationship.

const Caption:React.FC<{caption:V22Caption;scenes:V22Scene[]}> = ({caption,scenes}) => {const frame=useCurrentFrame(),{durationInFrames}=useVideoConfig(),enter=spring({frame,fps:30,config:{damping:17,stiffness:185},durationInFrames:9}),opacity=interpolate(frame,[Math.max(0,durationInFrames-10),durationInFrames],[1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  // Kinetic typography: instead of holding one chip for the whole window (up to
  // 3.4s, which reads as a label), swap 1-2 word groups every ~14 frames with a
  // scale pop, so the words on screen track the words being spoken. This is the
  // reference pattern and the source of their high median frame change - the
  // picture still rests between swaps, so calm is preserved.
  const local=frame+caption.from;
  const group=caption.wordGroups.find((item)=>local>=item.from&&local<item.to)??caption.wordGroups.at(-1);
  if(!group)return null;
  const sinceSwap=local-group.from;
  const pop=spring({frame:Math.max(0,sinceSwap),fps:30,config:{damping:20,stiffness:190},durationInFrames:12});
  // Ease the chip back in across a swap. The text changes in one frame and the
  // dark chip resizes with it, so a hard swap moves a large block of pixels
  // instantly — ffmpeg's scene detector reads that as a cut, and once caption
  // groups were aligned to real speech two of them started registering as shots.
  // Spreading the change over four frames keeps the kinetic feel while letting
  // the chip stay a caption rather than a boundary.
  const swapFade=Math.min(1,.30+Math.max(0,sinceSwap)/6*.70);
  const active=scenes.find((item)=>local>=item.from&&local<item.to)??scenes[0]!;
  const backdrop=V22_BACKDROPS[active.backdrop];
  const tone=backdrop.foreground;
  // Halo in the opposite direction so the type separates from product pixels
  // as well as from the backdrop, without reintroducing a chip.
  const halo=backdrop.tier==="deep"?"rgba(7,17,31,.55)":"rgba(255,255,255,.62)";
  const text=group.text;
  const highlightIndex=caption.highlight?text.toLowerCase().indexOf(caption.highlight.toLowerCase()):-1;
  const pre=highlightIndex>=0?text.slice(0,highlightIndex):text;
  const highlighted=highlightIndex>=0?text.slice(highlightIndex,highlightIndex+(caption.highlight?.length??0)):undefined;
  const post=highlightIndex>=0?text.slice(highlightIndex+(caption.highlight?.length??0)):"";
  // Kinetic staging. Emphasis used to mean 96px instead of 82px in the same spot,
  // which reads as one size. An emphasised group is now nearly twice the height of
  // a quiet one and sits higher, and quiet groups alternate between left, centre
  // and right lanes -- so the type moves through the frame with the sentence
  // instead of ticking over in place. Everything stays inside the declared caption
  // band (77-307) because scene content starts at ~275.
  // Dialled back from three lanes and a 76/132 split. Jumping left-centre-right
  // every word or two read as busy: the eye chased the type instead of reading
  // it. Emphasis is now carried by size and a small rise on a fixed centre line,
  // which keeps the stress legible without moving the reader around the frame.
  const size=group.emphasis?116:80;
  const bandTop=group.emphasis?86:116;
  const justify="center";
  const scale=(.9+.1*pop)*(group.emphasis?1.04:1);
  return <div data-v22-caption={caption.id} data-v22-word-group={group.text} style={{position:"absolute",left:60,right:60,top:bandTop,display:"flex",justifyContent:justify,zIndex:70,opacity:opacity*swapFade,transform:`translateY(${(1-enter)*-22}px)`}}><div style={{fontFamily:"Fraunces Variable,serif",color:tone,fontSize:size,lineHeight:.94,textAlign:"center",fontWeight:900,textShadow:`0 0 26px ${halo},0 2px 10px ${halo}`,transform:`scale(${scale})`,transformOrigin:"50% 0%"}}>{pre}{highlighted&&<span style={{color:MINT}}>{highlighted}</span>}{post}</div></div>;};
