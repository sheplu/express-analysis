// Reproduction: method-override rewrites core-assigned req.method on a live
// http.IncomingMessage instance. Run: node repro-method-override.js "$PACKAGE_ROOT"
'use strict'
var path = require('path')
var http = require('http')
var pkgRoot = process.argv[2]
if (!pkgRoot) { console.error('usage: node repro-method-override.js "$PACKAGE_ROOT"'); process.exit(1) }
var methodOverride = require(path.join(pkgRoot, 'index.js'))
var mw = methodOverride() // default X-HTTP-Method-Override header getter

var server = http.createServer(function (req, res) {
  var before = {
    method: req.method,
    ownDescriptor: Object.getOwnPropertyDescriptor(req, 'method'),
    protoDescriptor: Object.getOwnPropertyDescriptor(http.IncomingMessage.prototype, 'method') || null
  }
  mw(req, res, function () {
    var after = {
      method: req.method,
      originalMethod: req.originalMethod,
      ownDescriptor: Object.getOwnPropertyDescriptor(req, 'method'),
      isIncomingMessage: req instanceof http.IncomingMessage
    }
    console.log(JSON.stringify({ before: before, after: after }, null, 2))
    res.end('ok')
    server.close()
  })
})

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port
  var req = http.request({
    host: '127.0.0.1',
    port: port,
    method: 'POST',
    path: '/',
    headers: { 'X-HTTP-Method-Override': 'DELETE' }
  }, function (res) { res.resume() })
  req.end()
})
