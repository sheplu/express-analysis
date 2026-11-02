'use strict'
// Usage: node probe-identities.js "$PACKAGE_ROOT"
// Clean before/after comparison of core identities around require('resolve-path')
// and representative calls. No spies installed; pure identity/descriptor checks.

var pkgRoot = process.argv[2]
if (!pkgRoot) { console.error('usage: node probe-identities.js "$PACKAGE_ROOT"'); process.exit(2) }

var path = require('path')
var util = require('util')
var events = require('events')
var Module = require('module')

function snap () {
  return {
    pathKeys: Object.getOwnPropertyNames(path).sort().join(','),
    pathIsAbsolute: path.isAbsolute,
    pathJoin: path.join,
    pathNormalize: path.normalize,
    pathResolve: path.resolve,
    utilInherits: util.inherits,
    eventsListenerCount: events.EventEmitter.listenerCount,
    objSetProto: Object.setPrototypeOf,
    objDefineProp: Object.defineProperty,
    errPrepare: Error.prepareStackTrace,
    errLimit: Error.stackTraceLimit,
    errCapture: Error.captureStackTrace,
    errProtoKeys: Object.getOwnPropertyNames(Error.prototype).sort().join(','),
    objProtoKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(','),
    funcProtoKeys: Object.getOwnPropertyNames(Function.prototype).sort().join(','),
    moduleLoad: Module._load,
    moduleResolve: Module._resolveFilename,
    moduleCompile: Module._compile,
    extKeys: Object.keys(require.extensions).sort().join(','),
    globalKeys: Object.getOwnPropertyNames(globalThis).sort().join(','),
    processEmit: process.emit,
    stderrWrite: process.stderr.write
  }
}

var before = snap()
var resolvePath = require(pkgRoot)
var afterRequire = snap()

// exercise runtime paths
var ok = resolvePath(process.cwd(), 'some/file.txt')
var e400, e403
try { resolvePath(process.cwd(), '/etc/passwd') } catch (e) { e400 = e }
try { resolvePath(process.cwd(), '../up') } catch (e) { e403 = e }
var afterCalls = snap()

function diff (a, b) {
  var out = []
  Object.keys(a).forEach(function (k) {
    if (a[k] !== b[k]) out.push(k)
  })
  return out
}

console.log('node version:', process.version)
console.log('diff before->afterRequire:', JSON.stringify(diff(before, afterRequire)))
console.log('diff before->afterCalls:', JSON.stringify(diff(before, afterCalls)))
console.log('resolvePath ok result is string:', typeof ok === 'string')
console.log('e400 status:', e400 && e400.status, 'name:', e400 && e400.name, 'instanceof Error:', e400 instanceof Error)
console.log('e403 status:', e403 && e403.status, 'name:', e403 && e403.name)
console.log('Error.prototype untouched by err creation:', Object.getOwnPropertyNames(Error.prototype).sort().join(',') === before.errProtoKeys)
console.log('setprototypeof === Object.setPrototypeOf:', require(pkgRoot + '/node_modules/setprototypeof') === Object.setPrototypeOf)
var pia = require(pkgRoot + '/node_modules/path-is-absolute')
console.log('path-is-absolute is not path.isAbsolute:', pia !== path.isAbsolute, '; path.isAbsolute identity stable:', path.isAbsolute === before.pathIsAbsolute)
var inh = require(pkgRoot + '/node_modules/http-errors/node_modules/inherits')
console.log('nested inherits === util.inherits:', inh === util.inherits)
console.log('Error.prepareStackTrace after all:', String(Error.prepareStackTrace))
console.log('Error.stackTraceLimit after all:', Error.stackTraceLimit)
