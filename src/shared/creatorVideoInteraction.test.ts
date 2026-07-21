import { describe, expect, it } from "vitest";
import {
  ARROW_POINTER_HOTSPOT,
  CLICK_FEEDBACK_MS,
  TYPING_COMPLETION_DWELL_MS,
  clickFeedbackProgress,
  easePointerPosition,
  typingDurationMs,
  typingPresentationAt
} from "./creatorVideoInteraction";

describe("creator-video interaction presentation", () => {
  it("eases continuous long and short pointer paths without teleporting", () => {
    const from = { x: 10, y: 20 };
    const to = { x: 910, y: 620 };
    const samples = Array.from({ length: 11 }, (_, index) => easePointerPosition(from, to, index / 10));
    expect(samples[0]).toEqual(from);
    expect(samples.at(-1)).toEqual(to);
    expect(samples.every((sample, index) => index === 0 || sample.x >= samples[index - 1]!.x)).toBe(true);
    expect(easePointerPosition({ x: 100, y: 100 }, { x: 140, y: 120 }, 0.5)).toEqual({ x: 120, y: 110 });
  });

  it("aligns clicks to the arrow tip and bounds click feedback", () => {
    expect(ARROW_POINTER_HOTSPOT).toEqual({ x: 1, y: 1 });
    expect(clickFeedbackProgress(0)).toBe(0);
    expect(clickFeedbackProgress(CLICK_FEEDBACK_MS)).toBe(1);
    expect(clickFeedbackProgress(CLICK_FEEDBACK_MS + 1)).toBeUndefined();
  });

  it("types incrementally, pauses, completes, and preserves post-entry dwell", () => {
    const value = "Lifecycle updated";
    const duration = typingDurationMs(value, 60);
    expect(typingPresentationAt({ value, elapsedMs: 180, characterDelayMs: 60 }).visibleText.length).toBeGreaterThan(0);
    expect(typingPresentationAt({ value, elapsedMs: 180, characterDelayMs: 60 }).visibleText).not.toBe(value);
    expect(typingPresentationAt({ value, elapsedMs: duration, characterDelayMs: 60 })).toMatchObject({ visibleText: value, complete: true });
    expect(TYPING_COMPLETION_DWELL_MS).toBeGreaterThanOrEqual(600);
  });

  it("redacts secret fields and secret-shaped values", () => {
    expect(typingPresentationAt({ value: "hunter2", elapsedMs: 10, fieldKind: "password" })).toMatchObject({ visibleText: "••••••••", redacted: true });
    expect(typingPresentationAt({ value: "sk_test_abcdefgh123456", elapsedMs: 10 })).toMatchObject({ redacted: true });
  });

  it("freezes a cancelled typing sequence at the cancellation point", () => {
    const first = typingPresentationAt({ value: "Lifecycle updated", elapsedMs: 1_000, cancelledAtMs: 240 });
    const later = typingPresentationAt({ value: "Lifecycle updated", elapsedMs: 4_000, cancelledAtMs: 240 });
    expect(later.visibleText).toBe(first.visibleText);
    expect(later.complete).toBe(false);
  });
});
