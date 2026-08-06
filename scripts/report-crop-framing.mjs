// Reports, for every EvidenceCrop usage, the region that was authored against the
// rect the card actually shows. The gap between them is invisible at runtime and is
// what made tightening crop regions clip words mid-character in V22.
import fs from "node:fs/promises";
const src=await fs.readFile("src/remotion/solomonCreatorStoryV22/SolomonCreatorStoryV22.tsx","utf8");
const CROPS={};
for(const m of src.match(/const CROPS=\{([\s\S]*?)\} satisfies/)[1].matchAll(/(\w+):\{x:(\d+),y:(\d+),width:(\d+),height:(\d+),trim:(\d+)\}/g))
  CROPS[m[1]]={x:+m[2],y:+m[3],width:+m[4],height:+m[5]};
// (cropKey, cardWidth, cardHeight) for each usage, including array-driven ones
const usages=[
  ["trackerAfter",940,600],["trackerBefore",940,600],["contactProof",970,760],["contactCard",680,810],
  ["opportunityHeader",450,260],["contactCard",450,260],["opportunityPanel",450,260],["contactProof",450,260],["outreachBlank",450,260],
  ["opportunityHeader",790,470],["opportunityHeader",700,620],["contactCard",690,780],
  ["opportunityHeader",200,300],["contactCard",200,300],["contactProof",200,300],["message",200,300],
  ["messageDraftEdit",970,850],["outreachBlank",970,850],["message",970,820],["messageEdit",700,830],
  ["trackerAfter",480,300],["opportunityHeader",480,300],["contactCard",480,300],["message",480,300],["outreachBlank",480,300],
  ["trackerAfter",932,170],["contactCard",410,275],["contactProof",506,275],["message",932,497],
];
const rows=usages.map(([k,w,h])=>{
  const r=CROPS[k];const scale=Math.max(w/r.width,h/r.height);
  const vw=w/scale,vh=h/scale;
  return{key:k,card:`${w}x${h}`,authored:`${r.width}x${r.height}`,shown:`${Math.round(vw)}x${Math.round(vh)}`,lost:1-(vw*vh)/(r.width*r.height)};
});
rows.sort((a,b)=>b.lost-a.lost);
console.log("region key           card        authored    shown       cropped away");
for(const r of rows) console.log(`  ${r.key.padEnd(19)}${r.card.padEnd(12)}${r.authored.padEnd(12)}${r.shown.padEnd(12)}${(r.lost*100).toFixed(0)}%`);
const severe=rows.filter((r)=>r.lost>0.4);
console.log(`\n${severe.length} usage(s) discard more than 40% of their authored region.`);
