'use strict'
/*
 * Complementary experiment: do NOT read crypto.pseudoRandomBytes before
 * loading the library. random-bytes@1.0.0 reads it once at module init
 * (node_modules/random-bytes/index.js:21), which triggers Node core's own
 * lazy deprecated-alias getter (getRandomBytesAlias in $NODEJS_SOURCE
 * lib/crypto.js) that redefines the property into a data property whose
 * value is core's crypto.randomBytes. This proves the observable descriptor
 * transition is a read-triggered core-owned mechanism, not a library write:
 * the final value is identical to the pristine crypto.randomBytes captured
 * before the library loaded.
 *
 * Usage: node lazy-alias-note.js "$PACKAGE_ROOT"
 */

const path = require('path')
const crypto = require('crypto')

const pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node lazy-alias-note.js "$PACKAGE_ROOT"')
  process.exit(1)
}

function descr (key) {
  const d = Object.getOwnPropertyDescriptor(crypto, key)
  return d && {
    kind: ('value' in d) ? 'data' : 'accessor',
    get: typeof d.get,
    set: typeof d.set,
    writable: d.writable,
    enumerable: d.enumerable,
    configurable: d.configurable
  }
}

const pristineRandomBytes = crypto.randomBytes // captured without touching the alias
const before = descr('pseudoRandomBytes') // descriptor read does NOT trigger the getter

require(path.join(pkgRoot, 'index.js')) // random-bytes init reads crypto.pseudoRandomBytes

const after = descr('pseudoRandomBytes')
const resolvedValueIsCoreRandomBytes = crypto.pseudoRandomBytes === pristineRandomBytes
const randomBytesUntouched = crypto.randomBytes === pristineRandomBytes

console.log(JSON.stringify({
  nodeVersion: process.version,
  descriptorBeforeLoad: before,
  descriptorAfterLoad: after,
  resolvedValueIsCoreRandomBytes: resolvedValueIsCoreRandomBytes,
  randomBytesUntouched: randomBytesUntouched,
  conclusion: resolvedValueIsCoreRandomBytes && randomBytesUntouched
    ? 'descriptor transition (if any) is core lazy-alias self-resolution; no library function installed'
    : 'UNEXPECTED - library may have replaced the alias'
}, null, 2))
