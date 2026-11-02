/*
 * Pass B runtime reproduction for the parseurl patch audit.
 *
 * Usage: node repro.js "$PACKAGE_ROOT"
 *
 * Snapshots core surfaces BEFORE requiring parseurl and AFTER requiring it
 * and exercising representative paths on a real http.IncomingMessage:
 *   - parseurl(req) fast path + repeated (memoized) call
 *   - changed req.url -> re-parse
 *   - absolute URL -> url.parse() slow path
 *   - parseurl.original(req) with req.originalUrl set
 * Then diffs identities/keys and classifies the memoization expandos.
 *
 * Output is sanitized: the package root and home directory are replaced by
 * aliases before anything is printed or saved.
 */

'use strict'

const PACKAGE_ROOT = process.argv[2]
if (!PACKAGE_ROOT) {
  console.error('usage: node repro.js "$PACKAGE_ROOT"')
  process.exit(1)
}

const url = require('url')
const http = require('http')
const Module = require('module')
const fs = require('fs')
const path = require('path')
const os = require('os')

function sanitize (s) {
  return String(s)
    .split(PACKAGE_ROOT).join('$PACKAGE_ROOT')
    .split(os.homedir()).join('$HOME')
}

function protoKeys (obj) {
  return Object.getOwnPropertyNames(obj).sort()
}

// ---- live references kept for identity (===) comparison ----
function captureRefs () {
  return {
    'url.parse': url.parse,
    'url.Url': url.Url,
    'url.format': url.format,
    'url.resolve': url.resolve,
    'url.resolveObject': url.resolveObject,
    'url.Url.prototype': url.Url.prototype,
    'url.Url.prototype.parse': url.Url.prototype.parse,
    'url.Url.prototype.format': url.Url.prototype.format,
    'url.Url.prototype.resolve': url.Url.prototype.resolve,
    'url.Url.prototype.resolveObject': url.Url.prototype.resolveObject,
    'url.Url.prototype.parseHost': url.Url.prototype.parseHost,
    'http.IncomingMessage': http.IncomingMessage,
    'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
    'IncomingMessage.prototype.setTimeout': http.IncomingMessage.prototype.setTimeout,
    'IncomingMessage.prototype._read': http.IncomingMessage.prototype._read,
    'IncomingMessage.prototype._destroy': http.IncomingMessage.prototype._destroy,
    'IncomingMessage.prototype._addHeaderLines': http.IncomingMessage.prototype._addHeaderLines,
    'IncomingMessage.prototype._dump': http.IncomingMessage.prototype._dump,
    'Object.assign': Object.assign,
    'Object.prototype': Object.prototype,
    'Module._load': Module._load,
    'Module._resolveFilename': Module._resolveFilename,
    'process.binding': process.binding
  }
}

function descriptorSummary (obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key)
  if (!d) return null
  return {
    writable: d.writable,
    enumerable: d.enumerable,
    configurable: d.configurable,
    kind: typeof d.value === 'function' ? 'function' : (d.get || d.set) ? 'accessor' : typeof d.value
  }
}

function captureSnapshot () {
  return {
    urlExportKeys: protoKeys(url),
    urlParseDescriptor: descriptorSummary(url, 'parse'),
    urlUrlDescriptor: descriptorSummary(url, 'Url'),
    urlPrototypeKeys: protoKeys(url.Url.prototype),
    incomingMessagePrototypeKeys: protoKeys(http.IncomingMessage.prototype),
    incomingMessagePrototypeSymbols: Object.getOwnPropertySymbols(http.IncomingMessage.prototype).map(String).sort(),
    objectPrototypeKeys: protoKeys(Object.prototype),
    arrayPrototypeKeys: protoKeys(Array.prototype),
    stringPrototypeKeys: protoKeys(String.prototype),
    functionPrototypeKeys: protoKeys(Function.prototype),
    requireExtensionsKeys: Object.keys(require.extensions).sort(),
    requireCacheKeys: Object.keys(require.cache).map(sanitize).sort(),
    globalKeys: protoKeys(globalThis)
  }
}

function diffLists (pre, post) {
  const added = post.filter((k) => !pre.includes(k))
  const removed = pre.filter((k) => !post.includes(k))
  return { added, removed }
}

const results = {
  nodeVersion: process.version,
  packageUnderTest: 'parseurl @ $PACKAGE_ROOT'
}

// ================= BEFORE =================
const preRefs = captureRefs()
const preSnap = captureSnapshot()

// ================= REQUIRE =================
const parseurl = require(PACKAGE_ROOT)

const postRequireRefs = captureRefs()
results.identityChangesAfterRequire = Object.keys(preRefs)
  .filter((k) => preRefs[k] !== postRequireRefs[k])

// ================= EXERCISE =================
const server = http.createServer((req, res) => {
  const exercise = {}

  const ownPropsBefore = Object.getOwnPropertyNames(req).sort()

  // 1. fast path parse
  const p1 = parseurl(req)
  // 2. memoized repeat call
  const p2 = parseurl(req)
  exercise.fastPathMemoized = p1 === p2
  exercise.parsedIsUrlInstance = p1 instanceof url.Url
  exercise.parsedOwnProps = Object.getOwnPropertyNames(p1).sort()
  exercise.parsedOwnPropsShadowUrlPrototype = exercise.parsedOwnProps
    .filter((k) => Object.prototype.hasOwnProperty.call(url.Url.prototype, k))
  exercise.parsedProtoIsUrlPrototype =
    Object.getPrototypeOf(p1) === url.Url.prototype

  // 3. changed-url re-parse
  req.url = '/changed/path?x=1'
  const p3 = parseurl(req)
  exercise.changedUrlReparsed = p3 !== p1 && p3.pathname === '/changed/path'

  // 4. slow path (absolute URL -> url.parse branch)
  req.url = 'http://example.com/abs/path?q=1'
  const p4 = parseurl(req)
  exercise.slowPathIsUrlInstance = p4 instanceof url.Url
  exercise.slowPathHost = p4.host

  // 5. original URL memoization
  req.originalUrl = '/original/path?a=b'
  const o1 = parseurl.original(req)
  const o2 = parseurl.original(req)
  exercise.originalMemoized = o1 === o2
  exercise.originalIsUrlInstance = o1 instanceof url.Url

  const ownPropsAfter = Object.getOwnPropertyNames(req).sort()
  const added = ownPropsAfter.filter((k) => !ownPropsBefore.includes(k))
  // originalUrl was set by this script, not by parseurl
  exercise.reqOwnPropsAddedByScriptAndLibrary = added
  exercise.reqOwnPropsAddedByLibrary = added.filter((k) => k !== 'originalUrl')
  exercise.addedPropsShadowingIncomingMessagePrototype =
    exercise.reqOwnPropsAddedByLibrary
      .filter((k) => Object.prototype.hasOwnProperty.call(http.IncomingMessage.prototype, k))
  exercise.addedPropsShadowingCoreOwnProps =
    exercise.reqOwnPropsAddedByLibrary
      .filter((k) => ownPropsBefore.includes(k))
  exercise.addedPropDescriptors = {}
  for (const k of exercise.reqOwnPropsAddedByLibrary) {
    exercise.addedPropDescriptors[k] = descriptorSummary(req, k)
  }
  exercise.cachedObjectType = Object.getPrototypeOf(req._parsedUrl) === url.Url.prototype
    ? 'core Url instance'
    : (Object.getPrototypeOf(req._parsedUrl) === Object.prototype ? 'plain object' : 'other')

  results.exercise = exercise
  res.end('ok')
})

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port
  http.get({ host: '127.0.0.1', port, path: '/foo/bar?fizz=buzz' }, (res) => {
    res.resume()
    res.on('end', () => {
      server.close(() => {
        // ================= AFTER =================
        const postRefs = captureRefs()
        const postSnap = captureSnapshot()

        results.identityChangesAfterExercise = Object.keys(preRefs)
          .filter((k) => preRefs[k] !== postRefs[k])

        results.snapshotDiffs = {}
        for (const key of Object.keys(preSnap)) {
          const a = preSnap[key]
          const b = postSnap[key]
          if (Array.isArray(a)) {
            const d = diffLists(a, b)
            if (d.added.length || d.removed.length) results.snapshotDiffs[key] = d
          } else if (JSON.stringify(a) !== JSON.stringify(b)) {
            results.snapshotDiffs[key] = { before: a, after: b }
          }
        }
        // require.cache is expected to gain exactly the library's own file
        results.requireCacheAdded = diffLists(preSnap.requireCacheKeys, postSnap.requireCacheKeys)
        results.requireCacheBuiltinEntries = postSnap.requireCacheKeys
          .filter((k) => k.startsWith('node:'))

        results.verdictHints = {
          anyCoreIdentityChanged: results.identityChangesAfterExercise.length > 0,
          anySnapshotKeyDiffBesidesRequireCache:
            Object.keys(results.snapshotDiffs).filter((k) => k !== 'requireCacheKeys').length > 0
        }

        const out = sanitize(JSON.stringify(results, null, 2))
        fs.writeFileSync(path.join(__dirname, 'results.json'), out + '\n')
        console.log(out)
      })
    })
  })
})
