'use strict'
// Reproduction for F-001: requiring body-parser writes Error.prepareStackTrace
// and Error.stackTraceLimit (via http-errors -> depd@2.0.0 getStack()) and
// restores both synchronously.
//
// Note: Error.stackTraceLimit must remain a data property (V8 reads it through
// a data-property fast path), so it is observed via snapshots taken inside the
// Error.prepareStackTrace accessor trap rather than trapped directly.
//
// Usage: node repro-error-hook-write.js "$PACKAGE_ROOT"

var path = require('path')
var pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node repro-error-hook-write.js <package-root>')
  process.exit(2)
}

// distinctive pre-require value, to make the temporary overwrite observable
Error.stackTraceLimit = 3

var events = []
var prepValue // starts undefined, like the Node.js default
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get: function () { return prepValue },
  set: function (v) {
    events.push({
      prepareStackTrace: typeof v === 'function' ? 'function ' + (v.name || '(anonymous)') : String(v),
      stackTraceLimitAtWrite: Error.stackTraceLimit
    })
    prepValue = v
  }
})

require(path.resolve(pkgRoot))

console.log('node version:', process.version)
console.log('Error.prepareStackTrace writes during require("body-parser"):')
if (events.length === 0) {
  console.log('  (none)')
} else {
  events.forEach(function (e, i) {
    console.log('  write ' + (i + 1) + ': prepareStackTrace <- ' + e.prepareStackTrace +
      ' | Error.stackTraceLimit at that moment: ' + e.stackTraceLimitAtWrite)
  })
}
console.log('Error.prepareStackTrace after require:', String(prepValue))
console.log('Error.stackTraceLimit after require:', Error.stackTraceLimit, '(was set to 3 before require)')
