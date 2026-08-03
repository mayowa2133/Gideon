import type { V9MascotFace, V9MascotMouth } from "../../shared/solomonMascotV9";
import { MascotMouth } from "./MascotMouth";

export const MascotHead: React.FC<{ id:string; face:V9MascotFace; mouth:V9MascotMouth; gazeX:number; blink:number; tilt:number }> = ({id,face,mouth,gazeX,blink,tilt}) => {
  const concerned = face === "concerned" || face === "old_way_lidded";
  const wink = face === "wink";
  return <g transform={`translate(330 250) rotate(${tilt}) translate(-330 -250)`}>
    <defs>
      <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffffff"/><stop offset=".45" stopColor="#eef4fa"/><stop offset="1" stopColor="#bac9d8"/></linearGradient>
      <radialGradient id={`${id}-gloss`} cx="24%" cy="12%" r="76%"><stop stopColor="#fff" stopOpacity=".94"/><stop offset=".42" stopColor="#fff" stopOpacity=".12"/><stop offset="1" stopColor="#7f93a8" stopOpacity=".22"/></radialGradient>
    </defs>
    <rect x="20" y="48" width="620" height="460" rx="170" fill={`url(#${id}-shell)`} stroke="#ffffff" strokeWidth="10"/>
    <rect x="40" y="66" width="580" height="420" rx="150" fill={`url(#${id}-gloss)`}/>
    <path d="M68 126 Q154 72 250 84" fill="none" stroke="#fff" strokeOpacity=".82" strokeWidth="24" strokeLinecap="round"/>
    <rect x="75" y="112" width="510" height="330" rx="160" fill="#030914"/>
    <path d="M102 154 Q162 120 232 128" fill="none" stroke="#42546a" strokeOpacity=".42" strokeWidth="12" strokeLinecap="round"/>
    <g transform={`translate(${gazeX} 0) scale(1 ${blink})`} style={{transformOrigin:"330px 260px",filter:"drop-shadow(0 0 15px rgba(57,242,181,.88))"}}>
      {[206,454].map((cx,index) => wink && index === 1 ? <path key={cx} d={`M${cx-60} 260 Q${cx} 278 ${cx+60} 260`} fill="none" stroke="#39f2b5" strokeWidth="14" strokeLinecap="round"/> : <path key={cx} d={`M${cx-64} 270 A64 ${concerned?42:70} 0 0 1 ${cx+64} 270 L${cx+64} ${concerned?280:294} L${cx-64} ${concerned?280:294}Z`} fill="#39f2b5" transform={concerned?`rotate(${index?-7:7} ${cx} 270)`:undefined}/>) }
    </g>
    <MascotMouth state={mouth}/>
    <rect x="294" y="18" width="72" height="52" rx="26" fill="#d4dce6"/>
    <rect x="319" y="-4" width="22" height="35" rx="11" fill="#92a6bb"/>
    <circle cx="330" cy="-13" r="18" fill="#ff9d18" style={{filter:"drop-shadow(0 0 10px rgba(255,157,24,.65))"}}/>
  </g>;
};
