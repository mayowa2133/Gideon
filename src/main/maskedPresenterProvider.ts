import type { MaskedPresenterGestureSchedule } from "./maskedPresenter";
import {
  renderMaskedPresenterPerformance,
  type MaskedPresenterRenderResult
} from "./maskedPresenterRenderer";

export interface MaskedPresenterAssetRequest {
  outputDir: string;
  durationMs: number;
  fps: 30 | 60;
  width: number;
  height: number;
  seed: number;
  schedule: MaskedPresenterGestureSchedule;
}

export interface MaskedPresenterAssetProvider {
  readonly kind: "code_native_rig" | "recorded_transparent_clips" | "approved_ai_video";
  readonly providerVersion: string;
  produce(request: MaskedPresenterAssetRequest): Promise<MaskedPresenterRenderResult>;
}

export class CodeNativeMaskedPresenterProvider implements MaskedPresenterAssetProvider {
  readonly kind = "code_native_rig" as const;
  readonly providerVersion = "code-native-axiom-v1";

  constructor(private readonly options: { ffmpegPath?: string } = {}) {}

  produce(request: MaskedPresenterAssetRequest): Promise<MaskedPresenterRenderResult> {
    return renderMaskedPresenterPerformance({
      ...request,
      ffmpegPath: this.options.ffmpegPath,
      encodeGreenScreenVideo: true
    });
  }
}

export function assertMaskedPresenterAssetProvider(provider: MaskedPresenterAssetProvider): void {
  if (!["code_native_rig", "recorded_transparent_clips", "approved_ai_video"].includes(provider.kind) || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(provider.providerVersion)) {
    throw new Error("Masked presenter asset provider is invalid.");
  }
}
