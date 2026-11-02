'use strict';
// Reproduction: verify that requiring and invoking basic-auth-connect does not
// mutate Node.js core modules, globals, or shared prototypes.
// Usage: PACKAGE_ROOT=<path-to-basic-auth-connect> node repro-no-mutation.js
// (or: node repro-no-mutation.js "$PACKAGE_ROOT")

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const Module = require('module');

const pkgRoot = process.env.PACKAGE_ROOT || process.argv[2];
if (!pkgRoot) {
  console.error('usage: node repro-no-mutation.js "$PACKAGE_ROOT"');
  process.exit(2);
}

function snapshot() {
  return {
    STATUS_CODES: http.STATUS_CODES,
    IncomingMessage: http.IncomingMessage,
    ServerResponse: http.ServerResponse,
    imProtoKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    srProtoKeys: Object.getOwnPropertyNames(http.ServerResponse.prototype).sort().join(','),
    srStatusCodeDesc: JSON.stringify(Object.getOwnPropertyDescriptor(http.ServerResponse.prototype, 'statusCode')),
    setHeader: http.ServerResponse.prototype.setHeader,
    end: http.ServerResponse.prototype.end,
    timingSafeEqual: crypto.timingSafeEqual,
    createHmac: crypto.createHmac,
    pseudoRandomBytes: crypto.pseudoRandomBytes,
    BufferCtor: global.Buffer,
    bufferProtoKeys: Object.getOwnPropertyNames(Buffer.prototype).sort().join(','),
    moduleLoad: Module._load,
    moduleCompile: Module.prototype._compile,
    requireExtensions: Object.keys(require.extensions).sort().join(','),
    globalKeys: Object.getOwnPropertyNames(globalThis).sort().join(','),
  };
}

const before = snapshot();

const basicAuth = require(path.resolve(pkgRoot, 'index.js'));

// Exercise all three runtime paths: string credentials, sync callback, async callback.
const mw1 = basicAuth('alice', 'secret');
const mw2 = basicAuth(function (u, p) { return u === 'alice' && p === 'secret'; });
const mw3 = basicAuth(function (u, p, fn) { fn(null, u === 'alice' && p === 'secret' ? u : null); });

function mockReq(auth) {
  return { headers: auth ? { authorization: auth } : {} };
}
function mockRes() {
  return {
    headers: {},
    setHeader: function (k, v) { this.headers[k] = v; },
    end: function (body) { this.body = body; },
  };
}
const ok = 'Basic ' + Buffer.from('alice:secret').toString('base64');
const bad = 'Basic ' + Buffer.from('alice:wrong').toString('base64');

for (const mw of [mw1, mw2, mw3]) {
  mw(mockReq(ok), mockRes(), function () {});
  mw(mockReq(bad), mockRes(), function () {});
  mw(mockReq(null), mockRes(), function () {});
  mw({ headers: { authorization: 'Basic not-three parts here' } }, mockRes(), function () {});
}

const after = snapshot();

let failures = 0;
for (const key of Object.keys(before)) {
  const same = before[key] === after[key];
  console.log((same ? 'UNCHANGED' : 'MUTATED  ') + '  ' + key);
  if (!same) failures++;
}

// Confirm the only observable writes land on the caller-supplied req object.
const reqObserved = mockReq(ok);
mw2(reqObserved, mockRes(), function () {});
console.log('req own props after success: ' + Object.getOwnPropertyNames(reqObserved).sort().join(','));

console.log(failures === 0
  ? 'RESULT: no core/global/prototype mutation observed'
  : 'RESULT: ' + failures + ' mutation(s) observed');
process.exit(failures === 0 ? 0 : 1);
