export interface TimedInterval { startSeconds: number; endSeconds: number; declared?: boolean }
export interface VisualDifferenceSample { timeSeconds: number; difference: number; captionOnly?: boolean }
export interface Rect { id: string; kind: "caption" | "robot" | "annotation" | "required_ocr"; left: number; top: number; right: number; bottom: number }

export function deriveStaticWindows(samples: VisualDifferenceSample[], threshold: number): TimedInterval[] {
  const windows: TimedInterval[] = [];
  let start: number | undefined;
  let last: number | undefined;
  for (const sample of samples) {
    const staticSample = sample.difference < threshold || sample.captionOnly === true;
    if (staticSample && start === undefined) start = sample.timeSeconds;
    if (!staticSample && start !== undefined && last !== undefined) {
      windows.push({ startSeconds: start, endSeconds: sample.timeSeconds });
      start = undefined;
    }
    last = sample.timeSeconds;
  }
  if (start !== undefined && last !== undefined) windows.push({ startSeconds: start, endSeconds: last });
  return windows;
}

export function auditStaticWindows(intervals: TimedInterval[], maximumSeconds = 2.5) {
  const rejected = intervals.filter(({ startSeconds, endSeconds, declared }) => !declared && endSeconds - startSeconds > maximumSeconds);
  return { passed: rejected.length === 0, maximumSeconds, rejected, longestSeconds: Math.max(0, ...intervals.map(({ startSeconds, endSeconds }) => endSeconds - startSeconds)) };
}

export function auditNarrationGaps(intervals: TimedInterval[], outroStartsAtSeconds: number, maximumMs = 250) {
  const rejected = intervals.filter(({ startSeconds, endSeconds, declared }) => !declared && startSeconds < outroStartsAtSeconds && (endSeconds - startSeconds) * 1_000 > maximumMs);
  return { passed: rejected.length === 0, maximumMs, rejected, longestMs: Math.round(Math.max(0, ...intervals.filter(({ startSeconds }) => startSeconds < outroStartsAtSeconds).map(({ startSeconds, endSeconds }) => (endSeconds - startSeconds) * 1_000))) };
}

export function auditTransientJumps(dbJumps: Array<{ timeSeconds: number; jumpDb: number }>, thresholdDb = 18) {
  const clicks = dbJumps.filter(({ jumpDb }) => jumpDb > thresholdDb);
  return { passed: clicks.length === 0, thresholdDb, clickCount: clicks.length, clicks };
}

export function auditCollisions(rectangles: Rect[], allowedPairs: Array<[string, string]> = []) {
  const allowed = new Set(allowedPairs.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const collisions: Array<{ first: string; second: string; overlapArea: number }> = [];
  for (let index = 0; index < rectangles.length; index += 1) for (let other = index + 1; other < rectangles.length; other += 1) {
    const first = rectangles[index]!;
    const second = rectangles[other]!;
    if (allowed.has(`${first.id}|${second.id}`) || ![first.kind, second.kind].includes("required_ocr")) continue;
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    if (width > 0 && height > 0) collisions.push({ first: first.id, second: second.id, overlapArea: width * height });
  }
  return { passed: collisions.length === 0, collisions };
}

export function auditAdjacentSimilarity(values: Array<{ firstSceneId: string; secondSceneId: string; similarity: number }>, maximum = .8) {
  const rejected = values.filter(({ similarity }) => similarity > maximum);
  return { passed: rejected.length === 0, maximum, rejected };
}

export function auditOcr(text: string, requiredGroups: string[][], privatePatterns: RegExp[], minimumCoverage = .75) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const required = requiredGroups.map((terms) => ({ terms, matched: terms.some((term) => normalized.includes(term.toLowerCase())) }));
  const privateMatches = privatePatterns.filter((pattern) => pattern.test(text)).map(String);
  const coverage = required.filter(({ matched }) => matched).length / Math.max(1, required.length);
  return { passed: coverage >= minimumCoverage && privateMatches.length === 0, coverage, minimumCoverage, missing: required.filter(({ matched }) => !matched).map(({ terms }) => terms), privateMatches };
}

export function auditCta(copy: string, objective: { brand: string; action: string; destinationVerified: boolean; commentDeliveryVerified: boolean }) {
  const unsupportedDelivery = /comment|dm|send (it|you)|link in bio|follow/i.test(copy) && !objective.commentDeliveryVerified;
  const inventedDestination = /https?:|www\.|\.com\b|@\w+/i.test(copy) && !objective.destinationVerified;
  const brandPassed = new RegExp(`\\b${escapeRegExp(objective.brand)}\\b`, "i").test(copy);
  const actionPassed = copy.toLowerCase().includes(objective.action.toLowerCase());
  return { passed: !unsupportedDelivery && !inventedDestination && brandPassed && actionPassed, unsupportedDelivery, inventedDestination, brandPassed, actionPassed };
}

export function auditRegression(current: Record<string, number>, floor: Record<string, number>, higherIsBetter: string[]) {
  const regressions = Object.entries(floor).flatMap(([metric, baseline]) => {
    const value = current[metric];
    if (value === undefined) return [{ metric, reason: "missing_current_measurement", baseline }];
    const passed = higherIsBetter.includes(metric) ? value >= baseline : value <= baseline;
    return passed ? [] : [{ metric, reason: "regressed", baseline, value }];
  });
  return { passed: regressions.length === 0, regressions };
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
