export interface V9Rect { id: string; kind: "robot" | "caption" | "editorial" | "product_ocr" | "annotation" | "cta" | "social_ui"; left: number; top: number; right: number; bottom: number }
export interface V9SemanticEvent { frame: number; kind: "semantic" | "decorative"; description: string }

export function auditV9Layout(rectangles: V9Rect[], allowedPairs: Array<[string, string]> = []) {
  const allowed = new Set(allowedPairs.flatMap(([left, right]) => [`${left}:${right}`, `${right}:${left}`]));
  const collisions = rectangles.flatMap((left, index) => rectangles.slice(index + 1).flatMap((right) => {
    if (allowed.has(`${left.id}:${right.id}`) || !intersects(left, right)) return [];
    if (!isForbiddenPair(left.kind, right.kind)) return [];
    return [{ left: left.id, right: right.id, leftKind: left.kind, rightKind: right.kind }];
  }));
  return { passed: collisions.length === 0, collisionCount: collisions.length, collisions };
}

export function auditV9Hook(spoken: string, visible: string, explicitException = false) {
  const normalizedSpoken = normalize(spoken);
  const normalizedVisible = normalize(visible);
  return { passed: explicitException || normalizedSpoken === normalizedVisible, normalizedSpoken, normalizedVisible, explicitException };
}

export function auditV9Composite(input: { cleanText: string[]; composedText: string[]; requiredText: string[]; highlightedRegions: Array<{ id: string; hasContent: boolean }>; messageStartsAtBeginning: boolean; heroZeroValues: number; privacyMaskOverPrimaryProof: boolean }) {
  const clean = new Set(input.cleanText.map(normalize));
  const composed = new Set(input.composedText.map(normalize));
  const missing = input.requiredText.map(normalize).filter((value) => clean.has(value) && !composed.has(value));
  const emptyHighlights = input.highlightedRegions.filter(({ hasContent }) => !hasContent).map(({ id }) => id);
  const failures = [
    missing.length ? "required_text_occluded" : undefined,
    emptyHighlights.length ? "empty_highlight" : undefined,
    !input.messageStartsAtBeginning ? "message_truncated" : undefined,
    input.heroZeroValues > 0 ? "hero_zero_value" : undefined,
    input.privacyMaskOverPrimaryProof ? "privacy_mask_over_proof" : undefined
  ].filter((value): value is string => Boolean(value));
  return { passed: failures.length === 0, missing, emptyHighlights, failures };
}

export function auditV9SemanticMotion(events: V9SemanticEvent[], startFrame: number, endFrame: number, maximumGapFrames = 27) {
  const semantic = events.filter(({ kind, frame }) => kind === "semantic" && frameInRange(frame, startFrame, endFrame)).sort((left, right) => left.frame - right.frame);
  const frames = [startFrame, ...semantic.map(({ frame }) => frame), endFrame];
  const gaps = frames.slice(1).map((frame, index) => ({ from: frames[index]!, to: frame, gap: frame - frames[index]! })).filter(({ gap }) => gap > maximumGapFrames);
  return { passed: semantic.length > 0 && gaps.length === 0, semanticCount: semantic.length, decorativeCount: events.filter(({ kind }) => kind === "decorative").length, gaps, maximumGapFrames };
}

export function auditV9Transitions(transitions: Array<{ type: "cut" | "slide" | "match_cut" | "object_wipe" | "dissolve"; purpose: string }>, maximumDissolves = 2) {
  const dissolves = transitions.filter(({ type }) => type === "dissolve");
  const missingPurpose = transitions.filter(({ purpose }) => !purpose.trim());
  return { passed: dissolves.length <= maximumDissolves && missingPurpose.length === 0, dissolveCount: dissolves.length, maximumDissolves, missingPurpose };
}

export function auditV9Cta(input: { brand: string; action: string; text: string; destinationVerified: boolean; commentDeliveryVerified: boolean; accountIdentity: string }) {
  const unsupportedPromise = /comment|dm|link in bio|visit|download|follow @|https?:\/\//i.test(input.text) && !(input.destinationVerified || input.commentDeliveryVerified);
  const passed = input.brand === "Solomon" && input.action === "save" && /save/i.test(input.text) && !unsupportedPromise && input.accountIdentity === "SOLOMON";
  return { passed, unsupportedPromise };
}

function intersects(left: V9Rect, right: V9Rect) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function isForbiddenPair(left: V9Rect["kind"], right: V9Rect["kind"]) {
  const pair = new Set([left, right]);
  return pair.has("robot") && (pair.has("caption") || pair.has("editorial") || pair.has("product_ocr") || pair.has("annotation") || pair.has("cta")) || pair.has("product_ocr") && (pair.has("caption") || pair.has("annotation") || pair.has("social_ui"));
}

function frameInRange(frame: number, start: number, end: number) {
  return frame >= start && frame <= end;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
