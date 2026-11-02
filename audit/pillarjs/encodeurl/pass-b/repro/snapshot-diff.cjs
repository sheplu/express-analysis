'use strict';
/*
 * Pass-B runtime reproduction for the encodeurl@3.0.0 patch audit.
 *
 * Usage: node snapshot-diff.cjs "$NPM_ARTIFACT"
 *   where $NPM_ARTIFACT is the extracted npm package directory
 *   (contains package.json with main -> dist/index.js).
 *
 * Snapshots Node/ECMAScript surfaces BEFORE requiring the artifact and
 * AFTER requiring + exercising encodeUrl, then diffs the snapshots.
 * Output is sanitized: the artifact path is printed as $NPM_ARTIFACT.
 * Exit code 0 = no mutation detected; 1 = mutation detected; 2 = usage error.
 */

const Module = require('module');

const artifactRoot = process.argv[2];
if (!artifactRoot) {
  console.error('usage: node snapshot-diff.cjs <npm-artifact-package-dir>');
  process.exit(2);
}

function sanitize(s) {
  return String(s).split(artifactRoot).join('$NPM_ARTIFACT');
}

function keyset(obj) {
  return Reflect.ownKeys(obj)
    .map((k) => (typeof k === 'symbol' ? k.toString() : k))
    .sort();
}

function descrSummary(obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d) return null;
  return {
    hasValue: 'value' in d,
    valueType: typeof d.value,
    writable: d.writable,
    enumerable: d.enumerable,
    configurable: d.configurable,
    get: typeof d.get,
    set: typeof d.set,
  };
}

function snapshot() {
  const execDesc = Object.getOwnPropertyDescriptor(RegExp.prototype, 'exec');
  const symReplDesc = Object.getOwnPropertyDescriptor(RegExp.prototype, Symbol.replace);
  return {
    refs: {
      encodeURI: encodeURI,
      encodeURIComponent: encodeURIComponent,
      decodeURI: decodeURI,
      'String.prototype.replace': String.prototype.replace,
      'RegExp.prototype.exec (descriptor value)': execDesc && execDesc.value,
      'RegExp.prototype[Symbol.replace] (descriptor value)': symReplDesc && symReplDesc.value,
      'Object.assign': Object.assign,
      'Module._load': Module._load,
      'Module._resolveFilename': Module._resolveFilename,
      'process.binding': process.binding,
    },
    keys: {
      'String.prototype own keys': keyset(String.prototype),
      'RegExp.prototype own keys': keyset(RegExp.prototype),
      'Object.prototype own keys': keyset(Object.prototype),
      'Array.prototype own keys': keyset(Array.prototype),
      'Function.prototype own keys': keyset(Function.prototype),
      'globalThis own keys': keyset(globalThis),
      'require.extensions keys': Object.keys(require.extensions).sort(),
      'require.cache keys (sanitized)': Object.keys(require.cache).map(sanitize).sort(),
    },
    descriptors: {
      'RegExp.prototype.exec': descrSummary(RegExp.prototype, 'exec'),
      'RegExp.prototype[Symbol.replace]': descrSummary(RegExp.prototype, Symbol.replace),
      'String.prototype.replace': descrSummary(String.prototype, 'replace'),
    },
  };
}

function diffSnapshots(before, after) {
  const problems = [];

  for (const name of Object.keys(before.refs)) {
    const same = before.refs[name] === after.refs[name];
    report('identity', name, same ? 'UNCHANGED' : 'MUTATED');
    if (!same) problems.push(`identity changed: ${name}`);
  }

  for (const name of Object.keys(before.keys)) {
    const b = before.keys[name];
    const a = after.keys[name];
    const added = a.filter((k) => !b.includes(k));
    const removed = b.filter((k) => !a.includes(k));
    // require.cache is EXPECTED to gain the artifact's own modules; anything
    // else (builtins like node:*, absolute core paths) is a finding.
    if (name === 'require.cache keys (sanitized)') {
      const unexpected = added.filter((k) => !k.startsWith('$NPM_ARTIFACT'));
      const builtinEntries = a.filter((k) => k.startsWith('node:'));
      report('keys', name, `added=${JSON.stringify(added)} removed=${JSON.stringify(removed)}`);
      report('keys', 'require.cache builtin (node:*) entries after', JSON.stringify(builtinEntries));
      if (unexpected.length || removed.length) {
        problems.push(`require.cache unexpected: added=${unexpected} removed=${removed}`);
      }
      continue;
    }
    if (added.length === 0 && removed.length === 0) {
      report('keys', name, 'UNCHANGED');
    } else {
      report('keys', name, `MUTATED added=${JSON.stringify(added)} removed=${JSON.stringify(removed)}`);
      problems.push(`key set changed: ${name}`);
    }
  }

  for (const name of Object.keys(before.descriptors)) {
    const b = JSON.stringify(before.descriptors[name]);
    const a = JSON.stringify(after.descriptors[name]);
    const same = b === a;
    report('descriptor', name, same ? `UNCHANGED ${b}` : `MUTATED before=${b} after=${a}`);
    if (!same) problems.push(`descriptor changed: ${name}`);
  }

  return problems;
}

function report(kind, name, detail) {
  console.log(`[${kind}] ${name}: ${sanitize(detail)}`);
}

function escapeNonAscii(s) {
  return s.replace(/[^\x20-\x7E]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase());
}

console.log(`node: ${process.version}`);
console.log('--- SNAPSHOT BEFORE require ---');
const before = snapshot();
console.log('snapshot taken');

console.log('--- require artifact ---');
const mod = require(artifactRoot); // package.json main -> dist/index.js (ESM, loaded via require(esm))
const encodeUrl = mod.encodeUrl;
console.log(`exports: ${sanitize(JSON.stringify(Object.keys(mod)))}`);
console.log(`typeof encodeUrl: ${typeof encodeUrl}`);

console.log('--- exercise encodeUrl ---');
const cases = {
  'plain (no encoding needed)': 'http://localhost/foo/bar.html?fizz=buzz#readme',
  'already encoded': 'http://example.com/a%20b?q=caf%C3%A9',
  'mixed raw + encoded': 'http://example.com/a%20b c<d>`{e}',
  'malformed percent (%foo, %2, trailing %)': 'http://example.com/%foo/%2/x%',
  'unpaired surrogate': 'http://example.com/\uD800foo\uDC00bar',
};
for (const [label, input] of Object.entries(cases)) {
  // call twice to exercise any shared-regex state across calls
  const out1 = encodeUrl(input);
  const out2 = encodeUrl(input);
  console.log(`  ${label}:`);
  console.log(`    in : ${escapeNonAscii(input)}`);
  console.log(`    out: ${escapeNonAscii(out1)}`);
  console.log(`    stable across repeat call: ${out1 === out2}`);
}

console.log('--- SNAPSHOT AFTER require + exercise ---');
const after = snapshot();
console.log('snapshot taken');

console.log('--- DIFF ---');
const problems = diffSnapshots(before, after);

console.log('--- RESULT ---');
if (problems.length === 0) {
  console.log('NO MUTATION DETECTED: all tracked identities, key sets, and descriptors unchanged.');
  process.exit(0);
} else {
  console.log(`MUTATIONS DETECTED (${problems.length}):`);
  for (const p of problems) console.log(`  - ${sanitize(p)}`);
  process.exit(1);
}
