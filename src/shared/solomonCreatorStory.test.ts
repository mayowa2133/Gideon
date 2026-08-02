import { describe, expect, it } from "vitest";
import {
  SOLOMON_CREATOR_STORY_DURATION_FRAMES,
  SOLOMON_CREATOR_STORY_SCRIPT,
  assertSolomonCreatorStoryManifest,
  auditSolomonStoryLayout,
  auditSolomonStoryRetention,
  createSolomonCreatorStoryManifest
} from "./solomonCreatorStory";

const paths = {
  jobs: "/private/jobs.mp4",
  tracker: "/private/tracker.mp4",
  contacts: "/private/contacts.mp4",
  outreach: "/private/outreach.mp4"
};

describe("Solomon creator story", () => {
  it("builds a complete authentic 36-second user-story manifest", () => {
    const manifest = createSolomonCreatorStoryManifest(paths);
    expect(() => assertSolomonCreatorStoryManifest(manifest)).not.toThrow();
    expect(manifest.canvas.durationInFrames).toBe(SOLOMON_CREATOR_STORY_DURATION_FRAMES);
    expect(manifest.sources).toHaveLength(4);
    expect(manifest.sources.every(({ authentic, approved }) => authentic && approved)).toBe(true);
    expect(manifest.sources.every(({ environment, publicReleaseApproved }) =>
      environment === "authenticated_safe_demo_fixture" && !publicReleaseApproved)).toBe(true);
    expect(manifest.scenes[0]?.from).toBe(0);
    expect(manifest.scenes.at(-1)?.to).toBe(1_080);
    expect(manifest.scenes).toHaveLength(19);
    expect(manifest.scenes.at(-1)?.id).toBe("brand-sting");
    expect(manifest.scenes.at(-1)?.kind).toBe("cta");
    expect(manifest.cta).toEqual({
      actionCount: 1,
      text: "COMMENT ‘SOLOMON’",
      destinationStatus: "verified_destination",
      verified: true,
      publicUrlImplied: false,
      destination: "platform_comment",
      keyword: "SOLOMON"
    });
    expect(SOLOMON_CREATOR_STORY_SCRIPT.match(/[A-Za-z0-9']+/g)).toHaveLength(89);
    expect(manifest.scenes.map(({ narration }) => narration).filter(Boolean).join(" ")).toBe(SOLOMON_CREATOR_STORY_SCRIPT);
    expect(manifest.sources.find(({ id }) => id === "contacts")?.privacyMasks.length).toBeGreaterThanOrEqual(4);
    expect(manifest.sources.find(({ id }) => id === "outreach")?.privacyMasks.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps proof targeted, host poses varied, and declared events dense", () => {
    const manifest = createSolomonCreatorStoryManifest(paths);
    const audit = auditSolomonStoryRetention(manifest);
    expect(audit).toMatchObject({
      passed: true,
      maximumDeclaredEventGapFrames: 18,
      repeatedAdjacentHostPoses: [],
      productScenesWithoutProofTargets: [],
      missingSourceManifestEntries: [],
      inconsistentProductGazeScenes: [],
      cursorOutsideVisibleCropScenes: [],
      excessiveCameraVelocityScenes: [],
      excessiveCameraAccelerationScenes: [],
      abruptCameraDirectionChangeScenes: [],
      captionCadenceViolations: [],
      placeholderOrDebugText: [],
      unverifiedCta: false,
      unapprovedSourceIds: [],
      nonReleaseSourceIds: ["jobs", "tracker", "contacts", "outreach"]
    });
    expect(audit.releaseReady).toBe(false);
    expect(audit.longestDeclaredEventGapFrames).toBeLessThanOrEqual(18);
  });

  it("keeps captions inside the mobile-safe frame and away from presenter faces", () => {
    const manifest = createSolomonCreatorStoryManifest(paths);
    expect(auditSolomonStoryLayout(manifest)).toEqual({
      passed: true,
      safeFrame: { left: 38, top: 52, right: 1042, bottom: 1844 },
      captionViolations: [],
      presenterFaceCaptionCollisions: [],
      ctaPersistsThroughFinalFrame: true
    });
  });

  it("fails closed when proof authenticity or CTA policy is weakened", () => {
    const invalidSource = createSolomonCreatorStoryManifest(paths);
    invalidSource.sources[0] = { ...invalidSource.sources[0]!, authentic: false as true };
    expect(() => assertSolomonCreatorStoryManifest(invalidSource)).toThrow(/authentic/);

    const invalidCta = createSolomonCreatorStoryManifest(paths);
    (invalidCta.cta as { publicUrlImplied: boolean }).publicUrlImplied = true;
    expect(() => assertSolomonCreatorStoryManifest(invalidCta)).toThrow(/CTA/);

    const invalidReleaseApproval = createSolomonCreatorStoryManifest(paths);
    invalidReleaseApproval.sources[0] = {
      ...invalidReleaseApproval.sources[0]!,
      publicReleaseApproved: true,
      environmentReviewReceipt: "review-123"
    };
    expect(() => assertSolomonCreatorStoryManifest(invalidReleaseApproval)).toThrow(/release approval/);
  });

  it("fails retention when caption cadence, cursor framing, or camera motion regresses", () => {
    const invalidCaption = createSolomonCreatorStoryManifest(paths);
    invalidCaption.captions[0] = { ...invalidCaption.captions[0]!, to: 24 };
    expect(auditSolomonStoryRetention(invalidCaption).captionCadenceViolations).toEqual(["c01"]);

    const invalidCursor = createSolomonCreatorStoryManifest(paths);
    const trackerSource = invalidCursor.sources.find(({ id }) => id === "tracker")!;
    trackerSource.actionRegion = { ...trackerSource.actionRegion, x: 1.2 };
    expect(auditSolomonStoryRetention(invalidCursor).cursorOutsideVisibleCropScenes).toContain("status-click");

    const invalidCamera = createSolomonCreatorStoryManifest(paths);
    const trackerAction = invalidCamera.scenes.find(({ id }) => id === "status-click")!;
    trackerAction.camera = { ...trackerAction.camera!, settleFrames: 1, zoomEnd: 3 };
    const cameraAudit = auditSolomonStoryRetention(invalidCamera);
    expect([
      ...cameraAudit.excessiveCameraVelocityScenes,
      ...cameraAudit.excessiveCameraAccelerationScenes
    ]).toContain("status-click");
  });
});
