// Pass A dynamic verification for csrf@3.1.0 patch audit.
// Usage:
//   node verify-no-mutation.js "$PACKAGE_ROOT"            # load + exercise csrf, diff core state
//   node verify-no-mutation.js --control                   # no library: read crypto.pseudoRandomBytes once
// Prints descriptor/identity diffs of core objects. No machine paths in output.
'use strict'

var crypto = require('crypto')

function snapshotCrypto () {
  var snap = {}
  Object.getOwnPropertyNames(crypto).forEach(function (k) {
    var d = Object.getOwnPropertyDescriptor(crypto, k)
    snap[k] = {
      kind: d.get || d.set ? 'accessor' : 'data',
      value: d.value,
      get: d.get,
      set: d.set,
      enumerable: d.enumerable,
      configurable: d.configurable,
      writable: d.writable
    }
  })
  return snap
}

function snapshotGlobals () {
  return {
    'Math.random': Math.random,
    'Buffer.byteLength': Buffer.byteLength,
    'Buffer.prototype.toString': Buffer.prototype.toString,
    'global.Promise': global.Promise,
    'global.setTimeout': global.setTimeout,
    'String.prototype.replace': String.prototype.replace,
    'Object.prototype': Object.getOwnPropertyNames(Object.prototype).sort().join(',')
  }
}

function diffCrypto (before, after, label) {
  var changes = []
  var keys = new Set(Object.keys(before).concat(Object.keys(after)))
  keys.forEach(function (k) {
    var b = before[k]
    var a = after[k]
    if (!b) { changes.push('ADDED crypto.' + k); return }
    if (!a) { changes.push('REMOVED crypto.' + k); return }
    if (b.kind !== a.kind) {
      changes.push('crypto.' + k + ': ' + b.kind + ' -> ' + a.kind +
        (a.kind === 'data'
          ? ' (new value === crypto.randomBytes: ' + (a.value === after.randomBytes.value) + ')'
          : ''))
    } else if (b.value !== a.value || b.get !== a.get || b.set !== a.set) {
      changes.push('crypto.' + k + ': value/get/set identity changed')
    }
  })
  console.log('[' + label + '] crypto own-property changes: ' +
    (changes.length ? '\n  ' + changes.join('\n  ') : 'NONE'))
  return changes
}

function diffGlobals (before, after, label) {
  var changes = []
  Object.keys(before).forEach(function (k) {
    if (before[k] !== after[k]) changes.push(k + ' identity changed')
  })
  console.log('[' + label + '] global/builtin changes: ' +
    (changes.length ? '\n  ' + changes.join('\n  ') : 'NONE'))
  return changes
}

var arg = process.argv[2]
if (!arg) {
  console.error('usage: node verify-no-mutation.js "$PACKAGE_ROOT" | --control')
  process.exit(2)
}

var cBefore = snapshotCrypto()
var gBefore = snapshotGlobals()

if (arg === '--control') {
  // Core-owned behavior only: first read of the deprecated alias triggers
  // Node's own lazy getter, which redefines the property on the crypto module.
  void crypto.pseudoRandomBytes
  var cAfterCtl = snapshotCrypto()
  diffCrypto(cBefore, cAfterCtl, 'control: read crypto.pseudoRandomBytes, no library loaded')
  diffGlobals(gBefore, snapshotGlobals(), 'control')
  console.log('node ' + process.version)
  process.exit(0)
}

var Tokens = require(arg)

var cAfterLoad = snapshotCrypto()
var loadChanges = diffCrypto(cBefore, cAfterLoad, 'after require(csrf)')
var loadGlobalChanges = diffGlobals(gBefore, snapshotGlobals(), 'after require(csrf)')

var tokens = new Tokens()
var secret = tokens.secretSync()
var token = tokens.create(secret)
var ok = tokens.verify(secret, token)
var bad = tokens.verify(secret, 'invalid-token')

tokens.secret(function (err, s2) {
  if (err) throw err
  tokens.secret().then(function (s3) {
    var cAfterUse = snapshotCrypto()
    var useChanges = diffCrypto(cAfterLoad, cAfterUse, 'after exercising create/verify/secret/secretSync')
    var useGlobalChanges = diffGlobals(gBefore, snapshotGlobals(), 'after exercising')
    console.log('functional check: verify(valid)=' + ok + ' verify(invalid)=' + bad +
      ' secrets ok=' + (typeof s2 === 'string' && typeof s3 === 'string'))
    console.log('node ' + process.version)
    var libraryOwned = loadChanges.concat(loadGlobalChanges, useGlobalChanges)
    // useChanges may contain only the core-owned pseudoRandomBytes/prng/rng lazy
    // materialization (accessor -> data, value === crypto.randomBytes); compare
    // against the --control run to attribute it.
    console.log('summary: load-time library-attributable changes=' + libraryOwned.length +
      '; call-time crypto descriptor changes=' + useChanges.length +
      ' (compare with --control run for attribution)')
  })
})
