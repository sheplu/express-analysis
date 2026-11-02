/*
 * Pass B reproduction: does require('resolve-path') (+ deps) patch Node.js core?
 *
 * Usage: node repro.js "$PACKAGE_ROOT"
 *   $PACKAGE_ROOT = root of the resolve-path checkout (contains index.js and
 *   node_modules with the resolved runtime deps).
 *
 * Snapshots shared core/global state BEFORE requiring the library, installs an
 * accessor trap on Error.prepareStackTrace / Error.stackTraceLimit to catch
 * transient swaps during require, then requires + exercises representative
 * paths and diffs AFTER state. Output is sanitized: the package root is
 * printed as $PACKAGE_ROOT and the home directory as $HOME.
 */

'use strict'

const Module = require('module')
const path = require('path')

const PACKAGE_ROOT = process.argv[2]
if (!PACKAGE_ROOT) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"')
  process.exit(1)
}

const HOME = process.env.HOME || ''
function sanitize (s) {
  let out = String(s).split(PACKAGE_ROOT).join('$PACKAGE_ROOT')
  if (HOME) out = out.split(HOME).join('$HOME')
  return out
}

function names (obj) {
  return Object.getOwnPropertyNames(obj).sort()
}

function descr (obj, prop) {
  const d = Object.getOwnPropertyDescriptor(obj, prop)
  if (!d) return 'ABSENT'
  return {
    hasValue: 'value' in d,
    valueType: 'value' in d ? typeof d.value : undefined,
    get: typeof d.get,
    set: typeof d.set,
    writable: d.writable,
    enumerable: d.enumerable,
    configurable: d.configurable
  }
}

function snapshot (label) {
  return {
    label,
    nodeVersion: process.version,
    errorPrepareStackTrace: {
      value: Error.prepareStackTrace,
      type: typeof Error.prepareStackTrace
    },
    errorStackTraceLimit: Error.stackTraceLimit,
    protoKeys: {
      Error: names(Error.prototype),
      Object: names(Object.prototype),
      Array: names(Array.prototype),
      String: names(String.prototype),
      Function: names(Function.prototype)
    },
    errorCtorKeys: names(Error),
    pathKeys: names(path),
    pathIdentities: {
      isAbsolute: path.isAbsolute,
      join: path.join,
      normalize: path.normalize,
      resolve: path.resolve,
      relative: path.relative,
      sep: path.sep
    },
    objectAssign: Object.assign,
    objectSetPrototypeOf: Object.setPrototypeOf,
    moduleLoad: Module._load,
    moduleResolveFilename: Module._resolveFilename,
    requireExtensions: Object.keys(require.extensions).sort(),
    requireCacheKeys: Object.keys(require.cache).map(sanitize).sort(),
    processBinding: process.binding,
    processBindingType: typeof process.binding,
    globalKeys: names(globalThis)
  }
}

function diffSnapshots (a, b) {
  const diffs = []
  function cmpArr (name, x, y) {
    const added = y.filter((k) => !x.includes(k))
    const removed = x.filter((k) => !y.includes(k))
    if (added.length || removed.length) {
      diffs.push(`${name}: added=[${added}] removed=[${removed}]`)
    }
  }
  if (a.errorPrepareStackTrace.value !== b.errorPrepareStackTrace.value) {
    diffs.push(`Error.prepareStackTrace identity changed: ${a.errorPrepareStackTrace.type} -> ${b.errorPrepareStackTrace.type}`)
  }
  if (a.errorStackTraceLimit !== b.errorStackTraceLimit) {
    diffs.push(`Error.stackTraceLimit changed: ${a.errorStackTraceLimit} -> ${b.errorStackTraceLimit}`)
  }
  for (const p of Object.keys(a.protoKeys)) cmpArr(`${p}.prototype keys`, a.protoKeys[p], b.protoKeys[p])
  cmpArr('Error ctor own keys', a.errorCtorKeys, b.errorCtorKeys)
  cmpArr('path module keys', a.pathKeys, b.pathKeys)
  for (const k of Object.keys(a.pathIdentities)) {
    if (a.pathIdentities[k] !== b.pathIdentities[k]) diffs.push(`path.${k} identity changed`)
  }
  if (a.objectAssign !== b.objectAssign) diffs.push('Object.assign identity changed')
  if (a.objectSetPrototypeOf !== b.objectSetPrototypeOf) diffs.push('Object.setPrototypeOf identity changed')
  if (a.moduleLoad !== b.moduleLoad) diffs.push('Module._load identity changed')
  if (a.moduleResolveFilename !== b.moduleResolveFilename) diffs.push('Module._resolveFilename identity changed')
  cmpArr('require.extensions keys', a.requireExtensions, b.requireExtensions)
  if (a.processBinding !== b.processBinding) diffs.push('process.binding identity changed')
  cmpArr('global keys', a.globalKeys, b.globalKeys)
  const cacheAdded = b.requireCacheKeys.filter((k) => !a.requireCacheKeys.includes(k))
  const cacheBuiltin = cacheAdded.filter((k) => !k.startsWith('$PACKAGE_ROOT') && !k.startsWith('$HOME'))
  diffs.push(`require.cache: ${cacheAdded.length} new entries, ${cacheBuiltin.length} outside $PACKAGE_ROOT/$HOME: [${cacheBuiltin}]`)
  return diffs
}

// ---------------------------------------------------------------------------
// Accessor trap to observe transient swaps during require.
//
// NOTE: Error.stackTraceLimit cannot be trapped with an accessor: V8 reads it
// through a data-property fast path, and an accessor disables stack capture
// entirely (obj.stack becomes undefined), which crashes depd's own detection.
// Instead, each SET of Error.prepareStackTrace also records the live value of
// Error.stackTraceLimit; depd swaps prepareStackTrace first and restores it
// first, so the limit logged at a restore event is the transient value.
// ---------------------------------------------------------------------------
const trapLog = []
function installTrap (prop, initial) {
  let current = initial
  Object.defineProperty(Error, prop, {
    configurable: true,
    enumerable: false,
    get () { return current },
    set (v) {
      trapLog.push(
        `SET Error.${prop} = ${typeof v === 'function' ? 'function ' + (v.name || '<anon>') : JSON.stringify(v)}` +
        ` | Error.stackTraceLimit at this moment = ${Error.stackTraceLimit}`
      )
      current = v
    }
  })
  return () => {
    Object.defineProperty(Error, prop, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: current
    })
    return current
  }
}

console.log('Node runtime:', process.version)
console.log('descriptor(Error, prepareStackTrace) BEFORE:', JSON.stringify(descr(Error, 'prepareStackTrace')))
console.log('descriptor(Error, stackTraceLimit) BEFORE:', JSON.stringify(descr(Error, 'stackTraceLimit')))

const before = snapshot('before-require')

const restorePrep = installTrap('prepareStackTrace', Error.prepareStackTrace)
const limitBefore = Error.stackTraceLimit

// ---------------------------------------------------------------------------
// Require the library (traps active)
// ---------------------------------------------------------------------------
trapLog.push('--- require(resolve-path) begins ---')
const resolvePath = require(PACKAGE_ROOT)
trapLog.push('--- require(resolve-path) done ---')

// ---------------------------------------------------------------------------
// Exercise representative paths (traps still active to catch runtime swaps)
// ---------------------------------------------------------------------------
const createError = require(path.join(PACKAGE_ROOT, 'node_modules', 'http-errors'))
const results = []

trapLog.push('--- exercise begins ---')
try {
  const ok = resolvePath(PACKAGE_ROOT, 'index.js')
  results.push('success case: resolved to ' + sanitize(ok))
} catch (e) {
  results.push('success case UNEXPECTED throw: ' + e.message)
}

for (const [label, arg] of [
  ['traversal ../x', '../x'],
  ['NUL byte a\\0b', 'a\u0000b'],
  ['absolute /etc/passwd', '/etc/passwd']
]) {
  try {
    resolvePath(PACKAGE_ROOT, arg)
    results.push(label + ': UNEXPECTED success')
  } catch (e) {
    results.push(
      label + ': threw name=' + e.name +
      ' status=' + e.status +
      ' statusCode=' + e.statusCode +
      ' msg=' + JSON.stringify(e.message) +
      ' ctor=' + (e.constructor && e.constructor.name) +
      ' instanceof HttpError=' + (e instanceof createError.HttpError) +
      ' instanceof Error=' + (e instanceof Error) +
      ' Object.getPrototypeOf(err)===createError[' + (e.status || '?') + '].prototype=' +
      (Object.getPrototypeOf(e) === (createError[e.status] && createError[e.status].prototype))
    )
  }
}
trapLog.push('--- exercise done ---')

// Dependency-specific identity checks
const spo = require(path.join(PACKAGE_ROOT, 'node_modules', 'setprototypeof'))
const pia = require(path.join(PACKAGE_ROOT, 'node_modules', 'path-is-absolute'))
results.push('setprototypeof export === Object.setPrototypeOf (native reference, no wrap): ' + (spo === Object.setPrototypeOf))
results.push('path-is-absolute export === path.isAbsolute (should be false; ponyfill): ' + (pia === path.isAbsolute))
results.push('path.isAbsolute identity unchanged after requiring path-is-absolute: ' + (path.isAbsolute === before.pathIdentities.isAbsolute))

// Remove trap, restore plain data property
const finalPrep = restorePrep()
const finalLimit = Error.stackTraceLimit

const after = snapshot('after-require-and-exercise')

console.log('\n=== Accessor trap log (transient swaps observed) ===')
for (const line of trapLog) console.log(sanitize(line))

console.log('\n=== Exercise results ===')
for (const line of results) console.log(sanitize(line))

console.log('\n=== Final values after restore ===')
console.log('Error.prepareStackTrace:', typeof finalPrep, '(before:', before.errorPrepareStackTrace.type + ')')
console.log('Error.stackTraceLimit:', finalLimit, '(before:', limitBefore + ')')
console.log('descriptor(Error, prepareStackTrace) AFTER:', JSON.stringify(descr(Error, 'prepareStackTrace')))
console.log('descriptor(Error, stackTraceLimit) AFTER:', JSON.stringify(descr(Error, 'stackTraceLimit')))

console.log('\n=== Snapshot diff (before-require vs after-require-and-exercise) ===')
const diffs = diffSnapshots(before, after)
if (diffs.length === 0) console.log('NO DIFFERENCES')
for (const d of diffs) console.log(sanitize(d))
