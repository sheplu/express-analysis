// Reproduction: verify that requiring and running cookie-parser does not
// mutate Node.js core (http.IncomingMessage, crypto, Object.prototype,
// module loading). Run as:
//   PACKAGE_ROOT=<path-to-cookie-parser-checkout> node repro-no-core-mutation.js
'use strict'

const assert = require('assert')
const http = require('http')
const crypto = require('crypto')
const Module = require('module')

const PACKAGE_ROOT = process.env.PACKAGE_ROOT
if (!PACKAGE_ROOT) {
  console.error('Set PACKAGE_ROOT to the cookie-parser checkout')
  process.exit(2)
}

function snapshot () {
  return {
    imProtoKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    imProto: Object.getPrototypeOf(http.IncomingMessage.prototype),
    setTimeout: http.IncomingMessage.prototype.setTimeout,
    headersDesc: Object.getOwnPropertyDescriptor(http.IncomingMessage.prototype, 'headers'),
    createHmac: crypto.createHmac,
    createHash: crypto.createHash,
    objProtoKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(','),
    moduleLoad: Module._load,
    moduleResolve: Module._resolveFilename,
    requireExtJs: require.extensions['.js']
  }
}

const before = snapshot()

const cookieParser = require(PACKAGE_ROOT)
const afterRequire = snapshot()

// Run the middleware against a real IncomingMessage-shaped object.
const req = new http.IncomingMessage(null)
req.headers = { cookie: 'a=b; s=s%3Asigned.sig; j=j%3A%7B%22x%22%3A1%7D' }
const mw = cookieParser('top-secret')
let nextCalled = false
mw(req, {}, function next (err) { nextCalled = true; if (err) throw err })
assert.strictEqual(nextCalled, true, 'next() called')

const afterRun = snapshot()

for (const phase of [['after require', afterRequire], ['after middleware run', afterRun]]) {
  const [label, s] = phase
  assert.strictEqual(s.imProtoKeys, before.imProtoKeys, label + ': IncomingMessage.prototype own keys unchanged')
  assert.strictEqual(s.imProto, before.imProto, label + ': IncomingMessage.prototype [[Prototype]] unchanged')
  assert.strictEqual(s.setTimeout, before.setTimeout, label + ': IncomingMessage.prototype.setTimeout identity unchanged')
  assert.strictEqual(s.headersDesc.get, before.headersDesc.get, label + ': headers getter identity unchanged')
  assert.strictEqual(s.createHmac, before.createHmac, label + ': crypto.createHmac identity unchanged')
  assert.strictEqual(s.createHash, before.createHash, label + ': crypto.createHash identity unchanged')
  assert.strictEqual(s.objProtoKeys, before.objProtoKeys, label + ': Object.prototype own keys unchanged')
  assert.strictEqual(s.moduleLoad, before.moduleLoad, label + ': Module._load identity unchanged')
  assert.strictEqual(s.moduleResolve, before.moduleResolve, label + ': Module._resolveFilename identity unchanged')
  assert.strictEqual(s.requireExtJs, before.requireExtJs, label + ': require.extensions[".js"] identity unchanged')
}

// Writes land on the instance only, as library-owned own properties.
assert.deepStrictEqual(Object.keys(req.cookies).sort(), ['a', 'j'])
assert.strictEqual(req.cookies.a, 'b')
assert.deepStrictEqual(req.cookies.j, { x: 1 })
assert.strictEqual(Object.getPrototypeOf(req.cookies), Object.prototype, 'cookie.parse returns plain object')
assert.strictEqual(Object.getPrototypeOf(req.signedCookies), null, 'signedCookies is null-prototype')
assert.strictEqual(req.secret, 'top-secret')
assert.ok(Object.prototype.hasOwnProperty.call(req, 'cookies'), 'req.cookies is an own property')
assert.ok(!('cookies' in http.IncomingMessage.prototype), 'no cookies on shared prototype')
assert.ok(!('signedCookies' in http.IncomingMessage.prototype), 'no signedCookies on shared prototype')
assert.ok(!('secret' in http.IncomingMessage.prototype), 'no secret on shared prototype')

console.log('OK: no core mutation observed (node ' + process.version + ')')
