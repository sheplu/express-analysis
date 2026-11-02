// Pass-B runtime reproduction for the hbs@4.4.0 Node.js patch audit.
// Usage: node check.js "$PACKAGE_ROOT"
// Snapshots core surfaces BEFORE require('hbs') and AFTER requiring it and
// exercising a representative runtime path (register helpers/async helper,
// registerPartials via walk, render a view with layout + partial twice via
// the express-engine API hbs.__express), then prints a sanitized diff.
'use strict';

const path = require('path');
const Module = require('module');

const PKG = process.argv[2];
if (!PKG) {
  console.error('usage: node check.js "$PACKAGE_ROOT"');
  process.exit(2);
}
const REPRO = __dirname;

function sanitize(s) {
  return String(s)
    .split(PKG).join('$PACKAGE_ROOT')
    .split(REPRO).join('$REPRO');
}

// --- snapshot machinery -----------------------------------------------------
const fs = require('fs');
const http = require('http');
const stream = require('stream');
const events = require('events');
const util = require('util');

// Identity-tracked core references (captured once, compared by === later).
const tracked = {
  'fs.readFile': () => fs.readFile,
  'fs.readFileSync': () => fs.readFileSync,
  'fs.stat': () => fs.stat,
  'fs.promises.readFile': () => fs.promises.readFile,
  'fs.ReadStream': () => fs.ReadStream,
  'http.createServer': () => http.createServer,
  'http.ServerResponse.prototype.end': () => http.ServerResponse.prototype.end,
  'http.IncomingMessage.prototype._read': () => http.IncomingMessage.prototype._read,
  'stream.Readable.prototype.pipe': () => stream.Readable.prototype.pipe,
  'stream.Writable.prototype.write': () => stream.Writable.prototype.write,
  'events.EventEmitter.prototype.emit': () => events.EventEmitter.prototype.emit,
  'events.EventEmitter.prototype.on': () => events.EventEmitter.prototype.on,
  'util.inherits': () => util.inherits,
  'path.join': () => path.join,
  'Object.assign': () => Object.assign,
  'Object.defineProperty': () => Object.defineProperty,
  'Function.prototype.bind': () => Function.prototype.bind,
  'Function.prototype.call': () => Function.prototype.call,
  'Array.prototype.slice': () => Array.prototype.slice,
  'Array.prototype.forEach': () => Array.prototype.forEach,
  'String.prototype.replace': () => String.prototype.replace,
  'JSON.stringify': () => JSON.stringify,
  'Module._load': () => Module._load,
  'Module._resolveFilename': () => Module._resolveFilename,
  'Module._compile (prototype)': () => Module.prototype._compile,
  'Module.prototype.require': () => Module.prototype.require,
  'process.nextTick': () => process.nextTick,
  'process.binding': () => { try { return process.binding; } catch (e) { return 'unavailable'; } },
};
const baseline = {};
for (const k of Object.keys(tracked)) baseline[k] = tracked[k]();

function descriptorSig(obj, prop) {
  const d = Object.getOwnPropertyDescriptor(obj, prop);
  if (!d) return 'absent';
  return JSON.stringify({
    writable: d.writable, enumerable: d.enumerable, configurable: d.configurable,
    get: !!d.get, set: !!d.set, valueType: typeof d.value,
  });
}

function snapshot() {
  const extKeys = Object.keys(require.extensions).sort();
  return {
    identities: Object.fromEntries(
      Object.keys(tracked).map((k) => [k, tracked[k]() === baseline[k]])
    ),
    descriptors: {
      'fs.readFile': descriptorSig(fs, 'readFile'),
      'fs.readFileSync': descriptorSig(fs, 'readFileSync'),
      'stream.Readable.prototype.pipe': descriptorSig(stream.Readable.prototype, 'pipe'),
      'http.ServerResponse.prototype.end': descriptorSig(http.ServerResponse.prototype, 'end'),
      'Object.assign': descriptorSig(Object, 'assign'),
      'Array.prototype.forEach': descriptorSig(Array.prototype, 'forEach'),
    },
    protoKeys: {
      'Object.prototype': Object.getOwnPropertyNames(Object.prototype).sort(),
      'Array.prototype': Object.getOwnPropertyNames(Array.prototype).sort(),
      'String.prototype': Object.getOwnPropertyNames(String.prototype).sort(),
      'Function.prototype': Object.getOwnPropertyNames(Function.prototype).sort(),
    },
    requireExtensions: extKeys,
    requireExtensionsIsModuleExtensions: require.extensions === Module._extensions,
    moduleExtensions: Object.keys(Module._extensions).sort(),
    requireCacheBuiltinish: Object.keys(require.cache)
      .filter((k) => k.startsWith('node:') || !path.isAbsolute(k))
      .sort(),
    requireCacheSize: Object.keys(require.cache).length,
    globalKeys: Object.getOwnPropertyNames(globalThis).sort(),
    processBindingType: (() => { try { return typeof process.binding; } catch (e) { return 'throws'; } })(),
  };
}

function diffArrays(name, a, b, out) {
  const A = new Set(a); const B = new Set(b);
  const added = b.filter((x) => !A.has(x));
  const removed = a.filter((x) => !B.has(x));
  if (added.length || removed.length) {
    out.push(`  ${name}: +[${added.join(', ')}] -[${removed.join(', ')}]`);
  }
}

function diff(before, after) {
  const out = [];
  for (const k of Object.keys(before.identities)) {
    if (before.identities[k] !== after.identities[k] || after.identities[k] !== true) {
      out.push(`  identity changed: ${k} (same-as-baseline: ${after.identities[k]})`);
    }
  }
  for (const k of Object.keys(before.descriptors)) {
    if (before.descriptors[k] !== after.descriptors[k]) {
      out.push(`  descriptor changed: ${k}: ${before.descriptors[k]} -> ${after.descriptors[k]}`);
    }
  }
  for (const k of Object.keys(before.protoKeys)) {
    diffArrays(`${k} own keys`, before.protoKeys[k], after.protoKeys[k], out);
  }
  diffArrays('require.extensions keys', before.requireExtensions, after.requireExtensions, out);
  diffArrays('Module._extensions keys', before.moduleExtensions, after.moduleExtensions, out);
  if (before.requireExtensionsIsModuleExtensions !== after.requireExtensionsIsModuleExtensions) {
    out.push(`  require.extensions===Module._extensions: ${before.requireExtensionsIsModuleExtensions} -> ${after.requireExtensionsIsModuleExtensions}`);
  }
  diffArrays('require.cache builtin-like keys', before.requireCacheBuiltinish, after.requireCacheBuiltinish, out);
  out.push(`  require.cache size: ${before.requireCacheSize} -> ${after.requireCacheSize} (new entries all under $PACKAGE_ROOT: ${newCacheEntriesOk()})`);
  diffArrays('globalThis own keys', before.globalKeys, after.globalKeys, out);
  if (before.processBindingType !== after.processBindingType) {
    out.push(`  typeof process.binding: ${before.processBindingType} -> ${after.processBindingType}`);
  }
  return out;
}

let cacheKeysBefore = null;
function newCacheEntriesOk() {
  const now = Object.keys(require.cache);
  const added = now.filter((k) => !cacheKeysBefore.includes(k));
  return added.every((k) => k.startsWith(PKG)) ? 'yes' : 'NO: ' + sanitize(added.filter((k) => !k.startsWith(PKG)).join(', '));
}

// --- run ---------------------------------------------------------------------
console.log('node', process.version);
const before = snapshot();
cacheKeysBefore = Object.keys(require.cache);
console.log('BEFORE require.extensions keys:', before.requireExtensions.join(', '));

const hbs = require(PKG); // resolves package.json main -> lib/hbs.js

const afterRequire = snapshot();
console.log('AFTER-REQUIRE require.extensions keys:', afterRequire.requireExtensions.join(', '));
console.log('\n=== DIFF after require("hbs") (before any rendering) ===');
const d1 = diff(before, afterRequire);
console.log(d1.length ? d1.map(sanitize).join('\n') : '  (no differences)');

// Exercise a representative express-engine runtime path.
hbs.registerHelper('shout', function (v) { return String(v).toUpperCase(); });
hbs.registerAsyncHelper('later', function (opts, cb) {
  setImmediate(function () { cb('async-value'); });
});

const views = path.join(REPRO, 'fixtures', 'views');
const renderOpts = {
  user: 'world',
  cache: true,
  layout: 'layout',
  settings: { views: views },
};

hbs.registerPartials(path.join(REPRO, 'fixtures', 'partials'), function () {
  hbs.__express(path.join(views, 'index.hbs'), renderOpts, function (err, html) {
    if (err) { console.error('render error:', sanitize(err.message)); process.exit(1); }
    // second render hits the template cache path
    hbs.__express(path.join(views, 'index.hbs'), renderOpts, function (err2, html2) {
      if (err2) { console.error('render error:', sanitize(err2.message)); process.exit(1); }
      console.log('\nrendered output 1:', sanitize(html.trim()));
      console.log('rendered output 2 (cached):', sanitize(html2.trim()));
      const after = snapshot();
      console.log('\n=== DIFF after require + render (vs before) ===');
      const d2 = diff(before, after);
      console.log(d2.length ? d2.map(sanitize).join('\n') : '  (no differences)');
      // Demonstrate the behavioral effect of the require.extensions mutation:
      let loaded;
      try {
        const tpl = require(path.join(views, 'plain.hbs'));
        loaded = 'require("<views>/plain.hbs") now returns typeof ' + typeof tpl +
          '; rendered via required template: ' + sanitize(tpl({ user: 'via-require' }).trim());
      } catch (e) {
        loaded = 'require of .hbs file failed: ' + sanitize(e.message);
      }
      console.log('\n=== Behavioral check (core module loading) ===');
      console.log(' ', loaded);
    });
  });
});
