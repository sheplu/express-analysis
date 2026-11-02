// Reproduction: on-headers instance override of res.writeHead via response-time
// Usage: node repro-onheaders.js "$PACKAGE_ROOT"
'use strict'

var path = require('path')
var http = require('http')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-onheaders.js "$PACKAGE_ROOT"')
  process.exit(2)
}

var responseTime = require(path.resolve(pkgRoot))
var middleware = responseTime()

var protoWriteHead = http.ServerResponse.prototype.writeHead

var server = http.createServer(function (req, res) {
  var beforeOwn = Object.prototype.hasOwnProperty.call(res, 'writeHead')
  middleware(req, res, function () {
    var afterOwn = Object.prototype.hasOwnProperty.call(res, 'writeHead')
    console.log('own writeHead before middleware:', beforeOwn)
    console.log('own writeHead after middleware :', afterOwn)
    console.log('res.writeHead === ServerResponse.prototype.writeHead:',
      res.writeHead === protoWriteHead)
    console.log('prototype.writeHead unchanged:',
      http.ServerResponse.prototype.writeHead === protoWriteHead)
    // implicit header path: res.end() -> _implicitHeader() -> this.writeHead()
    res.end('ok')
  })
})

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port
  http.get({ host: '127.0.0.1', port: port, path: '/' }, function (res) {
    console.log('x-response-time header set on implicit writeHead:',
      typeof res.headers['x-response-time'] === 'string')
    res.resume()
    res.on('end', function () {
      server.close()
    })
  })
})
