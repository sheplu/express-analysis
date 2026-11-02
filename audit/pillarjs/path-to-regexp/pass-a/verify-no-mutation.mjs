// Pass A dynamic verification for path-to-regexp@9.0.0.
// Usage: node verify-no-mutation.mjs "$NPM_ARTIFACT/dist/index.js"
// Snapshots own-property descriptors of JS intrinsics and globalThis before and
// after importing the shipped artifact and exercising its full public API, then
// reports any mutation. Exits 0 with "NO MUTATION DETECTED" when clean.
import { pathToFileURL } from "node:url";

const entry = process.argv[2];
if (!entry) {
  console.error("usage: node verify-no-mutation.mjs <artifact-entry-file>");
  process.exit(2);
}

const targets = [
  ["globalThis", globalThis],
  ["RegExp", RegExp],
  ["RegExp.prototype", RegExp.prototype],
  ["String", String],
  ["String.prototype", String.prototype],
  ["Object", Object],
  ["Object.prototype", Object.prototype],
  ["Array", Array],
  ["Array.prototype", Array.prototype],
  ["Function.prototype", Function.prototype],
  ["Error", Error],
  ["Error.prototype", Error.prototype],
  ["TypeError", TypeError],
  ["TypeError.prototype", TypeError.prototype],
  ["Symbol", Symbol],
];

function snapshot() {
  const snap = new Map();
  for (const [name, obj] of targets) {
    const entry = new Map();
    for (const key of Reflect.ownKeys(obj)) {
      entry.set(key, Object.getOwnPropertyDescriptor(obj, key));
    }
    snap.set(name, { props: entry, proto: Object.getPrototypeOf(obj) });
  }
  return snap;
}

function sameDescriptor(a, b) {
  if (!a || !b) return false;
  return (
    Object.is(a.value, b.value) &&
    a.get === b.get &&
    a.set === b.set &&
    a.writable === b.writable &&
    a.enumerable === b.enumerable &&
    a.configurable === b.configurable
  );
}

function diff(before, after) {
  const problems = [];
  for (const [name] of targets) {
    const b = before.get(name);
    const a = after.get(name);
    if (b.proto !== a.proto) problems.push(`${name}: [[Prototype]] changed`);
    for (const key of b.props.keys()) {
      if (!a.props.has(key)) problems.push(`${name}.${String(key)}: deleted`);
      else if (!sameDescriptor(b.props.get(key), a.props.get(key)))
        problems.push(`${name}.${String(key)}: descriptor/value changed`);
    }
    for (const key of a.props.keys()) {
      if (!b.props.has(key)) problems.push(`${name}.${String(key)}: added`);
    }
  }
  return problems;
}

const savedIdentities = {
  encodeURIComponent,
  decodeURIComponent,
  "RegExp.prototype.exec": RegExp.prototype.exec,
  "String.prototype.replace": String.prototype.replace,
  "String.prototype.split": String.prototype.split,
};

// Warm-up: reading globalThis descriptors triggers Node's own lazy getters
// (e.g. fetch -> undici dispatcher symbols). Take a throwaway snapshot first so
// the baseline reflects fully-materialized runtime state.
snapshot();

const before = snapshot();
const mod = await import(pathToFileURL(entry).href);

// Exercise the complete runtime API surface.
const { regexp, keys } = mod.pathToRegexp(["/user/:name", "/*splat"], {
  end: true,
  trailing: true,
  sensitive: false,
});
regexp.exec("/user/bob");
const extraOwn = Reflect.ownKeys(regexp).filter((k) => k !== "lastIndex");
const m = mod.match("/user/:name{/:tail}", { decode: decodeURIComponent });
m("/user/b%C3%B6b/x");
mod.compile("/user/:name")({ name: "x y" });
mod.stringify(mod.parse("/user/:name{/opt}/*rest"));
try {
  mod.pathToRegexp("/:");
} catch (e) {
  if (!(e instanceof mod.PathError)) throw e;
}

const after = snapshot();
const problems = diff(before, after);

for (const [name, fn] of Object.entries(savedIdentities)) {
  const current = name.includes(".")
    ? name.split(".").reduce((o, k) => o[k], globalThis)
    : globalThis[name];
  if (current !== fn) problems.push(`${name}: function identity changed`);
}
if (Object.getPrototypeOf(regexp) !== RegExp.prototype)
  problems.push("returned regexp is not a plain RegExp instance");
if (extraOwn.length)
  problems.push(
    `returned regexp has unexpected own keys: ${extraOwn.map(String).join(",")}`,
  );
if (keys.length !== 2) problems.push("unexpected keys result");

if (problems.length) {
  console.error("MUTATIONS DETECTED:");
  for (const p of problems) console.error(" - " + p);
  process.exit(1);
}
console.log("NO MUTATION DETECTED");
console.log("node " + process.versions.node);
