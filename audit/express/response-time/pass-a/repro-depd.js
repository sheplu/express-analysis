// Reproduction: depd getStack() temporarily writes Error.prepareStackTrace and
// Error.stackTraceLimit at require('response-time') time.
// Usage: node repro-depd.js "$PACKAGE_ROOT"
'use strict'

var path = require('path')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-depd.js "$PACKAGE_ROOT"')
  process.exit(2)
}

// Sentinel pre-existing user prepareStackTrace
function sentinelPrepare (err, trace) {
  return 'sentinel'
}
var writes = []
var current = sentinelPrepare

Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return current },
  set: function (v) {
    writes.push(typeof v === 'function' ? v.name || '<anonymous fn>' : String(v))
    current = v
  }
})

var limitBefore = Error.stackTraceLimit

// Trigger: module load of response-time -> require('depd')('response-time')
require(path.resolve(pkgRoot))

console.log('writes to Error.prepareStackTrace during require:', JSON.stringify(writes))
console.log('Error.prepareStackTrace restored to sentinel:', current === sentinelPrepare)
console.log('Error.stackTraceLimit restored:', Error.stackTraceLimit === limitBefore)
