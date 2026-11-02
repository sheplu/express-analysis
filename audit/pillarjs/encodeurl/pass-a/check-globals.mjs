// Pass A reproduction: verify encodeurl@3.0.0 does not mutate globals,
// String/RegExp prototypes, or intrinsic function identities.
// Usage: node check-globals.mjs "$NPM_ARTIFACT/dist/index.js"
// (Path is taken from argv and never printed, to keep output portable.)
import { pathToFileURL } from "node:url";

const target = process.argv[2];
if (!target) {
  console.error("usage: node check-globals.mjs <path-to-dist/index.js>");
  process.exit(2);
}

function snapshot() {
  return {
    globalKeys: Object.getOwnPropertyNames(globalThis).sort().join(","),
    encodeURI: encodeURI,
    encodeURIComponent: encodeURIComponent,
    decodeURI: decodeURI,
    strReplace: String.prototype.replace,
    strSearch: String.prototype.search,
    strToWellFormed: String.prototype.toWellFormed,
    reExec: RegExp.prototype.exec,
    reSymReplace: RegExp.prototype[Symbol.replace],
    reSymSearch: RegExp.prototype[Symbol.search],
    strProtoKeys: Object.getOwnPropertyNames(String.prototype).sort().join(","),
    reProtoKeys: Object.getOwnPropertyNames(RegExp.prototype).sort().join(","),
    objProtoKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(","),
    encodeURIDesc: JSON.stringify(
      Object.getOwnPropertyDescriptor(globalThis, "encodeURI"),
      (k, v) => (typeof v === "function" ? "fn" : v),
    ),
  };
}

const before = snapshot();
const mod = await import(pathToFileURL(target).href);
const afterImport = snapshot();

// Exercise the function, including the regex/replace path and surrogate repair.
const samples = [
  ["http://example.com/foo bar", "http://example.com/foo%20bar"],
  ["http://example.com/%foo", "http://example.com/%25foo"],
  ["http://example.com/%20", "http://example.com/%20"],
  ["http://example.com/\uD800", "http://example.com/%EF%BF%BD"],
  ["http://example.com/ok", "http://example.com/ok"],
];
let behaviorOk = true;
for (const [input, expected] of samples) {
  const got = mod.encodeUrl(input);
  if (got !== expected) {
    behaviorOk = false;
    console.log(`BEHAVIOR MISMATCH: ${JSON.stringify(input)} -> ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`);
  }
}
const afterCall = snapshot();

let fail = 0;
for (const [label, a, b] of [
  ["import", before, afterImport],
  ["call", afterImport, afterCall],
]) {
  for (const key of Object.keys(before)) {
    const same = a[key] === b[key];
    if (!same) {
      fail++;
      console.log(`FAIL after ${label}: ${key} changed`);
    }
  }
}

console.log(`module exports: ${Object.keys(mod).sort().join(",")}`);
console.log(`behavior check: ${behaviorOk ? "PASS" : "FAIL"}`);
console.log(
  fail === 0
    ? "PASS: no global/prototype/intrinsic mutation detected after import or call"
    : `FAIL: ${fail} mutation(s) detected`,
);
process.exit(fail === 0 && behaviorOk ? 0 : 1);
