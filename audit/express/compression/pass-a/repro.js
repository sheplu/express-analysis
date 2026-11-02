'use strict'

// Reproduction for the compression@1.8.2 monkeypatch audit (pass A).
// Usage: node repro.js "$PACKAGE_ROOT"
// Proves: (1) requiring compression mutates no shared prototypes;
// (2) running the middleware reassigns write/end/on (+ writeHead via
// on-headers, + flush addition) as OWN properties of the live
// ServerResponse instance; (3) originals are saved and still reachable;
// (4) prototypes remain untouched after a full compressed round trip.

var path = require('path')
var http = require('http')
var events = require('events')
var zlib = require('zlib')

var packageRoot = process.argv[2] || '.'

var protoWrite = http.OutgoingMessage.prototype.write
var protoEnd = http.OutgoingMessage.prototype.end
var protoWriteHead = http.ServerResponse.prototype.writeHead
var protoOn = events.EventEmitter.prototype.on
var protoFlushExists = 'flush' in http.OutgoingMessage.prototype

var compression = require(path.join(packageRoot, 'index.js'))

console.log('[1] prototypes unchanged after require():',
  protoWrite === http.OutgoingMessage.prototype.write &&
  protoEnd === http.OutgoingMessage.prototype.end &&
  protoWriteHead === http.ServerResponse.prototype.writeHead &&
  protoOn === events.EventEmitter.prototype.on)
console.log('[2] OutgoingMessage.prototype has own/inherited "flush" before middleware:', protoFlushExists)

var middleware = compression({ threshold: 0 })
var checked = false

var server = http.createServer(function (req, res) {
  var keys = ['write', 'end', 'on', 'flush', 'writeHead']
  var ownBefore = keys.filter(function (k) { return Object.prototype.hasOwnProperty.call(res, k) })
  middleware(req, res, function () {})
  var ownAfter = keys.filter(function (k) { return Object.prototype.hasOwnProperty.call(res, k) })

  if (!checked) {
    checked = true
    console.log('[3] own properties on res BEFORE middleware:', JSON.stringify(ownBefore))
    console.log('[4] own properties on res AFTER middleware :', JSON.stringify(ownAfter))
    console.log('[5] res.write shadows OutgoingMessage.prototype.write:', res.write !== protoWrite)
    console.log('[6] res.end shadows OutgoingMessage.prototype.end:', res.end !== protoEnd)
    console.log('[7] res.on shadows EventEmitter.prototype.on:', res.on !== protoOn)
    console.log('[8] res.writeHead shadows ServerResponse.prototype.writeHead:', res.writeHead !== protoWriteHead)
    console.log('[9] prototype methods themselves untouched:',
      protoWrite === http.OutgoingMessage.prototype.write &&
      protoEnd === http.OutgoingMessage.prototype.end &&
      protoWriteHead === http.ServerResponse.prototype.writeHead &&
      protoOn === events.EventEmitter.prototype.on)
  }

  res.setHeader('Content-Type', 'text/plain')
  res.end('hello world hello world hello world hello world')
})

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port
  http.get({ host: '127.0.0.1', port: port, headers: { 'accept-encoding': 'gzip' } }, function (resp) {
    console.log('[10] response content-encoding:', resp.headers['content-encoding'])
    var chunks = []
    resp.on('data', function (c) { chunks.push(c) })
    resp.on('end', function () {
      console.log('[11] gunzipped body ok:',
        zlib.gunzipSync(Buffer.concat(chunks)).toString().indexOf('hello world') === 0)
      console.log('[12] shared prototypes still unchanged after full request:',
        protoWrite === http.OutgoingMessage.prototype.write &&
        protoEnd === http.OutgoingMessage.prototype.end &&
        protoWriteHead === http.ServerResponse.prototype.writeHead &&
        protoOn === events.EventEmitter.prototype.on)
      server.close()
    })
  })
})
