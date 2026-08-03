import type { V9MascotMouth } from "../../shared/solomonMascotV9";

export const MascotMouth: React.FC<{ state: V9MascotMouth }> = ({state}) => {
  if (state === "thinking_wave") return <path d="M270 263 Q300 242 330 263 Q360 284 390 263" fill="none" stroke="#39f2b5" strokeWidth="12" strokeLinecap="round"/>;
  const heights: Record<Exclude<V9MascotMouth,"thinking_wave">,number> = { smile_rest:30, smile_small:38, smile_medium:50, smile_emphasis:66, smile_closed:8 };
  const height = heights[state];
  return <path d={`M282 250 Q330 ${250+height} 378 250 Q370 ${278+height*.35} 330 ${282+height*.48} Q290 ${278+height*.35} 282 250Z`} fill="#39f2b5" style={{filter:"drop-shadow(0 0 13px rgba(57,242,181,.9))"}}/>;
};
