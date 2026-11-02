'use strict'
// Usage: node repro-writehead-override.js "$PACKAGE_ROOT"
// Confirms: cookie-session middleware (via on-headers) replaces res.writeHead
// with an own-property wrapper on the live ServerResponse instance, while the
// shared ServerResponse.prototype.writeHead remains untouched.
var http = require('http')
var cookieSession = require(process.argv[2])

var protoWriteHead = http.ServerResponse.prototype.writeHead
var middleware = cookieSession({ keys: ['test-key'] })

var server = http.createServer(function (req, res) {
  var beforeOwn = Object.prototype.hasOwnProperty.call(res, 'writeHead')
  var beforeSame = res.writeHead === protoWriteHead
  middleware(req, res, function next () {
    var afterOwn = Object.prototype.hasOwnProperty.call(res, 'writeHead')
    var afterSame = res.writeHead === protoWriteHead
    var sessionDesc = Object.getOwnPropertyDescriptor(req, 'session')
    req.session.touched = true
    res.end(JSON.stringify({
      writeHeadOwnBefore: beforeOwn,
      writeHeadIsPrototypeBefore: beforeSame,
      writeHeadOwnAfter: afterOwn,
      writeHeadIsPrototypeAfter: afterSame,
      wrapperName: res.writeHead.name,
      reqSessionDesc: sessionDesc && {
        enumerable: sessionDesc.enumerable,
        configurable: sessionDesc.configurable,
        hasGetSet: typeof sessionDesc.get === 'function' && typeof sessionDesc.set === 'function'
      },
      reqSessionOptionsOwn: Object.prototype.hasOwnProperty.call(req, 'sessionOptions')
    }))
  })
})

server.listen(0, '127.0.0.1', function () {
  http.get({ host: '127.0.0.1', port: server.address().port }, function (res) {
    var body = ''
    res.on('data', function (c) { body += c })
    res.on('end', function () {
      console.log('in-request state:', body)
      console.log('set-cookie emitted:', JSON.stringify(res.headers['set-cookie']))
      console.log('prototype.writeHead unchanged after request:',
        http.ServerResponse.prototype.writeHead === protoWriteHead)
      server.close()
    })
  })
})
