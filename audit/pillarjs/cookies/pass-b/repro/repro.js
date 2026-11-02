'use strict'

/*
 * Pass B runtime reproduction for the cookies@0.9.2 patch audit.
 *
 * Usage: node repro.js "$PACKAGE_ROOT"
 *
 * Phases:
 *  0. Baseline snapshot of core surfaces (before any library code loads).
 *  1. Install set/get traps on Error.prepareStackTrace and Error.stackTraceLimit,
 *     require the library (import-time transient effects), remove traps.
 *  2. Snapshot after require.
 *  3. Exercise: real http server round trip — construct Cookies with keys,
 *     set a signed cookie, read it back and verify the signature. Then, with
 *     traps re-installed, exercise the deprecated keys-array constructor path
 *     to capture runtime transient effects of depd's getStack().
 *  4. Snapshot after exercise; diff all snapshots; write sanitized results.json.
 */

const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const crypto = require('crypto')
const Module = require('module')

const packageRoot = process.argv[2]
if (!packageRoot) {
  console.error('usage: node repro.js <package-root>')
  process.exit(1)
}

// ---------- identity registry and snapshots ----------

const tracked = [
  ['http.OutgoingMessage.prototype.setHeader', () => http.OutgoingMessage.prototype.setHeader],
  ['http.OutgoingMessage.prototype.getHeader', () => http.OutgoingMessage.prototype.getHeader],
  ['http.OutgoingMessage.prototype.removeHeader', () => http.OutgoingMessage.prototype.removeHeader],
  ['http.OutgoingMessage.prototype.end', () => http.OutgoingMessage.prototype.end],
  ['http.ServerResponse.prototype.writeHead', () => http.ServerResponse.prototype.writeHead],
  ['http.IncomingMessage.prototype.destroy', () => http.IncomingMessage.prototype.destroy],
  ['http.createServer', () => http.createServer],
  ['crypto.createHmac', () => crypto.createHmac],
  ['crypto.timingSafeEqual', () => crypto.timingSafeEqual],
  ['crypto.pseudoRandomBytes', () => crypto.pseudoRandomBytes],
  ['crypto.randomBytes', () => crypto.randomBytes],
  ['Object.assign', () => Object.assign],
  ['Module._load', () => Module._load],
  ['Module._resolveFilename', () => Module._resolveFilename],
  ['process.binding', () => { try { return process.binding } catch (e) { return undefined } }],
  ['Error.captureStackTrace', () => Error.captureStackTrace],
]

const baselineRefs = new Map()
for (const [name, get] of tracked) baselineRefs.set(name, get())

function descriptorOf (obj, prop) {
  const d = Object.getOwnPropertyDescriptor(obj, prop)
  if (!d) return null
  return {
    type: typeof d.value,
    fnName: typeof d.value === 'function' ? d.value.name : undefined,
    writable: d.writable,
    enumerable: d.enumerable,
    configurable: d.configurable,
    accessor: !!(d.get || d.set)
  }
}

function snapshot (label) {
  const identities = {}
  for (const [name, get] of tracked) {
    identities[name] = {
      sameAsBaseline: get() === baselineRefs.get(name),
      type: typeof get()
    }
  }
  return {
    label,
    identities,
    descriptors: {
      'http.OutgoingMessage.prototype.setHeader': descriptorOf(http.OutgoingMessage.prototype, 'setHeader'),
      'crypto.createHmac': descriptorOf(crypto, 'createHmac'),
      'Object.assign': descriptorOf(Object, 'assign'),
      'Error.prepareStackTrace': descriptorOf(Error, 'prepareStackTrace'),
      'Error.stackTraceLimit': descriptorOf(Error, 'stackTraceLimit')
    },
    errorState: {
      prepareStackTrace: typeof Error.prepareStackTrace === 'function'
        ? 'function:' + Error.prepareStackTrace.name
        : String(Error.prepareStackTrace),
      stackTraceLimit: Error.stackTraceLimit
    },
    protoKeys: {
      'Object.prototype': Object.getOwnPropertyNames(Object.prototype).sort(),
      'Array.prototype': Object.getOwnPropertyNames(Array.prototype).sort(),
      'String.prototype': Object.getOwnPropertyNames(String.prototype).sort(),
      'Function.prototype': Object.getOwnPropertyNames(Function.prototype).sort(),
      'Error.prototype': Object.getOwnPropertyNames(Error.prototype).sort(),
      'Error (constructor own props)': Object.getOwnPropertyNames(Error).sort(),
      'http.OutgoingMessage.prototype': Object.getOwnPropertyNames(http.OutgoingMessage.prototype).sort(),
      'http.IncomingMessage.prototype': Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort()
    },
    requireExtensions: Object.keys(require.extensions).sort(),
    requireCache: {
      count: Object.keys(require.cache).length,
      builtinStyleEntries: Object.keys(require.cache).filter(k => k.startsWith('node:') || !k.includes(path.sep)).sort(),
      entries: Object.keys(require.cache).sort()
    },
    globalKeys: Object.getOwnPropertyNames(globalThis).sort()
  }
}

// ---------- traps for transient global writes ----------

// Trap notes:
// - Error.prepareStackTrace can be trapped with an accessor: both Node's
//   realm prepareStackTraceCallback ($NODEJS_SOURCE lib/internal/errors.js)
//   and depd read/write it with ordinary property access.
// - Error.stackTraceLimit CANNOT be trapped with an accessor: V8 reads it as
//   a data property only (verified separately: with an accessor installed,
//   Error.captureStackTrace leaves `stack` undefined). Instead we set a
//   sentinel value (3) and wrap Error.captureStackTrace to sample the limit
//   that is in force at each capture, which exposes depd's transient
//   `Math.max(10, limit)` write and its restoration.
const LIMIT_SENTINEL = 3

function installErrorTraps (log) {
  const savedPrepDesc = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
  const savedLimit = Error.stackTraceLimit
  const savedCapture = Error.captureStackTrace
  let prepValue = Error.prepareStackTrace

  Object.defineProperty(Error, 'prepareStackTrace', {
    configurable: true,
    get () { return prepValue },
    set (v) {
      log.push({
        prop: 'Error.prepareStackTrace',
        op: 'set',
        newValue: typeof v === 'function' ? 'function:' + v.name : String(v)
      })
      prepValue = v
    }
  })

  Error.stackTraceLimit = LIMIT_SENTINEL
  Error.captureStackTrace = function captureStackTrace (obj, opt) {
    log.push({
      prop: 'Error.captureStackTrace',
      op: 'call',
      stackTraceLimitInForce: Error.stackTraceLimit
    })
    // pass the wrapper as constructorOpt so this extra frame is omitted and
    // the captured stack is identical to an unwrapped capture
    return opt === undefined ? savedCapture(obj, captureStackTrace) : savedCapture(obj, opt)
  }

  return function removeTraps () {
    delete Error.prepareStackTrace
    // restore original descriptor shape, but keep the final value the trapped
    // code left behind (so an unrestored write would remain visible)
    if (savedPrepDesc) {
      if ('value' in savedPrepDesc) savedPrepDesc.value = prepValue
      Object.defineProperty(Error, 'prepareStackTrace', savedPrepDesc)
    } else if (prepValue !== undefined) {
      Error.prepareStackTrace = prepValue
    }
    log.push({
      prop: 'Error.stackTraceLimit',
      op: 'final-observed-value (sentinel was ' + LIMIT_SENTINEL + ')',
      value: Error.stackTraceLimit,
      restoredBySubject: Error.stackTraceLimit === LIMIT_SENTINEL
    })
    Error.stackTraceLimit = savedLimit
    Error.captureStackTrace = savedCapture
  }
}

// ---------- diff helpers ----------

function diffArrays (a, b) {
  const sa = new Set(a); const sb = new Set(b)
  return {
    added: b.filter(x => !sa.has(x)),
    removed: a.filter(x => !sb.has(x))
  }
}

function diffSnapshots (before, after) {
  const out = { identityChanges: [], protoKeyChanges: {}, errorState: {}, globalKeyChanges: null, requireExtensionsChanges: null }
  for (const name of Object.keys(before.identities)) {
    if (before.identities[name].sameAsBaseline !== after.identities[name].sameAsBaseline) {
      out.identityChanges.push(name)
    }
  }
  for (const proto of Object.keys(before.protoKeys)) {
    const d = diffArrays(before.protoKeys[proto], after.protoKeys[proto])
    if (d.added.length || d.removed.length) out.protoKeyChanges[proto] = d
  }
  out.errorState = {
    prepareStackTrace: [before.errorState.prepareStackTrace, after.errorState.prepareStackTrace],
    stackTraceLimit: [before.errorState.stackTraceLimit, after.errorState.stackTraceLimit],
    changed: before.errorState.prepareStackTrace !== after.errorState.prepareStackTrace ||
             before.errorState.stackTraceLimit !== after.errorState.stackTraceLimit
  }
  const g = diffArrays(before.globalKeys, after.globalKeys)
  out.globalKeyChanges = (g.added.length || g.removed.length) ? g : 'none'
  const e = diffArrays(before.requireExtensions, after.requireExtensions)
  out.requireExtensionsChanges = (e.added.length || e.removed.length) ? e : 'none'
  out.requireCacheBuiltinEntries = [before.requireCache.builtinStyleEntries, after.requireCache.builtinStyleEntries]
  out.requireCacheAddedEntries = diffArrays(before.requireCache.entries, after.requireCache.entries).added
  return out
}

// ---------- main ----------

async function main () {
  const results = { nodeVersion: process.version, phases: {} }

  // Phase 0: baseline
  const snapBefore = snapshot('before-require')

  // Phase 1: require with traps installed (import-time transient effects)
  const importTrapLog = []
  let removeTraps = installErrorTraps(importTrapLog)
  const Cookies = require(packageRoot)
  removeTraps()
  results.phases.importTimeTrapLog = importTrapLog

  // Phase 2: snapshot after require
  const snapAfterRequire = snapshot('after-require')

  // Phase 3a: exercise — real http round trip with signed cookies
  const exercise = { setCookieHeaders: null, roundTrip: null, verified: null }
  await new Promise((resolve, reject) => {
    const keys = ['pass-b-secret-key-1', 'pass-b-secret-key-2']
    const server = http.createServer((req, res) => {
      const cookies = new Cookies(req, res, { keys })
      if (req.url === '/set') {
        cookies.set('session', 'value123', { signed: true, httpOnly: true })
        res.end('ok')
      } else {
        const value = cookies.get('session', { signed: true })
        res.end(String(value))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      http.get({ host: '127.0.0.1', port, path: '/set' }, (res1) => {
        exercise.setCookieHeaders = res1.headers['set-cookie']
        res1.resume()
        res1.on('end', () => {
          const cookieHeader = (res1.headers['set-cookie'] || [])
            .map(c => c.split(';')[0]).join('; ')
          http.get({ host: '127.0.0.1', port, path: '/get', headers: { cookie: cookieHeader } }, (res2) => {
            let body = ''
            res2.on('data', d => { body += d })
            res2.on('end', () => {
              exercise.roundTrip = body
              exercise.verified = body === 'value123'
              server.close(resolve)
            })
          }).on('error', reject)
        })
      }).on('error', reject)
    })
    server.on('error', reject)
  })
  results.phases.httpExercise = exercise

  // Phase 3b: deprecated keys-array constructor, with traps re-installed,
  // to capture runtime (post-import) transient global writes by depd.
  const runtimeTrapLog = []
  const deprecations = []
  const onDep = (err) => deprecations.push(err.namespace + ': ' + err.message)
  process.on('deprecation', onDep) // routes depd output to an event, keeps stderr clean
  removeTraps = installErrorTraps(runtimeTrapLog)
  const fakeReq = { headers: {}, socket: { encrypted: false } }
  const fakeRes = { getHeader () {}, setHeader () {} }
  // eslint-disable-next-line no-new
  new Cookies(fakeReq, fakeRes, ['deprecated-key-array']) // triggers depd log -> getStack()
  removeTraps()
  process.removeListener('deprecation', onDep)
  results.phases.runtimeTrapLog = runtimeTrapLog
  results.phases.deprecationsEmitted = deprecations

  // Phase 4: snapshot after exercise and diffs
  const snapAfterExercise = snapshot('after-exercise')

  results.snapshots = {
    before: snapBefore,
    afterRequire: snapAfterRequire,
    afterExercise: snapAfterExercise
  }
  results.diffs = {
    beforeVsAfterRequire: diffSnapshots(snapBefore, snapAfterRequire),
    afterRequireVsAfterExercise: diffSnapshots(snapAfterRequire, snapAfterExercise),
    beforeVsAfterExercise: diffSnapshots(snapBefore, snapAfterExercise)
  }

  // Trim bulky raw lists from saved snapshots (keep diffs + counts)
  for (const s of Object.values(results.snapshots)) {
    s.requireCache = { count: s.requireCache.count, builtinStyleEntries: s.requireCache.builtinStyleEntries }
    delete s.protoKeys
    delete s.globalKeys
    delete s.requireExtensions
  }

  // ---------- sanitize and write ----------
  let json = JSON.stringify(results, null, 2)
  const home = os.homedir()
  json = json.split(packageRoot).join('$PACKAGE_ROOT')
  json = json.split(__dirname).join('$REPRO_DIR')
  json = json.split(home).join('~')
  const user = os.userInfo().username
  json = json.split(user).join('<user>')
  fs.writeFileSync(path.join(__dirname, 'results.json'), json + '\n')

  // Console summary (sanitized)
  console.log('node:', process.version)
  console.log('import-time trap events:', importTrapLog.length)
  console.log(importTrapLog.map(e => `  set ${e.prop} -> ${e.newValue}`).join('\n'))
  console.log('runtime (deprecated path) trap events:', runtimeTrapLog.length)
  console.log(runtimeTrapLog.map(e => `  set ${e.prop} -> ${e.newValue}`).join('\n'))
  console.log('deprecations emitted:', deprecations.length)
  console.log('signed cookie round trip verified:', exercise.verified)
  console.log('set-cookie headers:', JSON.stringify(exercise.setCookieHeaders))
  console.log('identity changes before->afterExercise:',
    JSON.stringify(results.diffs.beforeVsAfterExercise.identityChanges))
  console.log('proto key changes before->afterExercise:',
    JSON.stringify(results.diffs.beforeVsAfterExercise.protoKeyChanges))
  console.log('Error state before/afterRequire/afterExercise:',
    JSON.stringify([snapBefore.errorState, snapAfterRequire.errorState, snapAfterExercise.errorState]))
  console.log('global key changes:', JSON.stringify(results.diffs.beforeVsAfterExercise.globalKeyChanges))
  console.log('require.extensions changes:', JSON.stringify(results.diffs.beforeVsAfterExercise.requireExtensionsChanges))
  console.log('builtin-style require.cache entries:', JSON.stringify(snapAfterExercise.requireCache.builtinStyleEntries))
  console.log('results written to results.json')
}

main().catch(err => {
  console.error('repro failed:', err && err.message)
  process.exit(1)
})
