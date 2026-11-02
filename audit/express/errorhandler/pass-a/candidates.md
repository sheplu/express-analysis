# Candidate ledger: errorhandler 1.5.2 (pass A)

Scope: `$PACKAGE_ROOT/index.js` + runtime deps (accepts@1.3.8, escape-html@1.0.3,
negotiator@0.6.3, mime-types@2.1.35, mime-db@1.52.0). Paths relative to
`$PACKAGE_ROOT`. Core baselines relative to `$NODEJS_SOURCE`
(d44625a4b80c672215b469906ce583ce7eeeebaf).

Totals: 18 candidates — 0 confirmed, 18 rejected as patch, 0 unresolved.

## errorhandler itself (index.js)

### C-001 — index.js:88-100 — `res.statusCode` assignments — REJECTED
Writes: `res.statusCode = err.statusCode` (89), `res.statusCode = err.status`
(94), `res.statusCode = 500` (99). Target: core-backed `http.ServerResponse`
instance. `statusCode` is a documented writable public property; the core
default is a prototype data property (`ServerResponse.prototype.statusCode =
200`, lib/internal/http/server.js:285) that user code is expected to shadow
with an own property before headers flush; `writeHead`/implicit-header paths
consume it (server.js:420,424,432-433). Instance data write through supported
API; nothing replaced or wrapped. Not a patch.

### C-002 — index.js:109 — `res._header` — REJECTED (private API READ)
`if (res._header) { return req.socket.destroy() }`. `_header` is private
OutgoingMessage state: initialized `null` (lib/internal/http/outgoing.js:188),
set to the serialized header block at flush (outgoing.js:636); public
equivalent is the `headersSent` getter (outgoing.js:1011). errorhandler only
reads it — no assignment, no descriptor change. Introduced in errorhandler
commit 8c95711 (2014-04-29) for pre-`headersSent` Node (engines >= 0.8).
Private API usage = supporting context, not a patch.

### C-003 — index.js:110 — `req.socket.destroy()` — REJECTED
Calls the documented `net.Socket#destroy` method on the request socket. A call,
not a reassignment of any core method or property.

### C-004 — index.js:118, 138, 145, 149 — `res.setHeader(...)` — REJECTED
Calls documented `OutgoingMessage.prototype.setHeader`
(lib/internal/http/outgoing.js:813) to set `X-Content-Type-Options` and
`Content-Type`. Per-response header state via supported API; the method itself
is never replaced.

### C-005 — index.js:139, 146, 150 — `res.end(body)` — REJECTED
Documented response-termination API call. No mutation beyond normal response
lifecycle.

### C-006 — index.js:142-143 — error object inspection (JSON branch) — REJECTED
`var error = { message: err.message, stack: err.stack }; for (var prop in err)
error[prop] = err[prop]`. Reads `err` (including inherited enumerables) into a
new library-owned object. `err` itself — core `Error` or user object — is never
written. Elsewhere `err.stack`/`String(err)`/`util.inspect(val)` (index.js:
122, 177-188) are also reads only.

### C-007 — index.js:159 — `exports.title = 'Connect'` — REJECTED
Library-owned module export; the in-code doc (index.js:156) invites framework
authors to override it. Template interpolation at index.js:135 reads it. Not a
core object.

### C-008 — index.js:36-38 — `defer` setImmediate/process.nextTick — REJECTED
`typeof setImmediate === 'function' ? setImmediate : function (fn) {
process.nextTick(...) }`. Feature detection that selects which core scheduler
to call; neither `setImmediate` nor `process.nextTick` is defined, replaced, or
wrapped on a shared object (the wrapper function is module-local). Not a
polyfill install.

### C-009 — index.js:30-31 — load-time `fs.readFileSync` — REJECTED
Reads `public/style.css` and `public/error.html` (package-owned data files) at
require time. Calls into `fs` only; no property of the `fs` module is written.

### C-010 — index.js:33 — `var toString = Object.prototype.toString` — REJECTED
Saves a reference for later `.call(err)` type checks (index.js:122, 186).
Read/alias only; `Object.prototype` is not mutated (confirmed by repro-check
objectProtoKeys/objectToString checks).

## accepts@1.3.8

### C-011 — node_modules/accepts/index.js:32-39 — `Accepts(req)` wraps req — REJECTED
Constructor stores `this.headers = req.headers` (reference read, line 37) and
`this.negotiator = new Negotiator(req)` (line 38). `req` receives no new or
changed properties; negotiation results are returned, never written back onto
`req`. All later methods (types/encodings/charsets/languages, lines 83-212)
read `this.headers`/`this.negotiator` only.

### C-012 — node_modules/accepts/index.js:82-195 — `Accepts.prototype.*` — REJECTED
Method definitions and aliases on the library's own constructor prototype
(`type/types`, `encoding/encodings`, `charset/charsets`,
`lang/langs/language/languages`). Library-owned prototype; no core prototype
involved.

## negotiator@0.6.3

### C-013 — node_modules/negotiator/index.js:35 — `this.request = request` — REJECTED
Stores a reference to the core-backed req on the library-owned Negotiator
instance. All uses are reads of `this.request.headers[...]` (lines 44, 53, 62,
71). No write to the request object.

### C-014 — node_modules/negotiator/index.js:38-82 — `Negotiator.prototype.*` — REJECTED
Method definitions plus backwards-compatibility aliases
(`preferredCharset(s)/preferredEncoding(s)/preferredLanguage(s)/preferredMediaType(s)`,
lines 75-82) on the library-owned prototype only.

### C-015 — node_modules/negotiator/lib/{charset,encoding,language,mediaType}.js — REJECTED
Pure header-string parsers (169/184/179/294 lines). Searches S1-S6 over these
files returned: no `require` of any module, no `process`/`global`/`Buffer`
references, no prototype or descriptor operations, no module-loading hooks.
Only module-local functions and `module.exports` assignments.

## mime-types@2.1.35

### C-016 — node_modules/mime-types/index.js:35,37,40,154-188 — load-time table build — REJECTED
`exports.extensions = Object.create(null)`; `exports.types =
Object.create(null)`; `populateMaps(exports.extensions, exports.types)` runs at
require time, iterating `mime-db` entries and writing `extensions[type] = exts`
(167) and `types[extension] = type` (185). All writes land in mime-types' own
null-prototype export tables. Core usage is a single destructured read of
`require('path').extname` (line 16), called at line 138 — never reassigned.

## mime-db@1.52.0

### C-017 — node_modules/mime-db/index.js:12 — `module.exports = require('./db.json')` — REJECTED
Entire runtime surface is a static JSON data export (db.json,
sha256 85c8e1ba...). No executable logic, no core access. The package's
scripts/ directory (table generation) is not shipped in the runtime path used
here and is not invoked at require time.

## escape-html@1.0.3

### C-018 — node_modules/escape-html/index.js — purity check — REJECTED
78-line pure function: module-local regexp + character-code switch building a
new string. No `require` statements at all, no globals touched, no prototype
access. Confirmed pure.

## Install-time surface (meta-candidate) — REJECTED
No package in the runtime tree (errorhandler or the five deps) declares
`preinstall`/`install`/`postinstall` scripts (verified from each package.json),
so no install-time core-source rewrite vector exists.
