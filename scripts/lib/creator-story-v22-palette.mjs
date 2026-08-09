// Palette measurement for the V22 master: how much of the film reads as coloured
// at all, and how concentrated that colour is in one hue family.
//
// This exists because the two colour properties the references share were, until
// now, checked by running a throwaway script by hand. That is how the tonal-floor
// change shipped a 6-point drop in coloured pixels while every gate stayed green:
// nothing was watching the axis it moved.
//
// Sampled at 1fps and 64x114. The decimation is deliberate and matches the script
// the reference bands were derived with -- the question is what share of the frame
// carries colour, not where the edges are, so full resolution would cost minutes
// to compute the same fractions.
import { spawn } from "node:child_process";

// Twelve 30-degree hue buckets grouped into four families. Buckets rather than
// named colours because "the references are red-dominant" is a claim about a
// region of hue space, and 0-30 plus 330-360 is that region.
const FAMILIES={warm:[0,1,11],gold:[2,3],cool:[4,5,6,7],violet:[8,9,10]};

function rawFrames(file){
  return new Promise((resolve,reject)=>{
    const child=spawn("ffmpeg",["-hide_banner","-loglevel","error","-i",file,"-vf","fps=1,scale=64:114","-f","rawvideo","-pix_fmt","rgb24","-"],{stdio:["ignore","pipe","pipe"]});
    const chunks=[];let stderr="";
    child.stdout.on("data",(chunk)=>chunks.push(chunk));
    child.stderr.setEncoding("utf8").on("data",(chunk)=>stderr+=chunk);
    child.once("error",reject);
    child.once("close",(code)=>code===0?resolve(Buffer.concat(chunks)):reject(new Error(`ffmpeg palette decode failed (${code}): ${stderr.slice(-2000)}`)));
  });
}

export async function measureV22Palette(file){
  const rgb=await rawFrames(file);
  if(rgb.length<3) throw new Error("V22 palette measurement decoded no pixels.");
  const hues=new Array(12).fill(0);
  let pixels=0,coloured=0,saturationSum=0,saturationMax=0;
  for(let index=0;index+2<rgb.length;index+=3){
    const r=rgb[index]/255,g=rgb[index+1]/255,b=rgb[index+2]/255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    const saturation=max===0?0:delta/max;
    pixels+=1;saturationSum+=saturation*100;
    if(saturation*100>saturationMax)saturationMax=saturation*100;
    // Both thresholds matter: saturation alone counts near-black pixels whose hue
    // is numerically strong and visually absent.
    if(saturation<=.25||max<=.15)continue;
    coloured+=1;
    let hue=0;
    if(delta>0)hue=max===r?((g-b)/delta+6)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
    hues[Math.floor(hue*60/30)%12]+=1;
  }
  const familyTotals=Object.fromEntries(Object.entries(FAMILIES).map(([family,buckets])=>[family,buckets.reduce((total,bucket)=>total+hues[bucket],0)]));
  const [dominantFamily,dominantCount]=Object.entries(familyTotals).sort((a,b)=>b[1]-a[1])[0];
  return{
    sampledPixels:pixels,
    colouredPixelFraction:coloured/Math.max(1,pixels),
    dominantFamily,
    dominantFamilyShare:coloured?dominantCount/coloured:0,
    familyShares:Object.fromEntries(Object.entries(familyTotals).map(([family,count])=>[family,coloured?count/coloured:0])),
    meanSaturation:saturationSum/Math.max(1,pixels),
    maxSaturation:saturationMax
  };
}
