export const MascotTorso: React.FC<{ id:string }> = ({id}) => <g>
  <defs><linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff"/><stop offset=".58" stopColor="#edf3f8"/><stop offset="1" stopColor="#b9c8d7"/></linearGradient></defs>
  <ellipse cx="330" cy="720" rx="255" ry="195" fill={`url(#${id}-body)`} stroke="#fff" strokeWidth="10"/>
  <ellipse cx="330" cy="865" rx="94" ry="14" fill="#ff9d18"/>
  <path d="M150 650 Q185 558 270 540" fill="none" stroke="#fff" strokeOpacity=".86" strokeWidth="22" strokeLinecap="round"/>
  <circle cx="330" cy="705" r="39" fill="#030914"/><text x="330" y="720" textAnchor="middle" fill="#39f2b5" fontFamily="Manrope" fontWeight="900" fontSize="43">S</text>
  <ellipse cx="330" cy="910" rx="190" ry="24" fill="#07111f" opacity=".18"/>
</g>;
