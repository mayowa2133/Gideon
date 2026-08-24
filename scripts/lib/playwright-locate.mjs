// How a surface locator finds its element, in one place.
//
// This was written twice -- once in the capture runner, once in the daily
// requirements generator -- and the copies drifted, which is the defect this
// repo keeps finding in other forms. The generator's copy resolved a `textbox`
// through `getByRole`, while the runner resolved it through `getByLabel`, so a
// field with an aria-label and no accessible role name was found by the capture
// and not by the script whose whole job is to reach the state the capture
// measures. It failed loudly here; the same drift in a locator that resolves to
// *something* would have failed silently, and the film would have been planned
// against a page the capture never shot.
//
// One implementation, imported by both.
export async function locate(page, locator) {
  const pattern = new RegExp(locator.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (locator.role === "combobox" || locator.role === "textbox") {
    const labelled = page.getByLabel(pattern).first();
    try { await labelled.waitFor({ state: "visible", timeout: 4000 }); return labelled; } catch { /* fall through */ }
  }
  let target = locator.container
    ? page.locator(locator.container).filter({ hasText: pattern }).first()
    : page.getByRole(locator.role, { name: pattern }).first();
  try { await target.waitFor({ state: "visible", timeout: 4000 }); return target; } catch { /* fall through */ }
  target = page.getByText(pattern).first();
  await target.waitFor({ state: "visible", timeout: 6000 });
  return target;
}

// Perform one surface action. The three kinds a surface may declare.
export async function perform(page, action) {
  const target = await locate(page, action.locator);
  await target.scrollIntoViewIfNeeded();
  if (action.kind === "click") { await target.click(); return; }
  if (action.kind === "select") { await target.selectOption({ label: action.text }); return; }
  for (const character of action.text ?? "") await target.type(character, { delay: 0 });
}
