'use strict'
// Usage: node repro-error-swap.js "$PACKAGE_ROOT"
// Records writes to Error.prepareStackTrace during require("$PACKAGE_ROOT").
// (Error.stackTraceLimit is V8-native-read; an accessor there breaks stack
// capture, so it is checked by value before/after instead.)
var pstWrites = []
var pst
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return pst },
  set: function (v) {
    pstWrites.push(typeof v === 'function' ? 'set:' + (v.name || '<anonymous>') : 'set:' + String(v))
    pst = v
  }
})
var limitBefore = Error.stackTraceLimit
require(process.argv[2])
console.log('node version:', process.versions.node)
console.log('Error.prepareStackTrace writes during require:', JSON.stringify(pstWrites))
console.log('prepareStackTrace restored to undefined:', pst === undefined)
console.log('stackTraceLimit before/after:', limitBefore, '/', Error.stackTraceLimit)
