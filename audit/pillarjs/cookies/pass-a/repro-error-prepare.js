'use strict'

// Reproduction for pass-a audit of cookies@0.9.2 (candidates C-001/C-002).
// Demonstrates that loading `cookies` (via its dependency depd@2.0.0) writes
// to the shared globals Error.prepareStackTrace and Error.stackTraceLimit,
// and that both are synchronously restored to their original values.
//
// Usage: node repro-error-prepare.js "$PACKAGE_ROOT"

var packageRoot = process.argv[2]
if (!packageRoot) {
  console.error('usage: node repro-error-prepare.js <package-root>')
  process.exit(1)
}

// Instrument Error.prepareStackTrace with an accessor that records writes
// while behaving like the original data property.
var writes = []
var current = Error.prepareStackTrace // typically undefined
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  enumerable: false,
  get: function () { return current },
  set: function (v) {
    writes.push(typeof v === 'function'
      ? 'set -> function ' + (v.name || '<anonymous>')
      : 'set -> ' + String(v))
    current = v
  }
})

var limitBefore = Error.stackTraceLimit

// Capture core method identity before loading the package.
var http = require('http')
var setHeaderBefore = http.OutgoingMessage.prototype.setHeader

// Swallow deprecation events so no stderr output (which would embed local
// stack paths) is produced when we trigger a deprecated code path below.
var deprecationEvents = 0
process.on('deprecation', function () { deprecationEvents++ })

var Cookies = require(packageRoot) // -> require('depd')('cookies') -> getStack()
var writesDuringRequire = writes.length

// Trigger a deprecated API: array `options` argument -> deprecate(...) -> log()
// -> getStack() -> another swap/restore pair.
new Cookies({ headers: {}, socket: {} }, { getHeader: function () {}, setHeader: function () {} }, ['secret'])
var writesDuringDeprecation = writes.length - writesDuringRequire

console.log('node version:', process.version)
console.log('writes to Error.prepareStackTrace during require("cookies"):', writesDuringRequire)
console.log('writes to Error.prepareStackTrace during deprecated call:', writesDuringDeprecation)
console.log('write sequence:', JSON.stringify(writes))
console.log('Error.prepareStackTrace after:',
  current === undefined ? 'undefined (restored to original)' : String(current && current.name))
console.log('Error.stackTraceLimit before:', limitBefore, 'after:', Error.stackTraceLimit,
  Error.stackTraceLimit === limitBefore ? '(restored)' : '(CHANGED)')
console.log('http.OutgoingMessage.prototype.setHeader identity unchanged:',
  http.OutgoingMessage.prototype.setHeader === setHeaderBefore)
console.log('deprecation events observed:', deprecationEvents)
