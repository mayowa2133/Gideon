import { describe, expect, it } from "vitest";
import { CodeNativeMaskedPresenterProvider, assertMaskedPresenterAssetProvider } from "./maskedPresenterProvider";

describe("masked presenter asset provider", () => {
  it("exposes a provider-neutral code-native implementation", () => {
    const provider = new CodeNativeMaskedPresenterProvider();
    expect(provider.kind).toBe("code_native_rig");
    expect(provider.providerVersion).toBe("code-native-axiom-v1");
    expect(() => assertMaskedPresenterAssetProvider(provider)).not.toThrow();
  });
});
