'use strict'

/*
 * Pass B runtime reproduction for the multiparty@4.3.1 Node.js patch audit.
 *
 * Snapshots identities/descriptors of core surfaces BEFORE requiring the
 * library, AFTER require, and AFTER exercising a representative runtime path
 * (a real multipart/form-data POST with one field and one file through
 * http.createServer + form.parse(req)).
 *
 * An accessor trap is installed on Error.prepareStackTrace before the require
 * so that transient swaps during module load are recorded even though they are
 * restored synchronously. Error.stackTraceLimit CANNOT be trapped with an
 * accessor: V8 reads it with data-property-only semantics (GetDataProperty),
 * so an accessor disables stack capture entirely (verified: with the accessor
 * installed, depd crashed because obj.stack was undefined). Instead the trap
 * on prepareStackTrace records Error.stackTraceLimit at each set event, and
 * the limit is pre-set to 3 so the transient raise to 10 is observable.
 *
 * Usage: PACKAGE_ROOT=/path/to/multiparty node repro.js
 * Output: results.json next to this script (sanitized: no machine paths).
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const stream = require('stream')
const events = require('events')
const sd = require('string_decoder')
const Module = require('module')

const PACKAGE_ROOT = process.env.PACKAGE_ROOT
if (!PACKAGE_ROOT) {
  console.error('PACKAGE_ROOT env var required')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Accessor trap on Error.prepareStackTrace / Error.stackTraceLimit
// ---------------------------------------------------------------------------
const trapEvents = []
let phase = 'init'

function describeValue (v) {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v === 'function') return 'function ' + (v.name || '<anonymous>')
  return typeof v + ' ' + String(v)
}

function installTrap (prop) {
  let current = Error[prop]
  Object.defineProperty(Error, prop, {
    configurable: true,
    enumerable: false,
    get () { return current },
    set (v) {
      trapEvents.push({
        phase: phase,
        prop: prop,
        from: describeValue(current),
        to: describeValue(v),
        stackTraceLimitAtEvent: Error.stackTraceLimit
      })
      current = v
    }
  })
  return function () { return current }
}

const getPrepare = installTrap('prepareStackTrace')
const getLimit = function () { return Error.stackTraceLimit }

// Pre-set the limit to a non-default value so a transient raise is observable
// in trap events (depd sets Math.max(10, limit)).
const ORIGINAL_STACK_TRACE_LIMIT = Error.stackTraceLimit
Error.stackTraceLimit = 3

// ---------------------------------------------------------------------------
// Snapshot machinery (references kept in-process; only diffs are serialized)
// ---------------------------------------------------------------------------
function protoInfo (obj) {
  const keys = Object.getOwnPropertyNames(obj).sort()
  const descs = {}
  const fns = {}
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(obj, k)
    descs[k] = JSON.stringify({
      kind: (d.get || d.set) ? 'accessor' : typeof d.value,
      writable: d.writable,
      enumerable: d.enumerable,
      configurable: d.configurable,
      hasGet: typeof d.get === 'function',
      hasSet: typeof d.set === 'function'
    })
    if (d && typeof d.value === 'function') fns[k] = d.value
  }
  return { ref: obj, keys: keys, descs: descs, fns: fns }
}

function snapshot () {
  return {
    'stream.Writable.prototype': protoInfo(stream.Writable.prototype),
    'stream.Readable.prototype': protoInfo(stream.Readable.prototype),
    'stream.Duplex.prototype': protoInfo(stream.Duplex.prototype),
    'stream.Transform.prototype': protoInfo(stream.Transform.prototype),
    'stream.PassThrough.prototype': protoInfo(stream.PassThrough.prototype),
    'stream.Writable (ctor identity)': { ref: stream.Writable },
    'stream.Readable (ctor identity)': { ref: stream.Readable },
    'stream.Transform (ctor identity)': { ref: stream.Transform },
    'fs.WriteStream (ctor identity)': { ref: fs.WriteStream },
    'fs.WriteStream.prototype': protoInfo(fs.WriteStream.prototype),
    'fs.createWriteStream (identity)': { ref: fs.createWriteStream },
    'fs.unlink (identity)': { ref: fs.unlink },
    'http.IncomingMessage.prototype': protoInfo(http.IncomingMessage.prototype),
    'events.EventEmitter.prototype': protoInfo(events.EventEmitter.prototype),
    'Buffer (ctor identity)': { ref: Buffer },
    'Buffer.from (identity)': { ref: Buffer.from },
    'Buffer.alloc (identity)': { ref: Buffer.alloc },
    'Buffer.allocUnsafe (identity)': { ref: Buffer.allocUnsafe },
    'Buffer.allocUnsafeSlow (identity)': { ref: Buffer.allocUnsafeSlow },
    'Buffer.concat (identity)': { ref: Buffer.concat },
    'Buffer.isBuffer (identity)': { ref: Buffer.isBuffer },
    'Buffer.byteLength (identity)': { ref: Buffer.byteLength },
    'Buffer.prototype': protoInfo(Buffer.prototype),
    'string_decoder.StringDecoder (ctor identity)': { ref: sd.StringDecoder },
    'string_decoder.StringDecoder.prototype': protoInfo(sd.StringDecoder.prototype),
    'Error.prepareStackTrace (value)': { scalar: describeValue(getPrepare()) },
    'Error.stackTraceLimit (value)': { scalar: describeValue(getLimit()) },
    'Error.captureStackTrace (identity)': { ref: Error.captureStackTrace },
    'Object.prototype own keys': { list: Object.getOwnPropertyNames(Object.prototype).sort() },
    'Array.prototype own keys': { list: Object.getOwnPropertyNames(Array.prototype).sort() },
    'String.prototype own keys': { list: Object.getOwnPropertyNames(String.prototype).sort() },
    'Function.prototype own keys': { list: Object.getOwnPropertyNames(Function.prototype).sort() },
    'Object.assign (identity)': { ref: Object.assign },
    'Object.setPrototypeOf (identity)': { ref: Object.setPrototypeOf },
    'Object.defineProperty (identity)': { ref: Object.defineProperty },
    'Module._load (identity)': { ref: Module._load },
    'Module._resolveFilename (identity)': { ref: Module._resolveFilename },
    'Module._extensions keys': { list: Object.keys(Module._extensions).sort() },
    'require.cache builtin-style entries': { list: Object.keys(require.cache).filter(function (k) { return k.indexOf('node:') === 0 }).sort() },
    'process.binding (identity)': { ref: process.binding },
    'process.nextTick (identity)': { ref: process.nextTick },
    'globalThis own keys': { list: Object.getOwnPropertyNames(globalThis).sort() }
  }
}

function diffSnapshots (a, b) {
  const changes = []
  for (const key of Object.keys(a)) {
    const av = a[key]
    const bv = b[key]
    if (av.keys) { // protoInfo
      if (av.ref !== bv.ref) changes.push(key + ': object identity changed')
      const added = bv.keys.filter(function (k) { return av.keys.indexOf(k) < 0 })
      const removed = av.keys.filter(function (k) { return bv.keys.indexOf(k) < 0 })
      if (added.length) changes.push(key + ': own keys added: ' + added.join(', '))
      if (removed.length) changes.push(key + ': own keys removed: ' + removed.join(', '))
      for (const k of av.keys) {
        if (bv.keys.indexOf(k) < 0) continue
        if (av.fns[k] && bv.fns[k] !== av.fns[k]) changes.push(key + '.' + k + ': function identity changed')
        if (av.descs[k] !== bv.descs[k]) changes.push(key + '.' + k + ': descriptor changed ' + av.descs[k] + ' -> ' + bv.descs[k])
      }
    } else if (av.list) {
      const added = bv.list.filter(function (k) { return av.list.indexOf(k) < 0 })
      const removed = av.list.filter(function (k) { return bv.list.indexOf(k) < 0 })
      if (added.length) changes.push(key + ': added: ' + added.join(', '))
      if (removed.length) changes.push(key + ': removed: ' + removed.join(', '))
    } else if ('scalar' in av) {
      if (av.scalar !== bv.scalar) changes.push(key + ': value changed ' + av.scalar + ' -> ' + bv.scalar)
    } else {
      if (av.ref !== bv.ref) changes.push(key + ': identity changed')
    }
  }
  return changes
}

// ---------------------------------------------------------------------------
// Exercise: real multipart POST through http.createServer + form.parse(req)
// ---------------------------------------------------------------------------
function exercise (multiparty, done) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-audit-'))
  const outcome = {}
  const server = http.createServer(function (req, res) {
    const form = new multiparty.Form({ uploadDir: uploadDir })
    form.parse(req, function (err, fields, files) {
      outcome.parseError = err ? String(err.message) : null
      outcome.fields = fields || null
      outcome.fileFieldNames = files ? Object.keys(files) : null
      try {
        if (files && files.upload && files.upload[0]) {
          const f = files.upload[0]
          outcome.file = {
            originalFilename: f.originalFilename,
            size: f.size,
            contentsMatch: fs.readFileSync(f.path, 'utf8') === FILE_CONTENTS
          }
          fs.unlinkSync(f.path)
        }
      } catch (e) {
        outcome.fileCheckError = String(e.message)
      }
      res.statusCode = 200
      res.end('ok')
    })
  })

  const FILE_CONTENTS = 'file-contents-0123456789\n'
  const boundary = 'AuditBoundary4221997'
  const body = Buffer.concat([
    Buffer.from('--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="title"\r\n\r\n' +
      'hello world\r\n'),
    Buffer.from('--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="upload"; filename="sample.txt"\r\n' +
      'Content-Type: text/plain\r\n\r\n'),
    Buffer.from(FILE_CONTENTS),
    Buffer.from('\r\n--' + boundary + '--\r\n')
  ])

  server.listen(0, '127.0.0.1', function () {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      method: 'POST',
      path: '/',
      headers: {
        'content-type': 'multipart/form-data; boundary=' + boundary,
        'content-length': body.length
      }
    }, function (res) {
      let data = ''
      res.on('data', function (c) { data += c })
      res.on('end', function () {
        outcome.httpStatus = res.statusCode
        outcome.responseBody = data
        server.close(function () {
          try { fs.rmdirSync(uploadDir) } catch (e) { /* non-empty: leave */ }
          done(null, outcome)
        })
      })
    })
    req.on('error', function (err) { done(err) })
    req.end(body)
  })
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
function sanitize (str) {
  let out = str
  const subs = [
    [PACKAGE_ROOT, '$PACKAGE_ROOT'],
    [fs.realpathSync(os.tmpdir()), '$TMPDIR'],
    [os.tmpdir(), '$TMPDIR'],
    [os.homedir(), '$HOME']
  ]
  for (const pair of subs) {
    out = out.split(pair[0]).join(pair[1])
  }
  return out
}

const before = snapshot()

phase = 'require'
const multiparty = require(path.join(PACKAGE_ROOT, 'index.js'))

phase = 'post-require'
const afterRequire = snapshot()

phase = 'exercise'
exercise(multiparty, function (err, outcome) {
  phase = 'post-exercise'
  const afterExercise = snapshot()

  const results = {
    nodeVersion: process.version,
    package: 'multiparty@4.3.1 ($PACKAGE_ROOT/index.js)',
    note: 'Error.stackTraceLimit was pre-set to 3 (default ' + ORIGINAL_STACK_TRACE_LIMIT + ') to make transient raises observable; restored at exit.',
    exerciseError: err ? String(err.message) : null,
    exerciseOutcome: outcome || null,
    trapEvents: trapEvents,
    diff_before_vs_afterRequire: diffSnapshots(before, afterRequire),
    diff_before_vs_afterExercise: diffSnapshots(before, afterExercise),
    finalState: {
      'Error.prepareStackTrace': describeValue(getPrepare()),
      'Error.stackTraceLimit': describeValue(getLimit())
    }
  }

  Error.stackTraceLimit = ORIGINAL_STACK_TRACE_LIMIT

  const json = sanitize(JSON.stringify(results, null, 2))
  fs.writeFileSync(path.join(__dirname, 'results.json'), json + '\n')
  console.log(json)
})
