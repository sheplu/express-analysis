// Reproduction: verify that requiring and invoking errorhandler does not
// mutate Node.js core prototypes, globals, or core module exports.
// Usage: node repro-check.js "$PACKAGE_ROOT"
'use strict'

var path = require('path')
var http = require('http')
var fs = require('fs')
var util = require('util')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-check.js "$PACKAGE_ROOT"')
  process.exit(2)
}

function snapshot () {
  return {
    srpSetHeader: http.ServerResponse.prototype.setHeader,
    srpEnd: http.ServerResponse.prototype.end,
    srpWriteHead: http.ServerResponse.prototype.writeHead,
    srpStatusCodeDesc: JSON.stringify(Object.getOwnPropertyDescriptor(http.ServerResponse.prototype, 'statusCode')),
    imProtoKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    objectProtoKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(','),
    funcProtoKeys: Object.getOwnPropertyNames(Function.prototype).sort().join(','),
    errorProtoKeys: Object.getOwnPropertyNames(Error.prototype).sort().join(','),
    fsReadFileSync: fs.readFileSync,
    utilInspect: util.inspect,
    processNextTick: process.nextTick,
    setImmediateRef: setImmediate,
    objectToString: Object.prototype.toString
  }
}

var before = snapshot()

var errorhandler = require(path.join(pkgRoot, 'index.js'))

var afterRequire = snapshot()

// Exercise all three content branches of the middleware.
var types = ['text/html', 'application/json', 'text/plain']
types.forEach(function (accept) {
  var mw = errorhandler({ log: false })
  var req = { headers: { accept: accept }, socket: { destroy: function () {} } }
  var res = {
    statusCode: 200,
    _header: null,
    headers: {},
    setHeader: function (k, v) { this.headers[k] = v },
    end: function () {}
  }
  var err = new Error('boom')
  err.status = 503
  mw(err, req, res, function () {})
})

// Also exercise the headers-already-sent branch.
;(function () {
  var mw = errorhandler({ log: false })
  var destroyed = false
  var req = { headers: {}, socket: { destroy: function () { destroyed = true } } }
  var res = { statusCode: 200, _header: 'HTTP/1.1 200 OK\r\n\r\n' }
  mw(new Error('late'), req, res, function () {})
  if (!destroyed) throw new Error('expected socket.destroy() call')
})()

var afterCall = snapshot()

var failures = 0
Object.keys(before).forEach(function (key) {
  var okRequire = before[key] === afterRequire[key]
  var okCall = before[key] === afterCall[key]
  if (!okRequire || !okCall) {
    failures++
    console.log('FAIL ' + key + ' changed (afterRequire=' + okRequire + ', afterCall=' + okCall + ')')
  } else {
    console.log('PASS ' + key + ' unchanged')
  }
})

console.log(failures === 0
  ? 'RESULT: no core mutation observed (node ' + process.version + ')'
  : 'RESULT: ' + failures + ' mutation(s) observed (node ' + process.version + ')')
process.exit(failures === 0 ? 0 : 1)
