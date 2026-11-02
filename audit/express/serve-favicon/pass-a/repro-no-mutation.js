// Reproduction: verify serve-favicon (+ runtime deps) does not mutate Node.js core.
// Usage: node repro-no-mutation.js "$PACKAGE_ROOT"
// Compares core function identities and own-property sets before/after
// requiring serve-favicon and exercising the middleware.
'use strict'

var assert = require('assert')
var path = require('path')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-no-mutation.js "$PACKAGE_ROOT"')
  process.exit(2)
}

var http = require('http')
var fs = require('fs')
var url = require('url')
var buffer = require('buffer')

function snap () {
  return {
    BufferId: buffer.Buffer,
    BufferFrom: buffer.Buffer.from,
    BufferAlloc: buffer.Buffer.alloc,
    bufferKeys: Object.getOwnPropertyNames(buffer).sort().join(','),
    BufferKeys: Object.getOwnPropertyNames(buffer.Buffer).sort().join(','),
    BufferProtoKeys: Object.getOwnPropertyNames(buffer.Buffer.prototype).sort().join(','),
    fsReadFile: fs.readFile,
    fsStatSync: fs.statSync,
    fsKeys: Object.getOwnPropertyNames(fs).sort().join(','),
    urlParse: url.parse,
    UrlId: url.Url,
    urlKeys: Object.getOwnPropertyNames(url).sort().join(','),
    UrlProtoKeys: Object.getOwnPropertyNames(url.Url.prototype).sort().join(','),
    IncomingProtoKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    ServerResProtoKeys: Object.getOwnPropertyNames(http.ServerResponse.prototype).sort().join(','),
    OutgoingSetHeader: http.OutgoingMessage.prototype.setHeader,
    ObjectProtoKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(','),
    DateParse: Date.parse
  }
}

var before = snap()

// Load target and exercise the middleware with a Buffer-backed icon.
var favicon = require(path.resolve(pkgRoot))
var middleware = favicon(Buffer.from([0x00, 0x00, 0x01, 0x00]))

var req = { url: '/favicon.ico?x=1', method: 'GET', headers: {} }
var headersOut = {}
var res = {
  statusCode: null,
  setHeader: function (k, v) { headersOut[k.toLowerCase()] = v },
  getHeader: function (k) { return headersOut[k.toLowerCase()] },
  end: function () { this.ended = true }
}
middleware(req, res, function next (err) { throw err || new Error('unexpected next()') })
assert.strictEqual(res.statusCode, 200, 'middleware served icon')
assert.ok(res.ended, 'response ended')

var after = snap()
var diffs = []
for (var k in before) {
  if (before[k] !== after[k]) diffs.push(k)
}

// safe-buffer re-export identity on modern Node (Buffer.from branch).
var safeBuffer = require(path.join(path.resolve(pkgRoot), 'node_modules', 'safe-buffer'))
assert.strictEqual(safeBuffer, buffer, 'safe-buffer re-exports the core buffer module object')
assert.strictEqual(safeBuffer.Buffer, buffer.Buffer, 'safe-buffer.Buffer is core Buffer')

// parseurl cache lands on the instance only, never the core prototype.
assert.ok(Object.prototype.hasOwnProperty.call(req, '_parsedUrl'), 'req instance gained _parsedUrl cache')
assert.ok(!('_parsedUrl' in http.IncomingMessage.prototype), 'core IncomingMessage.prototype has no _parsedUrl')

console.log('node version:', process.version)
console.log('core snapshot diffs after require+exercise:', diffs.length === 0 ? 'none' : diffs.join(', '))
console.log('safe-buffer === require("buffer"):', safeBuffer === buffer)
console.log('req own _parsedUrl (instance-only cache):', Object.prototype.hasOwnProperty.call(req, '_parsedUrl'))
console.log(diffs.length === 0 ? 'PASS: no core mutation observed' : 'FAIL: core mutation observed')
process.exit(diffs.length === 0 ? 0 : 1)
