'use strict'
// Audit reproduction for send@1.2.1 (pass A).
// Usage: node repro-check.js "$PACKAGE_ROOT"
// Prints only booleans/counters; no machine paths are echoed.

var path = require('path')
var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-check.js <package-root>')
  process.exit(1)
}

// --- 1. Instrument Error.prepareStackTrace to count writes during require ---
var pstWrites = []
var pstCurrent
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return pstCurrent },
  set: function (v) {
    pstWrites.push(typeof v === 'function' ? (v.name || 'anonymous-fn') : String(v))
    pstCurrent = v
  }
})
var limitBefore = Error.stackTraceLimit
var envDebugBefore = 'DEBUG' in process.env

// --- 2. Snapshot core API identities before loading send ---
var fs = require('fs')
var http = require('http')
var Stream = require('stream')
var EE = require('events').EventEmitter
var snap = {
  createReadStream: fs.createReadStream,
  stat: fs.stat,
  streamPipe: Stream.prototype.pipe,
  setHeader: http.ServerResponse.prototype.setHeader,
  end: http.ServerResponse.prototype.end,
  assignSocket: http.ServerResponse.prototype.assignSocket,
  eeOn: EE.prototype.on,
  eeEmit: EE.prototype.emit,
  errProto: Object.getOwnPropertyNames(Error.prototype).join(','),
  setProto: Object.setPrototypeOf
}

var send = require(path.resolve(pkgRoot))

console.log('[load] prepareStackTrace write count during require(send):', pstWrites.length)
console.log('[load] prepareStackTrace write sequence:', JSON.stringify(pstWrites))
console.log('[load] prepareStackTrace restored to undefined:', pstCurrent === undefined)
console.log('[load] stackTraceLimit restored:', Error.stackTraceLimit === limitBefore)
console.log('[load] process.env.DEBUG presence unchanged:', ('DEBUG' in process.env) === envDebugBefore)

// --- 3. on-finished patchAssignSocket reachability on this runtime ---
var onFinished = require(path.resolve(pkgRoot, 'node_modules', 'on-finished'))
var res = new http.ServerResponse({ method: 'GET' })
console.log('[on-finished] fresh ServerResponse socket is null (not undefined):',
  res.socket === null, res.socket === undefined)
onFinished(res, function () {})
console.log('[on-finished] instance assignSocket own-property added:',
  Object.prototype.hasOwnProperty.call(res, 'assignSocket'))
console.log('[on-finished] prototype assignSocket identity unchanged:',
  http.ServerResponse.prototype.assignSocket === snap.assignSocket)
console.log('[on-finished] __onFinished expando added to res:',
  Object.prototype.hasOwnProperty.call(res, '__onFinished'))

// --- 4. Exercise a real send pipeline (200 + 404), then re-check identities ---
var server = http.createServer(function (req, res2) {
  send(req, req.url, { root: pkgRoot }).pipe(res2)
})
server.listen(0, '127.0.0.1', function () {
  var port = server.address().port
  http.get({ host: '127.0.0.1', port: port, path: '/README.md' }, function (r1) {
    r1.resume()
    r1.on('end', function () {
      console.log('[runtime] 200 request status:', r1.statusCode)
      http.get({ host: '127.0.0.1', port: port, path: '/no-such-file' }, function (r2) {
        r2.resume()
        r2.on('end', function () {
          console.log('[runtime] 404 request status:', r2.statusCode)
          server.close(function () { finish() })
        })
      })
    })
  })
})

function finish () {
  console.log('[post] fs.createReadStream identity unchanged:', fs.createReadStream === snap.createReadStream)
  console.log('[post] fs.stat identity unchanged:', fs.stat === snap.stat)
  console.log('[post] Stream.prototype.pipe identity unchanged:', Stream.prototype.pipe === snap.streamPipe)
  console.log('[post] ServerResponse.prototype.setHeader unchanged:', http.ServerResponse.prototype.setHeader === snap.setHeader)
  console.log('[post] ServerResponse.prototype.end unchanged:', http.ServerResponse.prototype.end === snap.end)
  console.log('[post] ServerResponse.prototype.assignSocket unchanged:', http.ServerResponse.prototype.assignSocket === snap.assignSocket)
  console.log('[post] EventEmitter.prototype.on unchanged:', EE.prototype.on === snap.eeOn)
  console.log('[post] EventEmitter.prototype.emit unchanged:', EE.prototype.emit === snap.eeEmit)
  console.log('[post] Error.prototype own props unchanged:', Object.getOwnPropertyNames(Error.prototype).join(',') === snap.errProto)
  console.log('[post] Object.setPrototypeOf unchanged:', Object.setPrototypeOf === snap.setProto)
  console.log('[post] prepareStackTrace still undefined:', pstCurrent === undefined)
  console.log('[post] stackTraceLimit still original:', Error.stackTraceLimit === limitBefore)
  console.log('[runtime] node version:', process.versions.node)
}
