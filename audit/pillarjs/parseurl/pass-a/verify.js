'use strict'
// Pass A verification: does requiring and exercising parseurl mutate Node core?
// Usage: node verify.js "$PACKAGE_ROOT"
// Compares url module export identities, Url.prototype shape, and
// http.IncomingMessage prototype-chain membership before/after.

const assert = require('assert')
const url = require('url')
const http = require('http')

const pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node verify.js "$PACKAGE_ROOT"')
  process.exit(2)
}

function protoChainHas (obj, key) {
  for (let p = Object.getPrototypeOf(obj); p; p = Object.getPrototypeOf(p)) {
    if (Object.prototype.hasOwnProperty.call(p, key)) return true
  }
  return false
}

// --- baseline snapshot (before library load) ---
const beforeParse = url.parse
const beforeUrl = url.Url
const beforeUrlModuleKeys = Object.getOwnPropertyNames(url).sort().join(',')
const beforeUrlProtoKeys = Object.getOwnPropertyNames(url.Url.prototype).sort().join(',')
const beforeIMProtoKeys = Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(',')
const expandos = ['_parsedUrl', '_parsedOriginalUrl', '_raw']
const freshReqBefore = new http.IncomingMessage(null)
for (const k of expandos) {
  assert.strictEqual(k in freshReqBefore, false, `${k} pre-exists on IncomingMessage chain`)
}
assert.strictEqual('_raw' in new url.Url(), false, '_raw pre-exists on Url chain')

// --- load and exercise the library ---
const parseurl = require(pkgRoot)

const req = new http.IncomingMessage(null)
req.url = '/foo/bar?q=1#frag' // '#' forces slow path -> url.parse
const slow = parseurl(req)
req.url = '/foo/bar?q=1' // fast path -> new Url() hand-population
const fast = parseurl(req)
const cached = parseurl(req)
req.originalUrl = '/orig?x=2'
const orig = parseurl.original(req)

// --- post checks: core untouched ---
assert.strictEqual(url.parse, beforeParse, 'url.parse replaced')
assert.strictEqual(url.Url, beforeUrl, 'url.Url replaced')
assert.strictEqual(Object.getOwnPropertyNames(url).sort().join(','), beforeUrlModuleKeys, 'url module keys changed')
assert.strictEqual(Object.getOwnPropertyNames(url.Url.prototype).sort().join(','), beforeUrlProtoKeys, 'Url.prototype keys changed')
assert.strictEqual(Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','), beforeIMProtoKeys, 'IncomingMessage.prototype keys changed')

// expandos are own properties of this instance only, never on any prototype
for (const k of ['_parsedUrl', '_parsedOriginalUrl']) {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(req, k), true, `${k} not an own prop`)
  assert.strictEqual(protoChainHas(req, k), false, `${k} leaked onto a prototype`)
}
const otherReq = new http.IncomingMessage(null)
for (const k of expandos) {
  assert.strictEqual(k in otherReq, false, `${k} visible on unrelated instance`)
}

// parsed results: fresh per-request Url instances with own-prop _raw
assert.strictEqual(fast instanceof url.Url, true, 'fast path not a Url instance')
assert.strictEqual(slow instanceof url.Url, true, 'slow path not a Url instance')
assert.strictEqual(Object.prototype.hasOwnProperty.call(fast, '_raw'), true, '_raw not own prop')
assert.strictEqual(protoChainHas(fast, '_raw'), false, '_raw leaked onto Url prototype chain')
assert.strictEqual('_raw' in new url.Url(), false, '_raw visible on fresh Url instance')
assert.strictEqual(cached, fast, 'memoization did not return cached object')
assert.notStrictEqual(orig, fast, 'original cache collided with url cache')
assert.strictEqual(fast.pathname, '/foo/bar')
assert.strictEqual(fast.query, 'q=1')
assert.strictEqual(fast.search, '?q=1')

console.log('node ' + process.versions.node + ': PASS - no core mutation observed; expandos are instance-own only')
