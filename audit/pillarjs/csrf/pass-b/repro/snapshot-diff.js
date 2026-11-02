'use strict'
/*
 * Pass B runtime reproduction for the csrf patch audit.
 *
 * Usage: node snapshot-diff.js "$PACKAGE_ROOT"
 *   where $PACKAGE_ROOT is the root of the csrf checkout (contains index.js
 *   and node_modules with rndm, tsscmp, uid-safe, random-bytes).
 *
 * Snapshots identities/descriptors of core surfaces BEFORE requiring the
 * library, then requires csrf, exercises representative paths
 * (new Tokens(); secret() async + sync; create(secret); verify() true/false),
 * snapshots AFTER, and prints a sanitized JSON diff.
 *
 * NOTE on crypto.pseudoRandomBytes: in modern Node.js core this property is a
 * lazy deprecated-alias accessor (lib/crypto.js getRandomBytesAlias) that
 * redefines itself into a plain data property equal to crypto.randomBytes on
 * first read. The BEFORE snapshot deliberately reads its value so that this
 * core-owned self-resolution happens before the library loads and cannot be
 * confused with a library-made mutation. See lazy-alias-note.js for the
 * complementary experiment where the library's own init read triggers it.
 */

const path = require('path')
const Module = require('module')

const pkgRoot = process.argv[2]
if (!pkgRoot) {
  console.error('usage: node snapshot-diff.js "$PACKAGE_ROOT"')
  process.exit(1)
}

const crypto = require('crypto')

// --- identity registry -------------------------------------------------
// Store references under stable labels before load; compare === after.
const refs = new Map()
function keep (label, value) { refs.set(label, value) }
function sameRef (label, value) { return refs.get(label) === value }

function descr (obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key)
  if (!d) return null
  return {
    hasValue: 'value' in d,
    valueType: typeof d.value,
    get: typeof d.get,
    set: typeof d.set,
    writable: d.writable,
    enumerable: d.enumerable,
    configurable: d.configurable
  }
}

function snapshot () {
  const s = {}

  // crypto module export identities (reads values: resolves lazy aliases)
  s.crypto = {
    createHash: descr(crypto, 'createHash'),
    createHmac: descr(crypto, 'createHmac'),
    randomBytes: descr(crypto, 'randomBytes'),
    timingSafeEqual: descr(crypto, 'timingSafeEqual'),
    pseudoRandomBytes: descr(crypto, 'pseudoRandomBytes'),
    pseudoEqualsRandom: crypto.pseudoRandomBytes === crypto.randomBytes
  }

  // Hash prototype surface (observable via crypto.Hash)
  s.hashProtoKeys = crypto.Hash
    ? Object.getOwnPropertyNames(crypto.Hash.prototype).sort()
    : null

  // global primordial prototype own keys
  s.protoKeys = {
    Object: Object.getOwnPropertyNames(Object.prototype).sort(),
    Array: Object.getOwnPropertyNames(Array.prototype).sort(),
    String: Object.getOwnPropertyNames(String.prototype).sort(),
    Function: Object.getOwnPropertyNames(Function.prototype).sort(),
    Promise: Object.getOwnPropertyNames(Promise.prototype).sort()
  }

  // module loading machinery
  s.requireExtensions = Object.keys(require.extensions).sort()
  s.requireCacheBuiltinEntries = Object.keys(require.cache)
    .filter(function (k) { return k.startsWith('node:') || !path.isAbsolute(k) })
    .sort()
  s.requireCacheSize = Object.keys(require.cache).length

  // globals (own property names of globalThis)
  s.globalKeys = Object.getOwnPropertyNames(globalThis).sort()

  return s
}

function keepIdentities () {
  keep('crypto.createHash', crypto.createHash)
  keep('crypto.createHmac', crypto.createHmac)
  keep('crypto.randomBytes', crypto.randomBytes)
  keep('crypto.timingSafeEqual', crypto.timingSafeEqual)
  keep('crypto.pseudoRandomBytes', crypto.pseudoRandomBytes) // resolves lazy alias now
  keep('crypto.Hash', crypto.Hash)
  keep('crypto.Hash.prototype.update', crypto.Hash && crypto.Hash.prototype.update)
  keep('crypto.Hash.prototype.digest', crypto.Hash && crypto.Hash.prototype.digest)
  keep('Math.random', Math.random)
  keep('Object.assign', Object.assign)
  keep('Module._load', Module._load)
  keep('Module._resolveFilename', Module._resolveFilename)
  keep('process.binding', process.binding)
  keep('Promise', global.Promise)
  keep('setTimeout', global.setTimeout)
}

function checkIdentities () {
  const out = {}
  out['crypto.createHash'] = sameRef('crypto.createHash', crypto.createHash)
  out['crypto.createHmac'] = sameRef('crypto.createHmac', crypto.createHmac)
  out['crypto.randomBytes'] = sameRef('crypto.randomBytes', crypto.randomBytes)
  out['crypto.timingSafeEqual'] = sameRef('crypto.timingSafeEqual', crypto.timingSafeEqual)
  out['crypto.pseudoRandomBytes'] = sameRef('crypto.pseudoRandomBytes', crypto.pseudoRandomBytes)
  out['crypto.Hash'] = sameRef('crypto.Hash', crypto.Hash)
  out['crypto.Hash.prototype.update'] = sameRef('crypto.Hash.prototype.update', crypto.Hash && crypto.Hash.prototype.update)
  out['crypto.Hash.prototype.digest'] = sameRef('crypto.Hash.prototype.digest', crypto.Hash && crypto.Hash.prototype.digest)
  out['Math.random'] = sameRef('Math.random', Math.random)
  out['Object.assign'] = sameRef('Object.assign', Object.assign)
  out['Module._load'] = sameRef('Module._load', Module._load)
  out['Module._resolveFilename'] = sameRef('Module._resolveFilename', Module._resolveFilename)
  out['process.binding'] = sameRef('process.binding', process.binding)
  out['Promise'] = sameRef('Promise', global.Promise)
  out['setTimeout'] = sameRef('setTimeout', global.setTimeout)
  return out
}

function diffArrays (beforeArr, afterArr) {
  const b = new Set(beforeArr)
  const a = new Set(afterArr)
  return {
    added: afterArr.filter(function (k) { return !b.has(k) }),
    removed: beforeArr.filter(function (k) { return !a.has(k) })
  }
}

function sanitize (str) {
  // Replace the package root and any home-dir prefixes with aliases.
  return str
    .split(pkgRoot).join('$PACKAGE_ROOT')
    .replace(/\/(Users|home)\/[^/"\\]+/g, '$HOME')
}

async function main () {
  keepIdentities()
  const before = snapshot()

  // --- load the library and exercise representative paths ---------------
  const Tokens = require(path.join(pkgRoot, 'index.js'))

  const exercise = {}
  const t = new Tokens()
  exercise.newTokens = t instanceof Tokens
  const tFactory = Tokens({ saltLength: 10, secretLength: 20 })
  exercise.factoryCall = tFactory instanceof Tokens

  const secretAsync = await t.secret() // promise path -> uid-safe -> random-bytes
  exercise.secretAsyncLength = secretAsync.length
  const secretCb = await new Promise(function (resolve, reject) {
    t.secret(function (err, s) { return err ? reject(err) : resolve(s) }) // callback path
  })
  exercise.secretCallbackLength = secretCb.length
  const secretSync = t.secretSync()
  exercise.secretSyncLength = secretSync.length

  const token = t.create(secretSync) // rndm salt + crypto.createHash sha1
  exercise.tokenShape = /^[A-Za-z0-9]+-[A-Za-z0-9_-]+$/.test(token)
  exercise.verifyTrue = t.verify(secretSync, token) === true // tsscmp path
  exercise.verifyFalseWrongSecret = t.verify(secretAsync, token) === false
  exercise.verifyFalseMalformed = t.verify(secretSync, 'no-dash'.replace('-', '')) === false

  // --- after snapshot and diff ------------------------------------------
  const after = snapshot()

  const result = {
    nodeVersion: process.version,
    exercise: exercise,
    identityChecks: checkIdentities(),
    descriptorDiffs: {},
    hashProtoKeysDiff: diffArrays(before.hashProtoKeys || [], after.hashProtoKeys || []),
    protoKeysDiff: {},
    requireExtensionsDiff: diffArrays(before.requireExtensions, after.requireExtensions),
    requireCacheBuiltinEntriesDiff: diffArrays(before.requireCacheBuiltinEntries, after.requireCacheBuiltinEntries),
    requireCacheGrewBy: after.requireCacheSize - before.requireCacheSize,
    requireCacheNewEntries: null,
    globalKeysDiff: diffArrays(before.globalKeys, after.globalKeys),
    cryptoBefore: before.crypto,
    cryptoAfter: after.crypto
  }

  for (const k of Object.keys(before.crypto)) {
    const b = JSON.stringify(before.crypto[k])
    const a = JSON.stringify(after.crypto[k])
    if (b !== a) result.descriptorDiffs[k] = { before: before.crypto[k], after: after.crypto[k] }
  }
  for (const k of Object.keys(before.protoKeys)) {
    result.protoKeysDiff[k] = diffArrays(before.protoKeys[k], after.protoKeys[k])
  }

  result.requireCacheNewEntries = Object.keys(require.cache)
    .map(function (k) { return sanitize(k) })
    .filter(function (k) { return k.startsWith('$PACKAGE_ROOT') })
    .sort()

  const allIdentitiesIntact = Object.values(result.identityChecks).every(Boolean)
  const noDescriptorDiffs = Object.keys(result.descriptorDiffs).length === 0
  const noKeyDiffs =
    result.hashProtoKeysDiff.added.length === 0 && result.hashProtoKeysDiff.removed.length === 0 &&
    Object.values(result.protoKeysDiff).every(function (d) { return d.added.length === 0 && d.removed.length === 0 }) &&
    result.requireExtensionsDiff.added.length === 0 && result.requireExtensionsDiff.removed.length === 0 &&
    result.requireCacheBuiltinEntriesDiff.added.length === 0 &&
    result.globalKeysDiff.added.length === 0 && result.globalKeysDiff.removed.length === 0
  result.VERDICT = (allIdentitiesIntact && noDescriptorDiffs && noKeyDiffs)
    ? 'NO CORE MUTATION OBSERVED'
    : 'DIFF DETECTED - INSPECT ABOVE'

  console.log(sanitize(JSON.stringify(result, null, 2)))
}

main().catch(function (err) {
  console.error(sanitize(String(err && err.stack || err)))
  process.exit(1)
})
