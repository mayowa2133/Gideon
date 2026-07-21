import type { CreativeBlueprint, NormalizedRect, ProductEvidenceAsset, SceneComposition, SceneLayoutReceipt } from "./types";

const MIN_TEXT_SCALE = 0.78;

export function calculateBlueprintLayout(blueprint: CreativeBlueprint): SceneLayoutReceipt[] {
  const assets = new Map(blueprint.productAssets.map((asset) => [asset.id, asset]));
  return blueprint.scenes.flatMap((scene) => {
    const asset = scene.productAssetIds.map((id) => assets.get(id)).find(Boolean);
    const typography = scene.typography.slice(0, 2).map((cue) => choosePlacement(scene, asset, "typography", cue.position, cue.maxLines));
    const captions = scene.captions.length > 0 ? [choosePlacement(scene, asset, "caption", "bottom", 2)] : [];
    return [...typography, ...captions];
  });
}

export function choosePlacement(
  scene: SceneComposition,
  asset: ProductEvidenceAsset | undefined,
  textKind: "caption" | "typography",
  preferred: SceneComposition["typography"][number]["position"],
  requestedLines: number
): SceneLayoutReceipt {
  const reserved = reservedRegions(scene, asset);
  const candidates = uniquePositions([preferred, ...fallbackPositions(preferred)]);
  for (const scale of [1, 0.9, MIN_TEXT_SCALE]) {
    for (const position of candidates) {
      const chosen = candidateRect(position, textKind, requestedLines, scale);
      if (insideSafeArea(chosen) && reserved.every(({ rect }) => intersectionArea(chosen, rect) === 0)) {
        return { sceneId: scene.id, textKind, chosen, reserved, collisionFree: true, scale, lines: requestedLines };
      }
    }
  }
  const chosen = candidateRect(preferred, textKind, requestedLines, MIN_TEXT_SCALE);
  return { sceneId: scene.id, textKind, chosen, reserved, collisionFree: false, scale: MIN_TEXT_SCALE, lines: requestedLines };
}

export function intersectionArea(left: NormalizedRect, right: NormalizedRect): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

function reservedRegions(scene: SceneComposition, asset: ProductEvidenceAsset | undefined): SceneLayoutReceipt["reserved"] {
  const reserved: SceneLayoutReceipt["reserved"] = [];
  if (scene.presenter.visible) {
    reserved.push({ kind: "presenter", rect: presenterReservedRect(scene.presenter.layout) });
    reserved.push({ kind: "disclosure", rect: disclosureRect(scene.presenter.layout) });
  }
  if (asset && scene.shotType !== "kinetic_typography") {
    reserved.push({ kind: "product", rect: productReadableRect(asset, scene) });
  }
  if (scene.shotType === "cta_end_card") reserved.push({ kind: "cta", rect: { x: 0.16, y: 0.68, width: 0.68, height: 0.13 } });
  return reserved;
}

export function presenterReservedRect(layout: SceneComposition["presenter"]["layout"]): NormalizedRect {
  if (layout === "fullscreen") return { x: 0.08, y: 0.25, width: 0.84, height: 0.59 };
  if (layout === "close_up") return { x: 0.12, y: 0.31, width: 0.76, height: 0.48 };
  if (layout === "lower_third") return { x: 0.56, y: 0.56, width: 0.38, height: 0.34 };
  if (layout === "split_left") return { x: 0.03, y: 0.28, width: 0.44, height: 0.51 };
  if (layout === "split_right") return { x: 0.53, y: 0.28, width: 0.44, height: 0.51 };
  return { x: 0.24, y: 0.36, width: 0.52, height: 0.44 };
}

function productReadableRect(asset: ProductEvidenceAsset, scene: SceneComposition): NormalizedRect {
  const frame = scene.shotType === "split_presenter_product"
    ? (scene.presenter.layout === "split_left" ? { x: 0.49, y: 0.2, width: 0.46, height: 0.55 } : { x: 0.05, y: 0.2, width: 0.46, height: 0.55 })
    : asset.kind === "phone_mockup" ? { x: 0.25, y: 0.18, width: 0.5, height: 0.62 }
      : { x: 0.06, y: 0.19, width: 0.88, height: 0.57 };
  return {
    x: frame.x + asset.readableRegion.x * frame.width,
    y: frame.y + asset.readableRegion.y * frame.height,
    width: asset.readableRegion.width * frame.width,
    height: asset.readableRegion.height * frame.height
  };
}

function disclosureRect(layout: SceneComposition["presenter"]["layout"]): NormalizedRect {
  const presenter = presenterReservedRect(layout);
  return { x: presenter.x, y: Math.min(0.91, presenter.y + presenter.height - 0.03), width: Math.min(0.34, presenter.width), height: 0.03 };
}

function candidateRect(position: SceneComposition["typography"][number]["position"], kind: "caption" | "typography", lines: number, scale: number): NormalizedRect {
  const height = Math.min(kind === "caption" ? 0.14 : 0.19, (kind === "caption" ? 0.055 : 0.068) * Math.max(1, lines) * scale);
  const width = (position === "left" || position === "right" ? 0.39 : kind === "caption" ? 0.72 : 0.78) * scale;
  const x = position === "left" ? 0.065 : position === "right" ? 0.935 - width : 0.5 - width / 2;
  const y = position === "top" ? 0.065 : position === "center" ? 0.5 - height / 2 : position === "bottom" ? 0.91 - height : 0.1;
  return { x, y, width, height };
}

function insideSafeArea(rect: NormalizedRect): boolean { return rect.x >= 0.055 && rect.y >= 0.045 && rect.x + rect.width <= 0.945 && rect.y + rect.height <= 0.915; }
function fallbackPositions(preferred: string): Array<"top" | "center" | "bottom" | "left" | "right"> { return (["top", "bottom", "left", "right", "center"] as const).filter((position) => position !== preferred); }
function uniquePositions(values: Array<SceneComposition["typography"][number]["position"]>): Array<SceneComposition["typography"][number]["position"]> { return [...new Set(values)]; }
