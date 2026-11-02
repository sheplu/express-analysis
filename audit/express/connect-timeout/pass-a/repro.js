'use strict'

// Reproduction for connect-timeout patch audit (pass A).
// Usage: node repro.js "$PACKAGE_ROOT"
// Prints only booleans/counts; no machine paths in output.

var path = require('path')
var http = require('http')
var net = require('net')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"')
  process.exit(1)
}

// --- instrument Error.prepareStackTrace to observe transient writes (depd) ---
var psSets = []
var psStore = Error.prepareStackTrace
var psInitial = psStore
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return psStore },
  set: function (v) { psSets.push(typeof v); psStore = v }
})

var protoWriteHeadBefore = http.ServerResponse.prototype.writeHead
var protoAssignSocketBefore = http.ServerResponse.prototype.assignSocket
var stackLimitBefore = Error.stackTraceLimit

var timeout = require(path.resolve(pkgRoot))

console.log('[require time]')
console.log('  Error.prepareStackTrace write count during require (depd):', psSets.length)
console.log('  Error.prepareStackTrace writes (types):', JSON.stringify(psSets))
console.log('  default Error.prepareStackTrace present before require (Node >=21):', typeof psInitial)
console.log('  Error.prepareStackTrace restored to initial value after require:', psStore === psInitial)
console.log('  Error.stackTraceLimit restored after require:', Error.stackTraceLimit === stackLimitBefore)
console.log('  ServerResponse.prototype.writeHead unchanged:', http.ServerResponse.prototype.writeHead === protoWriteHeadBefore)
console.log('  ServerResponse.prototype.assignSocket unchanged:', http.ServerResponse.prototype.assignSocket === protoAssignSocketBefore)

// restore plain data property
delete Error.prepareStackTrace
if (psStore !== undefined) Error.prepareStackTrace = psStore

// --- per-request behavior on live core-backed req/res ---
var socket = new net.Socket()
var req = new http.IncomingMessage(socket)
var res = new http.ServerResponse(req)

var hadOwnWriteHeadBefore = Object.prototype.hasOwnProperty.call(res, 'writeHead')

var mw = timeout(1000)
mw(req, res, function next () {})

console.log('[after middleware ran on one request]')
console.log('  res had own writeHead before middleware:', hadOwnWriteHeadBefore)
console.log('  res has own writeHead after middleware (on-headers override):', Object.prototype.hasOwnProperty.call(res, 'writeHead'))
console.log('  res.writeHead !== ServerResponse.prototype.writeHead:', res.writeHead !== http.ServerResponse.prototype.writeHead)
console.log('  ServerResponse.prototype.writeHead still unchanged:', http.ServerResponse.prototype.writeHead === protoWriteHeadBefore)
console.log('  res has own assignSocket (on-finished node-0.8 patch fired?):', Object.prototype.hasOwnProperty.call(res, 'assignSocket'))
console.log('  ServerResponse.prototype.assignSocket still unchanged:', http.ServerResponse.prototype.assignSocket === protoAssignSocketBefore)
console.log('  res.socket value is null (not undefined):', res.socket === null)
console.log('  res has own __onFinished key (on-finished):', Object.prototype.hasOwnProperty.call(res, '__onFinished'))
console.log('  req has own timedout key:', Object.prototype.hasOwnProperty.call(req, 'timedout'), '| value:', req.timedout)
console.log('  req has own clearTimeout key:', Object.prototype.hasOwnProperty.call(req, 'clearTimeout'))
console.log('  core IncomingMessage.prototype has timedout member:', 'timedout' in http.IncomingMessage.prototype)
console.log('  core IncomingMessage.prototype has clearTimeout member:', 'clearTimeout' in http.IncomingMessage.prototype)

// cleanup so the process can exit
req.clearTimeout()
socket.destroy()
