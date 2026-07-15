import type { Locator, Page } from "playwright";
import type { AssertionSpec, LocatorSpec } from "../shared/productFlowCapture";
import type { CaptureLoginAdapter } from "./playwrightCaptureExecutor";

export function createUsernamePasswordLoginAdapter(config: {
  username: LocatorSpec;
  password: LocatorSpec;
  submit: LocatorSpec;
  success: AssertionSpec;
}): CaptureLoginAdapter {
  return {
    async authenticate(input) {
      await input.useCredential(async (secret) => {
        if (!secret.username || !secret.password || secret.sessionBootstrapToken) throw new Error("Login credential type does not match the username/password adapter.");
        await locatorFor(input.page, config.username).fill(secret.username);
        await locatorFor(input.page, config.password).fill(secret.password);
        await locatorFor(input.page, config.submit).click();
        if (!await assertionPassed(input.page, config.success)) throw new Error("Capture login did not reach its approved success state.");
      });
    }
  };
}

function locatorFor(page: Page, spec: LocatorSpec): Locator {
  if (spec.strategy === "role") return page.getByRole(spec.role!, { name: spec.value, exact: spec.exact });
  if (spec.strategy === "label") return page.getByLabel(spec.value, { exact: spec.exact });
  if (spec.strategy === "test_id") return page.getByTestId(spec.value);
  if (spec.strategy === "placeholder") return page.getByPlaceholder(spec.value, { exact: spec.exact });
  return page.getByText(spec.value, { exact: spec.exact });
}

async function assertionPassed(page: Page, assertion: AssertionSpec): Promise<boolean> {
  if (assertion.type === "url") return new URL(page.url()).pathname === new URL(assertion.path, page.url()).pathname;
  if (assertion.type === "visible") return locatorFor(page, assertion.target).isVisible();
  if (assertion.type === "hidden") return locatorFor(page, assertion.target).isHidden();
  if (assertion.type === "text") return (await locatorFor(page, assertion.target).textContent())?.includes(assertion.value) ?? false;
  throw new Error("Login success checks cannot compare fixture values.");
}
