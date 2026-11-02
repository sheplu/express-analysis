// Reproduction: does requiring/using express mutate Node.js core objects?
// Usage: node repro-proto-check.js "$PACKAGE_ROOT"
// Prints PASS/FAIL lines; no machine paths are printed.
'use strict';

const http = require('node:http');
const assert = require('node:assert');

const packageRoot = process.argv[2];
if (!packageRoot) {
  console.error('usage: node repro-proto-check.js "$PACKAGE_ROOT"');
  process.exit(2);
}

function snapshot(obj) {
  const out = new Map();
  for (const key of Reflect.ownKeys(obj)) {
    out.set(key, Object.getOwnPropertyDescriptor(obj, key));
  }
  return out;
}

function diff(before, after) {
  const changes = [];
  for (const [key, desc] of after) {
    if (!before.has(key)) {
      changes.push(`added: ${String(key)}`);
      continue;
    }
    const b = before.get(key);
    for (const f of ['value', 'get', 'set', 'writable', 'enumerable', 'configurable']) {
      if (b[f] !== desc[f]) changes.push(`changed: ${String(key)}.${f}`);
    }
  }
  for (const key of before.keys()) {
    if (!after.has(key)) changes.push(`removed: ${String(key)}`);
  }
  return changes;
}

const targets = {
  'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
  'http.ServerResponse.prototype': http.ServerResponse.prototype,
  'http.OutgoingMessage.prototype': http.OutgoingMessage.prototype,
  'Function.prototype': Function.prototype,
  'Object.prototype': Object.prototype,
};

const before = {};
for (const [name, obj] of Object.entries(targets)) before[name] = snapshot(obj);
const prepBefore = Error.prepareStackTrace;
const limitBefore = Error.stackTraceLimit;

// Sentinel check: depd is expected to save/replace/restore these during import.
// (An accessor-based write counter confirmed the write occurs: it makes
// depd's getStack crash at depd/index.js:393 because V8 no longer sees the
// replacement function. Here we only verify restoration.)
const prepSentinel = function auditSentinel(err, trace) { return 'sentinel'; };
Error.prepareStackTrace = prepSentinel;
Error.stackTraceLimit = 13;

const express = require(packageRoot);

console.log(`Error.prepareStackTrace restored to pre-require value: ${Error.prepareStackTrace === prepSentinel}`);
console.log(`Error.stackTraceLimit restored to pre-require value: ${Error.stackTraceLimit === 13}`);
Error.prepareStackTrace = prepBefore;
Error.stackTraceLimit = limitBefore;

const app = express();
app.get('/', (req, res) => {
  // core-backed instance prototype replacement check
  const reqProtoSwapped = Object.getPrototypeOf(req) === app.request;
  const resProtoSwapped = Object.getPrototypeOf(res) === app.response;
  const reqChainsToCore =
    Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(req))) ===
    http.IncomingMessage.prototype;
  const resChainsToCore =
    Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(res))) ===
    http.ServerResponse.prototype;
  console.log(`req prototype replaced with app.request: ${reqProtoSwapped}`);
  console.log(`res prototype replaced with app.response: ${resProtoSwapped}`);
  console.log(`req proto chain still reaches IncomingMessage.prototype: ${reqChainsToCore}`);
  console.log(`res proto chain still reaches ServerResponse.prototype: ${resChainsToCore}`);
  res.send('ok');
});

const server = app.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  http.get({ host: '127.0.0.1', port, path: '/' }, (resp) => {
    resp.resume();
    resp.on('end', () => {
      server.close(() => {
        let clean = true;
        for (const [name, obj] of Object.entries(targets)) {
          const changes = diff(before[name], snapshot(obj));
          if (changes.length) {
            clean = false;
            console.log(`MUTATED ${name}: ${changes.join(', ')}`);
          } else {
            console.log(`unchanged after request cycle: ${name}`);
          }
        }
        assert.strictEqual(Error.prepareStackTrace, prepBefore);
        console.log(clean ? 'RESULT: no shared core prototype/global mutation detected'
          : 'RESULT: shared mutation detected');
        console.log(`node: ${process.version}`);
      });
    });
  });
});
