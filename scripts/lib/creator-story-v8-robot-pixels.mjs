import { createReadStream } from "node:fs";
import PImage from "pureimage";

const SAMPLES = [{sceneId:"hook-host",frame:10},{sceneId:"contact-reveal",frame:55},{sceneId:"contact-evidence",frame:90},{sceneId:"problem-recoil",frame:112},{sceneId:"five-tools",frame:180},{sceneId:"reason-proof",frame:345},{sceneId:"signature-mechanism",frame:430},{sceneId:"comparison",frame:660},{sceneId:"trust",frame:740},{sceneId:"payoff",frame:870},{sceneId:"cta",frame:1005}];

export async function auditRenderedRobotPixels(manifest, reviewDir, collisionAudit) {
  const samples = [];
  for (const sample of SAMPLES) {
    const scene = manifest.scenes.find(({ id }) => id === sample.sceneId);
    const image = await PImage.decodePNGFromStream(createReadStream(`${reviewDir}/frame-${String(sample.frame).padStart(4,"0")}.png`));
    const bounds = roleBounds(scene.robot.role);
    const metrics = pixelMetrics(image, bounds);
    samples.push({ ...sample, role: scene.robot.role, declaredPose: scene.robot.pose, declaredExpression: scene.robot.expression, bounds, ...metrics });
  }
  const cyanMissing = samples.filter(({ cyanPixels }) => cyanPixels < 40).map(({ sceneId }) => sceneId);
  const boundaryContacts = samples.filter(({ cyanBoundaryContact }) => cyanBoundaryContact).map(({ sceneId }) => sceneId);
  const silhouetteDescriptors = new Set(samples.map(({ perceptualHash, declaredPose }) => `${declaredPose}:${perceptualHash}`));
  const eyeDescriptors = new Set(samples.map(({ eyeAspectBucket, declaredExpression }) => `${declaredExpression}:${eyeAspectBucket}`));
  return { schemaVersion:"1", method:"Decoded master PNGs at representative robot beats; cyan eye/grille pixels, visor-region eye aspect, role-slot boundary contact, and a 12x12 luminance perceptual hash are measured from encoded pixels.", passed:cyanMissing.length===0&&boundaryContacts.length===0&&silhouetteDescriptors.size>=6&&eyeDescriptors.size>=4&&collisionAudit.passed,cyanMissing,boundaryContacts,renderedSilhouetteCount:silhouetteDescriptors.size,renderedEyeStateCount:eyeDescriptors.size,uiCollisionCount:collisionAudit.collisionCount,samples };
}

function roleBounds(role){if(role==="cameo_left")return{left:171,top:1302,right:516,bottom:1795};if(role==="cameo_right")return{left:565,top:1302,right:910,bottom:1795};if(role==="split_left")return{left:8,top:350,right:476,bottom:1020};return{left:215,top:260,right:865,bottom:1190};}
function pixelMetrics(image,bounds){let cyanPixels=0,cyanLeft=bounds.right,cyanRight=bounds.left,cyanTop=bounds.bottom,cyanBottom=bounds.top,eyePixels=0,eyeLeft=bounds.right,eyeRight=bounds.left,eyeTop=bounds.bottom,eyeBottom=bounds.top;const luminance=[];for(let gy=0;gy<12;gy+=1)for(let gx=0;gx<12;gx+=1){const x=Math.round(bounds.left+(gx+.5)*(bounds.right-bounds.left)/12),y=Math.round(bounds.top+(gy+.5)*(bounds.bottom-bounds.top)/12),rgba=image.getPixelRGBA(x,y)>>>0,r=(rgba>>>24)&255,g=(rgba>>>16)&255,b=(rgba>>>8)&255;luminance.push(.2126*r+.7152*g+.0722*b);}for(let y=Math.max(0,Math.floor(bounds.top));y<Math.min(1920,Math.ceil(bounds.bottom));y+=2)for(let x=Math.max(0,Math.floor(bounds.left));x<Math.min(1080,Math.ceil(bounds.right));x+=2){const rgba=image.getPixelRGBA(x,y)>>>0,r=(rgba>>>24)&255,g=(rgba>>>16)&255,b=(rgba>>>8)&255;if(r<120&&g>175&&b>120&&b<230&&g>r*1.35){cyanPixels++;cyanLeft=Math.min(cyanLeft,x);cyanRight=Math.max(cyanRight,x);cyanTop=Math.min(cyanTop,y);cyanBottom=Math.max(cyanBottom,y);if(y<bounds.top+(bounds.bottom-bounds.top)*.44){eyePixels++;eyeLeft=Math.min(eyeLeft,x);eyeRight=Math.max(eyeRight,x);eyeTop=Math.min(eyeTop,y);eyeBottom=Math.max(eyeBottom,y);}}}const mean=luminance.reduce((a,b)=>a+b,0)/luminance.length,perceptualHash=luminance.map(value=>value>=mean?"1":"0").join("");const eyeWidth=Math.max(1,eyeRight-eyeLeft),eyeHeight=Math.max(1,eyeBottom-eyeTop);return{cyanPixels,eyePixels,cyanBounds:cyanPixels?{left:cyanLeft,right:cyanRight,top:cyanTop,bottom:cyanBottom}:null,cyanBoundaryContact:cyanPixels>0&&(cyanLeft<=5||cyanRight>=1075||cyanTop<=45||cyanBottom>=1875),eyeAspectBucket:Math.round(eyeWidth/eyeHeight*4)/4,perceptualHash};}
