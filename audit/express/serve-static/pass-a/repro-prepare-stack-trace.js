// Usage: node repro-prepare-stack-trace.js "$PACKAGE_ROOT"
// Proves: (1) requiring serve-static writes Error.prepareStackTrace /
// Error.stackTraceLimit (via send -> http-errors -> depd getStack) and
// synchronously restores them; (2) no persistent mutation of core HTTP /
// stream APIs or process.env.DEBUG survives the require.
'use strict'
const assert = require('assert')
const http = require('http')
const Stream = require('stream')

const packageRoot = process.argv[2]
if (!packageRoot) { console.error('usage: node repro-prepare-stack-trace.js "$PACKAGE_ROOT"'); process.exit(2) }

// Baseline identities before require
const baseline = {
  setHeader: http.ServerResponse.prototype.setHeader,
  end: http.OutgoingMessage.prototype.end,
  assignSocket: http.ServerResponse.prototype.assignSocket,
  pipe: Stream.prototype.pipe,
  emit: require('events').EventEmitter.prototype.emit,
  envDebug: process.env.DEBUG,
  stackTraceLimit: Error.stackTraceLimit
}

// Instrument Error.prepareStackTrace with an accessor to observe writes
let writes = []
let current
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get () { return current },
  set (v) { writes.push(typeof v); current = v }
})

require(packageRoot)

// 1. The write happened at require time and was restored
assert.strictEqual(writes.length >= 2, true, 'expected set+restore writes to Error.prepareStackTrace')
assert.strictEqual(writes[0], 'function', 'first write installs depd prepareObjectStackTrace')
assert.strictEqual(writes[writes.length - 1], 'undefined', 'last write restores original (undefined)')
assert.strictEqual(current, undefined, 'Error.prepareStackTrace restored after require')

// 2. No persistent core mutations
assert.strictEqual(http.ServerResponse.prototype.setHeader, baseline.setHeader)
assert.strictEqual(http.OutgoingMessage.prototype.end, baseline.end)
assert.strictEqual(http.ServerResponse.prototype.assignSocket, baseline.assignSocket)
assert.strictEqual(Stream.prototype.pipe, baseline.pipe)
assert.strictEqual(require('events').EventEmitter.prototype.emit, baseline.emit)
assert.strictEqual(process.env.DEBUG, baseline.envDebug)
assert.strictEqual(Error.stackTraceLimit, baseline.stackTraceLimit)

// 3. Serving a request does not add own-property overrides on req/res core methods
const serveStatic = require(packageRoot)
const middleware = serveStatic(packageRoot)
const server = http.createServer(function (req, res) {
  writes = [] // reset observer; no deprecation fires for 4xx/5xx paths
  middleware(req, res, function next (err) {
    res.statusCode = err ? (err.statusCode || 500) : 404
    res.end()
  })
  res.on('finish', function () {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(res, 'setHeader'), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(res, 'end'), false)
    assert.strictEqual(Object.prototype.hasOwnProperty.call(res, 'assignSocket'), false, 'no instance assignSocket override (patchAssignSocket not reached)')
    assert.strictEqual(writes.length, 0, 'no Error.prepareStackTrace writes during request handling')
  })
})
server.listen(0, function () {
  http.get({ port: server.address().port, path: '/LICENSE' }, function (res2) {
    res2.resume()
    res2.on('end', function () {
      server.close()
      console.log('repro OK: write+restore at require time; no persistent core mutations; node', process.version)
    })
  })
})
