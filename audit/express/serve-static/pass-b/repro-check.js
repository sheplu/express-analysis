'use strict'
// Usage: node repro-check.js "$PACKAGE_ROOT"
// Instruments shared globals and snapshots core API identities, then
// requires serve-static and reports every observed write and any
// post-load identity change. Static analysis predicts: exactly 2 sets of
// Error.prepareStackTrace and 2 sets of Error.stackTraceLimit during
// require (depd getStack swap + synchronous restore, fired once via
// serve-static -> send -> http-errors -> depd('http-errors')), and no
// other core mutation.

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-check.js "$PACKAGE_ROOT"')
  process.exit(1)
}

var http = require('http')
var fs = require('fs')
var stream = require('stream')

var before = {
  setHeader: http.ServerResponse.prototype.setHeader,
  getHeader: http.ServerResponse.prototype.getHeader,
  removeHeader: http.ServerResponse.prototype.removeHeader,
  writeHead: http.ServerResponse.prototype.writeHead,
  end: http.ServerResponse.prototype.end,
  assignSocket: http.ServerResponse.prototype.assignSocket,
  emit: http.ServerResponse.prototype.emit,
  createReadStream: fs.createReadStream,
  stat: fs.stat,
  readStreamPipe: fs.ReadStream.prototype.pipe,
  streamPipe: stream.Stream.prototype.pipe,
  prepareStackTrace: Error.prepareStackTrace,
  stackTraceLimit: Error.stackTraceLimit,
  captureStackTrace: Error.captureStackTrace
}

// instrument Error.prepareStackTrace / Error.stackTraceLimit writes
var prepSets = []
var curPrep = Error.prepareStackTrace
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return curPrep },
  set: function (v) {
    prepSets.push(typeof v === 'function' ? 'fn:' + (v.name || 'anonymous') : String(v))
    curPrep = v
  }
})
// NOTE: Error.stackTraceLimit cannot be instrumented with an accessor:
// V8 requires it to be an own data property or stack capture breaks
// (verified: an accessor made obj.stack undefined inside depd getStack).
// It is checked by value snapshot instead; the write count is established
// statically (single swap/restore pair in depd getStack).

var serveStatic = require(pkgRoot)

var results = {
  'typeof export': typeof serveStatic,
  'Error.prepareStackTrace writes during require': prepSets.length + ' ' + JSON.stringify(prepSets),
  'Error.prepareStackTrace restored': curPrep === before.prepareStackTrace,
  'Error.stackTraceLimit value restored': Error.stackTraceLimit === before.stackTraceLimit,
  'Error.captureStackTrace unchanged': Error.captureStackTrace === before.captureStackTrace,
  'ServerResponse.prototype.setHeader unchanged': http.ServerResponse.prototype.setHeader === before.setHeader,
  'ServerResponse.prototype.getHeader unchanged': http.ServerResponse.prototype.getHeader === before.getHeader,
  'ServerResponse.prototype.removeHeader unchanged': http.ServerResponse.prototype.removeHeader === before.removeHeader,
  'ServerResponse.prototype.writeHead unchanged': http.ServerResponse.prototype.writeHead === before.writeHead,
  'ServerResponse.prototype.end unchanged': http.ServerResponse.prototype.end === before.end,
  'ServerResponse.prototype.assignSocket unchanged': http.ServerResponse.prototype.assignSocket === before.assignSocket,
  'ServerResponse.prototype.emit unchanged': http.ServerResponse.prototype.emit === before.emit,
  'fs.createReadStream unchanged': fs.createReadStream === before.createReadStream,
  'fs.stat unchanged': fs.stat === before.stat,
  'fs.ReadStream.prototype.pipe unchanged': fs.ReadStream.prototype.pipe === before.readStreamPipe,
  'Stream.prototype.pipe unchanged': stream.Stream.prototype.pipe === before.streamPipe
}

Object.keys(results).forEach(function (k) {
  console.log(k + ': ' + results[k])
})
console.log('node: ' + process.version)
