import { createHash } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { stableSerialize } from "./productFlowCompiler";

export type CaptureMaskCategory = "password" | "token" | "payment" | "email" | "personal_data" | "canvas";

export interface CaptureMaskingPolicy {
  schemaVersion: "1";
  categories: CaptureMaskCategory[];
  customSelectors: string[];
  maskColor: `#${string}`;
}

export interface CaptureMaskingReceipt {
  schemaVersion: "1";
  policyHash: string;
  frameCount: number;
  matchedElementCount: number;
  visibleSensitiveElementCount: number;
  overlayCount: number;
  canvasCount: number;
  hiddenSensitiveElementCount: number;
  status: "active";
}

const requiredCategories: CaptureMaskCategory[] = ["password", "token", "payment", "email", "personal_data", "canvas"];

export function defaultCaptureMaskingPolicy(customSelectors: string[] = []): CaptureMaskingPolicy {
  return validateCaptureMaskingPolicy({ schemaVersion: "1", categories: requiredCategories, customSelectors, maskColor: "#111827" });
}

export function validateCaptureMaskingPolicy(value: CaptureMaskingPolicy | undefined): CaptureMaskingPolicy {
  const policy = value ?? { schemaVersion: "1", categories: requiredCategories, customSelectors: [], maskColor: "#111827" };
  if (policy.schemaVersion !== "1" || !Array.isArray(policy.categories) || !Array.isArray(policy.customSelectors)) throw new Error("Capture masking policy is invalid.");
  if (policy.categories.length !== requiredCategories.length || requiredCategories.some((category) => !policy.categories.includes(category)) || new Set(policy.categories).size !== policy.categories.length) throw new Error("Capture masking policy must retain every protected category.");
  if (policy.customSelectors.length > 50) throw new Error("Capture masking policy has too many custom selectors.");
  const customSelectors = policy.customSelectors.map((selector) => {
    if (typeof selector !== "string" || !selector.trim() || selector.length > 200 || /[\u0000-\u001f\u007f]/.test(selector) || /data-gideon-(?:mask|capture-pointer)/i.test(selector)) throw new Error("Capture masking custom selector is invalid.");
    return selector.trim();
  });
  if (new Set(customSelectors).size !== customSelectors.length || !/^#[0-9a-f]{6}$/i.test(policy.maskColor)) throw new Error("Capture masking policy is invalid.");
  return { schemaVersion: "1", categories: [...requiredCategories], customSelectors, maskColor: policy.maskColor.toLowerCase() as `#${string}` };
}

export function captureMaskingPolicyHash(policy: CaptureMaskingPolicy): string {
  return createHash("sha256").update(stableSerialize(validateCaptureMaskingPolicy(policy))).digest("hex");
}

export async function installCaptureMasking(context: BrowserContext, policyInput?: CaptureMaskingPolicy): Promise<CaptureMaskingPolicy> {
  const policy = validateCaptureMaskingPolicy(policyInput);
  await context.addInitScript((input: CaptureMaskingPolicy) => {
    type MaskState = {
      refresh(): { matched: number; visible: number; overlays: number; canvas: number; hidden: number; invalidSelector: boolean; scanTruncated: boolean };
    };
    const stateWindow = window as unknown as { __gideonCaptureMasking?: MaskState };
    if (stateWindow.__gideonCaptureMasking) return;
    const selectors = [
      'input[type="password"]',
      'input[autocomplete="current-password" i]',
      'input[autocomplete="new-password" i]',
      'input[autocomplete="one-time-code" i]',
      'input[name*="token" i]', 'input[id*="token" i]', 'textarea[name*="token" i]',
      'input[name*="secret" i]', 'input[id*="secret" i]', 'textarea[name*="secret" i]',
      'input[name*="api-key" i]', 'input[id*="api-key" i]', 'input[aria-label*="api key" i]',
      'input[autocomplete^="cc-" i]', 'input[name*="card" i]', 'input[id*="card" i]',
      'input[name*="cvv" i]', 'input[id*="cvv" i]', 'input[name*="cvc" i]', 'input[id*="cvc" i]',
      'input[type="email"]', 'input[autocomplete="email" i]', 'input[name*="email" i]', 'input[id*="email" i]',
      'input[type="tel"]', 'input[autocomplete="tel" i]', 'input[name*="phone" i]', 'input[id*="phone" i]',
      'input[autocomplete*="name" i]', 'input[autocomplete*="address" i]', 'input[autocomplete*="postal" i]', 'input[autocomplete*="bday" i]',
      '[data-sensitive]', '[data-gideon-sensitive]',
      'canvas',
      ...input.customSelectors
    ];
    const overlays = new Map<Element, HTMLDivElement>();
    let root: HTMLDivElement | undefined;
    let invalidSelector = false;
    let scanTruncated = false;
    const ensureRoot = () => {
      if (!document.documentElement) return undefined;
      if (!root?.isConnected) {
        root = document.createElement("div");
        root.setAttribute("data-gideon-mask-root", "true");
        Object.assign(root.style, { position: "fixed", inset: "0", width: "0", height: "0", zIndex: "2147483647", pointerEvents: "none" });
        document.documentElement.append(root);
      }
      return root;
    };
    const matchedElements = () => {
      const output = new Set<Element>();
      for (const selector of selectors) {
        try { for (const element of document.querySelectorAll(selector)) output.add(element); }
        catch { invalidSelector = true; }
      }
      const textNodes = document.body?.querySelectorAll("body *") ?? [];
      scanTruncated = textNodes.length > 10_000;
      const sensitiveText = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\d[ -]*?){13,19}\b|\b(?:sk|tok)[-_][A-Za-z0-9_-]{6,}|(?:password|secret|token|api[_ -]?key)\s*[:=]\s*\S{4,})/i;
      for (const element of [...textNodes].slice(0, 10_000)) {
        if (!(element instanceof HTMLElement) || ["SCRIPT", "STYLE", "NOSCRIPT", "HTML", "BODY"].includes(element.tagName) || element.children.length > 0) continue;
        const text = (element.textContent ?? "").trim().slice(0, 1_000);
        if (sensitiveText.test(text)) output.add(element);
      }
      return [...output].filter((element) => !element.closest('[data-gideon-mask-root="true"]'));
    };
    const visibleRect = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0 || rect.width <= 0 || rect.height <= 0) return undefined;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return undefined;
      return rect;
    };
    const refresh = () => {
      const host = ensureRoot();
      const matched = matchedElements();
      const current = new Set(matched);
      let visible = 0;
      let canvas = 0;
      for (const element of matched) {
        element.setAttribute("data-gideon-masked", "true");
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
          element.setAttribute("autocomplete", "off");
          Object.assign((element as HTMLElement).style, { color: "transparent", caretColor: "transparent", textShadow: "none", backgroundColor: input.maskColor, WebkitTextFillColor: "transparent" });
        }
        const rect = visibleRect(element);
        let overlay = overlays.get(element);
        if (!rect || !host) {
          overlay?.remove();
          overlays.delete(element);
          continue;
        }
        visible += 1;
        if (element instanceof HTMLCanvasElement) canvas += 1;
        if (!overlay?.isConnected) {
          overlay = document.createElement("div");
          overlay.setAttribute("data-gideon-mask-overlay", "true");
          overlay.setAttribute("aria-hidden", "true");
          Object.assign(overlay.style, { position: "fixed", background: input.maskColor, borderRadius: "3px", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)", pointerEvents: "none" });
          host.append(overlay);
          overlays.set(element, overlay);
        }
        Object.assign(overlay.style, { left: `${Math.max(0, rect.left)}px`, top: `${Math.max(0, rect.top)}px`, width: `${Math.min(innerWidth, rect.right) - Math.max(0, rect.left)}px`, height: `${Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)}px` });
      }
      for (const [element, overlay] of overlays) if (!current.has(element) || !element.isConnected) { overlay.remove(); overlays.delete(element); }
      return { matched: matched.length, visible, overlays: overlays.size, canvas, hidden: matched.length - visible, invalidSelector, scanTruncated };
    };
    stateWindow.__gideonCaptureMasking = { refresh };
    const observer = new MutationObserver(() => refresh());
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden", "type", "data-sensitive", "data-gideon-sensitive"] });
    addEventListener("scroll", refresh, true);
    addEventListener("resize", refresh, true);
    addEventListener("input", refresh, true);
    addEventListener("change", refresh, true);
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
    refresh();
  }, policy);
  return policy;
}

export async function assertCaptureMaskingReady(page: Page, policyInput?: CaptureMaskingPolicy): Promise<CaptureMaskingReceipt> {
  const policy = validateCaptureMaskingPolicy(policyInput);
  let matchedElementCount = 0;
  let visibleSensitiveElementCount = 0;
  let overlayCount = 0;
  let canvasCount = 0;
  let hiddenSensitiveElementCount = 0;
  const frames = page.frames();
  for (const frame of frames) {
    const state = await frame.evaluate(() => {
      const masking = (window as unknown as { __gideonCaptureMasking?: { refresh(): { matched: number; visible: number; overlays: number; canvas: number; hidden: number; invalidSelector: boolean; scanTruncated: boolean } } }).__gideonCaptureMasking;
      return masking?.refresh();
    }).catch(() => undefined);
    if (!state || state.invalidSelector || state.scanTruncated || state.overlays < state.visible) throw new Error("capture_masking_unavailable");
    matchedElementCount += state.matched;
    visibleSensitiveElementCount += state.visible;
    overlayCount += state.overlays;
    canvasCount += state.canvas;
    hiddenSensitiveElementCount += state.hidden;
  }
  return { schemaVersion: "1", policyHash: captureMaskingPolicyHash(policy), frameCount: frames.length, matchedElementCount, visibleSensitiveElementCount, overlayCount, canvasCount, hiddenSensitiveElementCount, status: "active" };
}

export function assertCaptureMaskingReceipt(value: CaptureMaskingReceipt, policy: CaptureMaskingPolicy): void {
  if (!value || value.schemaVersion !== "1" || value.status !== "active" || value.policyHash !== captureMaskingPolicyHash(policy)) throw new Error("Isolated capture masking receipt is invalid.");
  for (const count of [value.frameCount, value.matchedElementCount, value.visibleSensitiveElementCount, value.overlayCount, value.canvasCount, value.hiddenSensitiveElementCount]) if (!Number.isInteger(count) || count < 0 || count > 100_000) throw new Error("Isolated capture masking receipt is invalid.");
  if (value.frameCount < 1 || value.overlayCount < value.visibleSensitiveElementCount || value.hiddenSensitiveElementCount > value.matchedElementCount) throw new Error("Isolated capture masking receipt is invalid.");
}
