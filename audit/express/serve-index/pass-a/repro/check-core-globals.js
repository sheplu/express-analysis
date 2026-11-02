'use strict'
// Usage: node check-core-globals.js "$PACKAGE_ROOT"
// Instruments Error.prepareStackTrace with an accessor (V8/Node reads the hook
// through a normal JS property get, so an accessor is observable), snapshots
// core surfaces, requires the package, and reports every write plus any
// permanent core differences. Error.stackTraceLimit is NOT converted to an
// accessor (V8 requires a data property there and disables stack collection
// otherwise); its restoration is checked by before/after value instead.
// Prints no machine paths.

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node check-core-globals.js <package-root>')
  process.exit(2)
}

var EventEmitter = require('events').EventEmitter
var http = require('http')
var fs = require('fs')
var url = require('url')

function snap () {
  return {
    eventEmitterProtoKeys: Object.getOwnPropertyNames(EventEmitter.prototype).sort().join(','),
    errorProtoKeys: Object.getOwnPropertyNames(Error.prototype).sort().join(','),
    serverResponseProtoKeys: Object.getOwnPropertyNames(http.ServerResponse.prototype).sort().join(','),
    incomingMessageProtoKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    fsStat: fs.stat,
    fsReaddir: fs.readdir,
    fsReadFile: fs.readFile,
    fsReadFileSync: fs.readFileSync,
    urlParse: url.parse,
    processNextTick: process.nextTick
  }
}

var before = snap()
var limitBefore = Error.stackTraceLimit

var prepareWrites = []
var currentPrepare = Error.prepareStackTrace
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return currentPrepare },
  set: function (v) {
    prepareWrites.push(typeof v === 'function' ? 'function:' + (v.name || '<anonymous>') : String(v))
    currentPrepare = v
  }
})

var serveIndex = require(pkgRoot)

var after = snap()
var permanentDiffs = []
Object.keys(before).forEach(function (k) {
  if (before[k] !== after[k]) permanentDiffs.push(k)
})

console.log(JSON.stringify({
  nodeVersion: process.version,
  exportType: typeof serveIndex,
  prepareStackTraceWrites: prepareWrites,
  prepareStackTraceRestoredToUndefined: currentPrepare === undefined,
  stackTraceLimitBefore: limitBefore,
  stackTraceLimitAfter: Error.stackTraceLimit,
  permanentCoreDiffsAfterRequire: permanentDiffs
}, null, 2))
