import { describe, expect, it } from "vitest";
import { createSolomonCreatorStoryV7Manifest } from "./solomonCreatorStoryV7";
import { hashV7Manifest, regenerateV7Scene } from "./solomonCreatorStoryV7Regeneration";

const paths = { jobs: "/private/jobs.webm", tracker: "/private/tracker.webm", contacts: "/private/contacts.webm", outreach: "/private/outreach.webm" };

describe("V7 scene-level regeneration", () => {
  it("changes one scene while preserving every other scene and its evidence lineage", () => {
    const manifest = createSolomonCreatorStoryV7Manifest(paths);
    const result = regenerateV7Scene(manifest, {
      sceneId: "human-control",
      expectedManifestHash: hashV7Manifest(manifest),
      reason: "Make the trust beat more explicit.",
      requestedChanges: { visibleResult: "The Solomon host clearly hands control back to the user." }
    });
    expect(result.receipt.changedFields).toEqual(["visibleResult"]);
    expect(result.receipt.preservedSceneIds).toHaveLength(manifest.scenes.length - 1);
    expect(result.manifest.scenes.filter(({ id }) => id !== "human-control")).toEqual(manifest.scenes.filter(({ id }) => id !== "human-control"));
  });

  it("rejects stale manifest lineage", () => {
    const manifest = createSolomonCreatorStoryV7Manifest(paths);
    expect(() => regenerateV7Scene(manifest, { sceneId: "human-control", expectedManifestHash: "0".repeat(64), reason: "Stale request must fail.", requestedChanges: { visibleResult: "Changed" } })).toThrow(/stale/);
  });
});
