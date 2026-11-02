# Candidate ledger — serve-index 1.9.2 patch audit (pass B)

Every candidate site surfaced by the skill's pattern set over `$PACKAGE_ROOT/index.js`
and all 15 installed runtime dependencies, with resolution. Statuses:
confirmed (-> finding), rejected (not a Node.js patch), unresolved (none).

## Confirmed

### C-001 — depd/index.js:365-383 `getStack()` — writes `Error.prepareStackTrace`, `Error.stackTraceLimit`
- Writes: `Error.prepareStackTrace = prepareObjectStackTrace` (:370), `Error.stackTraceLimit = Math.max(10, limit)` (:371); saved originals at :366,:368; restored at :379-380.
- Object/key: global `Error` constructor, data properties `prepareStackTrace` and `stackTraceLimit` — core-consulted hooks (`$NODEJS_SOURCE/lib/internal/errors.js:136-162,181-188`).
- Activation: at `require('serve-index')` via index.js:17 -> http-errors/index.js:15 `require('depd')('http-errors')` -> depd/index.js:110; again via http-errors/index.js:286 `deprecate.function` -> depd/index.js:404; post-load on every depd `log()` (:183) process-wide.
- Restoration: synchronous, unconditional straight-line restore; no user code runs inside the window; no try/finally (restore skipped only if `captureStackTrace`/`obj.stack` threw — not observed).
- Status: **confirmed -> F-001**. Reproduction: 3 set/restore cycles observed during require; values fully restored (Node v24.19.0).

### C-002 — depd/lib/compat/index.js:21-43 lazy `callSiteToString` getter — same `Error` swap
- Writes: `Error.prepareStackTrace = prepareObjectStackTrace` (:30), `Error.stackTraceLimit = 2` (:31); restored :39-40. Also lazyProperty redefines `module.exports.callSiteToString` via defineProperty (:53-71) — own module object.
- Activation: property read at depd/index.js:11 (`require('./lib/compat').callSiteToString`) forces the getter during `require('depd')`, i.e. at `require('serve-index')`.
- Status: **confirmed -> F-001** (second library site, same core target, same save/restore semantics).

## Rejected

### C-003 — batch/index.js:51 `Batch.prototype.__proto__ = EventEmitter.prototype`
- Writes: the [[Prototype]] of `Batch.prototype` (library-owned object). `EventEmitter.prototype` is only the assigned reference; never itself written.
- Checked: full read of batch/index.js (174 lines). Batch's prototype members `concurrency` (:64), `push` (:77), `throws` (:89), `end` (:103) and instance fields `fns`, `n`, `e` shadow no `EventEmitter.prototype` member (checked against `$NODEJS_SOURCE/lib/events.js`). Batch never calls the EventEmitter constructor; core `addListener` lazily initializes `_events` (`$NODEJS_SOURCE/lib/events.js:552-555`), so no contract break. `emit('progress')` (:145) fires on the Batch instance.
- Status: rejected — legacy inheritance via library-owned prototype chain; no core mutation.

### C-004 — http-errors/index.js:123,166,235 `inherits(HttpError|ClientError|ServerError, ...)`
- `inherits` = `util.inherits` (inherits/inherits.js:5). util.inherits sets `ctor.super_` and re-prototypes `ctor.prototype` — mutations land on http-errors' own constructors; `Error`/`Error.prototype` untouched.
- Status: rejected — ordinary inheritance of library constructors from core `Error`.

### C-005 — http-errors/index.js:145,214 `setPrototypeOf(err, ClientError|ServerError.prototype)`; :148-161,217-230 `Object.defineProperty(err,'message'|'name',...)`
- `err` is `new Error(msg)` created by http-errors itself (:139,:207) and returned as its own product. Re-prototyping/redefining props on a library-created Error instance.
- Status: rejected — library-owned instance; no core-provided object modified.

### C-006 — http-errors/index.js:95,142,211 `Error.captureStackTrace(err, ...)`
- Status: rejected — invocation of the documented V8/Node API; a call, not a write to `Error`.

### C-007 — http-errors/index.js:98-102 `err.expose`/`err.status`/`err.statusCode`; :104-108 props copy
- May write onto a caller-supplied Error instance. `status`/`statusCode`/`expose` exist on neither `Error.prototype` nor core error contracts — metadata only.
- Status: rejected — instance metadata, no core member shadowing.

### C-008 — http-errors/index.js:286 `deprecate.function(exports.ImATeapot, ...)` -> depd/index.js:397-417 `wrapfunction` (eval at :410)
- Produces a wrapper stored on http-errors' own `exports["I'mateapot"]`; wraps a library function. `eval` is dynamic codegen, not loader interception. Inner `getStack()` covered by C-001.
- Status: rejected as a separate patch — no core object replaced.

### C-009 — http-errors/index.js:250-257 `nameFunc` `Object.defineProperty(func,'name',...)`
- Status: rejected — on http-errors' own constructors.

### C-010 — setprototypeof/index.js:3-17
- Load-time: reads `Object.setPrototypeOf` / `__proto__` support; exports the native function or a fallback that mutates only the object passed in. In this tree it is applied only to http-errors' own instances (C-005).
- Status: rejected — no write to any global/prototype at load; polyfill-shaped but mutation-free toward core.

### C-011 — parseurl/index.js:54 `req._parsedUrl = parsed`; :84 `req._parsedOriginalUrl = parsed`; :52,:82 `parsed._raw`
- Adds memoization metadata to the IncomingMessage instance per request (serve-index index.js:111,117,365). Negative grep for `_parsedUrl|_parsedOriginalUrl` in `$NODEJS_SOURCE/lib/_http_incoming.js` — no core member shadowed. `parsed` is parseurl's own object.
- Status: rejected — request metadata (skill-exempt), Express-ecosystem convention.

### C-012 — parseurl/index.js:128-141 `new Url()` + `url.path/href/pathname/query/search` writes
- `Url` is publicly exported by core (`$NODEJS_SOURCE/lib/url.js:1025-1027`). parseurl constructs its own instance and fills the same fields `url.parse` would — a standalone fast-path copy (comment cites joyent/node PR #7878 regex), not a replacement of `url.parse`.
- Status: rejected — own instance of a documented legacy class; no core function/prototype replaced.

### C-013 — debug/src/node.js:248 `exports.enable(load())` -> debug.js:138-139 `exports.save` -> node.js:139-147 `process.env.DEBUG =` / `delete process.env.DEBUG`
- Fires at `require('serve-index')` (index.js:18). `process.env` is a documented writable core-backed object; the write re-persists the existing value (or no-op deletes when DEBUG unset).
- Status: rejected — supported API use, idempotent at load; no behavior of Node rewritten.

### C-014 — debug/src/node.js:167-226 `createWritableStdioStream`
- Only reachable when env `DEBUG_FD` parses to an fd other than 1/2 (:61-69); default path binds `process.stderr` without mutation. Inside: `process.binding('tty_wrap')` (:169) private-API read; `new fs.SyncWriteStream` (:187) — absent from `$NODEJS_SOURCE/lib/fs.js` (DEP0061; path throws on modern Node); instance writes `stream._type`, `stream.readable = false`, `stream.read = null`, `stream.fd`, `stream._isStdio` (:176-223) on tty/fs/net stream instances debug itself constructs and solely consumes (code copied from legacy `node/src/node.js` bootstrap). `stream.read = null` shadows `Readable.prototype.read` on that one owned instance only.
- Status: rejected — optional activation, library-created/owned instances, nothing shared with other consumers; recorded as private-API usage in supporting context.

### C-015 — debug/src/node.js:63-65 `util.deprecate(function(){}, ...)()` 
- Status: rejected — core API call (emits a deprecation warning), only under non-default DEBUG_FD; no mutation.

### C-016 — $PACKAGE_ROOT/index.js:143-145 `err.status = err.code === 'ENAMETOOLONG' ? 414 : 500`
- Writes `status` onto the Error instance delivered by `fs.stat`'s callback. `status` is not a member of core fs errors or `Error.prototype`.
- Status: rejected — error-instance metadata for downstream middleware.

### C-017 — $PACKAGE_ROOT/index.js:103-106 `res.statusCode =`, `res.setHeader`, `res.end`; :540-547 send()
- Status: rejected — documented `http.ServerResponse` API usage; no method replaced.

### C-018 — accepts/index.js:82-212 and negotiator/index.js:38-82 prototype method definitions
- Both define methods on their own constructors' prototypes (`Accepts.prototype.*`, `Negotiator.prototype.*`, incl. aliases :75-82). `req` is only read (`this.headers = req.headers`, `this.request = request`; header reads in negotiator/lib parsers). No write to `req` anywhere (verified by full read of accepts/index.js and negotiator/index.js; pattern scan of negotiator/lib/*.js — zero core references).
- Status: rejected — library-owned prototypes; request untouched.

### C-019 — statuses/index.js:60-77 `populateStatusesMap`; mime-types/index.js:30-39,154-188 exports maps
- Status: rejected — writes to the modules' own exports objects (data tables).

### C-020 — depd/index.js:51-67 `convertDataDescriptorToAccessor`, :423-470 `wrapproperty`, :476-522 `DeprecationError` defineProperties
- `wrapproperty` could re-define a property on a caller-supplied object (including a core one), but no module in this tree calls `deprecate.property`; http-errors uses only `deprecate()` and `deprecate.function`. DeprecationError defineProperties act on depd's own `new Error()`.
- Status: rejected — unreachable toward core in the audited scope; library-owned objects otherwise.

### C-021 — inherits/inherits.js:1-9
- Status: rejected — re-exports `util.inherits` after a capability check; read-only.

### C-022 — debug/src/debug.js:9-29 exports assignments, :117-125 debug instance fields, formatters (node.js:85-100)
- Status: rejected — own module exports and own function-object fields (`debug.enabled`, `inspectOpts`, `formatters.o/O`); `formatArgs` mutates its own args array.

### C-023 — batch/index.js:16-18 `defer = process.nextTick`
- Status: rejected — stores a reference to the core function; never writes to `process`.

## Unresolved

None.
