// Pass A reproduction: does requiring+using multiparty mutate Node.js core?
// Usage: node repro-core-mutation-check.js "$PACKAGE_ROOT"
// - Traps writes to Error.prepareStackTrace / Error.stackTraceLimit around load.
// - Snapshots core surfaces before load, compares after a full field-only parse.
// Output is sanitized: no absolute paths are printed.
'use strict'

var path = require('path')
var stream = require('stream')
var bufferMod = require('buffer')
var fsMod = require('fs')
var http = require('http')
var events = require('events')
var sd = require('string_decoder')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-core-mutation-check.js "$PACKAGE_ROOT"')
  process.exit(2)
}

function snapshot (obj) {
  var out = {}
  Object.getOwnPropertyNames(obj).forEach(function (k) {
    var d = Object.getOwnPropertyDescriptor(obj, k)
    var t = typeof d.value
    var v
    if (d.get) v = 'get:' + String(d.get).length
    else if (t === 'function') v = 'function:' + String(d.value).length
    else if (t === 'object' && d.value !== null) v = 'object'
    else v = t + ':' + String(d.value).slice(0, 40)
    out[k] = v
  })
  return out
}

function diff (name, before, after) {
  var diffs = []
  Object.keys(before).forEach(function (k) {
    if (!(k in after)) diffs.push(name + ': removed ' + k)
    else if (before[k] !== after[k]) diffs.push(name + ': changed ' + k)
  })
  Object.keys(after).forEach(function (k) {
    if (!(k in before)) diffs.push(name + ': added ' + k)
  })
  return diffs
}

var surfaces = {
  'stream.Writable.prototype': stream.Writable.prototype,
  'stream.Readable.prototype': stream.Readable.prototype,
  'stream.Transform.prototype': stream.Transform.prototype,
  'stream.PassThrough.prototype': stream.PassThrough.prototype,
  'Buffer (statics)': bufferMod.Buffer,
  'Buffer.prototype': bufferMod.Buffer.prototype,
  'Error (statics)': Error,
  'Error.prototype': Error.prototype,
  'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
  'events.EventEmitter.prototype': events.EventEmitter.prototype,
  'string_decoder.StringDecoder.prototype': sd.StringDecoder.prototype,
  'fs (module statics)': fsMod
}

var before = {}
Object.keys(surfaces).forEach(function (k) { before[k] = snapshot(surfaces[k]) })

// --- sentinel proof for depd's transient Error.prepareStackTrace write ---
// depd's getStack() does: save Error.prepareStackTrace, set its own
// prepareObjectStackTrace, raise Error.stackTraceLimit, captureStackTrace,
// then restore both. If depd did NOT replace prepareStackTrace, our sentinel
// (which returns a string) would make depd's `obj.stack.slice(1)[1]` blow up
// in callSiteLocation during require. If depd did NOT restore, the sentinel
// would be gone afterwards.
var hadOwnPst = Object.prototype.hasOwnProperty.call(Error, 'prepareStackTrace')
var origPst = Error.prepareStackTrace
var origStl = Error.stackTraceLimit
var sentinelCalls = 0
function sentinelPrepare (err, trace) { sentinelCalls++; return 'SENTINEL' }
Error.prepareStackTrace = sentinelPrepare
Error.stackTraceLimit = 5

// --- load multiparty (triggers http-errors -> depd at require time) ---
var multiparty = require(path.resolve(pkgRoot))

console.log('require succeeded with sentinel prepareStackTrace installed:',
  'yes (depd must have swapped in its own prepareStackTrace during getStack)')
console.log('Error.prepareStackTrace restored to sentinel after require:',
  Error.prepareStackTrace === sentinelPrepare)
console.log('Error.stackTraceLimit restored after require:', Error.stackTraceLimit === 5,
  '(value: ' + Error.stackTraceLimit + ')')
console.log('sentinel invocations during require:', sentinelCalls)

// remove our own instrumentation before snapshot comparison
if (hadOwnPst) Error.prepareStackTrace = origPst
else delete Error.prepareStackTrace
Error.stackTraceLimit = origStl

// --- identity checks ---
console.log('node version:', process.version)
console.log('safe-buffer module === core buffer module:',
  require(path.join(path.resolve(pkgRoot), 'node_modules', 'safe-buffer')) === bufferMod)
console.log('safe-buffer .Buffer === core Buffer:',
  require(path.join(path.resolve(pkgRoot), 'node_modules', 'safe-buffer')).Buffer === bufferMod.Buffer)
console.log('inherits === util.inherits:',
  require(path.join(path.resolve(pkgRoot), 'node_modules', 'inherits')) === require('util').inherits)
console.log('setprototypeof === Object.setPrototypeOf:',
  require(path.join(path.resolve(pkgRoot), 'node_modules', 'setprototypeof')) === Object.setPrototypeOf)
console.log('Form.prototype proto is stream.Writable.prototype:',
  Object.getPrototypeOf(multiparty.Form.prototype) === stream.Writable.prototype)

// --- run a full field-only parse through a synthetic request stream ---
var body = Buffer.from(
  '--BNDRY\r\n' +
  'content-disposition: form-data; name="alpha"\r\n' +
  '\r\n' +
  'beta\r\n' +
  '--BNDRY--\r\n'
)
var req = new stream.PassThrough()
req.headers = {
  'content-type': 'multipart/form-data; boundary=BNDRY',
  'content-length': String(body.length)
}

var form = new multiparty.Form()
form.parse(req, function (err, fields) {
  console.log('parse result:', err ? 'error: ' + err.message : JSON.stringify(fields))

  var after = {}
  Object.keys(surfaces).forEach(function (k) { after[k] = snapshot(surfaces[k]) })
  var allDiffs = []
  Object.keys(surfaces).forEach(function (k) {
    allDiffs = allDiffs.concat(diff(k, before[k], after[k]))
  })
  console.log('core surface diffs after load+parse:', allDiffs.length === 0 ? 'NONE' : JSON.stringify(allDiffs))
  console.log('Error.prepareStackTrace final:', String(Error.prepareStackTrace))
  console.log('Error.stackTraceLimit final:', Error.stackTraceLimit)
})
req.end(body)
