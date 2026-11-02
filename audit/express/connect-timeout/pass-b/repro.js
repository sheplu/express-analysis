'use strict'
// Reproduction for connect-timeout monkeypatch audit (pass-b).
// Usage: node repro.js "$PACKAGE_ROOT"
// Proves: (1) depd (via http-errors) temporarily writes Error.prepareStackTrace
// at require time and restores it; (2) on-headers replaces res.writeHead on the
// ServerResponse INSTANCE (prototype untouched); (3) connect-timeout adds new
// library-owned keys req.timedout / req.clearTimeout (no core members shadowed);
// (4) on-finished adds res.__onFinished metadata and does not touch assignSocket
// on modern Node.

var path = require('path')
var http = require('http')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"')
  process.exit(1)
}

// --- 1. instrument Error.prepareStackTrace before loading the package ---
var writes = 0
var current
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return current },
  set: function (v) { writes++; current = v }
})

var timeout = require(path.join(pkgRoot, 'index.js'))

var writesAtRequire = writes
var restoredAfterRequire = current === undefined
delete Error.prepareStackTrace // back to plain data property
console.log('1a. Error.prepareStackTrace writes during require():', writesAtRequire)
console.log('1b. Error.prepareStackTrace restored (undefined) after require():', restoredAfterRequire)

// --- 2-4. run the middleware against a real HTTP request ---
var protoWriteHead = http.ServerResponse.prototype.writeHead
var protoAssignSocket = http.ServerResponse.prototype.assignSocket
var has = Function.prototype.call.bind(Object.prototype.hasOwnProperty)

var server = http.createServer(function (req, res) {
  var ownWriteHeadBefore = has(res, 'writeHead')
  var mw = timeout(2000)
  mw(req, res, function () {
    console.log('2a. res own "writeHead" before middleware:', ownWriteHeadBefore)
    console.log('2b. res own "writeHead" after middleware:', has(res, 'writeHead'))
    console.log('2c. instance writeHead !== ServerResponse.prototype.writeHead:', res.writeHead !== protoWriteHead)
    console.log('2d. ServerResponse.prototype.writeHead unchanged (shared):', http.ServerResponse.prototype.writeHead === protoWriteHead)
    console.log('3a. req own "timedout":', has(req, 'timedout'), '| value:', req.timedout)
    console.log('3b. req own "clearTimeout":', has(req, 'clearTimeout'))
    console.log('3c. "timedout" in IncomingMessage.prototype (core member?):', 'timedout' in http.IncomingMessage.prototype)
    console.log('3d. "clearTimeout" in IncomingMessage.prototype (core member?):', 'clearTimeout' in http.IncomingMessage.prototype)
    console.log('4a. res own "__onFinished" (on-finished metadata):', has(res, '__onFinished'))
    console.log('4b. res own "assignSocket" (patchAssignSocket dormant?):', has(res, 'assignSocket'))
    console.log('4c. ServerResponse.prototype.assignSocket unchanged:', http.ServerResponse.prototype.assignSocket === protoAssignSocket)
    console.log('4d. res.socket === undefined (patch guard):', res.socket === undefined)
    req.clearTimeout()
    res.end('ok')
  })
})

server.listen(0, '127.0.0.1', function () {
  http.get({ host: '127.0.0.1', port: server.address().port }, function (resp) {
    resp.resume()
    resp.on('end', function () {
      console.log('done. node', process.version)
      server.close()
    })
  })
})
