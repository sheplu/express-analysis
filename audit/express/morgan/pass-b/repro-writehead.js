'use strict'

// Reproduction for the morgan pass-b patch audit.
// Usage: node repro-writehead.js "$PACKAGE_ROOT"
// Verifies, on live http.ServerResponse / http.IncomingMessage instances:
//   1. morgan (default, non-immediate mode) replaces res.writeHead with an own
//      wrapper (via on-headers) while the shared prototype stays untouched.
//   2. morgan annotates req/res with _startAt/_startTime/_remoteAddress and
//      on-finished adds res.__onFinished; none shadow core members.
//   3. on-finished's patchAssignSocket branch is NOT taken (no own
//      res.assignSocket property) because res.socket is already assigned.
//   4. requiring morgan leaves process.env.DEBUG value-identical and restores
//      Error.prepareStackTrace / Error.stackTraceLimit (depd getStack).

var http = require('http')
var path = require('path')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-writehead.js "$PACKAGE_ROOT"')
  process.exit(1)
}

// --- require-time checks (debug env round-trip, depd Error restore) ---
process.env.DEBUG = '__pass_b_probe__'
var prepBefore = Error.prepareStackTrace
var limitBefore = Error.stackTraceLimit
var protoWriteHeadBefore = http.ServerResponse.prototype.writeHead

var morgan = require(path.join(pkgRoot, 'index.js'))

var requireTime = {
  debugEnvPreserved: process.env.DEBUG === '__pass_b_probe__',
  prepareStackTraceRestored: Error.prepareStackTrace === prepBefore,
  stackTraceLimitRestored: Error.stackTraceLimit === limitBefore,
  serverResponsePrototypeWriteHeadUntouched:
    http.ServerResponse.prototype.writeHead === protoWriteHeadBefore
}

// --- per-request checks ---
var mw = morgan('combined', { stream: { write: function () {} } })
var own = Object.prototype.hasOwnProperty

var server = http.createServer(function (req, res) {
  var beforeClean =
    res.writeHead === protoWriteHeadBefore &&
    !own.call(res, 'writeHead') &&
    !own.call(req, '_startAt') &&
    !own.call(res, '_startAt')

  mw(req, res, function () {})

  var after = {
    resWriteHeadIsOwnProperty: own.call(res, 'writeHead'),
    resWriteHeadIsCoreFunction: res.writeHead === protoWriteHeadBefore,
    resWriteHeadName: res.writeHead.name,
    prototypeWriteHeadUnchanged:
      http.ServerResponse.prototype.writeHead === protoWriteHeadBefore,
    reqOwnKeys: {
      _startAt: own.call(req, '_startAt'),
      _startTime: own.call(req, '_startTime'),
      _remoteAddress: own.call(req, '_remoteAddress')
    },
    resOwnKeys: {
      _startAt: own.call(res, '_startAt'),
      _startTime: own.call(res, '_startTime'),
      __onFinished: own.call(res, '__onFinished')
    },
    patchAssignSocketApplied: own.call(res, 'assignSocket'),
    resSocketTypeAtAttach: res.socket === null
      ? 'null'
      : typeof res.socket
  }

  console.log(JSON.stringify({
    nodeVersion: process.version,
    requireTime: requireTime,
    beforeMiddlewareClean: beforeClean,
    afterMiddleware: after
  }, null, 2))

  res.end('ok')
})

server.listen(0, '127.0.0.1', function () {
  http.get({ host: '127.0.0.1', port: server.address().port }, function (r) {
    r.resume()
    r.on('end', function () { server.close() })
  })
})
