// Offline, read-only component preview for the three internship review films.
// Copies actual product UI unchanged. Fixtures never enter a customer account.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (key, fallback) => args.includes(`--${key}`) ? args[args.indexOf(`--${key}`) + 1] : fallback;
const product = path.resolve(flag("product", "../NexusReach/frontend"));
const out = path.resolve(flag("out", "tmp/meet-internship-categories/demo"));
const files = ["pages/TrackerPage.tsx", "components/ui/card.tsx", "components/ui/badge.tsx", "components/ui/button.tsx", "components/ui/separator.tsx", "lib/utils.ts", "index.css"];
const sha = data => createHash("sha256").update(data).digest("hex");
const manifest = [];
await fs.mkdir(out, { recursive: true, mode: 0o700 });
for (const relative of files) {
  const source = path.join(product, "src", relative), target = path.join(out, "product/src", relative);
  const bytes = await fs.readFile(source);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  manifest.push({ file: `src/${relative}`, sha256: sha(bytes), unchanged: true });
}
const samples = {
  finance: { title: "Finance Intern", company_name: "Example Finance Co.", stage: "applied", notes: "Review the role requirements.", interview_rounds: [] },
  software: { title: "Software Engineering Intern", company_name: "Example Software Studio", stage: "interviewing", notes: null,
    interview_rounds: [{ round: 1, interview_type: "technical", scheduled_at: null, completed: false, interviewer: null, notes: null }] },
  law: { title: "Legal Intern", company_name: "Example Legal Group", stage: "applied", notes: "Check eligibility and required documents.", interview_rounds: [] },
};
await fs.writeFile(path.join(out, "samples.json"), JSON.stringify(samples, null, 2));
await fs.writeFile(path.join(out, "hooks.ts"), `import samples from './samples.json';
const category = new URLSearchParams(location.search).get('category');
if (!category || !Object.hasOwn(samples, category)) throw new Error('Choose an explicit demo category.');
const sample = samples[category as keyof typeof samples];
const job = { id: 'offline-sample-' + category, ...sample, location: 'Toronto, Canada', remote: false, starred: false, applied_at: null, offer_details: null, url: null };
export function useJobs() { return { data: { items: [job], total: 1 }, isLoading: false }; }
const blocked = () => ({ isPending: false, mutateAsync: async () => { throw new Error('Offline read-only demo: no mutations.'); } });
export const useUpdateJobStage = blocked, useUpdateInterviewRounds = blocked, useUpdateOfferDetails = blocked;
`);
await fs.writeFile(path.join(out, "index.html"), `<!doctype html><html><head><meta charset="UTF-8"><title>Solomon offline internship demo</title><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:5177; form-action 'none'; base-uri 'self'"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>`);
await fs.writeFile(path.join(out, "main.tsx"), `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { TrackerPage } from './product/src/pages/TrackerPage';
import './style.css';
createRoot(document.getElementById('root')!).render(<BrowserRouter><header style={{height:56,padding:'0 80px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #ddd',fontWeight:700}}><span>Solomon · Tracker component</span><span>OFFLINE DEMO · FICTIONAL SAMPLE DATA</span></header><main style={{maxWidth:1280,margin:'24px auto'}}><TrackerPage /></main></BrowserRouter>);
`);
await fs.writeFile(path.join(out, "style.css"), '@import "./product/src/index.css";\n@source "./product/src";\n@source "./main.tsx";\n');
await fs.writeFile(path.join(out, "package.json"), JSON.stringify({ private: true, type: "module" }));
await fs.writeFile(path.join(out, "vite.config.mjs"), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({ envDir: false, plugins:[react(),tailwindcss()], resolve:{alias:[
 { find:'@/hooks/useJobs',replacement:path.resolve('hooks.ts') },
 { find:'@',replacement:path.resolve('product/src') }
]}, server:{host:'127.0.0.1',port:5177,strictPort:true,fs:{allow:[process.cwd(),${JSON.stringify(path.join(product, "node_modules"))}]}} });
`);
try { await fs.symlink(path.join(product, "node_modules"), path.join(out, "node_modules")); }
catch (error) { if (error.code !== "EEXIST") throw error; }
const sourceCommit = execFileSync("git", ["-C", product, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await fs.writeFile(path.join(out, "component-provenance.json"), JSON.stringify({ mode: "offline-component-demo", productSource: product, sourceCommit, sourceFiles: manifest,
  fixtureSha256: sha(await fs.readFile(path.join(out, "samples.json"))), noAuthentication: true, noBackend: true, mutationsBlocked: true,
  limitation: "Unmodified product UI with injected sample hooks; does not verify real account state, API behavior, vacancies, eligibility or hiring outcomes." }, null, 2));
process.stdout.write(`Prepared offline demo: ${out}\n`);
