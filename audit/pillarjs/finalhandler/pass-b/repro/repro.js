'use strict'
/*
 * Pass B runtime reproduction for the finalhandler patch audit.
 *
 * Usage: node repro.js "$PACKAGE_ROOT"
 *   $PACKAGE_ROOT = root of the finalhandler checkout (contains index.js and
 *   node_modules with the resolved runtime dependencies).
 *
 * Snapshots Node.js core surfaces BEFORE requiring finalhandler and AFTER
 * requiring + exercising representative paths through a real http server:
 *   - /control   : plain res.end() (core-only baseline for req/res expandos)
 *   - /missing   : 404 via finalhandler(req, res)()
 *   - /error     : 500 via finalhandler(req, res)(err) with content headers
 *                  pre-set (observe header removal) and err.headers set
 *   - /aftersent : error after headers already flushed (req.socket.destroy path)
 *
 * Output: results.json next to this script (sanitized: no absolute paths).
 */

const path = require('path')
const http = require('http')
const net = require('net')
const events = require('events')
const Module = require('module')

const PACKAGE_ROOT = process.argv[2]
if (!PACKAGE_ROOT) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Snapshot machinery
// ---------------------------------------------------------------------------

const PROTO_TARGETS = {
  'http.OutgoingMessage.prototype': http.OutgoingMessage.prototype,
  'http.ServerResponse.prototype': http.ServerResponse.prototype,
  'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
  'net.Socket.prototype': net.Socket.prototype,
  'events.EventEmitter.prototype': events.EventEmitter.prototype
}

const BUILTIN_PROTO_TARGETS = {
  'Object.prototype': Object.prototype,
  'Array.prototype': Array.prototype,
  'String.prototype': String.prototype,
  'Function.prototype': Function.prototype
}

function snapProto (obj) {
  const out = {}
  for (const name of Object.getOwnPropertyNames(obj)) {
    const d = Object.getOwnPropertyDescriptor(obj, name)
    out[name] = {
      kind: 'value' in d ? typeof d.value : (d.get ? 'accessor' : 'setter-only'),
      ref: 'value' in d ? d.value : d.get, // in-memory identity token
      writable: d.writable === undefined ? null : d.writable,
      enumerable: d.enumerable,
      configurable: d.configurable
    }
  }
  return out
}

function takeSnapshot () {
  const snap = { protos: {}, singles: {} }
  for (const [label, obj] of Object.entries(PROTO_TARGETS)) snap.protos[label] = snapProto(obj)
  for (const [label, obj] of Object.entries(BUILTIN_PROTO_TARGETS)) snap.protos[label] = snapProto(obj)
  snap.singles['net.Socket.prototype.destroy'] = net.Socket.prototype.destroy
  snap.singles['Object.assign'] = Object.assign
  snap.singles['Module._load'] = Module._load
  snap.singles['Module._resolveFilename'] = Module._resolveFilename
  snap.singles['process.binding'] = process.binding
  snap.singles['Error.prepareStackTrace'] = Error.prepareStackTrace
  snap.errorStackTraceLimit = Error.stackTraceLimit
  snap.requireExtensions = Object.keys(require.extensions).sort()
  snap.requireCacheCount = Object.keys(require.cache).length
  snap.requireCacheBuiltinEntries = Object.keys(require.cache)
    .filter((k) => k.startsWith('node:')).sort()
  snap.globalKeys = Object.getOwnPropertyNames(globalThis).sort()
  snap.envDEBUG = Object.prototype.hasOwnProperty.call(process.env, 'DEBUG')
    ? process.env.DEBUG : '<unset>'
  return snap
}

function diffSnapshots (a, b) {
  const diff = { protoChanges: [], singleChanges: [], globalKeysAdded: [], globalKeysRemoved: [], other: [] }
  for (const label of Object.keys(a.protos)) {
    const pa = a.protos[label]
    const pb = b.protos[label]
    const names = new Set([...Object.keys(pa), ...Object.keys(pb)])
    for (const n of names) {
      if (!(n in pa)) { diff.protoChanges.push(`${label}.${n}: ADDED (${pb[n].kind})`); continue }
      if (!(n in pb)) { diff.protoChanges.push(`${label}.${n}: REMOVED`); continue }
      if (pa[n].ref !== pb[n].ref) diff.protoChanges.push(`${label}.${n}: IDENTITY CHANGED`)
      for (const flag of ['kind', 'writable', 'enumerable', 'configurable']) {
        if (pa[n][flag] !== pb[n][flag]) diff.protoChanges.push(`${label}.${n}: descriptor ${flag} ${pa[n][flag]} -> ${pb[n][flag]}`)
      }
    }
  }
  for (const key of Object.keys(a.singles)) {
    if (a.singles[key] !== b.singles[key]) diff.singleChanges.push(`${key}: IDENTITY CHANGED`)
  }
  if (a.errorStackTraceLimit !== b.errorStackTraceLimit) diff.other.push(`Error.stackTraceLimit: ${a.errorStackTraceLimit} -> ${b.errorStackTraceLimit}`)
  diff.globalKeysAdded = b.globalKeys.filter((k) => !a.globalKeys.includes(k))
  diff.globalKeysRemoved = a.globalKeys.filter((k) => !b.globalKeys.includes(k))
  const extA = a.requireExtensions.join(','); const extB = b.requireExtensions.join(',')
  if (extA !== extB) diff.other.push(`require.extensions keys: ${extA} -> ${extB}`)
  if (a.requireCacheBuiltinEntries.join(',') !== b.requireCacheBuiltinEntries.join(',')) {
    diff.other.push(`require.cache builtin entries: ${JSON.stringify(a.requireCacheBuiltinEntries)} -> ${JSON.stringify(b.requireCacheBuiltinEntries)}`)
  }
  if (a.envDEBUG !== b.envDEBUG) diff.other.push(`process.env.DEBUG: ${JSON.stringify(a.envDEBUG)} -> ${JSON.stringify(b.envDEBUG)}`)
  return diff
}

function ownPropsReport (obj) {
  // own property names + whether each shadows an inherited prototype-chain member
  const chain = Object.getPrototypeOf(obj)
  return Object.getOwnPropertyNames(obj).map((n) => {
    return (chain && n in chain) ? `${n} (SHADOWS prototype member)` : n
  }).sort()
}

// ---------------------------------------------------------------------------
// 1. Snapshot before require, with accessor traps on Error statics
// ---------------------------------------------------------------------------

const results = { nodeVersion: process.version, packageVersion: null }
const before = takeSnapshot()

const trapped = { prepareStackTraceWrites: [], stackTraceLimitWrites: [] }
let pstCurrent = Error.prepareStackTrace
let stlCurrent = Error.stackTraceLimit
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get () { return pstCurrent },
  set (v) { trapped.prepareStackTraceWrites.push(typeof v); pstCurrent = v }
})
Object.defineProperty(Error, 'stackTraceLimit', {
  configurable: true,
  get () { return stlCurrent },
  set (v) { trapped.stackTraceLimitWrites.push(String(v)); stlCurrent = v }
})

// ---------------------------------------------------------------------------
// 2. Require the library (resolves its own node_modules deps)
// ---------------------------------------------------------------------------

const finalhandler = require(path.join(PACKAGE_ROOT, 'index.js'))
results.packageVersion = require(path.join(PACKAGE_ROOT, 'package.json')).version

// restore plain data properties on Error
delete Error.prepareStackTrace
if (pstCurrent !== undefined) Error.prepareStackTrace = pstCurrent
delete Error.stackTraceLimit
Error.stackTraceLimit = stlCurrent
results.errorStaticWritesDuringRequire = trapped

const afterRequire = takeSnapshot()
results.diffRequire = diffSnapshots(before, afterRequire)

// ---------------------------------------------------------------------------
// 3. Exercise representative paths through a real http server
// ---------------------------------------------------------------------------

const instanceReports = {}

const server = http.createServer(function (req, res) {
  const url = req.url
  const record = (label) => {
    // defer so synchronous finalhandler work (unpipe/onFinished attach) is done
    setImmediate(() => {
      instanceReports[label] = {
        reqOwnProps: ownPropsReport(req),
        resOwnProps: ownPropsReport(res),
        reqAssignSocketOwn: Object.prototype.hasOwnProperty.call(req, 'assignSocket'),
        resAssignSocketOwn: Object.prototype.hasOwnProperty.call(res, 'assignSocket'),
        resHeaderNames: res.headersSent ? '<headers sent>' : res.getHeaderNames()
      }
    })
  }

  if (url === '/control') {
    res.end('ok')
    record('control')
  } else if (url === '/missing') {
    const done = finalhandler(req, res)
    done() // 404 path
    record('missing-404')
  } else if (url === '/error') {
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Language', 'xx')
    res.setHeader('Content-Range', 'bytes 0-1/2')
    res.setHeader('X-Keep', 'kept')
    const done = finalhandler(req, res)
    const err = new Error('boom')
    err.status = 500
    err.headers = { 'X-From-Err': 'yes' }
    done(err) // 500 path with header removal + err headers
    record('error-500')
  } else if (url === '/aftersent') {
    res.setHeader('Content-Type', 'text/plain')
    res.write('partial') // flush headers
    const done = finalhandler(req, res)
    done(new Error('late boom')) // headersSent path -> req.socket.destroy()
    record('aftersent-destroy')
  } else {
    res.end('noop')
  }
})

function request (pathName) {
  return new Promise((resolve) => {
    const r = http.get({ port: server.address().port, path: pathName }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('error', () => {})
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: {
           'content-encoding': res.headers['content-encoding'] || '<removed>',
          'content-language': res.headers['content-language'] || '<removed>',
          'content-range': res.headers['content-range'] || '<removed>',
          'x-keep': res.headers['x-keep'] || '<absent>',
          'x-from-err': res.headers['x-from-err'] || '<absent>',
          'content-security-policy': res.headers['content-security-policy'] || '<absent>',
          'x-content-type-options': res.headers['x-content-type-options'] || '<absent>',
          'content-type': res.headers['content-type'] || '<absent>'
        },
        bodyFirstLine: Buffer.concat(chunks).toString('utf8').split('\n')[0]
      }))
    })
    r.on('error', (e) => resolve({ clientError: e.code || e.message }))
  })
}

server.listen(0, '127.0.0.1', async () => {
  results.responses = {}
  results.responses.control = await request('/control')
  results.responses.missing404 = await request('/missing')
  results.responses.error500 = await request('/error')
  results.responses.aftersent = await request('/aftersent')

  // let deferred instance records flush
  await new Promise((r) => setTimeout(r, 50))

  const afterExercise = takeSnapshot()
  results.diffExercise = diffSnapshots(afterRequire, afterExercise)
  results.diffTotal = diffSnapshots(before, afterExercise)
  results.instanceReports = instanceReports

  server.close(() => {
    const fs = require('fs')
    const out = path.join(__dirname, 'results.json')
    fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n')
    console.log('wrote results.json')
    console.log('diffRequire.protoChanges:', results.diffRequire.protoChanges.length)
    console.log('diffTotal.protoChanges:', results.diffTotal.protoChanges.length)
    console.log('diffTotal.singleChanges:', results.diffTotal.singleChanges.length)
  })
})
