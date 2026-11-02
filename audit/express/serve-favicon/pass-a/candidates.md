# Candidate ledger: serve-favicon 2.5.1 (pass A)

Scope: `$PACKAGE_ROOT/index.js` + resolved runtime deps (etag@1.8.1,
fresh@0.5.2, ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1), each at its single
`index.js` entrypoint. Every candidate surfaced by the search set in
searches.md is listed; statuses are confirmed / rejected / unresolved.

Final tally: 0 confirmed, 12 rejected, 0 unresolved.

## C-001 — parseurl/index.js:54 `req._parsedUrl = parsed`

- Writes: own property `_parsedUrl` on the caller-supplied request object (an
  `http.IncomingMessage` in normal use), holding a library-created parsed-URL
  object.
- Status: **rejected** (library cache key on instance, not a core override).
- Reason: Node core never defines `_parsedUrl`: zero matches in
  `$NODEJS_SOURCE/lib/_http_incoming.js`, `lib/http.js`, `lib/_http_server.js`,
  `lib/_http_outgoing.js`, `lib/_http_common.js`, and
  `lib/internal/http/{incoming,server,outgoing,common}.js`. Nothing in core
  reads it either, so no core code path changes. Adding request metadata does
  not establish a patch (skill contract). Reproduction: key appears as an own
  property of the instance only; `http.IncomingMessage.prototype` gains
  nothing.

## C-002 — parseurl/index.js:84 `req._parsedOriginalUrl = parsed`

- Writes: own property `_parsedOriginalUrl` on the request instance.
- Status: **rejected** (same analysis as C-001).
- Reason: identical classification; additionally unreachable from
  serve-favicon, which only calls `parseurl(req)` (index.js:156), never
  `parseurl.original`.

## C-003 — parseurl/index.js:132-138 `url.path/href/pathname/query/search = ...`

- Writes: looks like assignments onto the core `url` module object.
- Status: **rejected** (local-variable shadow; new instance, not core).
- Reason: inside `fastparse`, line 128 declares
  `var url = Url !== undefined ? new Url() : {}`, shadowing the module-level
  `var url = require('url')` (line 15). The writes create own properties on a
  freshly constructed `url.Url` instance. `Url` is a public export
  (`$NODEJS_SOURCE/lib/url.js:1025-1028`); instantiation is not mutation.
  `Url.prototype` is untouched (reproduction: `Url.prototype` and `url` module
  own-property sets unchanged).

## C-004 — parseurl/index.js:52,82 `parsed._raw = url`

- Writes: own property `_raw` on the parse-result object.
- Status: **rejected**.
- Reason: the target object is either the library-created instance from C-003
  or the fresh object returned by `url.parse` (owned by the caller per the
  legacy API contract); never a shared prototype or module object.

## C-005 — safe-buffer/index.js:13 `module.exports = buffer`

- Writes: safe-buffer's own `module.exports` slot, set to the core `buffer`
  module object.
- Status: **rejected** (re-export, zero writes to core).
- Reason: guard at line 12 (`Buffer.from && Buffer.alloc && Buffer.allocUnsafe
  && Buffer.allocUnsafeSlow`) is true on the baseline
  (`$NODEJS_SOURCE/lib/buffer.js:351,454,473,496`), so safe-buffer hands back
  the unmodified core module. Reproduction: `require('safe-buffer') ===
  require('buffer')` is true; `buffer` and `Buffer` own-property sets and
  `Buffer.from`/`Buffer.alloc` identities unchanged. Answering the briefed
  question: safe-buffer never writes to the `buffer` module or to `Buffer` in
  either branch.

## C-006 — safe-buffer/index.js:16-17 `copyProps(buffer, exports); exports.Buffer = SafeBuffer` (legacy branch)

- Writes: properties of safe-buffer's own `exports` object.
- Status: **rejected**.
- Reason: `copyProps(src, dst)` (lines 7-11) iterates `src` (core module,
  read-only) and assigns onto `dst` (safe-buffer exports). `SafeBuffer`
  replaces nothing in core; consumers opt in by importing safe-buffer. Branch
  unreachable on Node >= 4.5 (guard at line 12), including the baseline.

## C-007 — safe-buffer/index.js:24 `SafeBuffer.prototype = Object.create(Buffer.prototype)`

- Writes: `prototype` property of the library-owned `SafeBuffer` function.
- Status: **rejected**.
- Reason: `Object.create(Buffer.prototype)` returns a new object whose
  [[Prototype]] is `Buffer.prototype`; the core prototype is only read.
  Ordinary inheritance, not mutation. Runs unconditionally at import but
  writes only to `SafeBuffer`. Reproduction: `Buffer.prototype` own-property
  set unchanged.

## C-008 — safe-buffer/index.js:27 `copyProps(Buffer, SafeBuffer)`

- Writes: static properties onto `SafeBuffer`.
- Status: **rejected**.
- Reason: copy direction is core -> library (`for (key in src) dst[key] =
  src[key]`); core `Buffer` is the read side only.

## C-009 — index.js:73,216,222 `res.statusCode = 405/200/304`

- Writes: own property `statusCode` on the per-request `http.ServerResponse`
  instance.
- Status: **rejected** (documented public API usage).
- Reason: core defines the default as a plain data property on the prototype,
  `ServerResponse.prototype.statusCode = 200`
  (`$NODEJS_SOURCE/lib/internal/http/server.js:285`); assigning per-instance
  is the intended, documented way to set the response status (core reads
  `this.statusCode` when writing the head). No core method or shared
  prototype is replaced; effect is per-response application state.

## C-010 — index.js:74-76,174,211,217,223-225 `res.setHeader/getHeader/end` calls

- Writes: none to core — method invocations only.
- Status: **rejected**.
- Reason: public `OutgoingMessage.prototype.setHeader`
  (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`) and friends are called,
  never assigned. Candidate listed because res-touching sites were in the
  sweep set.

## C-011 — index.js:16-22 core imports; index.js:85 `fs.readFile`; index.js:187 `fs.statSync`

- Writes: none — `require('fs')`, `require('path')` plus read-only calls.
- Status: **rejected**.
- Reason: write-pattern sweep (`^\s*(fs|url|path|...)\.\w+\s*=`, `delete`,
  `defineProperty`) found no assignment/deletion/descriptor change to any core
  module binding anywhere in scope. Reproduction: `fs.readFile`/`fs.statSync`
  identities and `fs` own-property set unchanged.

## C-012 — etag/index.js:21-22,29 `crypto`, `fs.Stats`, saved `Object.prototype.toString`

- Writes: none — local alias `var toString = Object.prototype.toString`.
- Status: **rejected**.
- Reason: `crypto.createHash(...)` call chain (lines 46-50) and
  `obj instanceof Stats` (line 106) are reads of public APIs;
  `toString.call(...)` (lines 112-113) invokes the saved built-in without
  modifying `Object.prototype`. Reproduction: `Object.prototype` own-property
  set unchanged.

## Non-candidates confirmed by negative sweeps

- fresh/index.js — no core imports at all; pure header-comparison function.
  Line 97 comment guards against third-party `Date.parse` patching (read-only
  defensive style, no write). `Date.parse` identity unchanged in
  reproduction.
- ms/index.js — no `require` of any module; pure string/number conversion;
  only write is its own `module.exports`.
- No hits in any scoped file for: patch/wrap/shim/polyfill/override keywords;
  `require.cache`/`require.extensions`/`Module._*`/`syncBuiltinESMExports`/
  `registerHooks`; `process.binding`/`internalBinding`/`'_http_'`/
  `'internal/'` specifiers; `__proto__`/`setPrototypeOf`/`defineProperty`/
  `Object.assign` (other than C-007's `Object.create`); `globalThis`/`global`
  writes; `delete` statements.
