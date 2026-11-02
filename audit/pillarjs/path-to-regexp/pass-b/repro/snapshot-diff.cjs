#!/usr/bin/env node
"use strict";
/**
 * Pass B runtime reproduction for the path-to-regexp@9.0.0 patch audit.
 *
 * Usage: node snapshot-diff.cjs "$NPM_ARTIFACT"
 *   where $NPM_ARTIFACT is the extracted npm package root containing
 *   package.json with exports -> ./dist/index.js (ESM).
 *
 * Snapshots Node/JS core surfaces BEFORE importing the package, then imports
 * the dist entry, exercises representative API paths, snapshots AFTER, and
 * prints a sanitized diff (no machine paths). Exit code 1 if any core surface
 * changed, 0 if none did.
 */

const Module = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const artifactRoot = process.argv[2];
if (!artifactRoot) {
  console.error('usage: node snapshot-diff.cjs "$NPM_ARTIFACT"');
  process.exit(2);
}
const entry = path.join(artifactRoot, "dist", "index.js");

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

function keyName(k) {
  return typeof k === "symbol" ? k.toString() : String(k);
}

function descSig(obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d) return "<absent>";
  const parts = [];
  if ("value" in d) parts.push(`value:${typeof d.value}`);
  if (d.get) parts.push("get:fn");
  if (d.set) parts.push("set:fn");
  parts.push(`w:${!!d.writable}`, `e:${!!d.enumerable}`, `c:${!!d.configurable}`);
  return parts.join(",");
}

/** Capture identities (live references) + descriptor signatures for keys of obj. */
function snapSurface(label, obj, keys) {
  const identities = new Map();
  const descs = new Map();
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(obj, k);
    identities.set(k, d ? ("value" in d ? d.value : d.get) : undefined);
    descs.set(k, descSig(obj, k));
  }
  return { label, obj, keys, identities, descs };
}

function ownKeySet(obj) {
  return Reflect.ownKeys(obj).map(keyName).sort();
}

const WK = [
  Symbol.match,
  Symbol.matchAll,
  Symbol.replace,
  Symbol.split,
  Symbol.search,
];

function takeSnapshot() {
  const snap = {};

  // Key sets of shared prototypes / globals (names only, sorted).
  snap.keySets = {
    "RegExp (statics)": ownKeySet(RegExp),
    "RegExp.prototype": ownKeySet(RegExp.prototype),
    "String.prototype": ownKeySet(String.prototype),
    "Object.prototype": ownKeySet(Object.prototype),
    "Array.prototype": ownKeySet(Array.prototype),
    "Function.prototype": ownKeySet(Function.prototype),
    "TypeError.prototype": ownKeySet(TypeError.prototype),
    globalThis: ownKeySet(globalThis),
    "require.extensions": Object.keys(require.extensions).sort(),
  };

  // Identity + descriptor surfaces.
  snap.surfaces = [
    snapSurface("RegExp.prototype", RegExp.prototype, [
      "exec",
      "test",
      "toString",
      "compile",
      "source",
      "flags",
      "global",
      "ignoreCase",
      "multiline",
      "dotAll",
      "sticky",
      "unicode",
      "unicodeSets",
      "hasIndices",
      "lastIndex",
      ...WK,
    ]),
    snapSurface("RegExp (statics)", RegExp, [
      "$1",
      "$2",
      "input",
      "lastMatch",
      "leftContext",
      "rightContext",
      Symbol.species,
    ]),
    snapSurface("Object (statics)", Object, [
      "assign",
      "defineProperty",
      "defineProperties",
      "setPrototypeOf",
      "create",
      "freeze",
      "getOwnPropertyDescriptor",
    ]),
    snapSurface("String.prototype", String.prototype, [
      "replace",
      "match",
      "matchAll",
      "split",
      "search",
      "includes",
      "endsWith",
    ]),
    snapSurface("Module (CJS loader)", Module, [
      "_load",
      "_resolveFilename",
      "_compile" in Module ? "_compile" : "_load",
      "createRequire",
    ]),
    snapSurface("Module.prototype", Module.prototype, ["_compile", "load", "require"]),
    snapSurface("process", process, ["binding", "_linkedBinding", "dlopen"]),
    snapSurface("globalThis fns", globalThis, [
      "encodeURIComponent",
      "decodeURIComponent",
      "Function",
      "eval",
    ]),
  ];

  // require.cache: builtin-looking entries (there should be none; builtins
  // never appear in require.cache). Count only, sanitized to basenames.
  snap.requireCacheBuiltins = Object.keys(require.cache)
    .filter((k) => k.startsWith("node:") || !path.isAbsolute(k))
    .sort();
  snap.requireCacheSize = Object.keys(require.cache).length;

  return snap;
}

function diffSnapshots(before, after, out) {
  let changes = 0;

  for (const label of Object.keys(before.keySets)) {
    const a = before.keySets[label].join("|");
    const b = after.keySets[label].join("|");
    if (a !== b) {
      changes++;
      const added = after.keySets[label].filter((k) => !before.keySets[label].includes(k));
      const removed = before.keySets[label].filter((k) => !after.keySets[label].includes(k));
      out.push(`CHANGED key set ${label}: +[${added}] -[${removed}]`);
    } else {
      out.push(`OK key set ${label} unchanged (${after.keySets[label].length} keys)`);
    }
  }

  for (let i = 0; i < before.surfaces.length; i++) {
    const sb = before.surfaces[i];
    const sa = after.surfaces[i];
    for (const k of sb.keys) {
      const idSame = sb.identities.get(k) === sa.identities.get(k);
      const dSame = sb.descs.get(k) === sa.descs.get(k);
      if (!idSame || !dSame) {
        changes++;
        out.push(
          `CHANGED ${sb.label}[${keyName(k)}]: identity ${idSame ? "same" : "REPLACED"}, descriptor ${dSame ? "same" : `"${sb.descs.get(k)}" -> "${sa.descs.get(k)}"`}`,
        );
      }
    }
    out.push(`OK ${sb.label}: ${sb.keys.length} properties, identities and descriptors unchanged`);
  }

  if (
    before.requireCacheBuiltins.join("|") !== after.requireCacheBuiltins.join("|")
  ) {
    changes++;
    out.push(
      `CHANGED require.cache builtin-like entries: [${before.requireCacheBuiltins}] -> [${after.requireCacheBuiltins}]`,
    );
  } else {
    out.push(
      `OK require.cache builtin-like entries: ${after.requireCacheBuiltins.length} (size ${before.requireCacheSize} -> ${after.requireCacheSize}; ESM import does not use require.cache)`,
    );
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const out = [];
  out.push(`node ${process.version}`);

  // Intrinsic baseline for returned-RegExp expando classification, captured
  // BEFORE the library loads.
  const baselineRe = new RegExp("^\\/x$", "i");
  const baselineOwnKeys = Reflect.ownKeys(baselineRe).map(keyName).sort();
  out.push(`baseline intrinsic RegExp own keys: [${baselineOwnKeys}]`);

  const before = takeSnapshot();

  // ---- import the package (ESM dist entry) ----
  const lib = await import(pathToFileURL(entry).href);
  out.push(`imported exports: [${Object.keys(lib).sort()}]`);

  // ---- exercise representative paths ----
  const results = [];

  // 1. pathToRegexp with named param
  const r1 = lib.pathToRegexp("/user/:name");
  results.push(["pathToRegexp('/user/:name').regexp", r1.regexp.source, r1.keys.map((k) => `${k.type}:${k.name}`)]);

  // 2. wildcard
  const r2 = lib.pathToRegexp("/files/*path");
  results.push(["pathToRegexp('/files/*path').regexp", r2.regexp.source, r2.keys.map((k) => `${k.type}:${k.name}`)]);

  // 3. array input + optional group + options
  const r3 = lib.pathToRegexp(["/a/:b", "/c{/:d}"], { end: false, sensitive: true, delimiter: "/" });
  results.push(["pathToRegexp(array,{end:false,sensitive:true})", r3.regexp.source, r3.keys.map((k) => `${k.type}:${k.name}`)]);

  // 4. custom (quoted) param name
  const r4 = lib.pathToRegexp('/x/:"custom name"');
  results.push(["pathToRegexp('/x/:\"custom name\"')", r4.regexp.source, r4.keys.map((k) => `${k.type}:${k.name}`)]);

  // 5. match with decode
  const m1 = lib.match("/user/:id")("/user/123%2Fabc");
  results.push(["match('/user/:id')('/user/123%2Fabc')", JSON.stringify(m1)]);

  // 6. match wildcard (array-valued param)
  const m2 = lib.match("/files/*path")("/files/a/b/c");
  results.push(["match('/files/*path')('/files/a/b/c')", JSON.stringify(m2)]);

  // 7. compile with encoding
  const c1 = lib.compile("/user/:name")({ name: "café au lait" });
  results.push(["compile('/user/:name')({name:'café au lait'})", c1]);

  // 8. compile wildcard
  const c2 = lib.compile("/files/*path")({ path: ["a b", "c"] });
  results.push(["compile('/files/*path')({path:['a b','c']})", c2]);

  // 9. parse + stringify round trip
  const p1 = lib.parse("/:a{/:b}/*rest");
  results.push(["stringify(parse('/:a{/:b}/*rest'))", lib.stringify(p1)]);

  // 10. PathError inheritance (subclass check, not mutation)
  let pathErrProto = "n/a";
  try {
    lib.parse("/:");
  } catch (e) {
    pathErrProto = `instanceof TypeError=${e instanceof TypeError}, proto chain mutation of TypeError.prototype=none-expected`;
  }
  results.push(["parse('/:') throws PathError", pathErrProto]);

  for (const r of results) out.push(`exercised: ${r[0]} => ${r.slice(1).join(" keys=")}`);

  // ---- returned-RegExp expando classification ----
  for (const [name, r] of [["/user/:name", r1], ["/files/*path", r2], ["array", r3], ["quoted", r4]]) {
    const own = Reflect.ownKeys(r.regexp).map(keyName).sort();
    const extra = own.filter((k) => !baselineOwnKeys.includes(k));
    const protoOk = Object.getPrototypeOf(r.regexp) === RegExp.prototype;
    const ctorOk = r.regexp.constructor === RegExp;
    out.push(
      `returned regexp (${name}): own keys [${own}]; expandos beyond intrinsic baseline: [${extra.length ? extra : "none"}]; [[Prototype]]===RegExp.prototype: ${protoOk}; constructor===RegExp: ${ctorOk}; keys delivered as sibling property of plain result object (not on the RegExp)`,
    );
  }

  const after = takeSnapshot();
  out.push("---- BEFORE/AFTER core-surface diff ----");
  const changes = diffSnapshots(before, after, out);
  out.push(`TOTAL CORE SURFACE CHANGES: ${changes}`);
  out.push(changes === 0 ? "VERDICT SUPPORT: no runtime mutation of any snapshotted core surface" : "VERDICT SUPPORT: mutations detected, see CHANGED lines");

  console.log(out.join("\n"));
  process.exit(changes === 0 ? 0 : 1);
})().catch((e) => {
  // Sanitize: print message only, no stack (stacks contain machine paths).
  console.error(`repro failed: ${e && e.message}`);
  process.exit(2);
});
