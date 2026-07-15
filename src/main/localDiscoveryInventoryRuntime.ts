import type { DiscoveryInventoryRuntime } from "./discoveryRunWorker";
import { browserPolicyForEnvironment } from "./captureService";
import { crawlRenderedInventory } from "./captureInventoryCrawler";

export class LocalDiscoveryInventoryRuntime implements DiscoveryInventoryRuntime {
  readonly isolation = "local_test" as const;
  constructor(private readonly options: { executablePath?: string } = {}) {}
  async collect(input: Parameters<DiscoveryInventoryRuntime["collect"]>[0]) {
    if (input.environment.type !== "local_preview") throw new Error("Local discovery runtime can only access local preview environments.");
    return { renderedPages: await crawlRenderedInventory({ policy: browserPolicyForEnvironment(input.environment), entryPaths: ["/"], maxPages: input.maxPages, executablePath: this.options.executablePath }) };
  }
}
