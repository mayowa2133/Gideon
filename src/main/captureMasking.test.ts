import { describe, expect, it } from "vitest";
import { captureMaskingPolicyHash, defaultCaptureMaskingPolicy, validateCaptureMaskingPolicy } from "./captureMasking";

describe("capture masking policy", () => {
  it("enables every protected category by default and hashes custom selectors", () => {
    const policy = defaultCaptureMaskingPolicy(["[data-private-panel]"]);
    expect(policy.categories).toEqual(["password", "token", "payment", "email", "personal_data", "canvas"]);
    expect(captureMaskingPolicyHash(policy)).toMatch(/^[a-f0-9]{64}$/);
    expect(captureMaskingPolicyHash(policy)).not.toBe(captureMaskingPolicyHash(defaultCaptureMaskingPolicy()));
  });

  it("cannot disable protected categories or target masking internals", () => {
    expect(() => validateCaptureMaskingPolicy({ ...defaultCaptureMaskingPolicy(), categories: ["password"] })).toThrow("retain every protected category");
    expect(() => defaultCaptureMaskingPolicy(["[data-gideon-mask-root]"])).toThrow("custom selector is invalid");
    expect(() => defaultCaptureMaskingPolicy(["../secret\n"])).toThrow("custom selector is invalid");
  });
});
