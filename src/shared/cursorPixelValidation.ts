import type { PixelRect } from "./editorialProductFraming";

export interface CursorPixelComponent extends PixelRect {
  darkPixelCount: number;
  fillRatio: number;
  aspectRatio: number;
  score: number;
}

export interface CursorPixelSearchInput {
  pixels: Uint8Array;
  frameWidth: number;
  frameHeight: number;
  searchRegion: PixelRect;
  expectedCenter?: { x: number; y: number };
  darkThreshold?: number;
}

export function detectArrowCursorPixels(input: CursorPixelSearchInput): CursorPixelComponent | undefined {
  if (input.pixels.length !== input.frameWidth * input.frameHeight) {
    throw new Error("Cursor pixel frame dimensions do not match the grayscale buffer.");
  }
  const region = clampPixelRegion(input.searchRegion, input.frameWidth, input.frameHeight);
  const darkThreshold = input.darkThreshold ?? 82;
  const visited = new Uint8Array(input.pixels.length);
  const candidates: CursorPixelComponent[] = [];
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = y * input.frameWidth + x;
      if (visited[index] || input.pixels[index]! >= darkThreshold) continue;
      const component = collectComponent(input, visited, index, region, darkThreshold);
      if (!component) continue;
      const aspectRatio = component.height / component.width;
      const fillRatio = component.darkPixelCount / (component.width * component.height);
      if (
        component.width < 8 || component.width > 44
        || component.height < 12 || component.height > 56
        || aspectRatio < 1.08 || aspectRatio > 2.15
        || component.darkPixelCount < 24 || component.darkPixelCount > 320
        || fillRatio < 0.10 || fillRatio > 0.42
      ) continue;
      const center = { x: component.x + component.width / 2, y: component.y + component.height / 2 };
      const maximumDistance = Math.max(1, Math.hypot(region.width, region.height) / 2);
      const distanceScore = input.expectedCenter
        ? 1 - Math.min(1, Math.hypot(center.x - input.expectedCenter.x, center.y - input.expectedCenter.y) / maximumDistance)
        : 0.7;
      const aspectScore = 1 - Math.min(1, Math.abs(aspectRatio - 1.35) / 0.8);
      const fillScore = 1 - Math.min(1, Math.abs(fillRatio - 0.22) / 0.22);
      const sizeScore = Math.min(1, component.darkPixelCount / 120);
      candidates.push({
        ...component,
        aspectRatio,
        fillRatio,
        score: Number((distanceScore * 0.35 + aspectScore * 0.25 + fillScore * 0.20 + sizeScore * 0.20).toFixed(4))
      });
    }
  }
  return candidates.sort((first, second) =>
    second.score - first.score
    || second.darkPixelCount - first.darkPixelCount
    || first.y - second.y
    || first.x - second.x
  )[0];
}

function collectComponent(
  input: CursorPixelSearchInput,
  visited: Uint8Array,
  firstIndex: number,
  region: PixelRect,
  darkThreshold: number
): Omit<CursorPixelComponent, "fillRatio" | "aspectRatio" | "score"> | undefined {
  const queue = [firstIndex];
  visited[firstIndex] = 1;
  let cursor = 0;
  let minimumX = input.frameWidth;
  let maximumX = 0;
  let minimumY = input.frameHeight;
  let maximumY = 0;
  let darkPixelCount = 0;
  while (cursor < queue.length) {
    const index = queue[cursor++]!;
    const y = Math.floor(index / input.frameWidth);
    const x = index - y * input.frameWidth;
    minimumX = Math.min(minimumX, x);
    maximumX = Math.max(maximumX, x);
    minimumY = Math.min(minimumY, y);
    maximumY = Math.max(maximumY, y);
    darkPixelCount += 1;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < region.x || nextX >= region.x + region.width
          || nextY < region.y || nextY >= region.y + region.height
        ) continue;
        const nextIndex = nextY * input.frameWidth + nextX;
        if (!visited[nextIndex] && input.pixels[nextIndex]! < darkThreshold) {
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }
  }
  if (darkPixelCount < 8) return undefined;
  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX + 1,
    height: maximumY - minimumY + 1,
    darkPixelCount
  };
}

function clampPixelRegion(region: PixelRect, frameWidth: number, frameHeight: number): PixelRect {
  const x = Math.max(0, Math.min(frameWidth - 1, Math.floor(region.x)));
  const y = Math.max(0, Math.min(frameHeight - 1, Math.floor(region.y)));
  const right = Math.max(x + 1, Math.min(frameWidth, Math.ceil(region.x + region.width)));
  const bottom = Math.max(y + 1, Math.min(frameHeight, Math.ceil(region.y + region.height)));
  return { x, y, width: right - x, height: bottom - y };
}
