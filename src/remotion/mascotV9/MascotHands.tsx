import type { V9MascotGesture } from "../../shared/solomonMascotV9";

export const MascotHands:React.FC<{left:V9MascotGesture;right:V9MascotGesture;amount:number}> = ({left,right,amount}) => <>{<Hand side="left" gesture={left} amount={amount}/>}<Hand side="right" gesture={right} amount={amount}/></>;
const Hand:React.FC<{side:"left"|"right";gesture:V9MascotGesture;amount:number}> = ({side,gesture,amount}) => {
  const sign=side==="left"?-1:1, active=gesture!=="rest_mitt", point=gesture.startsWith("point")||gesture==="save_bookmark", celebrate=gesture==="celebration"||gesture==="wave", stop=gesture==="stop_control";
  const shoulderX=side==="left"?118:542, handX=side==="left"?76:584, lift=(celebrate?-220:point?-135:stop?-175:-85)*amount, spread=(active?52:10)*amount*sign;
  return <g transform={`translate(${spread} ${lift}) rotate(${sign*(celebrate?28:point?18:8)*amount} ${shoulderX} 650)`}>
    <path d={side==="left"?"M145 625 Q90 674 79 768":"M515 625 Q570 674 581 768"} fill="none" stroke="#e6eef5" strokeWidth="72" strokeLinecap="round"/>
    <ellipse cx={handX} cy="790" rx={point?42:52} ry={point?36:54} fill="#f8fbfd" stroke="#acbed0" strokeWidth="7"/>
    {point&&<path d={side==="left"?"M55 783 L4 726":"M605 783 L656 726"} stroke="#f8fbfd" strokeWidth="26" strokeLinecap="round"/>}
  </g>;
};
