import { describe, expect, it } from "vitest";
import { auditRenderedRobotGeometry, directRobotPerformance, sampleSpeechEnvelope, type RobotDirectorInput } from "./gideonRobotV7";

const input: RobotDirectorInput = { sceneId: "proof-contact", narrativeFunction: "proof", emotion: "focused", gazeTarget: "product_left", gesture: "point_left", scaleToken: "cameo", energy: .8, sceneDurationFrames: 90, emphasizedWordFrame: 34, proofPosition: { x: .2, y: .3 }, audioEnvelope: [0, .2, .8, .4, 0] };

describe("V7 robot director", () => {
  it("leads a gesture with gaze and uses irregular deterministic blinks", () => {
    const first = directRobotPerformance(input);
    const second = directRobotPerformance(input);
    expect(first).toEqual(second);
    expect(first.gazeArrivalFrame).toBeLessThan(first.gesturePeakFrame);
    expect(first.blinkFrames).not.toEqual([55]);
  });

  it("samples the declared narration envelope rather than a sine oscillator", () => {
    expect(sampleSpeechEnvelope(input.audioEnvelope, 0, 90)).toBe(0);
    expect(sampleSpeechEnvelope(input.audioEnvelope, 45, 90)).toBe(.8);
  });

  it("fails rendered geometry when clipping or invisible acting is detected", () => {
    const audit = auditRenderedRobotGeometry([{ sceneId: "bad", top: -1, bottom: 1800, left: 20, right: 1040, headClearance: 40, handClipped: true, eyeTravel: 2, torsoDisplacement: 3, silhouetteDifference: .01 }]);
    expect(audit.passed).toBe(false);
    expect(audit.clippedScenes).toEqual(["bad"]);
    expect(audit.visuallySimilarStates).toEqual(["bad"]);
  });
});
