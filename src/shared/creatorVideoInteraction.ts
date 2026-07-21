export interface Point {
  x: number;
  y: number;
}

export interface TypingPresentation {
  visibleText: string;
  caretVisible: boolean;
  complete: boolean;
  redacted: boolean;
}

export const DEFAULT_CHARACTER_DELAY_MS = 60;
export const TYPING_COMPLETION_DWELL_MS = 700;
export const CLICK_FEEDBACK_MS = 180;
export const POINTER_PRE_CLICK_DWELL_MS = 220;
export const ARROW_POINTER_HOTSPOT = { x: 1, y: 1 } as const;

export function easePointerPosition(from: Point, to: Point, progress: number): Point {
  const bounded = Math.max(0, Math.min(1, progress));
  const eased = bounded < 0.5
    ? 4 * bounded * bounded * bounded
    : 1 - Math.pow(-2 * bounded + 2, 3) / 2;
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased
  };
}

export function clickFeedbackProgress(elapsedMs: number): number | undefined {
  if (elapsedMs < 0 || elapsedMs > CLICK_FEEDBACK_MS) return undefined;
  return elapsedMs / CLICK_FEEDBACK_MS;
}

export function typingPresentationAt(input: {
  value: string;
  elapsedMs: number;
  characterDelayMs?: number;
  fieldKind?: "safe_text" | "password" | "authentication_code" | "token";
  cancelledAtMs?: number;
}): TypingPresentation {
  const redacted = input.fieldKind !== undefined && input.fieldKind !== "safe_text";
  if (redacted || looksSecretShaped(input.value)) {
    return { visibleText: "••••••••", caretVisible: false, complete: true, redacted: true };
  }
  const delay = Math.max(45, Math.min(70, input.characterDelayMs ?? DEFAULT_CHARACTER_DELAY_MS));
  const effectiveElapsed = Math.max(0, Math.min(input.elapsedMs, input.cancelledAtMs ?? Number.POSITIVE_INFINITY));
  let consumedMs = 0;
  let characterCount = 0;
  for (const character of input.value) {
    const pause = /[\s,.;:!?]/.test(character) ? Math.round(delay * 0.65) : 0;
    if (consumedMs + delay + pause > effectiveElapsed) break;
    consumedMs += delay + pause;
    characterCount += 1;
  }
  const completeAtMs = typingDurationMs(input.value, delay);
  const complete = effectiveElapsed >= completeAtMs;
  return {
    visibleText: input.value.slice(0, characterCount),
    caretVisible: !complete && (Math.floor(effectiveElapsed / 400) % 2 === 0),
    complete,
    redacted: false
  };
}

export function typingDurationMs(value: string, characterDelayMs = DEFAULT_CHARACTER_DELAY_MS): number {
  const delay = Math.max(45, Math.min(70, characterDelayMs));
  return [...value].reduce((total, character) => total + delay + (/[\s,.;:!?]/.test(character) ? Math.round(delay * 0.65) : 0), 0);
}

export function looksSecretShaped(value: string): boolean {
  const compact = value.trim();
  return /^(?:sk|pk|ghp|xox[baprs]|api[_-]?key)[_-][A-Za-z0-9_-]{8,}$/i.test(compact)
    || /^[A-Fa-f0-9]{32,}$/.test(compact)
    || /(?:password|token|secret|auth(?:entication)?\s*code)/i.test(compact);
}
