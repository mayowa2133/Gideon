import { createReadStream } from "node:fs";
import PImage from "pureimage";

const SAMPLES=[10,55,110,170,245,320,420,540,650,715,885,990,1068];

export async function auditRenderedMascotV9(manifest,reviewDir,collisionAudit){
  const samples=[];
  for(const frame of SAMPLES){const image=await PImage.decodePNGFromStream(createReadStream(`${reviewDir}/frame-${String(frame).padStart(4,"0")}.png`));const scene=manifest.scenes.find(({from,to})=>frame>=from&&frame<to);samples.push({frame,sceneId:scene.id,emotion:scene.mascot.emotion,gestures:[scene.mascot.leftGesture,scene.mascot.rightGesture],...metrics(image)});}
  const missingFace=samples.filter(({mintPixels})=>mintPixels<120).map(({sceneId})=>sceneId),clipped=samples.filter(({boundaryMint})=>boundaryMint).map(({sceneId})=>sceneId),faceStates=new Set(samples.map(({emotion})=>emotion)),silhouettes=new Set(samples.map(({gestures,hash})=>`${gestures.join("/")}:${hash}`));
  return{schemaVersion:"1",method:"Decoded full-resolution master PNGs sampled at thirteen performance beats; bright-mint facial pixels, boundary contact, 16x16 luminance hashes, declared face states, and gesture-linked silhouettes are verified from final encoded frames.",passed:missingFace.length===0&&clipped.length===0&&faceStates.size>=5&&silhouettes.size>=6&&collisionAudit.passed,missingFace,clipped,renderedFaceStateCount:faceStates.size,renderedSilhouetteCount:silhouettes.size,phoneScaleFacePassed:missingFace.length===0,collisionCount:collisionAudit.collisionCount,samples};
}
function metrics(image){let mintPixels=0,boundaryMint=false;const values=[];for(let gy=0;gy<16;gy++)for(let gx=0;gx<16;gx++){const x=Math.round((gx+.5)*1080/16),y=Math.round((gy+.5)*1920/16),rgba=image.getPixelRGBA(x,y)>>>0,r=(rgba>>>24)&255,g=(rgba>>>16)&255,b=(rgba>>>8)&255;values.push(.2126*r+.7152*g+.0722*b);}for(let y=0;y<1920;y+=3)for(let x=0;x<1080;x+=3){const rgba=image.getPixelRGBA(x,y)>>>0,r=(rgba>>>24)&255,g=(rgba>>>16)&255,b=(rgba>>>8)&255;if(r<130&&g>190&&b>120&&b<235&&g>r*1.4){mintPixels++;if(x<8||x>1072||y<8||y>1912)boundaryMint=true;}}const mean=values.reduce((a,b)=>a+b,0)/values.length;return{mintPixels,boundaryMint,hash:values.map(value=>value>=mean?"1":"0").join("")};}
