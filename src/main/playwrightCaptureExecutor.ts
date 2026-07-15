import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Video } from "playwright";
import {
  authorizeBrowserAction,
  createFlowExecutionReceipt,
  type AssertionReceipt,
  type AssertionSpec,
  type BrowserExecutionPolicy,
  type CaptureTargetGeometry,
  type FlowStepVisualEvidence,
  type FlowExecutionReceipt,
  type FlowStepReceipt,
  type LocatorSpec,
  type ProductFlowAction
} from "../shared/productFlowCapture";
import type { CaptureCredentialSecret } from "./captureCredentials";
import { validateCaptureNetworkDestination, type CaptureNetworkPolicyOptions } from "./captureNetworkPolicy";
import { verifyCompiledFlowPlan, type CompiledFlowPlan } from "./productFlowCompiler";

export interface CaptureLoginAdapter {
  authenticate(input: {
    page: Page;
    credentialGrantId: string;
    useCredential<T>(consumer: (secret: Readonly<CaptureCredentialSecret>) => Promise<T>): Promise<T>;
  }): Promise<void>;
}

export interface RawBrowserCaptureArtifact {
  path: string;
  contentType: "video/webm";
  byteSize: number;
  sha256: string;
}

export interface PlaywrightCaptureResult {
  receipt: FlowExecutionReceipt;
  rawCapture?: RawBrowserCaptureArtifact;
  networkReceipts: Array<{
    url: string;
    hostname: string;
    resolvedAddresses: string[];
    policyVersion: string;
  }>;
}

export interface PlaywrightCaptureExecutorInput {
  id: string;
  workspaceId: string;
  plan: CompiledFlowPlan;
  policy: BrowserExecutionPolicy;
  fixtureValues: Record<string, string>;
  outputDir: string;
  recordVideo: boolean;
  viewport?: { width: number; height: number };
  executablePath?: string;
  browser?: Browser;
  loginAdapter?: CaptureLoginAdapter;
  useCredential?: <T>(grantId: string, consumer: (secret: Readonly<CaptureCredentialSecret>) => Promise<T>) => Promise<T>;
  networkPolicyOptions?: CaptureNetworkPolicyOptions;
  capturePacing?: {
    initialHoldMs?: number;
    beforeActionMs?: number;
    afterActionMs?: number;
    finalHoldMs?: number;
  };
  capturePresentation?: {
    showPointer?: boolean;
    pointerMoveMs?: number;
    typingDelayMs?: number;
  };
  now?: () => string;
}

export async function executePlaywrightCapture(input: PlaywrightCaptureExecutorInput): Promise<PlaywrightCaptureResult> {
  verifyCompiledFlowPlan(input.plan);
  const pacing = validateCapturePacing(input.capturePacing);
  const presentation = validateCapturePresentation(input.capturePresentation);
  await fs.mkdir(input.outputDir, { recursive: true });
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const ownsBrowser = !input.browser;
  const browser = input.browser ?? (await chromium.launch({ headless: true, executablePath: input.executablePath }));
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let rawVideoPath: string | undefined;
  let video: Video | null = null;
  const networkReceipts = new Map<string, PlaywrightCaptureResult["networkReceipts"][number]>();
  const stepReceipts: FlowStepReceipt[] = [];

  try {
    context = await browser.newContext({
      viewport: input.viewport ?? { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "reduce",
      acceptDownloads: false,
      recordVideo: input.recordVideo
        ? { dir: input.outputDir, size: input.viewport ?? { width: 1440, height: 900 } }
        : undefined
    });
    if (presentation.showPointer) await context.addInitScript(installCapturePointer);
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) {
        await route.continue();
        return;
      }
      try {
        const receipt = await validateCaptureNetworkDestination(requestUrl, input.policy, input.networkPolicyOptions);
        networkReceipts.set(`${receipt.hostname}:${new URL(receipt.url).port}`, {
          url: receipt.url,
          hostname: receipt.hostname,
          resolvedAddresses: receipt.resolvedAddresses,
          policyVersion: receipt.policyVersion
        });
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    page = await context.newPage();
    video = page.video();
    await page.goto(new URL(input.plan.startingState.entryPath, input.policy.baseUrl).toString(), {
      waitUntil: "domcontentloaded"
    });
    await hold(pacing.initialHoldMs);

    if (input.plan.startingState.credentialGrantId) {
      if (!input.loginAdapter || !input.useCredential) {
        throw new Error("The approved flow requires a configured login adapter.");
      }
      const credentialGrantId = input.plan.startingState.credentialGrantId;
      await input.loginAdapter.authenticate({
        page,
        credentialGrantId,
        useCredential: (consumer) => input.useCredential!(credentialGrantId, consumer)
      });
    }

    for (const step of input.plan.steps) {
      const stepStartedAt = now();
      const policyDecision = authorizeBrowserAction(
        { action: step.action, declaredRisk: step.policyDecision.effectiveRisk, origin: "approved_plan" },
        input.policy
      );
      if (!policyDecision.allowed) {
        stepReceipts.push({
          stepId: step.id,
          status: "blocked",
          policyDecision,
          assertions: [],
          startedAt: stepStartedAt,
          completedAt: now(),
          safeErrorCode: policyDecision.code
        });
        break;
      }
      try {
        await hold(pacing.beforeActionMs);
        const actionTarget = await executeAction(page, step.action, input.fixtureValues, input.policy.baseUrl, presentation);
        await hold(pacing.afterActionMs);
        const assertions = await evaluateAssertions(page, step.expectedState, input.fixtureValues);
        const passed = assertions.every((assertion) => assertion.passed);
        const visualEvidence = await captureStepVisualEvidence(page, actionTarget, step.expectedState, assertions);
        stepReceipts.push({
          stepId: step.id,
          status: passed ? "succeeded" : "failed",
          policyDecision,
          assertions,
          startedAt: stepStartedAt,
          completedAt: now(),
          safeErrorCode: passed ? undefined : "step_assertion_failed",
          visualEvidence
        });
        if (!passed) break;
      } catch {
        stepReceipts.push({
          stepId: step.id,
          status: "failed",
          policyDecision,
          assertions: [],
          startedAt: stepStartedAt,
          completedAt: now(),
          safeErrorCode: "browser_action_failed"
        });
        break;
      }
    }

    const allStepsSucceeded = stepReceipts.length === input.plan.steps.length && stepReceipts.every((step) => step.status === "succeeded");
    const finalAssertions = allStepsSucceeded
      ? await evaluateAssertions(page, input.plan.finalAssertions, input.fixtureValues)
      : input.plan.finalAssertions.map((assertion) => ({
          assertion,
          passed: false,
          safeMessage: "Final assertion was not evaluated because the flow did not complete."
        }));
    if (allStepsSucceeded && finalAssertions.every((assertion) => assertion.passed)) await hold(pacing.finalHoldMs);
    await context.close();
    context = undefined;
    if (video) rawVideoPath = await video.path();
    const blocked = stepReceipts.find((step) => step.status === "blocked");
    const receipt = createFlowExecutionReceipt({
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.plan.projectId,
      flowId: input.plan.flowId,
      flowRevision: input.plan.flowRevision,
      environmentVersionId: input.plan.environmentVersionId,
      compiledPlanHash: input.plan.compiledPlanHash,
      steps: stepReceipts,
      finalAssertions,
      startedAt,
      completedAt: now(),
      blockerCode: blocked?.safeErrorCode
    });
    return {
      receipt,
      rawCapture: rawVideoPath ? await describeVideo(rawVideoPath) : undefined,
      networkReceipts: [...networkReceipts.values()]
    };
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (ownsBrowser) await browser.close().catch(() => undefined);
  }
}

function validateCapturePacing(input: PlaywrightCaptureExecutorInput["capturePacing"]): Required<NonNullable<PlaywrightCaptureExecutorInput["capturePacing"]>> {
  const result = {
    initialHoldMs: input?.initialHoldMs ?? 0,
    beforeActionMs: input?.beforeActionMs ?? 0,
    afterActionMs: input?.afterActionMs ?? 0,
    finalHoldMs: input?.finalHoldMs ?? 0
  };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isInteger(value) || value < 0 || value > 5_000) throw new Error(`Capture pacing ${name} must be an integer from 0 to 5000 milliseconds.`);
  }
  return result;
}

async function hold(milliseconds: number): Promise<void> {
  if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateCapturePresentation(input: PlaywrightCaptureExecutorInput["capturePresentation"]): Required<NonNullable<PlaywrightCaptureExecutorInput["capturePresentation"]>> {
  const result = { showPointer: input?.showPointer ?? false, pointerMoveMs: input?.pointerMoveMs ?? 0, typingDelayMs: input?.typingDelayMs ?? 0 };
  if (!Number.isInteger(result.pointerMoveMs) || result.pointerMoveMs < 0 || result.pointerMoveMs > 2_000) throw new Error("Capture pointerMoveMs must be an integer from 0 to 2000 milliseconds.");
  if (!Number.isInteger(result.typingDelayMs) || result.typingDelayMs < 0 || result.typingDelayMs > 250) throw new Error("Capture typingDelayMs must be an integer from 0 to 250 milliseconds.");
  return result;
}

function installCapturePointer(): void {
  window.addEventListener("DOMContentLoaded", () => {
    const pointer = document.createElement("div");
    pointer.setAttribute("data-gideon-capture-pointer", "true");
    Object.assign(pointer.style, {
      position: "fixed", left: "0", top: "0", width: "28px", height: "34px",
      transform: "translate(-3px, -2px)", filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55))",
      zIndex: "2147483647", pointerEvents: "none"
    });
    pointer.innerHTML = `<svg width="28" height="34" viewBox="0 0 28 34" aria-hidden="true"><path d="M3 2L3 27L9.6 20.7L14.6 31L19 28.9L14.1 18.8L24 18Z" fill="white" stroke="#111827" stroke-width="2" stroke-linejoin="round"/></svg><span aria-hidden="true"></span>`;
    const ripple = pointer.lastElementChild as HTMLElement;
    Object.assign(ripple.style, {
      position: "absolute", left: "3px", top: "2px", width: "14px", height: "14px", borderRadius: "50%",
      border: "3px solid rgb(16, 185, 129)", opacity: "0", transform: "translate(-50%, -50%) scale(0.4)",
      transition: "transform 180ms ease-out, opacity 180ms ease-out"
    });
    document.documentElement.append(pointer);
    window.addEventListener("mousemove", (event) => { pointer.style.left = `${event.clientX}px`; pointer.style.top = `${event.clientY}px`; }, true);
    window.addEventListener("mousedown", () => {
      ripple.style.opacity = "1";
      ripple.style.transform = "translate(-50%, -50%) scale(1.8)";
    }, true);
    window.addEventListener("mouseup", () => window.setTimeout(() => {
      ripple.style.opacity = "0";
      ripple.style.transform = "translate(-50%, -50%) scale(0.4)";
    }, 180), true);
  }, { once: true });
}

async function executeAction(
  page: Page,
  action: ProductFlowAction,
  fixtureValues: Record<string, string>,
  baseUrl: string,
  presentation: Required<NonNullable<PlaywrightCaptureExecutorInput["capturePresentation"]>>
): Promise<CaptureTargetGeometry | undefined> {
  if (action.type === "navigate") {
    await page.goto(new URL(action.path, baseUrl).toString(), { waitUntil: "domcontentloaded" });
    return undefined;
  }
  if (action.type === "click") {
    const target = locatorFor(page, action.target);
    const geometry = await visibleGeometry(page, target);
    await movePointerTo(page, target, presentation);
    await target.click();
    return geometry;
  }
  if (action.type === "fill") {
    const target = locatorFor(page, action.target);
    const geometry = await visibleGeometry(page, target);
    await movePointerTo(page, target, presentation);
    const value = resolveFixture(action.valueRef, fixtureValues);
    if (presentation.typingDelayMs > 0) {
      await target.click();
      await target.fill("");
      await target.pressSequentially(value, { delay: presentation.typingDelayMs });
    } else {
      await target.fill(value);
    }
    return geometry;
  }
  if (action.type === "select") {
    const target = locatorFor(page, action.target);
    const geometry = await visibleGeometry(page, target);
    await movePointerTo(page, target, presentation);
    await target.selectOption(resolveFixture(action.optionRef, fixtureValues));
    return geometry;
  }
  if (action.type === "key") {
    const target = action.target ? locatorFor(page, action.target) : page.locator("body");
    const geometry = action.target ? await visibleGeometry(page, target) : undefined;
    if (action.target) await movePointerTo(page, target, presentation);
    await target.press(action.key);
    return geometry;
  }
  const receipt = await waitForAssertion(page, action.assertion, fixtureValues);
  if (!receipt?.passed) throw new Error("Wait condition was not satisfied.");
  return assertionTarget(action.assertion) ? await visibleGeometry(page, locatorFor(page, assertionTarget(action.assertion)!)) : undefined;
}

async function movePointerTo(page: Page, target: Locator, presentation: Required<NonNullable<PlaywrightCaptureExecutorInput["capturePresentation"]>>): Promise<void> {
  if (!presentation.showPointer) return;
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Capture target did not have a visible bounding box.");
  const steps = Math.max(1, Math.round(presentation.pointerMoveMs / 25));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  await hold(presentation.pointerMoveMs);
}

async function captureStepVisualEvidence(
  page: Page,
  actionTarget: CaptureTargetGeometry | undefined,
  expectedState: AssertionSpec[],
  assertions: AssertionReceipt[]
): Promise<FlowStepVisualEvidence> {
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY
  }));
  const safeViewport = {
    width: Math.max(1, Math.round(viewport.width)),
    height: Math.max(1, Math.round(viewport.height)),
    scrollX: Math.max(0, Math.round(viewport.scrollX)),
    scrollY: Math.max(0, Math.round(viewport.scrollY))
  };
  let resultTarget: CaptureTargetGeometry | undefined;
  for (let index = 0; index < expectedState.length; index += 1) {
    const spec = assertions[index]?.passed ? assertionTarget(expectedState[index]!) : undefined;
    if (!spec) continue;
    resultTarget = await visibleGeometry(page, locatorFor(page, spec));
    if (resultTarget) break;
  }
  const modalRegion = await firstVisibleGeometry(page, page.locator('dialog, [role="dialog"], [aria-modal="true"]'));
  const pageSignal = await detectSafePageSignal(page);
  return {
    schemaVersion: "1",
    viewport: safeViewport,
    pageSignal,
    actionTarget: clampGeometry(actionTarget, safeViewport.width, safeViewport.height),
    resultTarget: clampGeometry(resultTarget, safeViewport.width, safeViewport.height),
    modalRegion: clampGeometry(modalRegion, safeViewport.width, safeViewport.height)
  };
}

async function detectSafePageSignal(page: Page): Promise<FlowStepVisualEvidence["pageSignal"]> {
  try {
    return await page.evaluate(() => {
      const title = document.title.toLowerCase();
      if (location.protocol === "chrome-error:" || /site can.t be reached|browser error|page crashed/.test(title)) return "browser_error" as const;
      const visible = (element: Element): boolean => {
        const style = window.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
      };
      if ([...document.querySelectorAll('input[type="password"]')].some(visible)) return "login" as const;
      if ([...document.querySelectorAll('[aria-busy="true"], [role="progressbar"]')].some(visible)) return "loading" as const;
      const alerts = [...document.querySelectorAll('[role="alert"]')].filter(visible);
      if (alerts.some((element) => /\b(error|failed|unable to|something went wrong)\b/i.test(element.textContent ?? ""))) return "failure" as const;
      return undefined;
    });
  } catch {
    return "browser_error";
  }
}

function assertionTarget(assertion: AssertionSpec): LocatorSpec | undefined {
  return assertion.type === "visible" || assertion.type === "text" || assertion.type === "value" ? assertion.target : undefined;
}

async function firstVisibleGeometry(page: Page, locator: Locator): Promise<CaptureTargetGeometry | undefined> {
  const count = Math.min(await locator.count(), 10);
  for (let index = 0; index < count; index += 1) {
    const geometry = await visibleGeometry(page, locator.nth(index));
    if (geometry) return geometry;
  }
  return undefined;
}

async function visibleGeometry(page: Page, target: Locator): Promise<CaptureTargetGeometry | undefined> {
  try {
    await target.scrollIntoViewIfNeeded();
    if (!(await target.isVisible())) return undefined;
    const box = await target.boundingBox();
    const viewport = page.viewportSize();
    return box && viewport ? clampGeometry(box, viewport.width, viewport.height) : undefined;
  } catch {
    return undefined;
  }
}

function clampGeometry(value: { x: number; y: number; width: number; height: number } | undefined, viewportWidth: number, viewportHeight: number): CaptureTargetGeometry | undefined {
  if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite)) return undefined;
  const left = Math.max(0, Math.min(viewportWidth - 1, Math.round(value.x)));
  const top = Math.max(0, Math.min(viewportHeight - 1, Math.round(value.y)));
  const right = Math.max(left + 1, Math.min(viewportWidth, Math.round(value.x + value.width)));
  const bottom = Math.max(top + 1, Math.min(viewportHeight, Math.round(value.y + value.height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function waitForAssertion(page: Page, assertion: AssertionSpec, fixtureValues: Record<string, string>, timeoutMs = 10_000): Promise<AssertionReceipt> {
  const deadline = Date.now() + timeoutMs;
  let receipt = (await evaluateAssertions(page, [assertion], fixtureValues))[0]!;
  while (!receipt.passed && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    receipt = (await evaluateAssertions(page, [assertion], fixtureValues))[0]!;
  }
  return receipt;
}

async function evaluateAssertions(
  page: Page,
  assertions: AssertionSpec[],
  fixtureValues: Record<string, string>
): Promise<AssertionReceipt[]> {
  const receipts: AssertionReceipt[] = [];
  for (const assertion of assertions) {
    let passed = false;
    try {
      if (assertion.type === "url") {
        passed = new URL(page.url()).pathname === new URL(assertion.path, page.url()).pathname;
      } else if (assertion.type === "visible") {
        passed = await locatorFor(page, assertion.target).isVisible();
      } else if (assertion.type === "hidden") {
        passed = await locatorFor(page, assertion.target).isHidden();
      } else if (assertion.type === "text") {
        passed = (await locatorFor(page, assertion.target).textContent())?.includes(assertion.value) ?? false;
      } else {
        passed = (await locatorFor(page, assertion.target).inputValue()) === resolveFixture(assertion.valueRef, fixtureValues);
      }
    } catch {
      passed = false;
    }
    receipts.push({
      assertion,
      passed,
      safeMessage: passed ? "Assertion passed." : "Expected browser state was not observed."
    });
  }
  return receipts;
}

function locatorFor(page: Page, spec: LocatorSpec): Locator {
  if (spec.strategy === "role") {
    return page.getByRole(spec.role!, { name: spec.value, exact: spec.exact });
  }
  if (spec.strategy === "label") return page.getByLabel(spec.value, { exact: spec.exact });
  if (spec.strategy === "test_id") return page.getByTestId(spec.value);
  if (spec.strategy === "placeholder") return page.getByPlaceholder(spec.value, { exact: spec.exact });
  return page.getByText(spec.value, { exact: spec.exact });
}

function resolveFixture(reference: string, fixtureValues: Record<string, string>): string {
  const match = reference.match(/^fixture:(.+)$/);
  if (!match?.[1]) throw new Error("Only fixture references can be resolved by the flow executor.");
  const value = fixtureValues[match[1]];
  if (value === undefined) throw new Error(`Required fixture value ${match[1]} is missing.`);
  return value;
}

async function describeVideo(videoPath: string): Promise<RawBrowserCaptureArtifact> {
  const stat = await fs.stat(videoPath);
  if (!stat.isFile() || stat.size < 1) throw new Error("Browser recording artifact is empty.");
  return {
    path: path.resolve(videoPath),
    contentType: "video/webm",
    byteSize: stat.size,
    sha256: await sha256File(videoPath)
  };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
