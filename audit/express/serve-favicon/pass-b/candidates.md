# Candidate ledger — serve-favicon 2.5.1 patch audit (pass-b)

Every candidate site surfaced by the searches in `searches.md`, traced to the
exact object/key written. Paths are `$PACKAGE_ROOT`-relative; core baselines
are `$NODEJS_SOURCE`-relative at commit `d44625a4b80c672215b469906ce583ce7eeeebaf`.

Status values: confirmed (patch), rejected (not a patch), unresolved.
Result: 0 confirmed, 12 rejected, 0 unresolved.

## C-001 — parseurl caches parse result on the request instance

- Site: `node_modules/parseurl/index.js:54` — `return (req._parsedUrl = parsed)`
- Writes: adds/overwrites own data property `_parsedUrl` on the `req` object
  (an `http.IncomingMessage` instance when used under a Node HTTP server).
- Core baseline: `grep '_parsedUrl'` over `$NODEJS_SOURCE/lib/_http_incoming.js`
  and `$NODEJS_SOURCE/lib/internal/http/incoming.js` → no occurrences. The
  IncomingMessage constructor's own fields (internal/http/incoming.js:77-106)
  do not include `_parsedUrl`. The key is library-owned (Express-ecosystem
  convention), not a core property, accessor, or method.
- Execution chain: `index.js:156 getPathname -> parseurl(req) -> write`.
  Activated on every middleware invocation.
- Status: **rejected as patch** — instance metadata added to a core-backed
  instance; no core-defined property or behavior replaced (skill: "merely
  adding request metadata ... does not establish a core patch").
- Runtime corroboration: repro shows the only key added to a request object by
  the middleware is `_parsedUrl`; no prototype/core changes.

## C-002 — parseurl `original` variant caches on the request instance

- Site: `node_modules/parseurl/index.js:84` — `return (req._parsedOriginalUrl = parsed)`
- Writes: own data property `_parsedOriginalUrl` on `req`.
- Core baseline: same as C-001 — absent from core IncomingMessage.
- Execution chain: only via `module.exports.original`; serve-favicon never
  calls it (`index.js` uses `parseUrl(req)` only, line 156).
- Status: **rejected as patch** — same reasoning as C-001; additionally
  unreachable from the audited entrypoint.

## C-003 — parseurl fastparse constructs a legacy `url.Url` and assigns fields

- Site: `node_modules/parseurl/index.js:128-141` — `var url = Url !== undefined
  ? new Url() : {}` then `url.path/href/pathname/query/search = ...`
- Writes: own data properties on a freshly constructed `Url` instance (or a
  plain object fallback). The local `var url` at :128 shadows the module-level
  `var url = require('url')` at :15, so despite the name these writes do NOT
  touch the core `url` module object. `Url.prototype` is never written.
- Core baseline: `$NODEJS_SOURCE/lib/url.js:77-89` — the `Url` constructor
  initializes exactly these own fields (`search`, `query`, `pathname`, `path`,
  `href`) to null; `url.parse` itself assigns them (e.g. :260-272, :467-504).
  `Url` is part of the public (legacy) exports (`lib/url.js:1025` "Original
  API"). parseurl constructs an instance and fills documented own data fields,
  bypassing `parse()` for the fast path.
- Execution chain: `index.js:156 -> parseurl -> fastparse -> writes` on cache
  miss for simple `/`-prefixed URLs.
- Status: **rejected as patch** — writes to a library-created instance;
  core `url.parse` and `Url.prototype` unchanged for all other consumers.
  Noted in supporting context as unconventional use of a legacy public API and
  as a standalone copy of the closed/unmerged joyent/node PR #7878 fast path.

## C-004 — safe-buffer re-exports the core buffer module

- Site: `node_modules/safe-buffer/index.js:12-13` — `if (Buffer.from &&
  Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) { module.exports = buffer }`
- Writes: safe-buffer's own `module.exports` binding only. The core `buffer`
  module object is passed through by reference, unmodified.
- Core baseline: `$NODEJS_SOURCE/lib/buffer.js` defines `Buffer.from` (:351),
  `Buffer.alloc` (:454), `Buffer.allocUnsafe` (:473), `Buffer.allocUnsafeSlow`
  (:496) — the guard is true on all supported Node versions (>= 4.5), so this
  branch is the live one.
- Status: **rejected as patch** — a re-export is not a mutation. Runtime check:
  `require('safe-buffer') === require('buffer')` → `true`, and buffer module
  own-key inventory unchanged after load.

## C-005 — safe-buffer legacy branch copies buffer props onto its exports

- Site: `node_modules/safe-buffer/index.js:16` — `copyProps(buffer, exports)`
- Writes: `copyProps(src, dst)` (:7-11) does `dst[key] = src[key]`; here
  `dst = exports`, safe-buffer's own fresh exports object. `src = buffer`
  (core module) is only read.
- Activation: legacy else-branch only (pre-`Buffer.from` Node, i.e. < 4.5);
  dead on the baseline and on the reproduction runtime.
- Status: **rejected as patch** — write target is a library-owned object;
  branch additionally inert on any modern Node.

## C-006 — safe-buffer legacy branch installs SafeBuffer on its exports

- Site: `node_modules/safe-buffer/index.js:17` — `exports.Buffer = SafeBuffer`
- Writes: `Buffer` key on safe-buffer's own exports object. Core
  `buffer.Buffer` is not reassigned anywhere in the file.
- Status: **rejected as patch** — library-owned export surface only
  (legacy branch, dead on baseline).

## C-007 — SafeBuffer.prototype delegates to Buffer.prototype

- Site: `node_modules/safe-buffer/index.js:24` —
  `SafeBuffer.prototype = Object.create(Buffer.prototype)`
- Writes: the `prototype` property of the local `SafeBuffer` function.
  `Object.create` creates a NEW object whose [[Prototype]] is
  `Buffer.prototype`; it does not modify `Buffer.prototype` or add/replace any
  of its properties.
- Core baseline: `Buffer.prototype` defined in `$NODEJS_SOURCE/lib/buffer.js`;
  runtime repro confirms its own-property inventory is unchanged after loading
  and exercising the package.
- Status: **rejected as patch** — delegation/inheritance, not mutation.

## C-008 — Buffer statics copied onto SafeBuffer

- Site: `node_modules/safe-buffer/index.js:27` — `copyProps(Buffer, SafeBuffer)`
- Writes: `dst = SafeBuffer` (local function); `src = Buffer` (core, read
  only). Copies Buffer statics FROM core TO the local shim — the direction
  that matters: core Buffer receives no writes. (Lines 29-65 then define
  `from/alloc/allocUnsafe/allocUnsafeSlow` on SafeBuffer itself.)
- Status: **rejected as patch** — core Buffer is the read-only source;
  additionally legacy-branch-only code path for the shim's consumers.

## C-009 — serve-favicon assigns res.statusCode

- Sites: `index.js:73` (`res.statusCode = req.method === 'OPTIONS' ? 200 : 405`),
  `index.js:216` (`res.statusCode = 304`), `index.js:222` (`res.statusCode = 200`)
- Writes: own data property `statusCode` on the per-request ServerResponse
  instance (shadowing the prototype default).
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:285` —
  `ServerResponse.prototype.statusCode = 200`; a documented, intentionally
  writable response property. Per-instance assignment is the documented way to
  set the status.
- Status: **rejected as patch** — documented API usage on an instance the
  middleware is handed; no core function or prototype replaced.

## C-010 — serve-favicon calls res.setHeader / res.end / res.getHeader

- Sites: `index.js:74-75` (Allow, Content-Length), `index.js:205-226` `send()`
  (`res.setHeader` loop :209-212, `Content-Length`/`Content-Type` :223-224,
  `res.end` :217/:225), reads via `res.getHeader` (`index.js:173-174`).
- Writes: none on core objects — these are method CALLS into the documented
  OutgoingMessage API (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`
  `OutgoingMessage.prototype.setHeader`); header state lands in the response's
  own internal header container. The `icon.headers` object iterated at
  :207-212 is library-owned (`createIcon`, index.js:120-128).
- Status: **rejected as patch** — API invocation, not override. Runtime repro
  confirms `OutgoingMessage.prototype.setHeader/end` identities unchanged.

## C-011 — etag saves a reference to Object.prototype.toString

- Site: `node_modules/etag/index.js:29` —
  `var toString = Object.prototype.toString`
- Writes: none — read-only saved reference, later invoked via
  `toString.call(...)` (:112-113) for duck-typing fs.Stats.
- Status: **rejected as patch** — no write to `Object.prototype` anywhere in
  scope (P3 sweep found no other prototype references).

## C-012 — serve-favicon fabricates an fs-shaped EISDIR error

- Site: `index.js:138-145` (`createIsDirError`) — sets `code`, `errno`,
  `path`, `syscall` on a `new Error(...)`.
- Writes: own properties on a brand-new library-owned Error object, thrown
  from `resolveSync` (index.js:189-191) when the configured path is a
  directory. Mimics the shape of Node fs errors without touching any core
  error class, prototype, or the fs module.
- Status: **rejected as patch** — copied convention on a library-owned object.

## Non-candidates noted for completeness

- `index.js:19 fs.readFile / index.js:187 fs.statSync` — calls only, no writes
  to the `fs` module object (S3 sweep: zero `fs.* =` assignments).
- `fresh`, `ms` — pure functions over caller-supplied strings/objects; zero
  core module imports in `fresh/index.js` and `ms/index.js` (P1 sweep).
- `fresh/index.js:97` comment "guard against date.js Date.parse patching" —
  defensive against third-party patches; fresh performs no write.
- P4 (patch/shim/polyfill vocabulary), P5 (require.cache, Module._load,
  require.extensions, syncBuiltinESMExports, registerHooks), P6
  (process.binding, internalBinding, internal/ specifiers): zero hits across
  all six runtime files.
- No install/prepare scripts, no `browser`/`exports` entrypoint remapping, no
  nested node_modules in any dependency (S4-S6 sweeps).
