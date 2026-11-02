// Reproduction for response-time@2.3.4 patch audit (pass-b).
// Usage: node repro.js "$PACKAGE_ROOT"
// Verifies:
//  1. require('response-time') transiently writes Error.prepareStackTrace (via depd) and restores it.
//  2. http.ServerResponse.prototype.writeHead is never mutated.
//  3. The middleware installs an own-property writeHead override on each response instance (via on-headers).
//  4. The override is live: X-Response-Time is set when headers are written.
'use strict'

const http = require('http')
const protoWriteHeadBefore = http.ServerResponse.prototype.writeHead

// Instrument Error.prepareStackTrace to record every write.
const pstWrites = []
let pstValue = Error.prepareStackTrace
const pstInitial = pstValue
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get () { return pstValue },
  set (v) {
    pstWrites.push(typeof v === 'function' ? (v.name || '<anonymous function>') : String(v))
    pstValue = v
  }
})

const responseTime = require(process.argv[2])

console.log('[require] Error.prepareStackTrace writes during require:', JSON.stringify(pstWrites))
console.log('[require] pre-require Error.prepareStackTrace:',
  typeof pstInitial === 'function' ? (pstInitial.name || '<anonymous function>') : String(pstInitial))
console.log('[require] Error.prepareStackTrace restored to pre-require value:', pstValue === pstInitial)
console.log('[require] ServerResponse.prototype.writeHead identity unchanged:',
  http.ServerResponse.prototype.writeHead === protoWriteHeadBefore)

const middleware = responseTime()

const server = http.createServer(function (req, res) {
  const ownBefore = Object.prototype.hasOwnProperty.call(res, 'writeHead')
  middleware(req, res, function next () {})
  const ownAfter = Object.prototype.hasOwnProperty.call(res, 'writeHead')
  console.log('[request] res own-property writeHead before middleware:', ownBefore)
  console.log('[request] res own-property writeHead after middleware:', ownAfter)
  console.log('[request] res.writeHead shadows prototype method:',
    res.writeHead !== http.ServerResponse.prototype.writeHead)
  console.log('[request] replacement function name:', res.writeHead.name)
  res.end('ok')
})

server.listen(0, '127.0.0.1', function () {
  const port = server.address().port
  http.get({ host: '127.0.0.1', port: port }, function (resp) {
    console.log('[client] x-response-time header present:', typeof resp.headers['x-response-time'] === 'string')
    console.log('[after] ServerResponse.prototype.writeHead identity unchanged:',
      http.ServerResponse.prototype.writeHead === protoWriteHeadBefore)
    resp.resume()
    resp.on('end', function () { server.close() })
  })
})
