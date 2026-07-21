import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { ProductEvidenceAsset } from "../shared/types";

export interface ProductAssetMaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProductAssetFactoryInput {
  recordingPath: string;
  outputDir: string;
  assets: ProductEvidenceAsset[];
  maskRegionsByAssetId?: Record<string, ProductAssetMaskRegion[]>;
  ffmpegPath?: string;
  sourceSha256?: string;
}

export interface ProductAssetFactoryReceipt {
  schemaVersion: "1";
  assets: ProductEvidenceAsset[];
  manifestPath: string;
  cacheKey: string;
  renderedAssetIds: string[];
  reusedAssetIds: string[];
}

export const PRODUCT_ASSET_FACTORY_VERSION = "product-assets-v3-readable-landscape";

export interface ProductAssetCommand {
  assetId: string;
  outputPath: string;
  args: string[];
}

export async function materializeProductEvidenceAssets(input: ProductAssetFactoryInput): Promise<ProductAssetFactoryReceipt> {
  if (!path.isAbsolute(input.recordingPath) || !path.isAbsolute(input.outputDir)) {
    throw new Error("Product asset source and output directory must be absolute paths.");
  }
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  const commands = buildProductAssetCommands(input);
  const cacheKey = productAssetFactoryCacheKey(input);
  const manifestPath = path.join(input.outputDir, "product-assets.json");
  const previous = await readReusableManifest(manifestPath, cacheKey);
  const reusedAssetIds: string[] = [];
  const renderedAssetIds: string[] = [];
  for (const command of commands) {
    const expectedHash = previous?.contentHashes.get(command.assetId);
    if (expectedHash && await exists(command.outputPath) && await sha256File(command.outputPath) === expectedHash) { reusedAssetIds.push(command.assetId); continue; }
    await runCommand(input.ffmpegPath ?? "ffmpeg", command.args);
    await fs.chmod(command.outputPath, 0o600);
    renderedAssetIds.push(command.assetId);
  }
  const outputs = new Map(commands.map((command) => [command.assetId, command.outputPath]));
  const assets = await Promise.all(input.assets.map(async (asset) => {
    const outputPath = outputs.get(asset.id);
    if (!outputPath) return asset;
    const isClip = asset.kind === "interaction_clip";
    const maskRegions = input.maskRegionsByAssetId?.[asset.id] ?? [];
    const contentHash = await sha256File(outputPath);
    return {
      ...asset,
      ...(isClip ? { clipPath: outputPath, clipUrl: pathToFileURL(outputPath).toString() } : { imagePath: outputPath, imageUrl: pathToFileURL(outputPath).toString() }),
      contentHash,
      factoryVersion: PRODUCT_ASSET_FACTORY_VERSION,
      maskingStatus: maskRegions.length > 0 ? "masked" as const : asset.maskingStatus
    };
  }));
  const manifest = {
    schemaVersion: "1",
    factoryVersion: PRODUCT_ASSET_FACTORY_VERSION,
    cacheKey,
    assetIds: commands.map(({ assetId }) => assetId),
    assets: assets.map((asset) => ({
      ...asset,
      imagePath: asset.imagePath ? path.basename(asset.imagePath) : undefined,
      imageUrl: undefined,
      clipPath: asset.clipPath ? path.basename(asset.clipPath) : undefined,
      clipUrl: undefined
    }))
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });
  return { schemaVersion: "1", assets, manifestPath, cacheKey, renderedAssetIds, reusedAssetIds };
}

export function productAssetFactoryCacheKey(input: ProductAssetFactoryInput): string {
  const relevant = input.assets.filter((asset) => asset.provenance !== "conceptual" && asset.approvalStatus !== "rejected").map((asset) => ({ id: asset.id, kind: asset.kind, sourceStartMs: asset.sourceStartMs, sourceEndMs: asset.sourceEndMs, sourceMomentIds: asset.sourceMomentIds, sourceEvidenceIds: asset.sourceEvidenceIds, supportedClaimIds: asset.supportedClaimIds, maskingStatus: asset.maskingStatus, crop: asset.crop, readableRegion: asset.readableRegion, approvalStatus: asset.approvalStatus, factualUseAllowed: asset.factualUseAllowed, masks: input.maskRegionsByAssetId?.[asset.id] ?? [] }));
  return createHash("sha256").update(JSON.stringify({ version: PRODUCT_ASSET_FACTORY_VERSION, sourceSha256: input.sourceSha256 ?? "unknown", assets: relevant })).digest("hex");
}

export function buildProductAssetCommands(input: ProductAssetFactoryInput): ProductAssetCommand[] {
  return input.assets.flatMap((asset) => {
    if (asset.provenance === "conceptual" || asset.approvalStatus === "rejected") return [];
    const mask = maskFilter(input.maskRegionsByAssetId?.[asset.id] ?? []);
    const startSec = Math.max(0, asset.sourceStartMs ?? 0) / 1_000;
    if (asset.kind === "interaction_clip") {
      const durationSec = Math.max(0.25, ((asset.sourceEndMs ?? (asset.sourceStartMs ?? 0) + 2_500) - (asset.sourceStartMs ?? 0)) / 1_000);
      const outputPath = path.join(input.outputDir, `${safeId(asset.id)}.mp4`);
      return [{
        assetId: asset.id,
        outputPath,
        args: [
          "-hide_banner", "-loglevel", "error", "-y", "-ss", startSec.toFixed(3), "-i", input.recordingPath,
          "-t", durationSec.toFixed(3), "-vf", `${productFrameFilter()}${mask}`,
          "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath
        ]
      }];
    }
    const outputPath = path.join(input.outputDir, `${safeId(asset.id)}.png`);
    if (asset.kind === "before_after_pair") {
      const endSec = Math.max(startSec + 0.25, (asset.sourceEndMs ?? (asset.sourceStartMs ?? 0) + 2_500) / 1_000);
      const pairFilter = [
        "[0:v]scale=620:620:force_original_aspect_ratio=decrease,pad=620:620:(ow-iw)/2:(oh-ih)/2:color=0x101319[a]",
        "[1:v]scale=620:620:force_original_aspect_ratio=decrease,pad=620:620:(ow-iw)/2:(oh-ih)/2:color=0x101319[b]",
        `[a][b]hstack=inputs=2,pad=1280:720:20:50:color=0x0b0e13${mask}[out]`
      ].join(";");
      return [{
        assetId: asset.id,
        outputPath,
        args: [
          "-hide_banner", "-loglevel", "error", "-y", "-ss", startSec.toFixed(3), "-i", input.recordingPath,
          "-ss", endSec.toFixed(3), "-i", input.recordingPath, "-filter_complex", pairFilter,
          "-map", "[out]", "-frames:v", "1", outputPath
        ]
      }];
    }
    return [{
      assetId: asset.id,
      outputPath,
      args: [
        "-hide_banner", "-loglevel", "error", "-y", "-ss", startSec.toFixed(3), "-i", input.recordingPath,
        "-frames:v", "1", "-vf", `${productFrameFilter()}${mask}`, outputPath
      ]
    }];
  });
}

function productFrameFilter(): string {
  return "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0b0e13";
}

function maskFilter(regions: ProductAssetMaskRegion[]): string {
  return regions.map((region) => {
    validateUnitRect(region);
    return `,drawbox=x=${Math.round(region.x * 1280)}:y=${Math.round(region.y * 720)}:w=${Math.round(region.width * 1280)}:h=${Math.round(region.height * 720)}:color=black@1:t=fill`;
  }).join("");
}

function validateUnitRect(region: ProductAssetMaskRegion): void {
  if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) {
    throw new Error("Product asset masking regions must be normalized rectangles inside the frame.");
  }
}

function safeId(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80);
  if (!safe) throw new Error("Product asset ID cannot produce an empty filename.");
  return safe;
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-8_000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Product asset generation failed (${code ?? "unknown"}): ${stderr}`)));
  });
}

async function readReusableManifest(manifestPath: string, cacheKey: string): Promise<{ contentHashes: Map<string, string> } | undefined> { try { const value = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { cacheKey?: string; assets?: Array<{ id?: unknown; contentHash?: unknown }> }; if (value.cacheKey !== cacheKey || !Array.isArray(value.assets)) return undefined; const hashes = value.assets.filter((asset): asset is { id: string; contentHash: string } => typeof asset.id === "string" && /^[a-f0-9]{64}$/.test(String(asset.contentHash))).map((asset) => [asset.id, asset.contentHash] as const); return hashes.length === value.assets.length ? { contentHashes: new Map(hashes) } : undefined; } catch { return undefined; } }
async function exists(filePath: string): Promise<boolean> { try { await fs.access(filePath); return true; } catch { return false; } }
async function sha256File(filePath: string): Promise<string> { return createHash("sha256").update(await fs.readFile(filePath)).digest("hex"); }
