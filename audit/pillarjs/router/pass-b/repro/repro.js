'use strict'

/*
 * Pass B runtime reproduction for the router@2.2.0 patch audit.
 *
 * Usage: node repro.js "$PACKAGE_ROOT"
 *
 * Snapshots Node core surfaces BEFORE requiring the library, AFTER require,
 * and AFTER exercising representative routing paths over a real HTTP server:
 *   - http IncomingMessage/ServerResponse/OutgoingMessage prototype members
 *     (names + function identities)
 *   - EventEmitter prototype
 *   - Error.prepareStackTrace (accessor trap records every write, with phase
 *     labels, to show exactly when swaps fire)
 *   - Error.stackTraceLimit: an accessor trap is NOT usable here -- V8 reads
 *     stackTraceLimit as a data property only (GetDataProperty), so an
 *     accessor silently disables stack capture; a first run with such a trap
 *     crashed inside depd getStack at require(router) time
 *     (depd/index.js:393 "Cannot read properties of undefined (reading
 *     'slice')"), which is itself runtime proof that getStack executes during
 *     require. Instead, a harness wrapper around Error.captureStackTrace
 *     records the stackTraceLimit/prepareStackTrace values observed mid-swap,
 *     and snapshots record the value before require / after require /
 *     after exercise (restoration check).
 *   - Object/Array/String/Function prototype own property names
 *   - Object.assign / Object.setPrototypeOf / Object.defineProperty,
 *     Module._load, Module._resolveFilename, process.binding,
 *     Error.captureStackTrace identities
 *   - require.extensions keys, require.cache builtin ("node:*") entries
 *   - globalThis own property names
 * It also records own properties appearing on req/res instances during and
 * after dispatch (params/baseUrl/next/_parsedUrl etc.).
 *
 * Output: results.json next to this script, sanitized of machine paths.
 */

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const http = require('node:http')
const events = require('node:events')
const Module = require('node:module')

const pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro.js <package-root>')
  process.exit(2)
}

const out = {
  node: process.version,
  trapEvents: [],
  snapshots: {},
  diffs: {},
  exercise: {}
}

let phase = 'pre-require'

// ---------------------------------------------------------------------------
// Error.prepareStackTrace / Error.stackTraceLimit write trap
// ---------------------------------------------------------------------------

let rawPST = Error.prepareStackTrace

function describeVal (v) {
  if (typeof v === 'function') return 'function:' + (v.name || '<anonymous>')
  return String(v)
}

Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  enumerable: false,
  get () { return rawPST },
  set (v) {
    out.trapEvents.push({
      phase,
      prop: 'Error.prepareStackTrace',
      from: describeVal(rawPST),
      to: describeVal(v),
      stackTraceLimitNow: Error.stackTraceLimit
    })
    rawPST = v
  }
})

// Harness-owned wrapper (installed before ALL snapshots, removed after all
// diffs, so it never shows up as a spurious identity change): records the
// Error.stackTraceLimit / Error.prepareStackTrace values observed at each
// Error.captureStackTrace call, i.e. mid-swap when depd getStack runs.
const realCaptureStackTrace = Error.captureStackTrace
Error.captureStackTrace = function captureStackTraceProbe (...args) {
  out.trapEvents.push({
    phase,
    prop: 'Error.captureStackTrace invoked',
    stackTraceLimitNow: Error.stackTraceLimit,
    prepareStackTraceNow: describeVal(rawPST)
  })
  return realCaptureStackTrace.apply(Error, args)
}

function removeTraps () {
  Object.defineProperty(Error, 'prepareStackTrace', {
    configurable: true, enumerable: false, writable: true, value: rawPST
  })
  Error.captureStackTrace = realCaptureStackTrace
}

// ---------------------------------------------------------------------------
// Snapshot machinery (identities kept in memory, only diffs serialized)
// ---------------------------------------------------------------------------

function protoSnapshot (obj) {
  const names = Object.getOwnPropertyNames(obj).sort()
  const map = new Map()
  for (const n of names) {
    const d = Object.getOwnPropertyDescriptor(obj, n)
    map.set(n, d && ('value' in d ? d.value : d.get))
  }
  return { names, map }
}

const identityNames = [
  'Object.assign', 'Object.setPrototypeOf', 'Object.defineProperty',
  'Module._load', 'Module._resolveFilename', 'process.binding',
  'Error.captureStackTrace'
]

function identitySnapshot () {
  return new Map([
    ['Object.assign', Object.assign],
    ['Object.setPrototypeOf', Object.setPrototypeOf],
    ['Object.defineProperty', Object.defineProperty],
    ['Module._load', Module._load],
    ['Module._resolveFilename', Module._resolveFilename],
    ['process.binding', process.binding],
    ['Error.captureStackTrace', Error.captureStackTrace]
  ])
}

const protoTargets = () => ({
  'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
  'http.ServerResponse.prototype': http.ServerResponse.prototype,
  'http.OutgoingMessage.prototype': http.OutgoingMessage.prototype,
  'events.EventEmitter.prototype': events.EventEmitter.prototype,
  'Object.prototype': Object.prototype,
  'Array.prototype': Array.prototype,
  'String.prototype': String.prototype,
  'Function.prototype': Function.prototype
})

const liveSnapshots = {}

function takeSnapshot (label) {
  const protos = {}
  const targets = protoTargets()
  for (const name of Object.keys(targets)) {
    protos[name] = protoSnapshot(targets[name])
  }
  liveSnapshots[label] = {
    protos,
    identities: identitySnapshot()
  }
  out.snapshots[label] = {
    requireExtensions: Object.keys(require.extensions).sort(),
    requireCacheBuiltinEntries: Object.keys(require.cache)
      .filter((k) => k.startsWith('node:')).sort(),
    globalKeyCount: Object.getOwnPropertyNames(globalThis).length,
    globalKeys: Object.getOwnPropertyNames(globalThis).sort(),
    errorPrepareStackTrace: describeVal(rawPST),
    errorStackTraceLimit: Error.stackTraceLimit
  }
}

function diffSnapshots (a, b) {
  const A = liveSnapshots[a]
  const B = liveSnapshots[b]
  const diff = { protoChanges: {}, identityChanges: [], globalKeysAdded: [], globalKeysRemoved: [] }

  for (const name of Object.keys(A.protos)) {
    const pa = A.protos[name]
    const pb = B.protos[name]
    const added = pb.names.filter((n) => !pa.names.includes(n))
    const removed = pa.names.filter((n) => !pb.names.includes(n))
    const replaced = []
    for (const n of pa.names) {
      if (pb.map.has(n) && pa.map.get(n) !== pb.map.get(n)) replaced.push(n)
    }
    if (added.length || removed.length || replaced.length) {
      diff.protoChanges[name] = { added, removed, replaced }
    }
  }

  for (const n of identityNames) {
    if (A.identities.get(n) !== B.identities.get(n)) diff.identityChanges.push(n)
  }

  const ga = out.snapshots[a].globalKeys
  const gb = out.snapshots[b].globalKeys
  diff.globalKeysAdded = gb.filter((k) => !ga.includes(k))
  diff.globalKeysRemoved = ga.filter((k) => !gb.includes(k))
  diff.requireExtensionsChanged =
    JSON.stringify(out.snapshots[a].requireExtensions) !==
    JSON.stringify(out.snapshots[b].requireExtensions)
  diff.requireCacheBuiltinDelta = out.snapshots[b].requireCacheBuiltinEntries
    .filter((k) => !out.snapshots[a].requireCacheBuiltinEntries.includes(k))
  return diff
}

function ownProps (obj) {
  return Object.getOwnPropertyNames(obj)
    .concat(Object.getOwnPropertySymbols(obj).map((s) => String(s)))
    .sort()
}

// ---------------------------------------------------------------------------
// 1. BEFORE require
// ---------------------------------------------------------------------------

takeSnapshot('before')

// ---------------------------------------------------------------------------
// 2. require('router') (resolves deps from the package's own node_modules)
// ---------------------------------------------------------------------------

phase = 'require(router)'
const Router = require(pkgRoot)
phase = 'post-require'

takeSnapshot('afterRequire')
out.diffs['before->afterRequire'] = diffSnapshots('before', 'afterRequire')

// Traps stay installed through the exercise so any runtime swap is recorded.

// ---------------------------------------------------------------------------
// 3. Exercise over a real HTTP server
// ---------------------------------------------------------------------------

const router = new Router()
const sub = new Router()

sub.get('/users/:id', function usersHandler (req, res) {
  out.exercise.paramRoute = {
    inHandler: {
      url: req.url,
      baseUrl: req.baseUrl,
      originalUrl: req.originalUrl,
      params: req.params,
      hasNextFn: typeof req.next === 'function',
      reqOwnPropsAddedSinceEntry: ownProps(req)
        .filter((p) => !req.__entryProps.includes(p)),
      resOwnPropsAddedSinceEntry: ownProps(res)
        .filter((p) => !res.__entryProps.includes(p))
    }
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(req.params))
  // state right after responding without calling next (no restoration expected
  // for the inner trim; outer router's next() was never re-entered)
  out.exercise.paramRoute.afterEndSameTick = {
    url: req.url, baseUrl: req.baseUrl, params: req.params
  }
})

router.use('/api', sub)

router.get('/opts', function optsGet (req, res) { res.end('get') })
router.put('/opts', function optsPut (req, res) { res.end('put') })

router.get('/boom', function boom () {
  throw new Error('boom')
})

router.use(function errorHandler (err, req, res, next) {
  out.exercise.thrownRoute = {
    errMessage: err.message,
    urlInErrorHandler: req.url,
    baseUrlInErrorHandler: req.baseUrl
  }
  res.statusCode = 500
  res.end('handled:' + err.message)
})

const server = http.createServer(function (req, res) {
  req.__entryProps = ownProps(req).filter((p) => p !== '__entryProps')
  res.__entryProps = ownProps(res)
  const entrySnapshot = {
    reqOwnProps: req.__entryProps,
    url: req.url,
    method: req.method
  }

  router(req, res, function finalHandler (err) {
    if (req.method === 'GET' && entrySnapshot.url === '/nope') {
      out.exercise.unmatched404 = {
        err: err ? String(err) : null,
        // restoration state after full dispatch returned to the final handler
        urlRestored: req.url,
        urlEqualsEntry: req.url === entrySnapshot.url,
        baseUrlAfter: req.baseUrl,
        paramsAfter: req.params,
        nextAfter: typeof req.next,
        reqOwnPropsAddedByDispatch: ownProps(req)
          .filter((p) => p !== '__entryProps' && !entrySnapshot.reqOwnProps.includes(p))
      }
    }
    res.statusCode = err ? 500 : 404
    res.end(err ? 'error' : 'not found')
  })
})

function request (method, p) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.address().port, method, path: p },
      (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: {
            allow: res.headers.allow,
            'content-type': res.headers['content-type'],
            'x-content-type-options': res.headers['x-content-type-options']
          },
          body
        }))
      })
    req.on('error', reject)
    req.end()
  })
}

server.listen(0, '127.0.0.1', async () => {
  try {
    phase = 'exercise'
    out.exercise.responses = {}
    out.exercise.responses['GET /api/users/42'] = await request('GET', '/api/users/42')
    out.exercise.responses['GET /nope'] = await request('GET', '/nope')
    out.exercise.responses['OPTIONS /opts'] = await request('OPTIONS', '/opts')
    out.exercise.responses['GET /boom'] = await request('GET', '/boom')
    phase = 'post-exercise'

    takeSnapshot('afterExercise')
    out.diffs['afterRequire->afterExercise'] = diffSnapshots('afterRequire', 'afterExercise')

    removeTraps()
    out.finalErrorProps = {
      prepareStackTrace: describeVal(Error.prepareStackTrace),
      stackTraceLimit: Error.stackTraceLimit
    }

    // sanitize machine paths
    let text = JSON.stringify(out, null, 2)
    const home = os.homedir()
    text = text.split(path.resolve(pkgRoot)).join('$PACKAGE_ROOT')
    text = text.split(process.cwd()).join('$CWD')
    if (home) text = text.split(home).join('$HOME')
    fs.writeFileSync(path.join(__dirname, 'results.json'), text + '\n')
    console.log('wrote results.json; node', process.version)
    console.log('trap events:', out.trapEvents.length)
    console.log('diff before->afterRequire:',
      JSON.stringify(out.diffs['before->afterRequire'].protoChanges),
      'identities:', JSON.stringify(out.diffs['before->afterRequire'].identityChanges))
  } catch (err) {
    console.error('repro failed:', err)
    process.exitCode = 1
  } finally {
    server.close()
  }
})
