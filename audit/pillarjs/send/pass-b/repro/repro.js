// Pass B runtime reproduction for the send@1.2.1 patch audit.
// Usage: node repro.js "$PACKAGE_ROOT"
//
// Snapshots core surfaces BEFORE requiring the library, AFTER require, and
// AFTER exercising representative runtime paths (200, Range/206, 404 over a
// real http.createServer with send(req, path).pipe(res)), then diffs them.
// An accessor trap on Error.prepareStackTrace records transient swaps that a
// plain before/after snapshot would miss. Error.stackTraceLimit is only
// polled (an accessor there would be ignored by V8's data-property read and
// would corrupt stack capture during the test).
//
// Output is sanitized: no filesystem paths are printed.

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const stream = require('stream');
const events = require('events');
const Module = require('module');

const pkgRoot = process.argv[2];
if (!pkgRoot) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"');
  process.exit(2);
}

console.log('node version: ' + process.version);

// ---------------------------------------------------------------------------
// Snapshot machinery
// ---------------------------------------------------------------------------

const targets = {
  'http.OutgoingMessage.prototype': http.OutgoingMessage.prototype,
  'http.ServerResponse.prototype': http.ServerResponse.prototype,
  'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
  'http.ClientRequest.prototype': http.ClientRequest.prototype,
  'fs.ReadStream.prototype': fs.ReadStream.prototype,
  'stream.Readable.prototype': stream.Readable.prototype,
  'stream.Writable.prototype': stream.Writable.prototype,
  'stream.Stream.prototype': stream.Stream.prototype,
  'events.EventEmitter.prototype': events.EventEmitter.prototype,
  'Object.prototype': Object.prototype,
  'Array.prototype': Array.prototype,
  'String.prototype': String.prototype,
  'Function.prototype': Function.prototype,
  'Error (own props)': Error,
};

const identities = () => ({
  'fs.createReadStream': fs.createReadStream,
  'fs.ReadStream': fs.ReadStream,
  'Object.assign': Object.assign,
  'Module._load': Module._load,
  'Module._resolveFilename': Module._resolveFilename,
  'process.binding': process.binding,
  'Error.captureStackTrace': Error.captureStackTrace,
  'EventEmitter.prototype.on': events.EventEmitter.prototype.on,
  'EventEmitter.prototype.emit': events.EventEmitter.prototype.emit,
  'Readable.prototype.pipe': stream.Readable.prototype.pipe,
  'Writable.prototype.write': stream.Writable.prototype.write,
  'OutgoingMessage.prototype.setHeader': http.OutgoingMessage.prototype.setHeader,
  'OutgoingMessage.prototype.end': http.OutgoingMessage.prototype.end,
  'ServerResponse.prototype.assignSocket': http.ServerResponse.prototype.assignSocket,
});

function snapOwn(obj) {
  const out = new Map();
  for (const k of Reflect.ownKeys(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, k);
    out.set(String(typeof k === 'symbol' ? k.toString() : k), d);
  }
  return out;
}

function snapshot() {
  const s = { targets: {}, ids: identities() };
  for (const [name, obj] of Object.entries(targets)) s.targets[name] = snapOwn(obj);
  s.extensionsKeys = Object.keys(require.extensions).slice().sort();
  s.cacheBuiltins = Object.keys(require.cache).filter((k) => k.startsWith('node:')).sort();
  s.cacheSize = Object.keys(require.cache).length;
  s.globalKeys = Reflect.ownKeys(globalThis).map(String).sort();
  s.stackTraceLimit = Error.stackTraceLimit;
  s.prepareStackTrace = getPrep();
  return s;
}

function sameDesc(a, b) {
  if (!a || !b) return a === b;
  return a.value === b.value && a.get === b.get && a.set === b.set &&
    a.writable === b.writable && a.enumerable === b.enumerable &&
    a.configurable === b.configurable;
}

function diff(label, before, after) {
  let changes = 0;
  const report = (msg) => { changes++; console.log('  [DIFF] ' + msg); };

  for (const [name] of Object.entries(targets)) {
    const b = before.targets[name];
    const a = after.targets[name];
    for (const k of a.keys()) if (!b.has(k)) report(name + ' added key: ' + k);
    for (const k of b.keys()) if (!a.has(k)) report(name + ' removed key: ' + k);
    for (const k of b.keys()) {
      if (a.has(k) && !sameDesc(b.get(k), a.get(k))) report(name + ' descriptor changed: ' + k);
    }
  }
  for (const k of Object.keys(before.ids)) {
    if (before.ids[k] !== after.ids[k]) report('identity changed: ' + k);
  }
  const je = (x) => JSON.stringify(x);
  if (je(before.extensionsKeys) !== je(after.extensionsKeys)) {
    report('require.extensions keys: ' + je(before.extensionsKeys) + ' -> ' + je(after.extensionsKeys));
  }
  if (je(before.cacheBuiltins) !== je(after.cacheBuiltins)) {
    report('require.cache node: entries: ' + je(after.cacheBuiltins));
  }
  const addedGlobals = after.globalKeys.filter((k) => !before.globalKeys.includes(k));
  const removedGlobals = before.globalKeys.filter((k) => !after.globalKeys.includes(k));
  if (addedGlobals.length) report('global keys added: ' + je(addedGlobals));
  if (removedGlobals.length) report('global keys removed: ' + je(removedGlobals));
  if (before.stackTraceLimit !== after.stackTraceLimit) {
    report('Error.stackTraceLimit: ' + before.stackTraceLimit + ' -> ' + after.stackTraceLimit);
  }
  if (before.prepareStackTrace !== after.prepareStackTrace) {
    report('Error.prepareStackTrace (steady-state): ' +
      String(before.prepareStackTrace) + ' -> ' + String(after.prepareStackTrace));
  }
  console.log(label + ': ' + changes + ' difference(s)' +
    ' (require.cache module count ' + before.cacheSize + ' -> ' + after.cacheSize + ')');
  return changes;
}

// ---------------------------------------------------------------------------
// Transparent accessor trap on Error.prepareStackTrace (records every write)
// ---------------------------------------------------------------------------

let phase = 'before-require';
let prepValue = Error.prepareStackTrace; // expected: undefined
const prepEvents = [];
function getPrep() { return prepValue; }

Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  enumerable: false,
  get() { return prepValue; },
  set(v) {
    prepEvents.push({
      phase,
      newValue: typeof v === 'function' ? 'function ' + (v.name || '<anonymous>') : String(v),
      stackTraceLimitAtWrite: Error.stackTraceLimit,
    });
    prepValue = v;
  },
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const s0 = snapshot();

  phase = 'require';
  const send = require(pkgRoot);
  phase = 'after-require';

  const s1 = snapshot();
  console.log('\n--- diff: before require -> after require(send) ---');
  const d1 = diff('require-phase', s0, s1);

  // Exercise: real HTTP server, send(req, path).pipe(res)
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'send-audit-b-'));
  fs.writeFileSync(path.join(fixtureDir, 'hello.txt'), 'hello world from the pass-b audit fixture\n');

  const instanceObservations = [];
  const server = http.createServer((req, res) => {
    send(req, req.url, { root: fixtureDir })
      .on('error', (err) => {
        res.statusCode = err.status || 500;
        res.end('err');
      })
      .pipe(res);
    res.on('close', () => {
      instanceObservations.push({
        url: req.url,
        resOwnAssignSocket: Object.prototype.hasOwnProperty.call(res, 'assignSocket'),
        resOwnOnFinished: Object.prototype.hasOwnProperty.call(res, '__onFinished'),
        reqOwnOnFinished: Object.prototype.hasOwnProperty.call(req, '__onFinished'),
      });
    });
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  function get(pathname, headers) {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: pathname, headers }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
      });
      req.on('error', reject);
    });
  }

  phase = 'exercise';
  const r200 = await get('/hello.txt');
  const r206 = await get('/hello.txt', { Range: 'bytes=0-4' });
  const r404 = await get('/missing.txt');
  phase = 'after-exercise';

  console.log('\n--- exercised runtime paths ---');
  console.log('GET /hello.txt            -> ' + r200.status +
    ' len=' + r200.body.length + ' etag=' + Boolean(r200.headers.etag) +
    ' accept-ranges=' + r200.headers['accept-ranges']);
  console.log('GET /hello.txt (Range 0-4)-> ' + r206.status +
    ' body="' + r206.body + '" content-range=' + r206.headers['content-range']);
  console.log('GET /missing.txt          -> ' + r404.status);

  server.close();
  fs.rmSync(fixtureDir, { recursive: true, force: true });

  const s2 = snapshot();
  console.log('\n--- diff: after require -> after serving 200/206/404 ---');
  const d2 = diff('exercise-phase', s1, s2);

  console.log('\n--- per-instance observations (served responses) ---');
  for (const o of instanceObservations) {
    console.log('  ' + o.url + ': res own "assignSocket"=' + o.resOwnAssignSocket +
      ' (true would mean on-finished patchAssignSocket fired)' +
      ', res own "__onFinished"=' + o.resOwnOnFinished +
      ' (library expando; true on streamed paths, false on the 404 path where the' +
      ' error listener short-circuits before onFinished attaches)');
  }

  console.log('\n--- Error.prepareStackTrace write trap log ---');
  if (prepEvents.length === 0) console.log('  (no writes observed)');
  for (const e of prepEvents) {
    console.log('  phase=' + e.phase + ' wrote ' + e.newValue +
      ' (Error.stackTraceLimit at write: ' + e.stackTraceLimitAtWrite + ')');
  }
  console.log('steady-state Error.prepareStackTrace: ' + String(prepValue));
  console.log('steady-state Error.stackTraceLimit: ' + Error.stackTraceLimit);

  console.log('\nSUMMARY: require-phase diffs=' + d1 + ', exercise-phase diffs=' + d2 +
    ', transient prepareStackTrace writes=' + prepEvents.length);
}

main().catch((err) => {
  console.error('repro failed: ' + err.message.replace(/\/[^\s"']+/g, '<path>'));
  process.exit(1);
});
