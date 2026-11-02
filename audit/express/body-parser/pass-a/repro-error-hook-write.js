'use strict'
// Usage: node repro-error-hook-write.js "$PACKAGE_ROOT"
// Detects writes to Error.prepareStackTrace / Error.stackTraceLimit during require of the target.
//
// NOTE: installing accessors on these properties perturbs V8 (it looks them up as
// data properties), so the instrumented require may throw inside depd's getStack.
// That throw is itself activation evidence: it shows depd getStack executing during
// the require. The recorded setter events show the writes that occurred before it.
const target = process.argv[2]
if (!target) {
  console.error('usage: node repro-error-hook-write.js "$PACKAGE_ROOT"')
  process.exit(1)
}

const events = []

let prep = Error.prepareStackTrace
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get () { return prep },
  set (v) {
    events.push('Error.prepareStackTrace <- ' + (typeof v === 'function' ? 'function ' + (v.name || '<anonymous>') : String(v)))
    prep = v
  }
})

let limit = Error.stackTraceLimit
Object.defineProperty(Error, 'stackTraceLimit', {
  configurable: true,
  get () { return limit },
  set (v) {
    events.push('Error.stackTraceLimit <- ' + String(v))
    limit = v
  }
})

let requireError = null
try {
  require(target)
} catch (e) {
  requireError = String(e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)
    .replace(/\/[^\s)]*node_modules\//g, '$PACKAGE_ROOT/node_modules/')
}

console.log(JSON.stringify({
  nodeMajor: process.versions.node.split('.')[0],
  writesDuringRequire: events,
  requireErrorFirstFrames: requireError
}, null, 2))
