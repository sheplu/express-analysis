'use strict';
// Usage: node repro-core-mutation-check.js "$PACKAGE_ROOT"
// Verifies whether requiring express and serving a request mutates Node.js
// core prototypes/globals, and inspects instance-level prototype rewiring.

const http = require('node:http');
const { Stream } = require('node:stream');
const assert = require('node:assert');

const pkgRoot = process.argv[2];
if (!pkgRoot) {
  console.error('usage: node repro-core-mutation-check.js "$PACKAGE_ROOT"');
  process.exit(1);
}

function show(v) {
  try {
    if (typeof v === 'function') return 'fn:' + (v.name || 'anonymous');
    return String(v).slice(0, 40);
  } catch (e) {
    return '<unstringifiable ' + typeof v + '>';
  }
}

function snap(obj) {
  const out = {};
  for (const key of Reflect.ownKeys(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    out[String(key)] = d.value !== undefined ? show(d.value)
      : (d.get ? 'getter:' + show(d.get) : 'accessor');
  }
  return out;
}

const targets = {
  'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
  'http.ServerResponse.prototype': http.ServerResponse.prototype,
  'http.OutgoingMessage.prototype': http.OutgoingMessage.prototype,
  'Stream.prototype': Stream.prototype,
  'Function.prototype': Function.prototype,
  'Object.prototype': Object.prototype,
  'Error (own props)': Error,
  'process (own props, minus env/title)': process,
};

const before = {};
for (const [name, obj] of Object.entries(targets)) before[name] = snap(obj);
const prepBefore = Error.prepareStackTrace;
const limitBefore = Error.stackTraceLimit;

const express = require(pkgRoot);
const app = express();

app.get('/', (req, res) => {
  // instance-level prototype rewiring evidence
  const reqProtoIsAppRequest = Object.getPrototypeOf(req) === app.request;
  const resProtoIsAppResponse = Object.getPrototypeOf(res) === app.response;
  const chain = [];
  let p = Object.getPrototypeOf(req);
  while (p) { chain.push(p); p = Object.getPrototypeOf(p); }
  const chainHasCoreProto = chain.includes(http.IncomingMessage.prototype);

  // shadowing check: do express req/res layer keys collide with core chain keys?
  function chainKeys(start) {
    const keys = new Set();
    let o = start;
    while (o && o !== Object.prototype) {
      for (const k of Reflect.ownKeys(o)) keys.add(String(k));
      o = Object.getPrototypeOf(o);
    }
    return keys;
  }
  const coreReqKeys = chainKeys(http.IncomingMessage.prototype);
  const coreResKeys = chainKeys(http.ServerResponse.prototype);
  const reqShadows = Reflect.ownKeys(express.request).map(String).filter(k => coreReqKeys.has(k));
  const resShadows = Reflect.ownKeys(express.response).map(String).filter(k => coreResKeys.has(k));

  res.json({ reqProtoIsAppRequest, resProtoIsAppResponse, chainHasCoreProto, reqShadows, resShadows });
});

const server = app.listen(0, () => {
  http.get({ port: server.address().port, path: '/' }, (r) => {
    let body = '';
    r.on('data', (c) => { body += c; });
    r.on('end', () => {
      console.log('instance checks:', body);

      let mutated = false;
      for (const [name, obj] of Object.entries(targets)) {
        const now = snap(obj);
        const prev = before[name];
        const added = Object.keys(now).filter((k) => !(k in prev));
        const removed = Object.keys(prev).filter((k) => !(k in now));
        const changed = Object.keys(now).filter((k) => k in prev && now[k] !== prev[k])
          .filter((k) => !(name.startsWith('process') && ['title', '_eventsCount', 'env', 'mainModule', '_events'].includes(k)));
        if (added.length || removed.length || changed.length) {
          mutated = true;
          console.log('MUTATED', name, { added, removed, changed });
        }
      }
      console.log('prepareStackTrace restored:', Error.prepareStackTrace === prepBefore);
      console.log('stackTraceLimit restored:', Error.stackTraceLimit === limitBefore);
      console.log(mutated ? 'RESULT: core prototype/global mutations detected' : 'RESULT: no shared core prototype/global mutations detected');
      assert.strictEqual(typeof express.request.get, 'function');
      server.close();
    });
  });
});
