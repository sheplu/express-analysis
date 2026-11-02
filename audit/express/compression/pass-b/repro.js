'use strict'

// Reproduction for the compression@1.8.2 monkeypatch audit (pass-b).
// Usage: node repro.js "$PACKAGE_ROOT"
// Verifies:
//  1. Requiring compression (and its deps) does NOT mutate shared core
//     prototypes or the core buffer module.
//  2. Running the middleware installs per-instance own-property overrides
//     (write, end, on, flush) on the live ServerResponse, and on-headers
//     installs an own-property writeHead wrapper.
//  3. Shared prototypes are still untouched after a full compressed request.
// Output is JSON only; no absolute paths are printed.

var http = require('http')
var events = require('events')
var zlib = require('zlib')
var buffer = require('buffer')
var path = require('path')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro.js <package-root>')
  process.exit(1)
}

function hasOwn (o, k) { return Object.prototype.hasOwnProperty.call(o, k) }

var before = {
  write: http.OutgoingMessage.prototype.write,
  end: http.OutgoingMessage.prototype.end,
  writeHead: http.ServerResponse.prototype.writeHead,
  on: events.EventEmitter.prototype.on,
  gzipDestroy: zlib.Gzip.prototype.destroy,
  bufferModuleProps: Object.getOwnPropertyNames(buffer).sort().join(',')
}

var compression = require(path.join(pkgRoot, 'index.js'))
var safeBuffer = require(path.join(pkgRoot, 'node_modules', 'safe-buffer'))

var afterRequire = {
  protoWriteSame: http.OutgoingMessage.prototype.write === before.write,
  protoEndSame: http.OutgoingMessage.prototype.end === before.end,
  protoWriteHeadSame: http.ServerResponse.prototype.writeHead === before.writeHead,
  protoOnSame: events.EventEmitter.prototype.on === before.on,
  gzipDestroySame: zlib.Gzip.prototype.destroy === before.gzipDestroy,
  bufferModulePropsSame:
    Object.getOwnPropertyNames(buffer).sort().join(',') === before.bufferModuleProps,
  safeBufferIsCoreBufferModule: safeBuffer === buffer,
  outgoingHasFlushMethod: typeof http.OutgoingMessage.prototype.flush === 'function'
}

var instanceReport = null

var server = http.createServer(function (req, res) {
  var pre = {
    writeOwn: hasOwn(res, 'write'),
    endOwn: hasOwn(res, 'end'),
    onOwn: hasOwn(res, 'on'),
    flushOwn: hasOwn(res, 'flush'),
    writeHeadOwn: hasOwn(res, 'writeHead')
  }

  compression({ threshold: 0 })(req, res, function next () {
    instanceReport = {
      pre: pre,
      post: {
        writeOwnOverride: hasOwn(res, 'write') && res.write !== before.write,
        endOwnOverride: hasOwn(res, 'end') && res.end !== before.end,
        onOwnOverride: hasOwn(res, 'on') && res.on !== before.on,
        flushOwnNewMethod: hasOwn(res, 'flush') && typeof res.flush === 'function',
        writeHeadOwnOverride: hasOwn(res, 'writeHead') && res.writeHead !== before.writeHead,
        writeHeadWrapperName: res.writeHead.name
      }
    }
    res.setHeader('Content-Type', 'text/plain')
    res.end(new Array(2048).join('x'))
  })
})

server.listen(0, '127.0.0.1', function () {
  http.get({
    host: '127.0.0.1',
    port: server.address().port,
    headers: { 'Accept-Encoding': 'gzip' }
  }, function (r) {
    r.resume()
    r.on('end', function () {
      var afterRequest = {
        protoWriteSame: http.OutgoingMessage.prototype.write === before.write,
        protoEndSame: http.OutgoingMessage.prototype.end === before.end,
        protoWriteHeadSame: http.ServerResponse.prototype.writeHead === before.writeHead,
        protoOnSame: events.EventEmitter.prototype.on === before.on,
        gzipDestroySame: zlib.Gzip.prototype.destroy === before.gzipDestroy
      }
      console.log(JSON.stringify({
        node: process.version,
        responseContentEncoding: r.headers['content-encoding'],
        afterRequire: afterRequire,
        instance: instanceReport,
        afterRequest: afterRequest
      }, null, 2))
      server.close()
    })
  })
})
