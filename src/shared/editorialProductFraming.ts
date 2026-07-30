export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export type EditorialProductComposition =
  | "asymmetric_split"
  | "product_macro"
  | "product_reaction"
  | "product_comparison"
  | "rapid_recap";

export type EditorialProductPresenterPlacement = "left" | "right" | "bottom" | "none";

export interface ProductCardLayoutInput {
  composition: EditorialProductComposition;
  presenterVisible: boolean;
  presenterPlacement: EditorialProductPresenterPlacement;
}

export interface ProductPresenterLayoutInput {
  visible: boolean;
  placement: EditorialProductPresenterPlacement;
}

export interface ProductContainmentInput {
  sourceSize: PixelSize;
  card: PixelRect;
  viewport: NormalizedRect;
  criticalRegion?: NormalizedRect;
  cursor?: { x: number; y: number };
  outputSize?: PixelSize;
  safeMarginPx?: number;
  minimumCriticalMarginPx?: number;
}

export interface ProductContainmentReport {
  card: PixelRect;
  cardIntersectionRatio: number;
  cardSafeMarginPx: number;
  criticalRegion?: PixelRect;
  criticalIntersectionRatio?: number;
  criticalSafeMarginPx?: number;
  cursor?: { x: number; y: number };
  cursorContained?: boolean;
  passed: boolean;
}

const DEFAULT_OUTPUT_SIZE = { width: 1080, height: 1920 } as const;

export function productCardLayoutV4(input: ProductCardLayoutInput): PixelRect {
  if (input.composition === "product_macro") {
    return { x: 60, y: 230, width: 960, height: 640 };
  }
  if (input.composition === "product_comparison") {
    return { x: 50, y: 260, width: 980, height: 650 };
  }
  if (input.composition === "rapid_recap") {
    return { x: 75, y: 250, width: 930, height: 620 };
  }
  if (input.presenterVisible) {
    return {
      x: input.presenterPlacement === "left" ? 140 : 40,
      y: 240,
      width: 900,
      height: 600
    };
  }
  return { x: 50, y: 240, width: 980, height: 650 };
}

export function productPresenterLayoutV4(input: ProductPresenterLayoutInput): PixelRect | undefined {
  if (!input.visible) return undefined;
  if (input.placement === "left") return { x: -24, y: 1_140, width: 430, height: 764 };
  if (input.placement === "right") return { x: 674, y: 1_140, width: 430, height: 764 };
  return { x: -12, y: 1_280, width: 360, height: 640 };
}

export function normalizePixelRect(rect: PixelRect, viewport: PixelSize): NormalizedRect {
  assertPositiveSize(viewport, "viewport");
  return clampNormalizedRect({
    x: rect.x / viewport.width,
    y: rect.y / viewport.height,
    width: rect.width / viewport.width,
    height: rect.height / viewport.height
  });
}

export function clampNormalizedRect(rect: NormalizedRect): NormalizedRect {
  const width = clamp(rect.width, 0.000_001, 1);
  const height = clamp(rect.height, 0.000_001, 1);
  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height
  };
}

export function expandNormalizedRect(
  rect: NormalizedRect,
  minimumWidth: number,
  minimumHeight: number
): NormalizedRect {
  const normalized = clampNormalizedRect(rect);
  const width = clamp(Math.max(normalized.width, minimumWidth), 0.000_001, 1);
  const height = clamp(Math.max(normalized.height, minimumHeight), 0.000_001, 1);
  const centerX = normalized.x + normalized.width / 2;
  const centerY = normalized.y + normalized.height / 2;
  return clampNormalizedRect({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  });
}

export function viewportForCard(
  criticalRegion: NormalizedRect | undefined,
  card: PixelRect,
  options: { minimumSourceWidth?: number; minimumSourceHeight?: number; sourceSize?: PixelSize } = {}
): NormalizedRect {
  const sourceSize = options.sourceSize ?? { width: 1, height: 1 };
  assertPositiveSize(sourceSize, "source");
  const targetAspect = (card.width / card.height) / (sourceSize.width / sourceSize.height);
  const minimumWidth = options.minimumSourceWidth ?? Math.min(0.78, Math.max(0.42, targetAspect * 0.92));
  const minimumHeight = options.minimumSourceHeight ?? Math.min(1, minimumWidth / targetAspect);
  const region = expandNormalizedRect(
    criticalRegion ?? { x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
    Math.max(minimumWidth, (criticalRegion?.width ?? 0.84) * 1.14),
    Math.max(minimumHeight, (criticalRegion?.height ?? 0.84) * 1.14)
  );
  let width = region.width;
  let height = region.height;
  if (width / height > targetAspect) {
    height = width / targetAspect;
  } else {
    width = height * targetAspect;
  }
  if (width > 1) {
    width = 1;
    height = width / targetAspect;
  }
  if (height > 1) {
    height = 1;
    width = height * targetAspect;
  }
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;
  return clampNormalizedRect({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  });
}

export function mapSourceRectToCard(
  sourceRect: NormalizedRect,
  viewport: NormalizedRect,
  card: PixelRect
): PixelRect {
  return {
    x: card.x + ((sourceRect.x - viewport.x) / viewport.width) * card.width,
    y: card.y + ((sourceRect.y - viewport.y) / viewport.height) * card.height,
    width: (sourceRect.width / viewport.width) * card.width,
    height: (sourceRect.height / viewport.height) * card.height
  };
}

export function mapSourcePointToCard(
  point: { x: number; y: number },
  viewport: NormalizedRect,
  card: PixelRect
): { x: number; y: number } {
  return {
    x: card.x + ((point.x - viewport.x) / viewport.width) * card.width,
    y: card.y + ((point.y - viewport.y) / viewport.height) * card.height
  };
}

export function intersectionRatio(rect: PixelRect, bounds: PixelRect): number {
  const intersectionWidth = Math.max(0, Math.min(rect.x + rect.width, bounds.x + bounds.width) - Math.max(rect.x, bounds.x));
  const intersectionHeight = Math.max(0, Math.min(rect.y + rect.height, bounds.y + bounds.height) - Math.max(rect.y, bounds.y));
  return Math.min(1, (intersectionWidth * intersectionHeight) / Math.max(0.000_001, rect.width * rect.height));
}

export function minimumMargin(rect: PixelRect, bounds: PixelRect): number {
  return Math.min(
    rect.x - bounds.x,
    rect.y - bounds.y,
    bounds.x + bounds.width - (rect.x + rect.width),
    bounds.y + bounds.height - (rect.y + rect.height)
  );
}

export function rectanglesOverlap(first: PixelRect, second: PixelRect): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

export function productContainmentReport(input: ProductContainmentInput): ProductContainmentReport {
  assertPositiveSize(input.sourceSize, "source");
  const outputSize = input.outputSize ?? DEFAULT_OUTPUT_SIZE;
  const output = { x: 0, y: 0, width: outputSize.width, height: outputSize.height };
  const safeMarginPx = input.safeMarginPx ?? 24;
  const minimumCriticalMarginPx = input.minimumCriticalMarginPx ?? safeMarginPx;
  const cardIntersectionRatio = intersectionRatio(input.card, output);
  const cardSafeMarginPx = minimumMargin(input.card, output);
  const criticalRegion = input.criticalRegion
    ? mapSourceRectToCard(input.criticalRegion, input.viewport, input.card)
    : undefined;
  const criticalIntersectionRatio = criticalRegion ? intersectionRatio(criticalRegion, input.card) : undefined;
  const criticalSafeMarginPx = criticalRegion ? minimumMargin(criticalRegion, input.card) : undefined;
  const cursor = input.cursor ? mapSourcePointToCard(input.cursor, input.viewport, input.card) : undefined;
  const cursorContained = cursor
    ? cursor.x >= input.card.x + safeMarginPx
      && cursor.y >= input.card.y + safeMarginPx
      && cursor.x <= input.card.x + input.card.width - safeMarginPx
      && cursor.y <= input.card.y + input.card.height - safeMarginPx
    : undefined;
  return {
    card: input.card,
    cardIntersectionRatio,
    cardSafeMarginPx,
    criticalRegion,
    criticalIntersectionRatio,
    criticalSafeMarginPx,
    cursor,
    cursorContained,
    passed: cardIntersectionRatio >= 0.999_999
      && cardSafeMarginPx >= safeMarginPx
      && (criticalIntersectionRatio === undefined || criticalIntersectionRatio >= 0.999_999)
      && (criticalSafeMarginPx === undefined || criticalSafeMarginPx >= minimumCriticalMarginPx)
      && (cursorContained === undefined || cursorContained)
  };
}

export function rectCenter(rect: NormalizedRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function assertPositiveSize(size: PixelSize, label: string): void {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error(`Editorial product ${label} dimensions must be positive.`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
