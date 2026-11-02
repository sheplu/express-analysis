// Reproduction: verify cookie-parser@1.4.7 (+ cookie@0.7.2, cookie-signature@1.0.6)
// does not mutate Node.js core state at require time or during middleware execution.
// Usage: node repro-check.js "$PACKAGE_ROOT"
'use strict';

const http = require('http');
const crypto = require('crypto');
const net = require('net');
const assert = require('assert');
const Module = require('module');

const pkgRoot = process.argv[2];
if (!pkgRoot) {
  console.error('usage: node repro-check.js "$PACKAGE_ROOT"');
  process.exit(2);
}

function snapshot () {
  return {
    objectProtoKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(','),
    stringProtoKeys: Object.getOwnPropertyNames(String.prototype).sort().join(','),
    incomingProtoKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    incomingMessageRef: http.IncomingMessage,
    createHmacRef: crypto.createHmac,
    createHashRef: crypto.createHash,
    bufferRef: Buffer,
    globalBufferRef: globalThis.Buffer,
    moduleLoadRef: Module._load,
    moduleResolveRef: Module._resolveFilename,
    moduleExtKeys: Object.keys(Module._extensions).sort().join(','),
    jsonParseRef: JSON.parse,
    globalKeys: Object.getOwnPropertyNames(globalThis).sort().join(','),
  };
}

const before = snapshot();

const cookieParser = require(pkgRoot);
const signature = require(pkgRoot + '/node_modules/cookie-signature');

const afterRequire = snapshot();
for (const k of Object.keys(before)) {
  assert.strictEqual(before[k], afterRequire[k], 'changed at require time: ' + k);
}

// Exercise the middleware on a real core-backed IncomingMessage instance.
const req = new http.IncomingMessage(new net.Socket());
const signed = 's:' + signature.sign('bar', 'secret');
req.headers = {
  cookie: 'plain=1; signed=' + encodeURIComponent(signed) +
          '; json=' + encodeURIComponent('j:{"a":1}')
};
let nextCalled = false;
cookieParser('secret')(req, {}, function next (err) {
  if (err) throw err;
  nextCalled = true;
});
assert.ok(nextCalled, 'middleware did not call next');
assert.strictEqual(req.cookies.plain, '1');
assert.deepStrictEqual(req.cookies.json, { a: 1 });
assert.strictEqual(req.signedCookies.signed, 'bar');

const afterCall = snapshot();
for (const k of Object.keys(before)) {
  assert.strictEqual(before[k], afterCall[k], 'changed at call time: ' + k);
}

// The added fields are own instance properties, not prototype members.
assert.ok(Object.prototype.hasOwnProperty.call(req, 'cookies'));
assert.ok(Object.prototype.hasOwnProperty.call(req, 'signedCookies'));
assert.ok(Object.prototype.hasOwnProperty.call(req, 'secret'));
assert.ok(!('cookies' in http.IncomingMessage.prototype));
assert.ok(!('signedCookies' in http.IncomingMessage.prototype));
assert.ok(!('secret' in http.IncomingMessage.prototype));

console.log('node', process.versions.node);
console.log('checkpoints compared:', Object.keys(before).length, '(require time and call time)');
console.log('no Node.js core mutation detected');
console.log('own request instance props added:', ['secret', 'cookies', 'signedCookies'].join(','));
