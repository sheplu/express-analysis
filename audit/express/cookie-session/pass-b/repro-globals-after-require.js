'use strict'
// Usage: node repro-globals-after-require.js "$PACKAGE_ROOT"
// Confirms: requiring cookie-session (which loads cookies -> depd at module
// scope and triggers depd's getStack()) leaves Error.prepareStackTrace,
// Error.stackTraceLimit, the core buffer module exports, and the HTTP
// prototypes unchanged after load.
var http = require('http')
var bufferModule = require('buffer')

var before = {
  prepareStackTrace: Error.prepareStackTrace,
  stackTraceLimit: Error.stackTraceLimit,
  BufferFrom: bufferModule.Buffer.from,
  protoWriteHead: http.ServerResponse.prototype.writeHead,
  protoSetHeader: http.OutgoingMessage.prototype.setHeader,
  debugEnv: process.env.DEBUG
}

require(process.argv[2])

console.log(JSON.stringify({
  prepareStackTraceUnchanged: Error.prepareStackTrace === before.prepareStackTrace,
  stackTraceLimitUnchanged: Error.stackTraceLimit === before.stackTraceLimit,
  bufferModuleIsCoreReExport: require(process.argv[2] + '/node_modules/safe-buffer') === bufferModule,
  BufferFromUnchanged: bufferModule.Buffer.from === before.BufferFrom,
  protoWriteHeadUnchanged: http.ServerResponse.prototype.writeHead === before.protoWriteHead,
  protoSetHeaderUnchanged: http.OutgoingMessage.prototype.setHeader === before.protoSetHeader,
  debugEnvUnchanged: process.env.DEBUG === before.debugEnv
}, null, 2))
