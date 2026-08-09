// Reports, for every EvidenceCrop usage, the region that was authored against the
// rect the card actually shows. The gap between them is invisible at runtime and is
// what made tightening crop regions clip words mid-character in V22.
//
// Both halves of this are parsed out of the composition rather than restated here.
// The usage table used to be a hand-maintained array and it had drifted: it listed
// a 790x470 card that no longer exists and missed the sizes that replaced it, so
// the discard percentages it reported were for a film that was not being rendered.
// A report whose input is a copy of the source is a report that eventually lies.
import fs from "node:fs/promises";

const src=await fs.readFile("src/remotion/solomonCreatorStoryV22/SolomonCreatorStoryV22.tsx","utf8");

const CROPS={};
// Trailing fields after `trim` are optional: crops that play a still sequence
// carry a `motion` block, and an exact-shape regex silently dropped all four.
for(const m of src.match(/const CROPS=\{([\s\S]*?)\} satisfies/)[1].matchAll(/(\w+):\{x:(\d+),y:(\d+),width:(\d+),height:(\d+),trim:(\d+)/g))
  CROPS[m[1]]={x:+m[2],y:+m[3],width:+m[4],height:+m[5]};

// Components are the parse unit because the array-driven cards name their crop in
// a `{asset,crop}` literal and then render `crop={item.crop}`: the tag alone does
// not say which region it shows, but the component does, in order.
const components=src.split(/(?=^const \w+:React\.FC)/m);
const usages=[];
for(const component of components){
  const name=/^const (\w+):React\.FC/.exec(component)?.[1]??"module";
  const fromArrays=[...component.matchAll(/crop:CROPS\.(\w+)/g)].map((m)=>m[1]);
  let arrayCursor=0;
  for(const tag of component.matchAll(/<EvidenceCrop\b[^>]*?\/>/g)){
    const text=tag[0];
    // Card size can itself be a ternary (`width={reasons?970:680}`), in which case
    // the branches line up with the crop branches: same index, same card.
    const widths=[...(/width=\{([^}]*)\}/.exec(text)?.[1]??"").matchAll(/\d+/g)].map((m)=>Number(m[0]));
    const heights=[...(/height=\{([^}]*)\}/.exec(text)?.[1]??"").matchAll(/\d+/g)].map((m)=>Number(m[0]));
    if(!widths.length||!heights.length){usages.push({name,key:"UNPARSED",width:NaN,height:NaN});continue;}
    const inline=[...text.matchAll(/CROPS\.(\w+)/g)].map((m)=>m[1]);
    // A ternary shows either region in the same card, so both are real usages.
    const keys=inline.length?inline:fromArrays.slice(arrayCursor,(arrayCursor+=fromArrays.length));
    keys.forEach((key,index)=>usages.push({name,key,width:widths[index]??widths[0],height:heights[index]??heights[0]}));
  }
}

const missing=usages.filter((u)=>u.key==="UNPARSED"||!CROPS[u.key]);
const rows=usages.filter((u)=>CROPS[u.key]).map(({name,key,width,height})=>{
  const rect=CROPS[key],scale=Math.max(width/rect.width,height/rect.height);
  const shownWidth=width/scale,shownHeight=height/scale;
  return{name,key,card:`${width}x${height}`,authored:`${rect.width}x${rect.height}`,shown:`${Math.round(shownWidth)}x${Math.round(shownHeight)}`,
    cardAspect:width/height,cropAspect:rect.width/rect.height,lost:1-(shownWidth*shownHeight)/(rect.width*rect.height)};
});
rows.sort((a,b)=>b.lost-a.lost);
console.log("scene            region key           card        authored    shown       aspect card/crop   cropped away");
for(const r of rows)
  console.log(`  ${r.name.padEnd(15)}${r.key.padEnd(21)}${r.card.padEnd(12)}${r.authored.padEnd(12)}${r.shown.padEnd(12)}${(r.cardAspect.toFixed(2)+" / "+r.cropAspect.toFixed(2)).padEnd(18)}${(r.lost*100).toFixed(0)}%`);
const severe=rows.filter((r)=>r.lost>0.15);
console.log(`\n${rows.length} usages parsed. ${severe.length} discard more than 15% of their authored region.`);
if(missing.length) console.log(`WARNING: ${missing.length} usage(s) could not be resolved to a crop: ${missing.map((m)=>`${m.name}:${m.key}`).join(", ")}`);
