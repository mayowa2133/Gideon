#!/usr/bin/env node
// The creator-story render scripts execute at module top level, so a `const`
// placed next to the function that uses it is still in its temporal dead zone
// when top-level code calls that function. This has now broken four separate
// renders (HELD_STABILITY_SLIDE_CLEARANCE, TRIM_FILTER, CAPTION_SYNC_TOL_SECONDS,
// AUTHORED_FRAMES), each time after a passing lint and a comment saying "hoist
// these". A comment is not a check. This is the check.
//
// Rule: if top-level code at line L calls a function that reads a module-level
// binding declared after line L, that read throws at runtime. Report it.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "typeof", "new", "await", "const", "let", "var", "function", "of", "in", "this", "true", "false", "null", "undefined", "else", "try", "throw", "async", "case", "break", "continue", "default", "delete", "void", "instanceof", "yield", "class", "extends", "super"]);

// Walks the whole source rather than each line, because template literals and
// block comments span lines -- a per-line stripper leaves their prose behind and
// reports every English word in a markdown heredoc as an identifier read.
// Removed spans keep their newlines so line numbers still line up, and `${...}`
// contents survive: an interpolation is a real read.
function stripLiterals(source) {
  let out = "";
  let i = 0;
  // Contexts nest: `${ JSON.stringify({a}) }` is template > interpolation >
  // object literal. Tracking braces inside an interpolation is what keeps the
  // object's own `}` from closing the interpolation early and unbalancing
  // every brace count after it.
  const stack = [{ kind: "code", braces: 0 }];
  const top = () => stack[stack.length - 1];
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    const context = top();
    if (context.kind === "template") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "`") { stack.pop(); i += 1; continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "interp", braces: 0 }); out += "("; i += 2; continue; }
      if (ch === "\n") out += "\n";
      i += 1; continue;                            // drop template prose
    }
    if (ch === "/" && next === "/") { while (i < source.length && source[i] !== "\n") i += 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") out += "\n"; i += 1; } i += 2; continue; }
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < source.length && source[i] !== ch) { if (source[i] === "\\") i += 1; if (source[i] === "\n") out += "\n"; i += 1; }
      i += 1; out += '""'; continue;
    }
    if (ch === "`") { stack.push({ kind: "template" }); i += 1; continue; }
    if (ch === "{") { context.braces += 1; out += ch; i += 1; continue; }
    if (ch === "}") {
      if (context.kind === "interp" && context.braces === 0) { stack.pop(); out += ")"; i += 1; continue; }
      context.braces = Math.max(0, context.braces - 1); out += ch; i += 1; continue;
    }
    out += ch; i += 1;
  }
  return out;
}

// Member names are not identifier reads. `realized.scenes` does not read a
// binding called `scenes` and `process.env` does not read one called `env`, but
// a bare word match says they do -- which is why widening this check beyond the
// render scripts produced nineteen findings of which most were noise. Property
// keys in object literals are dropped for the same reason: `{ width: 4 }` is not
// a read of `width`.
function identifiers(text) {
  // The shebang is not code. `#!/usr/bin/env node` was reported as a read of a
  // binding named `env`.
  const withoutMembers = text.replace(/^#!.*$/m, " ")
    .replace(/\??\.\s*[A-Za-z_$][A-Za-z0-9_$]*/g, " ")
    .replace(/([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, " ");
  return new Set((withoutMembers.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []).filter((word) => !KEYWORDS.has(word)));
}

export function analyzeHoisting(source) {
  const clean = stripLiterals(source).split("\n");
  const functions = new Map();   // name -> {start, end, body}
  const bindings = new Map();    // name -> declaration line (1-indexed)
  const topLevel = [];           // {line, text}
  let depth = 0;
  let current = null;

  for (let i = 0; i < clean.length; i += 1) {
    const text = clean[i];
    if (depth === 0) {
      const declared = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(text);
      const binding = declared ? null : /^\s*(?:export\s+)?(?:const|let)\s+(.*)$/.exec(text);
      if (declared) {
        current = { name: declared[1], start: i, lines: [] };
      } else if (binding) {
        for (const name of binding[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g)) {
          if (!bindings.has(name[1])) bindings.set(name[1], i + 1);
        }
        // A binding initialised from top-level code executes there too, so its
        // right-hand side is scanned for later-declared reads like any statement.
        if (text.trim()) topLevel.push({ line: i + 1, text });
      } else if (text.trim()) {
        topLevel.push({ line: i + 1, text });
      }
    }
    if (current) current.lines.push(text);
    const opened = (text.match(/[{([]/g) ?? []).length;
    const closed = (text.match(/[})\]]/g) ?? []).length;
    depth += opened - closed;
    if (current && depth <= 0) { functions.set(current.name, { start: current.start + 1, body: current.lines.join("\n") }); current = null; }
    if (depth < 0) depth = 0;
  }

  const referenced = new Map();
  for (const [name, fn] of functions) referenced.set(name, identifiers(fn.body));

  // Every binding a call reaches, following calls into other functions.
  const reach = (name, seen = new Set()) => {
    if (seen.has(name)) return new Set();
    seen.add(name);
    const direct = referenced.get(name) ?? new Set();
    const all = new Set(direct);
    for (const word of direct) if (functions.has(word) && word !== name) for (const deep of reach(word, seen)) all.add(deep);
    return all;
  };

  const violations = [];
  for (const statement of topLevel) {
    const used = identifiers(statement.text);
    const reachable = new Set(used);
    for (const word of used) if (functions.has(word)) for (const deep of reach(word)) reachable.add(deep);
    for (const word of reachable) {
      const declaredAt = bindings.get(word);
      if (declaredAt !== undefined && declaredAt > statement.line) {
        const via = used.has(word) ? "directly" : `via ${[...used].filter((w) => functions.has(w)).join("/")}`;
        violations.push({ line: statement.line, binding: word, declaredAt, via });
      }
    }
  }
  return violations;
}

// Exposed so the check can be tested on its own parse, not just its verdict.
export function inspectHoisting(source) {
  const clean = stripLiterals(source).split("\n");
  let depth = 0;
  const depths = clean.map((text) => {
    const at = depth;
    depth += (text.match(/[{([]/g) ?? []).length - (text.match(/[})\]]/g) ?? []).length;
    if (depth < 0) depth = 0;
    return at;
  });
  return { clean, depths };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = (await fs.readdir(path.join(root, "scripts"))).filter((name) => /^render-solomon-creator-story-v\d+\.mjs$/.test(name));
  let failed = false;
  for (const name of targets) {
    const file = path.join(root, "scripts", name);
    const violations = analyzeHoisting(await fs.readFile(file, "utf8"));
    for (const v of violations) {
      failed = true;
      console.error(`${name}:${v.line} reads '${v.binding}' ${v.via}, but it is declared at line ${v.declaredAt} -- still in its temporal dead zone. Hoist it above the top-level code.`);
    }
  }
  if (failed) process.exit(1);
  console.log(`Render-script hoisting check passed (${targets.length} scripts).`);
}
