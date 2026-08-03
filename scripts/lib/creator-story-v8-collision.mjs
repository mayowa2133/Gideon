export function auditV8LayoutCollisions(manifest) {
  const collisions = [];
  for (const scene of manifest.scenes) {
    const exclusions = scene.collisionExclusionRegions.map((region) => ({ id: `${scene.id}:${region.id}`, left: region.x * 1080, top: region.y * 1920, right: (region.x + region.width) * 1080, bottom: (region.y + region.height) * 1920 }));
    const robot = robotBounds(scene.robot.role);
    if (robot) for (const exclusion of exclusions) addCollision(collisions, scene.id, "robot", robot, exclusion);
    for (const caption of manifest.captions.filter((item) => item.from < scene.to && item.to > scene.from)) {
      const captionBounds = { left: 55, top: caption.kind === "editorial" ? 1_560 : 1_565, right: 1_025, bottom: 1_690 };
      for (const exclusion of exclusions) addCollision(collisions, scene.id, `caption:${caption.id}`, captionBounds, exclusion);
    }
  }
  return { schemaVersion: "1", method: "Manifest-declared required OCR rectangles compared with fixed rendered robot slots and caption safe-zone rectangles; final decoded OCR boxes are audited separately.", passed: collisions.length === 0, collisionCount: collisions.length, collisions };
}

function robotBounds(role) {
  if (role === "absent") return undefined;
  if (role === "cameo_left") return { left: 171, top: 1_302, right: 516, bottom: 1_795 };
  if (role === "cameo_right") return { left: 565, top: 1_302, right: 910, bottom: 1_795 };
  if (role === "split_left") return { left: 8, top: 350, right: 476, bottom: 1_020 };
  return { left: 215, top: 260, right: 865, bottom: 1_190 };
}

function addCollision(rows, sceneId, overlayId, overlay, evidence) {
  const width = Math.max(0, Math.min(overlay.right, evidence.right) - Math.max(overlay.left, evidence.left));
  const height = Math.max(0, Math.min(overlay.bottom, evidence.bottom) - Math.max(overlay.top, evidence.top));
  if (width > 0 && height > 0) rows.push({ sceneId, overlayId, evidenceId: evidence.id, overlapArea: Math.round(width * height) });
}
