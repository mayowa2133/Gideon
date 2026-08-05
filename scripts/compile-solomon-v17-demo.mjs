import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { compileSolomonV17DemoContent } = require("../dist/main/shared/solomonDemoContentV17.js");
const output = path.join(root, "tmp", "solomon-creator-story-v17-performance", "fixture");
const fixture = compileSolomonV17DemoContent(Number(process.env.SOLOMON_V17_FIXTURE_SEED ?? 101010));

await fs.mkdir(output, { recursive: true, mode: 0o700 });
await fs.writeFile(path.join(output, "solomon-v17-demo-content.json"), `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ output, version: fixture.version, disclosure: fixture.disclosure, externalProvidersDisabled: fixture.externalProvidersDisabled, realPeopleUsed: fixture.realPeopleUsed }, null, 2)}\n`);
