// Usage: node repro-core-identity.js "$PACKAGE_ROOT"
// Snapshots identities/key-sets of core objects before and after loading
// multer (which loads type-is -> media-typer/mime-types -> mime-db,
// busboy -> streamsearch, append-field at require time), then exercises
// append-field with __proto__/constructor keys the way multer uses it.
'use strict'

const assert = require('assert')
const http = require('http')
const stream = require('stream')
const fs = require('fs')
const events = require('events')

const pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('missing package root argument')
  process.exit(1)
}

function snap () {
  return {
    readableKeys: Object.getOwnPropertyNames(stream.Readable.prototype).sort().join(','),
    writableKeys: Object.getOwnPropertyNames(stream.Writable.prototype).sort().join(','),
    incomingKeys: Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    eeKeys: Object.getOwnPropertyNames(events.EventEmitter.prototype).sort().join(','),
    bufKeys: Object.getOwnPropertyNames(Buffer.prototype).sort().join(','),
    objKeys: Object.getOwnPropertyNames(Object.prototype).sort().join(','),
    fsKeys: Object.getOwnPropertyNames(fs).sort().join(','),
    pipe: stream.Readable.prototype.pipe,
    unpipe: stream.Readable.prototype.unpipe,
    resume: stream.Readable.prototype.resume,
    push: stream.Readable.prototype.push,
    write: stream.Writable.prototype.write,
    emit: events.EventEmitter.prototype.emit,
    on: events.EventEmitter.prototype.on,
    removeAllListeners: events.EventEmitter.prototype.removeAllListeners,
    createWriteStream: fs.createWriteStream,
    unlink: fs.unlink,
    open: fs.open,
    fsync: fs.fsync,
    latin1Slice: Buffer.prototype.latin1Slice,
    utf8Slice: Buffer.prototype.utf8Slice
  }
}

const before = snap()
const multer = require(pkgRoot)
// Instantiate every exported surface that runs at setup time.
multer()
multer({ dest: require('os').tmpdir() })
multer.memoryStorage()
const mw = multer().any()
assert.strictEqual(typeof mw, 'function')
const after = snap()

for (const k of Object.keys(before)) {
  assert.strictEqual(before[k], after[k], `core identity changed: ${k}`)
}
console.log('OK: no core prototype/function identity change after loading+instantiating multer')

// append-field as multer uses it: store is Object.create(null)
const appendField = require(require('path').join(pkgRoot, 'node_modules', 'append-field'))
const protoBefore = Object.getOwnPropertyNames(Object.prototype).sort().join(',')
const store = Object.create(null)
appendField(store, '__proto__', 'polluted-a')
appendField(store, '__proto__[x]', 'polluted-b')
appendField(store, 'constructor[prototype][y]', 'polluted-c')
appendField(store, 'a[__proto__][z]', 'polluted-d')
const protoAfter = Object.getOwnPropertyNames(Object.prototype).sort().join(',')
assert.strictEqual(protoBefore, protoAfter, 'Object.prototype own keys changed')
assert.strictEqual({}.x, undefined)
assert.strictEqual({}.y, undefined)
assert.strictEqual({}.z, undefined)
assert.strictEqual(Object.prototype.polluted, undefined)
console.log('OK: append-field writes stayed on the null-prototype store; no Object.prototype pollution')
console.log('store own keys:', Object.getOwnPropertyNames(store).join(', '))
console.log('node version:', process.version)
