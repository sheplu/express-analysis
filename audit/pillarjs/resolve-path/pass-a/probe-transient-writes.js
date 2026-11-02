'use strict'
// Usage: node probe-transient-writes.js "$PACKAGE_ROOT"
// Installs accessor spies on Error.prepareStackTrace and Error.stackTraceLimit
// to count and sequence writes performed by depd during require('resolve-path')
// and during representative resolve-path calls. Proves the transient shared
// mutation occurs and is restored synchronously.

var pkgRoot = process.argv[2]
if (!pkgRoot) { console.error('usage: node probe-transient-writes.js "$PACKAGE_ROOT"'); process.exit(2) }

var log = []
function spy (obj, prop, label) {
  var val = obj[prop]
  Object.defineProperty(obj, prop, {
    configurable: true,
    enumerable: false,
    get: function () { return val },
    set: function (v) {
      log.push(label + ' set -> ' + (typeof v === 'function' ? 'function ' + (v.name || '<anon>') : String(v)))
      val = v
    }
  })
}

// NOTE: Error.stackTraceLimit cannot be accessor-spied: V8 reads it as a data
// property during stack capture and an accessor breaks Error.captureStackTrace.
// Its transient write is proven statically (depd index.js:371/380 and
// lib/compat/index.js:31/40); restoration is verified by value below.
spy(Error, 'prepareStackTrace', 'Error.prepareStackTrace')

var origLimit = Error.stackTraceLimit
var origPrepare = Error.prepareStackTrace

log.push('--- require(resolve-path) begins ---')
var resolvePath = require(pkgRoot)
log.push('--- require(resolve-path) done ---')

log.push('--- call: success path ---')
resolvePath(process.cwd(), 'a/b.txt')
log.push('--- call: 400 path (absolute) ---')
try { resolvePath(process.cwd(), '/abs') } catch (e) {}
log.push('--- call: 403 path (traversal) ---')
try { resolvePath(process.cwd(), '../x') } catch (e) {}
log.push('--- calls done ---')

console.log('node version:', process.version)
console.log(log.join('\n'))
console.log('final Error.prepareStackTrace === original:', Error.prepareStackTrace === origPrepare)
console.log('final Error.stackTraceLimit:', Error.stackTraceLimit, '(original ' + origLimit + ')')
console.log('restored:', Error.prepareStackTrace === origPrepare && Error.stackTraceLimit === origLimit)
