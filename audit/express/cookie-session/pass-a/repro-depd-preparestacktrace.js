// Reproduction: depd (transitive dependency of cookie-session via cookies)
// temporarily reassigns Error.prepareStackTrace and Error.stackTraceLimit
// when a depd deprecate namespace is created (runs at cookies module load).
// Usage: node repro-depd-preparestacktrace.js "$PACKAGE_ROOT"
// Note: Error.stackTraceLimit is left as a data property (an accessor would
// disable V8 stack capture); restoration is checked by comparing values.
'use strict'

var path = require('path')

var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-depd-preparestacktrace.js "$PACKAGE_ROOT"')
  process.exit(1)
}

var prepWrites = []
var currentPrep
var limitBefore = Error.stackTraceLimit

Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return currentPrep },
  set: function (v) { prepWrites.push(typeof v); currentPrep = v }
})

// Loading cookie-session loads cookies, which calls depd('cookies') at
// module scope; depd getStack() swaps the globals and restores them.
require(path.resolve(pkgRoot))

console.log('node version:', process.version)
console.log('writes observed on Error.prepareStackTrace (typeof):', prepWrites)
console.log('Error.prepareStackTrace restored to undefined:',
  currentPrep === undefined)
console.log('Error.stackTraceLimit unchanged after load:',
  Error.stackTraceLimit === limitBefore)
