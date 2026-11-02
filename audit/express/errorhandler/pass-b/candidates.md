# Candidate ledger: errorhandler 1.5.2 (pass B)

Every candidate site surfaced by the searches in `searches.md`, traced to the exact
object/key written or read, with status. Paths are `$PACKAGE_ROOT`-relative; dependency
paths are shorthand for `node_modules/<pkg>/...`. Node.js contracts verified at
`$NODEJS_SOURCE` commit `d44625a4b80c672215b469906ce583ce7eeeebaf`.

Statuses: confirmed (patch demonstrated) / rejected (traced, not a patch) / unresolved.
Result: 0 confirmed, 20 rejected, 0 unresolved.

## errorhandler index.js

### C-001 — index.js:35-38 — `defer` global feature detection
- Writes/modifies: nothing. `typeof setImmediate === 'function' ? setImmediate : function (fn) { process.nextTick(...) }`.
- Trace: reads global `setImmediate` identity; fallback closure calls `process.nextTick` with a bound fn. Both globals are only read and called; the fallback is stored in module-local var `defer`, never assigned onto `global`/`globalThis`/`process`.
- Status: **rejected** — read + call of core globals; no write. (Polyfill-shaped code that does not install a polyfill.)

### C-002 — index.js:67 — `process.env.NODE_ENV` read
- Writes/modifies: nothing; read into local `env`.
- Status: **rejected** — read only.

### C-003 — index.js:33 — `var toString = Object.prototype.toString`
- Writes/modifies: nothing; saves a reference to the core method for later `toString.call(err)` (lines 122, 186).
- Status: **rejected** — read of a core prototype method; `Object.prototype` never written (reproduction confirmed own-key set unchanged).

### C-004 — index.js:89, 94, 99 — `res.statusCode = err.statusCode | err.status | 500`
- Writes/modifies: own data property `statusCode` on the per-request `http.ServerResponse` instance, shadowing the prototype default.
- Core contract: `$NODEJS_SOURCE/lib/internal/http/server.js:285` `ServerResponse.prototype.statusCode = 200`; `response.statusCode` is documented public API (`$NODEJS_SOURCE/doc/api/http.md:2446`). Plain data slot, no accessor/function replaced.
- Status: **rejected** — documented instance data write (intended usage), not an instance override of core behavior and not a shared mutation.

### C-005 — index.js:109 — `if (res._header)` read of internal state
- Writes/modifies: nothing — read only; used to decide `req.socket.destroy()`.
- Core contract: `_header` is internal per-instance state of `OutgoingMessage`, initialized at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:188` (`this._header = null`) and backing the documented `headersSent` getter (`outgoing.js:1011`). Not covered by DEP0066 (which deprecates `_headers`/`_headerNames`).
- History: introduced by errorhandler commit `8c957112` ("Do not respond after headers sent", 2014).
- Status: **rejected** — private API read; no write. Logged as supporting context in report.

### C-006 — index.js:110 — `req.socket.destroy()`
- Writes/modifies: nothing on core objects; invokes the documented `net.Socket.prototype.destroy` method.
- Status: **rejected** — documented method call.

### C-007 — index.js:118, 138, 145, 149 — `res.setHeader(...)`
- Writes/modifies: response header state via the documented `OutgoingMessage.prototype.setHeader` API; the method itself is untouched.
- Status: **rejected** — documented API calls.

### C-008 — index.js:139, 146, 150 — `res.end(body|json|str)`
- Writes/modifies: nothing on core surfaces; documented call.
- Status: **rejected** — documented API calls.

### C-009 — index.js:142-143 — error-object property copy (JSON branch)
- Code: `var error = { message: err.message, stack: err.stack }; for (var prop in err) error[prop] = err[prop]`.
- Writes/modifies: a freshly created plain object `error`; `err` itself is only read (also read at lines 88, 93, 103, 122, 178, 197). No assignment anywhere in index.js targets `err`.
- Status: **rejected** — the passed error object is not mutated (confirmed statically and by reproduction: own-key set of the error identical before/after invoking all three branches).

### C-010 — index.js:159 — `exports.title = 'Connect'`
- Writes/modifies: the errorhandler module's own export object; documented library extension point ("framework authors may override this value").
- Status: **rejected** — library-owned surface, not core.

### C-011 — index.js:30-31 — load-time `fs.readFileSync` of public assets
- Writes/modifies: nothing; reads shipped `public/style.css` and `public/error.html` into module-local strings at require time. `fs`/`path`/`util` are imported and called, never mutated.
- Status: **rejected** — data-file reads; no core write.

## accepts@1.3.8 (node_modules/accepts/index.js)

### C-012 — accepts/index.js:82-83, 126-127, 159-160, 192-195 — `Accepts.prototype.*` assignments
- Writes/modifies: `type/types`, `encoding/encodings`, `charset/charsets`, `lang/langs/language/languages` on the prototype of the package's own `Accepts` constructor (declared index.js:32).
- Status: **rejected** — library-owned constructor prototype; `Accepts` neither extends nor wraps a core class.

### C-013 — accepts/index.js:36-37 — `this.headers = req.headers; this.negotiator = new Negotiator(req)`
- Writes/modifies: own properties of the new `Accepts` wrapper instance. The core-backed `req` (`http.IncomingMessage`) is only read (`req.headers`), never written; accepts holds no other reference to `req`.
- Status: **rejected** — own-object construction; zero writes to the core-backed request.

## negotiator@0.6.3 (node_modules/negotiator/)

### C-014 — negotiator/index.js:38-82 — `Negotiator.prototype.*` incl. backwards-compat aliases
- Writes/modifies: `charset(s)`, `encoding(s)`, `language(s)`, `mediaType(s)` and `preferred*` aliases on the package's own `Negotiator` constructor prototype (declared index.js:30). "Backwards compatibility" comment (index.js:74) refers to negotiator's own old API names, not core.
- Status: **rejected** — library-owned prototype.

### C-015 — negotiator/index.js:35 — `this.request = request`
- Writes/modifies: own property of the `Negotiator` instance storing a reference to `req`. All later use is read-only (`this.request.headers['accept-charset'|'accept-encoding'|'accept-language']`, `this.request.headers.accept`).
- Status: **rejected** — no write to the core-backed request.

### C-020 — negotiator/lib/charset.js, encoding.js, language.js, mediaType.js (whole files)
- Writes/modifies: only local arrays/objects inside pure parser functions (e.g. charset.js:38 `accepts[j++] = charset`, charset.js:43 `accepts.length = j`; same pattern in the other three) plus their own `module.exports`.
- Trace: targeted sweep found zero occurrences of `require`, `process`, `global`, or `prototype` in all four files; no writes to any argument originating from req/res.
- Status: **rejected** — self-contained string parsing; no core reference at all.

## mime-types@2.1.35 (node_modules/mime-types/index.js)

### C-016 — mime-types/index.js:31-39 + populateMaps (150-188) — load-time export population
- Writes/modifies: `exports.charset/charsets/contentType/extension/extensions/lookup/types` on the package's own export object; `populateMaps` (invoked at require time, line 39) fills `exports.extensions` and `exports.types`, both created with `Object.create(null)` (lines 35, 37), from mime-db data.
- Status: **rejected** — mutation of library-owned, null-prototype maps; no global, core module, or shared prototype touched.

### C-017 — mime-types/index.js:16 — `var extname = require('path').extname`
- Writes/modifies: nothing; destructured read of a core function, later called (line 134). `path` module exports never reassigned.
- Status: **rejected** — read + call only.

## mime-db@1.52.0 (node_modules/mime-db/index.js)

### C-018 — mime-db/index.js:12 — `module.exports = require('./db.json')`
- Writes/modifies: its own module export; pure static JSON data (no executable code, no scripts on the require path; `scripts/` build tooling is not required at runtime).
- Note: the exported object is shared/mutable (mime-types reads it; nothing in this scope writes to it).
- Status: **rejected** — data export; no core interaction.

## escape-html@1.0.3 (node_modules/escape-html/index.js)

### C-019 — escape-html/index.js (whole file, 78 lines)
- Writes/modifies: `module.exports = escapeHtml` and a module-scope regexp only. Pure function from string to string; no `require` of any module, no globals, no prototype access.
- Status: **rejected** — zero candidates inside; file-level entry recorded for coverage.

## Negative sweeps (no candidate produced)

- Module-loading interception (`require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`): 0 hits in all 10 runtime files.
- Bindings/internals (`process.binding`, `process._linkedBinding`, `internalBinding`, `'_http_`, `'internal/`): 0 hits.
- `delete` operator: 0 hits.
- Writes on builtin globals (`JSON/Math/Date/RegExp/String/Number/Array/Object/Function/Error/console/setImmediate/setTimeout/setInterval/queueMicrotask` followed by property assignment): 0 hits.
- `Object.defineProperty/defineProperties`, `__proto__`, `setPrototypeOf`, `Reflect.set/defineProperty/setPrototypeOf`, `Object.assign`: 0 hits anywhere in scope.
- `extends` / `util.inherits`: 0 hits (no core subclassing at all).
- Install scripts (preinstall/install/postinstall) in all six package.json files: none.
