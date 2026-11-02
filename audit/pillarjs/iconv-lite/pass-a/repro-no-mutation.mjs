// Reproduction: verify that importing and exercising iconv-lite does not mutate
// Node.js core objects. Usage: node repro-no-mutation.mjs "$PACKAGE_ROOT"
// Compares own-property names + function identities of core objects before/after
// import and after exercising encode/decode/node-streams/web-streams.

import { Transform, Readable, Writable } from "node:stream";

const pkgRoot = process.argv[2];
if (!pkgRoot) { console.error("usage: node repro-no-mutation.mjs <package-root>"); process.exit(2); }

const targets = {
  "Buffer (statics)": Buffer,
  "Buffer.prototype": Buffer.prototype,
  "Uint8Array.prototype": Uint8Array.prototype,
  "stream.Transform": Transform,
  "stream.Transform.prototype": Transform.prototype,
  "stream.Readable.prototype": Readable.prototype,
  "stream.Writable.prototype": Writable.prototype,
  "Object.prototype": Object.prototype,
  "String.prototype": String.prototype,
  "TextDecoder.prototype": TextDecoder.prototype,
  "TextEncoder.prototype": TextEncoder.prototype,
  "TransformStream.prototype": TransformStream.prototype,
};

function snapshot(obj) {
  const snap = new Map();
  for (const key of [...Object.getOwnPropertyNames(obj), ...Object.getOwnPropertySymbols(obj)]) {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    snap.set(String(key), { value: d.value, get: d.get, set: d.set,
      writable: d.writable, enumerable: d.enumerable, configurable: d.configurable });
  }
  snap.set("__proto__chain__", { value: Object.getPrototypeOf(obj) });
  return snap;
}

function diff(name, before, after) {
  const problems = [];
  for (const [key, b] of before) {
    const a = after.get(key);
    if (!a) { problems.push(`${name}: property removed: ${key}`); continue; }
    for (const f of ["value", "get", "set", "writable", "enumerable", "configurable"]) {
      if (!Object.is(a[f], b[f])) problems.push(`${name}: descriptor field '${f}' changed on ${key}`);
    }
  }
  for (const key of after.keys()) {
    if (!before.has(key)) problems.push(`${name}: property ADDED: ${key}`);
  }
  return problems;
}

const before = Object.fromEntries(Object.entries(targets).map(([n, o]) => [n, snapshot(o)]));

// Import the Node entrypoint (package "." with node condition -> lib/index-node.js)
const iconv = (await import(pkgRoot + "/lib/index-node.js")).default;

// Exercise representative paths: internal, sbcs, dbcs, utf16/32/7, node streams, web streams.
iconv.encode("héllo wörld", "win1251");
iconv.decode(Buffer.from([0x3f, 0x68]), "gbk");
iconv.encode("test \u{1F600}", "utf16-be");
iconv.decode(iconv.encode("abcĀ", "utf32"), "utf32");
iconv.encode("+test+", "utf7");
iconv.decode(Buffer.from("aGVsbG8=", "ascii"), "base64");
const es = iconv.encodeStream("win1252"); es.write("stream test"); es.end();
const ds = iconv.decodeStream("utf16le"); ds.write(Buffer.from("a\0b\0", "binary")); ds.end();
iconv.encodeWebStream("utf8");
iconv.decodeWebStream("shiftjis");
iconv.encodingExists("nonexistent-enc");

// Also exercise the "./web" entrypoint (lib/index-web.js, web backend), which is
// Node-resolvable via the exports map ("./web" and the browser/default conditions).
const iconvWeb = (await import(pkgRoot + "/lib/index-web.js")).default;
iconvWeb.encode("héllo", "win1251");
iconvWeb.decode(new Uint8Array([0x61, 0x62]), "koi8-r");
iconvWeb.encode("abc", "hex");
iconvWeb.decode(new Uint8Array([0x61]), "base64");
iconvWeb.encodeWebStream("utf7");
iconvWeb.decodeWebStream("utf32");

await new Promise((r) => setTimeout(r, 50)); // let stream callbacks flush

const after = Object.fromEntries(Object.entries(targets).map(([n, o]) => [n, snapshot(o)]));

let allProblems = [];
for (const name of Object.keys(targets)) allProblems.push(...diff(name, before[name], after[name]));

if (allProblems.length === 0) {
  console.log("PASS: no core object mutations detected after import + exercise");
  console.log("checked objects: " + Object.keys(targets).join(", "));
} else {
  console.log("MUTATIONS DETECTED:");
  for (const p of allProblems) console.log("  - " + p);
  process.exitCode = 1;
}
