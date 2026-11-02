// Usage: node repro-core-snapshot.js "$PACKAGE_ROOT"
// Snapshots identities/descriptors of core objects before/after loading
// serve-favicon and exercising the middleware; reports any differences.
'use strict'
var assert = require('assert')
var http = require('http')
var url = require('url')
var buffer = require('buffer')
var fs = require('fs')
var Module = require('module')

var pkgRoot = process.argv[2]
if (!pkgRoot) { console.error('missing package root arg'); process.exit(2) }

function snap () {
  return {
    bufferFrom: buffer.Buffer.from,
    bufferAlloc: buffer.Buffer.alloc,
    bufferProtoKeys: Object.getOwnPropertyNames(buffer.Buffer.prototype).sort().join(','),
    bufferModuleKeys: Object.getOwnPropertyNames(buffer).sort().join(','),
    urlParse: url.parse,
    urlUrl: url.Url,
    urlUrlProtoKeys: Object.getOwnPropertyNames(url.Url.prototype).sort().join(','),
    incomingProtoKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    serverResProtoKeys: Object.getOwnPropertyNames(http.ServerResponse.prototype).sort().join(','),
    setHeader: http.OutgoingMessage.prototype.setHeader,
    resEnd: http.OutgoingMessage.prototype.end,
    fsReadFile: fs.readFile,
    fsStatSync: fs.statSync,
    moduleLoad: Module._load,
    moduleResolve: Module._resolveFilename,
    requireExtJs: require.extensions['.js'],
    dateParse: Date.parse,
    objectAssign: Object.assign,
    objProtoKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(',')
  }
}

var before = snap()
var favicon = require(pkgRoot) // loads serve-favicon + etag, fresh, ms, parseurl, safe-buffer
var afterLoad = snap()

// exercise middleware: buffer icon, GET /favicon.ico hit + conditional + other path + POST
var icoBuf = require('buffer').Buffer.from([0, 0, 1, 0])
var mw = favicon(icoBuf)
function fakeRes () {
  var h = {}
  return {
    statusCode: 0,
    setHeader: function (k, v) { h[k.toLowerCase()] = v },
    getHeader: function (k) { return h[k.toLowerCase()] },
    end: function () {},
    _headers: h
  }
}
var req1 = { url: '/favicon.ico', method: 'GET', headers: {} }
mw(req1, fakeRes(), function () { throw new Error('unexpected next') })
var res2 = fakeRes()
mw({ url: '/favicon.ico', method: 'GET', headers: { 'if-none-match': res2.getHeader ? '' : '' } }, res2, function () {})
mw({ url: '/other', method: 'GET', headers: {} }, fakeRes(), function () {})
mw({ url: '/favicon.ico', method: 'POST', headers: {} }, fakeRes(), function () {})
var afterUse = snap()

var diffs = []
Object.keys(before).forEach(function (k) {
  if (before[k] !== afterLoad[k]) diffs.push('after load: ' + k)
  if (before[k] !== afterUse[k]) diffs.push('after use: ' + k)
})

// cached-parse metadata check (expected library-owned expando, not a core override)
console.log('req expando keys added by middleware:', Object.keys(req1).filter(function (k) {
  return ['url', 'method', 'headers'].indexOf(k) === -1
}).join(',') || '(none)')
console.log('safe-buffer === core buffer module:', require(pkgRoot + '/node_modules/safe-buffer') === buffer)
console.log('node:', process.version)
if (diffs.length) {
  console.log('CORE MUTATIONS DETECTED:'); diffs.forEach(function (d) { console.log(' -', d) })
  process.exit(1)
} else {
  console.log('RESULT: no core identity/descriptor/prototype changes detected')
}
assert.ok(true)
