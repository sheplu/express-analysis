// Usage: node repro-check.js "$PACKAGE_ROOT"
// Snapshots core surfaces before requiring errorhandler, then compares after
// require and after invoking the middleware against a mock req/res.
'use strict'

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-check.js "$PACKAGE_ROOT"')
  process.exit(2)
}

var http = require('http')
var fs = require('fs')
var util = require('util')
var Module = require('module')

function snapshot () {
  return {
    'http.ServerResponse.prototype.setHeader': http.ServerResponse.prototype.setHeader,
    'http.ServerResponse.prototype.end': http.ServerResponse.prototype.end,
    'http.ServerResponse.prototype.writeHead': http.ServerResponse.prototype.writeHead,
    'http.ServerResponse.prototype.statusCode (proto default)': http.ServerResponse.prototype.statusCode,
    'http.IncomingMessage.prototype keys': Object.getOwnPropertyNames(http.IncomingMessage.prototype).join(','),
    'Object.prototype keys': Object.getOwnPropertyNames(Object.prototype).join(','),
    'Error.prototype keys': Object.getOwnPropertyNames(Error.prototype).join(','),
    'global.setImmediate': global.setImmediate,
    'process.nextTick': process.nextTick,
    'fs.readFileSync': fs.readFileSync,
    'util.inspect': util.inspect,
    'Module._load': Module._load,
    'Module._resolveFilename': Module._resolveFilename,
    'require.extensions keys': Object.keys(require.extensions).join(','),
    'JSON.stringify': JSON.stringify,
    'console.error': console.error
  }
}

function diff (label, before, after) {
  var changed = []
  Object.keys(before).forEach(function (k) {
    if (before[k] !== after[k]) changed.push(k)
  })
  if (changed.length) {
    console.log(label + ': CHANGED -> ' + changed.join('; '))
    process.exitCode = 1
  } else {
    console.log(label + ': no core surface changed')
  }
}

var before = snapshot()
var errorhandler = require(pkgRoot)
diff('after require(errorhandler)', before, snapshot())

// Invoke the middleware with a mock req/res for each negotiated branch.
function mockReqRes (accept) {
  var req = {
    headers: accept ? { accept: accept } : {},
    socket: { destroy: function () {} }
  }
  var res = {
    statusCode: 200,
    _header: null,
    headers: {},
    setHeader: function (k, v) { this.headers[k] = v },
    end: function () {}
  }
  return { req: req, res: res }
}

var mw = errorhandler({ log: false })
var err = new Error('boom')
var errKeysBefore = Object.getOwnPropertyNames(err).sort().join(',')
;['text/html', 'application/json', 'text/plain'].forEach(function (accept) {
  var m = mockReqRes(accept)
  mw(err, m.req, m.res, function () {})
})
var errKeysAfter = Object.getOwnPropertyNames(err).sort().join(',')
console.log('error object own keys unchanged after middleware: ' + (errKeysBefore === errKeysAfter))
if (errKeysBefore !== errKeysAfter) process.exitCode = 1

diff('after invoking middleware (html/json/text)', before, snapshot())
console.log('node ' + process.version)
