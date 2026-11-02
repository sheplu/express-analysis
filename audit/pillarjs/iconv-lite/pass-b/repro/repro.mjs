// Pass B runtime reproduction for the iconv-lite patch audit.
//
// Snapshots identities/descriptors of Node core surfaces BEFORE importing
// iconv-lite and AFTER importing it and exercising representative runtime
// paths (sbcs, dbcs, utf16, internal utf8/base64/hex, Node streams
// encodeStream/decodeStream, Web streams, and the web entrypoint/backend),
// then diffs the snapshots.
//
// Usage: node repro.mjs "$PACKAGE_ROOT"
// Writes a sanitized results file (results.txt) next to this script.
// No machine paths are included in the output.

import { createRequire } from "node:module"
import { pathToFileURL, fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"

const require = createRequire(import.meta.url)
const Module = require("node:module")
const stream = require("node:stream")
const stringDecoder = require("node:string_decoder")

const pkgRoot = process.argv[2] || process.env.PACKAGE_ROOT
if (!pkgRoot) {
  console.error("usage: node repro.mjs <package-root>")
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Snapshot machinery. Identities are held in memory (same process), so the
// before/after comparison uses Object.is on the actual values; descriptors
// are reduced to a comparable signature.
// ---------------------------------------------------------------------------

function descSig (obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key)
  if (!d) return null
  return [
    "t:" + ("value" in d ? typeof d.value : "accessor"),
    "w:" + !!d.writable, "e:" + !!d.enumerable, "c:" + !!d.configurable,
    "g:" + !!d.get, "s:" + !!d.set
  ].join(",")
}

function captureObject (obj) {
  const keys = []
  const refs = new Map()
  const descs = new Map()
  for (const key of Reflect.ownKeys(obj)) {
    const sk = typeof key === "symbol" ? key.toString() : String(key)
    keys.push(sk)
    descs.set(sk, descSig(obj, key))
    const d = Object.getOwnPropertyDescriptor(obj, key)
    refs.set(sk, d && "value" in d ? d.value : (d ? d.get : undefined))
  }
  keys.sort()
  return { keys, refs, descs }
}

function snapshot () {
  return {
    surfaces: {
      "Buffer (statics)": captureObject(Buffer),
      "Buffer.prototype": captureObject(Buffer.prototype),
      "StringDecoder (statics)": captureObject(stringDecoder.StringDecoder),
      "StringDecoder.prototype": captureObject(stringDecoder.StringDecoder.prototype),
      "stream.Transform.prototype": captureObject(stream.Transform.prototype),
      "stream.Duplex.prototype": captureObject(stream.Duplex.prototype),
      "stream.Readable.prototype": captureObject(stream.Readable.prototype),
      "stream.Writable.prototype": captureObject(stream.Writable.prototype),
      "stream.PassThrough.prototype": captureObject(stream.PassThrough.prototype),
      "Object.prototype": captureObject(Object.prototype),
      "Array.prototype": captureObject(Array.prototype),
      "String.prototype": captureObject(String.prototype),
      "Function.prototype": captureObject(Function.prototype),
      "Uint8Array.prototype": captureObject(Uint8Array.prototype),
      "Object (statics)": captureObject(Object)
    },
    identities: new Map([
      ["Object.assign", Object.assign],
      ["Object.defineProperty", Object.defineProperty],
      ["Module._load", Module._load],
      ["Module._resolveFilename", Module._resolveFilename],
      ["Module._extensions", Module._extensions],
      ["process.binding", process.binding],
      ["Buffer", Buffer],
      ["Buffer.from", Buffer.from],
      ["Buffer.alloc", Buffer.alloc],
      ["Buffer.concat", Buffer.concat],
      ["Buffer.isBuffer", Buffer.isBuffer],
      ["Buffer.isEncoding", Buffer.isEncoding],
      ["Buffer.byteLength", Buffer.byteLength],
      ["Buffer.prototype.toString", Buffer.prototype.toString],
      ["Buffer.prototype.write", Buffer.prototype.write],
      ["Buffer.prototype.slice", Buffer.prototype.slice],
      ["StringDecoder", stringDecoder.StringDecoder],
      ["StringDecoder.prototype.write", stringDecoder.StringDecoder.prototype.write],
      ["StringDecoder.prototype.end", stringDecoder.StringDecoder.prototype.end],
      ["stream.Transform", stream.Transform],
      ["stream.Readable", stream.Readable],
      ["stream.Writable", stream.Writable],
      ["stream.Readable.prototype.setEncoding", stream.Readable.prototype.setEncoding],
      ["stream.Readable.prototype.pipe", stream.Readable.prototype.pipe],
      ["TextDecoder", globalThis.TextDecoder],
      ["TextEncoder", globalThis.TextEncoder],
      ["TransformStream", globalThis.TransformStream],
      ["TextDecoder.prototype.decode", globalThis.TextDecoder.prototype.decode],
      ["TextEncoder.prototype.encode", globalThis.TextEncoder.prototype.encode],
      ["atob", globalThis.atob],
      ["btoa", globalThis.btoa],
      ["JSON.parse", JSON.parse],
      ["JSON.stringify", JSON.stringify]
    ]),
    requireExtensions: Object.keys(require.extensions).sort(),
    requireCacheBuiltins: Object.keys(require.cache)
      .filter((k) => k.startsWith("node:") || !path.isAbsolute(k)).sort(),
    globalKeys: Reflect.ownKeys(globalThis)
      .map((k) => (typeof k === "symbol" ? k.toString() : String(k))).sort()
  }
}

function diffLists (label, before, after, problems) {
  const b = new Set(before)
  const a = new Set(after)
  for (const k of a) if (!b.has(k)) problems.push(`${label}: ADDED key '${k}'`)
  for (const k of b) if (!a.has(k)) problems.push(`${label}: REMOVED key '${k}'`)
}

function diffSnapshots (before, after) {
  const problems = []
  for (const name of Object.keys(before.surfaces)) {
    const b = before.surfaces[name]
    const a = after.surfaces[name]
    diffLists(name, b.keys, a.keys, problems)
    for (const [k, ref] of b.refs) {
      if (a.refs.has(k) && !Object.is(ref, a.refs.get(k))) {
        problems.push(`${name}: IDENTITY CHANGED for '${k}'`)
      }
    }
    for (const [k, sig] of b.descs) {
      if (a.descs.has(k) && sig !== a.descs.get(k)) {
        problems.push(`${name}: DESCRIPTOR CHANGED for '${k}' (${sig} -> ${a.descs.get(k)})`)
      }
    }
  }
  for (const [name, ref] of before.identities) {
    if (!Object.is(ref, after.identities.get(name))) {
      problems.push(`identity: CHANGED '${name}'`)
    }
  }
  diffLists("require.extensions", before.requireExtensions, after.requireExtensions, problems)
  diffLists("require.cache (builtin/non-file)", before.requireCacheBuiltins, after.requireCacheBuiltins, problems)
  diffLists("globalThis", before.globalKeys, after.globalKeys, problems)
  return problems
}

// ---------------------------------------------------------------------------
// Exercise helpers
// ---------------------------------------------------------------------------

function assertEqual (actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`exercise failed: ${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  }
}

function collectStream (s) {
  return new Promise((resolve, reject) => { s.collect((err, res) => (err ? reject(err) : resolve(res))) })
}

async function exercise (log) {
  const nodeEntry = pathToFileURL(path.join(pkgRoot, "lib", "index-node.js")).href
  const webEntry = pathToFileURL(path.join(pkgRoot, "lib", "index-web.js")).href

  const iconv = (await import(nodeEntry)).default
  log.push("imported node entrypoint (lib/index-node.js, i.e. exports['.'].node)")

  // Single-byte encoding round trip (windows-1251).
  const sb = iconv.encode("Привет, мир!", "win1251")
  assertEqual(Buffer.isBuffer(sb), true, "win1251 encode returns Buffer")
  assertEqual(iconv.decode(sb, "win1251"), "Привет, мир!", "win1251 round trip")
  log.push("sbcs: win1251 encode/decode round trip OK (" + sb.length + " bytes)")

  // Multi-byte encodings round trips (GBK and Shift_JIS, DBCS codec).
  const mb = iconv.encode("中文测试", "gbk")
  assertEqual(iconv.decode(mb, "gbk"), "中文测试", "gbk round trip")
  const sj = iconv.encode("テスト", "shiftjis")
  assertEqual(iconv.decode(sj, "shiftjis"), "テスト", "shiftjis round trip")
  log.push("dbcs: gbk and shiftjis encode/decode round trips OK")

  // UTF-16BE and internal codecs (utf8 via TextDecoder, base64, hex).
  assertEqual(iconv.decode(iconv.encode("héllo", "utf16-be"), "utf16-be"), "héllo", "utf16-be round trip")
  assertEqual(iconv.decode(iconv.encode("héllo", "utf8"), "utf8"), "héllo", "utf8 round trip")
  assertEqual(iconv.decode(Buffer.from("hello"), "base64"), "aGVsbG8=", "base64 decode")
  assertEqual(iconv.encode("aGVsbG8=", "base64").toString(), "hello", "base64 encode")
  assertEqual(iconv.encode("68656c6c6f", "hex").toString(), "hello", "hex encode")
  log.push("utf16-be, utf8, base64, hex paths OK")

  // Node streaming API (stream.Transform subclasses).
  const encStream = iconv.encodeStream("win1251")
  const encP = collectStream(encStream)
  encStream.write("Стрим ")
  encStream.write("тест")
  encStream.end()
  const encBytes = await encP
  const decStream = iconv.decodeStream("win1251")
  const decP = collectStream(decStream)
  decStream.write(encBytes.subarray(0, 3)) // split mid-stream
  decStream.write(encBytes.subarray(3))
  decStream.end()
  assertEqual(await decP, "Стрим тест", "stream round trip")
  log.push("node streams: encodeStream/decodeStream round trip OK")

  // Web Streams API.
  const ws = iconv.decodeWebStream("gbk")
  const writer = ws.writable.getWriter()
  const reader = ws.readable.getReader()
  const writeDone = writer.write(mb).then(() => writer.close())
  let webRes = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    webRes += value
  }
  await writeDone
  assertEqual(webRes, "中文测试", "web stream decode")
  log.push("web streams: decodeWebStream OK")

  // Web entrypoint with the web backend (exports['./web'] and browser condition).
  const iconvWeb = (await import(webEntry)).default
  const wb = iconvWeb.encode("Привет", "win1251")
  assertEqual(wb instanceof Uint8Array && !Buffer.isBuffer(wb), true, "web backend returns plain Uint8Array")
  assertEqual(iconvWeb.decode(wb, "win1251"), "Привет", "web backend round trip")
  log.push("web entrypoint (lib/index-web.js) with web backend OK")

  // Direct subpath export (exports['./encodings/*.js']).
  const utf7 = await import(pathToFileURL(path.join(pkgRoot, "encodings", "utf7.js")).href)
  assertEqual(typeof utf7.utf7, "function", "encodings subpath export loads")
  log.push("subpath export encodings/utf7.js loads OK")
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const log = []
const before = snapshot()
log.push("snapshot BEFORE import taken")

let exerciseError = null
try {
  await exercise(log)
} catch (e) {
  exerciseError = e.message
}

const after = snapshot()
log.push("snapshot AFTER import + exercise taken")

const problems = diffSnapshots(before, after)

const lines = []
lines.push("# iconv-lite pass-b runtime reproduction results")
lines.push("")
lines.push("Node runtime: " + process.version)
lines.push("Package: iconv-lite (loaded from $PACKAGE_ROOT)")
lines.push("")
lines.push("## Exercised paths")
for (const l of log) lines.push("- " + l)
if (exerciseError) lines.push("- EXERCISE ERROR: " + exerciseError)
lines.push("")
lines.push("## Core-surface diff (before import vs after import + exercise)")
lines.push("")
lines.push("Surfaces compared: Buffer statics + prototype, StringDecoder statics + prototype,")
lines.push("stream Transform/Duplex/Readable/Writable/PassThrough prototypes,")
lines.push("Object/Array/String/Function/Uint8Array prototypes, Object statics (incl. assign),")
lines.push("Module._load/_resolveFilename/_extensions, process.binding, require.extensions keys,")
lines.push("require.cache non-file entries, globalThis own keys, and " + before.identities.size + " pinned function identities.")
lines.push("")
if (problems.length === 0) {
  lines.push("RESULT: NO DIFFERENCES DETECTED. No core mutation observed at runtime.")
} else {
  lines.push("RESULT: " + problems.length + " DIFFERENCE(S) DETECTED:")
  for (const p of problems) lines.push("- " + p)
}
lines.push("")

const out = lines.join("\n")
console.log(out)
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "results.txt"), out)
process.exit(exerciseError ? 1 : (problems.length === 0 ? 0 : 3))
