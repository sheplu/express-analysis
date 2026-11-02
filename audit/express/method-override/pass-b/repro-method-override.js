// Reproduction: does method-override mutate shared Node.js core state, and
// what exactly happens to req.method on a live request?
// Usage: node repro-method-override.js "$PACKAGE_ROOT"
'use strict'

const http = require('http')
const path = require('path')

const packageRoot = process.argv[2]
if (!packageRoot) {
  console.error('usage: node repro-method-override.js "$PACKAGE_ROOT"')
  process.exit(1)
}

function snapshot () {
  return {
    IncomingMessage: http.IncomingMessage,
    ServerResponse: http.ServerResponse,
    createServer: http.createServer,
    request: http.request,
    imProtoNames: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    srProtoNames: Object.getOwnPropertyNames(http.ServerResponse.prototype).sort().join(','),
    setHeader: http.ServerResponse.prototype.setHeader,
    emit: http.IncomingMessage.prototype.emit,
    METHODS: JSON.stringify(http.METHODS),
    methodOnProto: Object.getOwnPropertyDescriptor(http.IncomingMessage.prototype, 'method')
  }
}

const before = snapshot()
const methodOverride = require(path.join(packageRoot, 'index.js'))
const after = snapshot()

const diffs = []
for (const k of Object.keys(before)) {
  const same = typeof before[k] === 'object' && before[k] !== null
    ? JSON.stringify(before[k]) === JSON.stringify(after[k])
    : before[k] === after[k]
  if (!same) diffs.push(k)
}
console.log('node version:', process.version)
console.log('shared-state diffs after require():', diffs.length ? diffs : 'none')
console.log('IncomingMessage.prototype has own "method" property:', before.methodOnProto !== undefined)

const mw = methodOverride() // default X-HTTP-Method-Override header getter
const server = http.createServer(function (req, res) {
  const descBefore = Object.getOwnPropertyDescriptor(req, 'method')
  mw(req, res, function () {
    const descAfter = Object.getOwnPropertyDescriptor(req, 'method')
    console.log('req.method before middleware: POST (sent on wire)')
    console.log('descriptor of own "method" before mw:', JSON.stringify(descBefore))
    console.log('req.method after middleware:', req.method)
    console.log('req.originalMethod after middleware:', req.originalMethod)
    console.log('descriptor of own "method" after mw:', JSON.stringify(descAfter))
    const after2 = snapshot()
    const diffs2 = []
    for (const k of Object.keys(before)) {
      const same = typeof before[k] === 'object' && before[k] !== null
        ? JSON.stringify(before[k]) === JSON.stringify(after2[k])
        : before[k] === after2[k]
      if (!same) diffs2.push(k)
    }
    console.log('shared-state diffs after request handling:', diffs2.length ? diffs2 : 'none')
    res.end('ok')
    server.close()
  })
})

server.listen(0, '127.0.0.1', function () {
  const port = server.address().port
  const reqOut = http.request({
    host: '127.0.0.1',
    port: port,
    method: 'POST',
    path: '/',
    headers: { 'X-HTTP-Method-Override': 'DELETE' }
  }, function (res) {
    res.resume()
  })
  reqOut.end()
})
