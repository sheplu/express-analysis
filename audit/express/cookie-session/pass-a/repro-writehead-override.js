// Reproduction: cookie-session middleware replaces res.writeHead on the
// ServerResponse instance (via on-headers) and defines req.session /
// req.sessionOptions on the IncomingMessage instance.
// Usage: node repro-writehead-override.js "$PACKAGE_ROOT"
'use strict'

var path = require('path')
var http = require('http')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-writehead-override.js "$PACKAGE_ROOT"')
  process.exit(1)
}

var cookieSession = require(path.resolve(pkgRoot))
var middleware = cookieSession({ keys: ['repro-key'] })

var protoWriteHead = http.ServerResponse.prototype.writeHead

var req = new http.IncomingMessage(null)
req.headers = {}
var res = new http.ServerResponse(req)

var instanceWriteHeadBefore = res.writeHead
var hadOwnBefore = Object.prototype.hasOwnProperty.call(res, 'writeHead')

middleware(req, res, function next () {})

var ownAfter = Object.prototype.hasOwnProperty.call(res, 'writeHead')
var sessionDesc = Object.getOwnPropertyDescriptor(req, 'session')

console.log('node version:', process.version)
console.log('res had own writeHead before middleware:', hadOwnBefore)
console.log('res has own writeHead after middleware:', ownAfter)
console.log('res.writeHead !== previous (prototype) writeHead:',
  res.writeHead !== instanceWriteHeadBefore)
console.log('ServerResponse.prototype.writeHead unchanged:',
  http.ServerResponse.prototype.writeHead === protoWriteHead)
console.log('replacement function name:', res.writeHead.name)
console.log('req own "session" accessor [get,set]:',
  sessionDesc ? [typeof sessionDesc.get, typeof sessionDesc.set] : null)
console.log('core IncomingMessage.prototype defines "session":',
  Object.prototype.hasOwnProperty.call(http.IncomingMessage.prototype, 'session'))
console.log('req own "sessionOptions" data property:',
  Object.prototype.hasOwnProperty.call(req, 'sessionOptions'))
