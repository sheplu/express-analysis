'use strict'

// Usage: node instance-override-check.js "$PACKAGE_ROOT"
// Verifies, for express-session:
//  1. Requiring the package leaves shared HTTP prototypes and
//     Error.prepareStackTrace / Error.stackTraceLimit untouched.
//  2. During a request, res.end / res.writeHead become per-instance own
//     properties (shadowing, not prototype mutation).
//  3. Triggering a depd deprecation leaves Error.prepareStackTrace restored.

var path = require('path')
var http = require('http')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node instance-override-check.js "$PACKAGE_ROOT"')
  process.exit(1)
}

var origEnd = http.OutgoingMessage.prototype.end
var origWrite = http.OutgoingMessage.prototype.write
var origWriteHead = http.ServerResponse.prototype.writeHead
var origPrepare = Error.prepareStackTrace
var origLimit = Error.stackTraceLimit

var session = require(path.join(pkgRoot, 'index.js'))

console.log('after require(express-session):')
console.log('  OutgoingMessage.prototype.end unchanged:', http.OutgoingMessage.prototype.end === origEnd)
console.log('  OutgoingMessage.prototype.write unchanged:', http.OutgoingMessage.prototype.write === origWrite)
console.log('  ServerResponse.prototype.writeHead unchanged:', http.ServerResponse.prototype.writeHead === origWriteHead)
console.log('  Error.prepareStackTrace restored:', Error.prepareStackTrace === origPrepare)
console.log('  Error.stackTraceLimit restored:', Error.stackTraceLimit === origLimit)

// trigger a depd deprecation (undefined resave) -> getStack() runs
session({ secret: 'audit-deprecation-trigger' })
console.log('after deprecation fired:')
console.log('  Error.prepareStackTrace restored:', Error.prepareStackTrace === origPrepare)
console.log('  Error.stackTraceLimit restored:', Error.stackTraceLimit === origLimit)

var middleware = session({ secret: 'audit', resave: false, saveUninitialized: true })

var server = http.createServer(function (req, res) {
  middleware(req, res, function () {
    console.log('during request (inside middleware next):')
    console.log('  res has own "end":', Object.prototype.hasOwnProperty.call(res, 'end'))
    console.log('  res has own "writeHead":', Object.prototype.hasOwnProperty.call(res, 'writeHead'))
    console.log('  res.end !== OutgoingMessage.prototype.end:', res.end !== http.OutgoingMessage.prototype.end)
    console.log('  res.writeHead !== ServerResponse.prototype.writeHead:', res.writeHead !== http.ServerResponse.prototype.writeHead)
    console.log('  shared prototype end still unchanged:', http.OutgoingMessage.prototype.end === origEnd)
    console.log('  shared prototype writeHead still unchanged:', http.ServerResponse.prototype.writeHead === origWriteHead)
    console.log('  req has own "session":', Object.prototype.hasOwnProperty.call(req, 'session'))
    console.log('  req has own "sessionStore":', Object.prototype.hasOwnProperty.call(req, 'sessionStore'))
    res.end('ok')
  })
})

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port
  http.get({ host: '127.0.0.1', port: port, path: '/' }, function (resp) {
    resp.resume()
    resp.on('end', function () {
      server.close()
      console.log('done')
    })
  })
})
