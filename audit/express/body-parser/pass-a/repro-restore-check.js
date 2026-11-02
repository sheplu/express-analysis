'use strict'
// Usage: node repro-restore-check.js "$PACKAGE_ROOT"
// Un-instrumented control: confirms Error.prepareStackTrace / Error.stackTraceLimit
// hold their original values after require of the target (synchronous save/restore).
const target = process.argv[2]
const beforePrep = Error.prepareStackTrace
const beforeLimit = Error.stackTraceLimit
const bp = require(target)
console.log(JSON.stringify({
  nodeMajor: process.versions.node.split('.')[0],
  loadedExports: Object.keys(bp).sort(),
  prepareStackTraceUnchanged: Error.prepareStackTrace === beforePrep,
  stackTraceLimitUnchanged: Error.stackTraceLimit === beforeLimit,
  stackTraceLimitValue: Error.stackTraceLimit
}, null, 2))
