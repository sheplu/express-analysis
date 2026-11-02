'use strict'

// Reproduction for the express-session monkeypatch audit (pass A).
// Usage: node repro.js "$PACKAGE_ROOT"
//
// Demonstrates:
//  1. depd transiently writes Error.prepareStackTrace / Error.stackTraceLimit
//     at express-session require time (observed via an instrumented accessor).
//  2. The middleware replaces res.end and res.writeHead as own properties on
//     the live ServerResponse instance, while the shared
//     http.ServerResponse.prototype stays untouched.
//  3. req.session / req.sessionID / req.sessionStore are plain own data
//     properties added to the IncomingMessage instance; the core prototype
//     gains nothing.

var path = require('path')
var http = require('http')
var net = require('net')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"')
  process.exit(1)
}

// --- 1. Instrument Error.prepareStackTrace before loading the library ---
var pstWrites = []
var pstValue
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return pstValue },
  set: function (v) {
    pstWrites.push(typeof v === 'function' ? 'set:' + (v.name || 'anonymous') : 'set:' + String(v))
    pstValue = v
  }
})
var stlBefore = Error.stackTraceLimit

var session = require(path.join(pkgRoot, 'index.js'))

console.log('[depd] Error.prepareStackTrace writes during require:', JSON.stringify(pstWrites))
console.log('[depd] Error.prepareStackTrace restored after require:', pstValue === undefined)
console.log('[depd] Error.stackTraceLimit restored after require:', Error.stackTraceLimit === stlBefore)

// --- 2/3. Run the middleware on a real core req/res pair ---
var protoEnd = http.ServerResponse.prototype.end
var protoWrite = http.ServerResponse.prototype.write
var protoWriteHead = http.ServerResponse.prototype.writeHead

var middleware = session({ secret: 'audit-secret', resave: false, saveUninitialized: false })

var req = new http.IncomingMessage(new net.Socket())
req.url = '/'
req.originalUrl = '/'
req.headers = {}
var res = new http.ServerResponse(req)

function own (obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

console.log('[pre ] res own end/writeHead/write:', own(res, 'end'), own(res, 'writeHead'), own(res, 'write'))

middleware(req, res, function next (err) {
  if (err) throw err

  console.log('[post] res own end:', own(res, 'end'), '| differs from prototype.end:', res.end !== protoEnd)
  console.log('[post] res own writeHead:', own(res, 'writeHead'), '| differs from prototype.writeHead:', res.writeHead !== protoWriteHead)
  console.log('[post] res own write (should stay false):', own(res, 'write'))
  console.log('[post] ServerResponse.prototype.end unchanged:', http.ServerResponse.prototype.end === protoEnd)
  console.log('[post] ServerResponse.prototype.writeHead unchanged:', http.ServerResponse.prototype.writeHead === protoWriteHead)
  console.log('[post] ServerResponse.prototype.write unchanged:', http.ServerResponse.prototype.write === protoWrite)

  var reqProps = ['session', 'sessionID', 'sessionStore'].map(function (k) {
    var d = Object.getOwnPropertyDescriptor(req, k)
    if (!d) return k + ':absent'
    return k + ':' + (d.get || d.set ? 'own-accessor' : 'own-data') + (d.enumerable ? '(enumerable)' : '')
  })
  console.log('[post] req props:', reqProps.join(' '))
  console.log('[post] IncomingMessage.prototype polluted:', ('session' in http.IncomingMessage.prototype) || ('sessionID' in http.IncomingMessage.prototype) || ('sessionStore' in http.IncomingMessage.prototype))
  console.log('node:', process.version)
})
