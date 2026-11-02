'use strict'
// Reproduction for morgan monkeypatch audit (pass A).
// Usage: node repro.js "$PACKAGE_ROOT"
// Prints only sanitized facts (no machine paths).

var path = require('path')
var http = require('http')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"')
  process.exit(1)
}

var results = {}
results.node = process.version

// --- Observe writes to Error.prepareStackTrace / Error.stackTraceLimit during require ---
var prepWrites = []
var prepValue = Error.prepareStackTrace // undefined by default
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return prepValue },
  set: function (v) {
    prepWrites.push(typeof v === 'function' ? 'fn:' + (v.name || 'anonymous') : String(v))
    prepValue = v
  }
})
var limitBefore = Error.stackTraceLimit
var protoWriteHeadBefore = http.ServerResponse.prototype.writeHead

var morgan = require(path.join(pkgRoot, 'index.js'))

results.prepareStackTrace_writes_during_require = prepWrites.slice()
results.prepareStackTrace_after_require = String(prepValue)
results.stackTraceLimit_restored = Error.stackTraceLimit === limitBefore
results.proto_writeHead_unchanged_after_require =
  http.ServerResponse.prototype.writeHead === protoWriteHeadBefore

// remove observer, restore plain state
delete Error.prepareStackTrace
Error.prepareStackTrace = prepValue

// --- ServerResponse.socket initial value (on-finished patchAssignSocket reachability) ---
var bareRes = new http.ServerResponse({ method: 'GET' })
results.bare_ServerResponse_socket_is_null = bareRes.socket === null
results.bare_ServerResponse_socket_is_undefined = bareRes.socket === undefined

// --- Live request through morgan middleware ---
var lines = []
var sink = { write: function (s) { lines.push(String(s)) } }
var mw = morgan('combined', { stream: sink })

var server = http.createServer(function (req, res) {
  mw(req, res, function () {
    results.req_startAt_own = Object.prototype.hasOwnProperty.call(req, '_startAt')
    results.req_remoteAddress_own = Object.prototype.hasOwnProperty.call(req, '_remoteAddress')
    results.res_writeHead_is_own_property = Object.prototype.hasOwnProperty.call(res, 'writeHead')
    results.res_writeHead_differs_from_prototype =
      res.writeHead !== http.ServerResponse.prototype.writeHead
    results.res_writeHead_wrapper_name = res.writeHead.name
    results.proto_writeHead_unchanged_during_request =
      http.ServerResponse.prototype.writeHead === protoWriteHeadBefore
    results.res_onFinished_own = Object.prototype.hasOwnProperty.call(res, '__onFinished')
    results.res_assignSocket_is_own_property =
      Object.prototype.hasOwnProperty.call(res, 'assignSocket')
    // no explicit res.writeHead() call: exercise core implicit header path
    res.end('ok')
  })
})

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port
  http.get({ host: '127.0.0.1', port: port, path: '/x' }, function (cres) {
    cres.resume()
    cres.on('end', function () {
      setImmediate(function () {
        results.res_startAt_recorded_via_implicit_writeHead = lines.length === 1 &&
          / 200 /.test(lines[0])
        results.log_line_sample = lines[0] ? lines[0].replace(/^[^ ]+/, '<ip>').trim() : null
        server.close(function () {
          console.log(JSON.stringify(results, null, 2))
        })
      })
    })
  })
})
