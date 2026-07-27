import type { NarrationProvider, NarrationRequest, NarrationResult } from "./narration";

export class NarrationProviderChain implements NarrationProvider {
  readonly kind = "chatterbox_local" as const;
  readonly providerVersion: string;
  constructor(private readonly preferred: NarrationProvider, private readonly fallback?: NarrationProvider) {
    this.providerVersion = `chain:${preferred.providerVersion}${fallback ? `>${fallback.providerVersion}` : ""}`;
  }
  async isAvailable(): Promise<boolean> {
    return await this.preferred.isAvailable() || Boolean(this.fallback && await this.fallback.isAvailable());
  }
  async synthesize(request: NarrationRequest): Promise<NarrationResult> {
    try {
      if (!await this.preferred.isAvailable()) throw new Error("Preferred narration provider is unavailable.");
      return await this.preferred.synthesize(request);
    } catch (preferredError) {
      if (!this.fallback || !await this.fallback.isAvailable()) throw preferredError;
      const result = await this.fallback.synthesize(request);
      return { ...result, provenance: { ...result.provenance, fallbackFrom: this.preferred.kind } };
    }
  }
}
