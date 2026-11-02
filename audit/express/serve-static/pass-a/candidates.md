# Candidate ledger — serve-static 2.2.1 (pass A)

Every candidate site surfaced by the searches in `searches.md`, with what it writes/modifies and its disposition. Paths relative to `$PACKAGE_ROOT`; Node.js references relative to `$NODEJS_SOURCE` (commit d44625a4b80c672215b469906ce583ce7eeeebaf).

## Confirmed

### C-001 — depd `getStack()`: transient reassignment of `Error.prepareStackTrace` and `Error.stackTraceLimit` -> F-001
- Sites: node_modules/depd/index.js:386 (`Error.prepareStackTrace = prepareObjectStackTrace`), :387 (`Error.stackTraceLimit = Math.max(10, limit)`), :390 (`Error.captureStackTrace(obj)`), :392 (`obj.stack` access triggers the hook), :395-396 (restore both).
- Writes/modifies: shared globals on the `Error` constructor — the V8 stack-trace preparation hook that Node core consults (lib/internal/errors.js:149-150) and the global frame limit.
- Reachability: unconditional at `require('serve-static')` — index.js:20 -> send/index.js:15 -> http-errors/index.js:15 (`require('depd')('http-errors')`) -> depd/index.js:103 (`depd()`) -> :108 (`getStack()`). Also from depd `log()` (:199), `wrapfunction` (:419), `wrapproperty` (:455) — of which only `log()` is wired in this tree and only fires for non-4xx/5xx `createError` statuses, which send never passes.
- Status: **confirmed** (transient shared-global mutation, synchronously restored; no user code interleaved during the window). Reproduction observed the write+restore pair at require time.

## Rejected

### C-002 — on-finished `patchAssignSocket`: instance-level wrapper of `res.assignSocket`
- Sites: node_modules/on-finished/index.js:128-131 (guard + call), :189-199 (saves `res.assignSocket`, assigns own-property `res.assignSocket = function _assignSocket(socket) { assignSocket.call(this, socket); callback(socket) }`).
- Writes/modifies: would create an own-property override on a single ServerResponse instance, wrapping the core prototype method (defined at lib/internal/http/server.js:312) and calling through.
- Reachability analysis (send's usage: `onFinished(res, cleanup)` at send/index.js:690): reached only when `isFinished(res) === false` AND `!msg.socket` AND `msg.socket === undefined`. At the baseline, `OutgoingMessage` sets `this[kSocket] = null` in its constructor (lib/internal/http/outgoing.js:187) and `socket` is a prototype accessor over `kSocket` (:304-316), so `res.socket` is `null` or a net.Socket — never `undefined`. In the normal path the socket is already assigned before the request handler runs (`res.assignSocket(socket)` at lib/internal/http/server.js:1410); in the pipelined path the response is queued with socket slot `null`. The code comment labels it "node.js 0.8 patch" ("res.on('socket', callback) is broken in 0.8"). Package engines: node >= 18.
- Status: **rejected as a patch at the audited baseline** — dormant legacy branch, statically unreachable (guard unsatisfiable); dynamically confirmed: live request left no own `assignSocket` property on `res`.

### C-003 — debug `save()`: `process.env.DEBUG` write/delete at require time
- Sites: node_modules/debug/src/node.js:205 (`process.env.DEBUG = namespaces`), :209 (`delete process.env.DEBUG`); activation node_modules/debug/src/common.js:287 (`createDebug.enable(createDebug.load())` runs during `require('debug')`).
- Writes/modifies: environment variable data on the core-backed `process.env` object.
- Status: **rejected as a patch** — data write, not an API/behavior replacement; idempotent at load (re-writes the current value of DEBUG, or deletes an absent key). No core function/prototype touched. Repro: `process.env.DEBUG` identical before/after require.

### C-004 — send `SendStream`: legacy `Stream` subclass with own-prototype `pipe`
- Sites: node_modules/send/index.js:94 (`Stream.call(this)`), :155 (`util.inherits(SendStream, Stream)`), :403 (`SendStream.prototype.pipe = ...`), plus 18 other `SendStream.prototype.*` definitions (:165-:736).
- Writes/modifies: send's own constructor prototype only; shadows `Stream.prototype.pipe` (lib/internal/streams/legacy.js:17, exported via lib/stream.js:55) for SendStream instances.
- Status: **rejected** — supported subclassing; core `Stream.prototype` untouched (identity verified in repro).

### C-005 — serve-static redirect listener mutates the cached parsed URL object
- Sites: index.js:192 (`originalUrl.path = null`), :193 (`originalUrl.pathname = collapseLeadingSlashes(...)`).
- Writes/modifies: the `url.Url` (or plain) object that parseurl cached on `req._parsedOriginalUrl` (or `req._parsedUrl` on fallback); subsequent `parseurl.original(req)` callers in the same request observe the mutated pathname (parseurl's freshness check passes because `_raw` is unchanged).
- Status: **rejected as a core patch** — mutation of a library-created, library-cached object stored under an express-family convention property; no core API/behavior replaced. Noted as supporting context (cross-middleware side effect).

### C-006 — parseurl memoization properties on the request
- Sites: node_modules/parseurl/index.js:51 (`req._parsedUrl = parsed`), :86 (`req._parsedOriginalUrl = parsed`); `parsed._raw` on its own object (:48, :83).
- Writes/modifies: adds library-owned metadata properties to a core-backed IncomingMessage instance.
- Status: **rejected** — request metadata, explicitly not a patch per the audit criteria; overrides nothing.

### C-007 — on-finished listener bookkeeping on the response
- Sites: node_modules/on-finished/index.js:147 (`msg.__onFinished = createListener(msg)`), :164 (reset to null).
- Status: **rejected** — library-owned metadata property on a core-backed instance; no override.

### C-008 — http-errors constructor machinery
- Sites: node_modules/http-errors/index.js:117 (`inherits(HttpError, Error)`), :139/:208 (`setPrototypeOf(err, ...)` on its own `new Error(...)`), :142-157/:211-226 (`Object.defineProperty(err, 'message'|'name', ...)` on its own errors), :163-165/:232-234 (status props on its own constructor prototypes), :249 (`Object.defineProperty(func, 'name', ...)` on its own constructors), module-load `populateConstructorExports` (:31) building ~tens of constructors at require time.
- Status: **rejected** — all targets are objects http-errors creates and owns; `Error`, `Error.prototype`, and core modules are untouched. Subclassing `Error` via `util.inherits` mutates only the new constructors.

### C-009 — setprototypeof module
- Sites: node_modules/setprototypeof/index.js:3 (exports `Object.setPrototypeOf` when present), :6 (`obj.__proto__ = proto` fallback), :10-16 (`mixinProperties` fallback).
- Status: **rejected** — no core mutation; fallbacks apply only on engines lacking `Object.setPrototypeOf` (not the baseline) and mutate caller-passed objects (http-errors' own errors).

### C-010 — depd process interaction
- Sites: node_modules/depd/index.js:186 (`eehaslisteners(process, 'deprecation')` — read), :251 (`process.emit('deprecation', err)`), :256-260 (`process.stderr.isTTY` read, `process.stderr.write`), :23 (`process.cwd()` at require), :154-177 (`process.noDeprecation`/`traceDeprecation`/env reads).
- Status: **rejected** — reads and public API calls (custom event emission, stream write); nothing reassigned on `process` or its streams.

### C-011 — depd `wrapfunction` / `wrapproperty`
- Sites: node_modules/depd/index.js:413-432 (`new Function(...)` wrapper returned to caller), :439-485 (`Object.defineProperty(obj, prop, descriptor)` on a caller-supplied object; also `convertDataDescriptorToAccessor` :48-64), exposed as `deprecate.function`/`deprecate.property` (:123-124).
- Status: **rejected (unreachable)** — the only depd consumer in scope is http-errors, which calls `deprecate(message)` only (http-errors/index.js:73); a tree-wide search found no `deprecate.function`/`deprecate.property` caller. Even if called, the target object is the caller's own export, not core.

### C-012 — debug self-mutation
- Sites: node_modules/debug/src/common.js:122 (`Object.defineProperty(debug, 'enabled', ...)` on its own instance functions), setup() assignments onto `createDebug`, node_modules/debug/src/index.js:6 (entry selection on `process.type`/`process.browser` — reads).
- Status: **rejected** — all writes target debug's own function objects.

### C-013 — etag core-type checks
- Sites: node_modules/etag/index.js:22 (`Stats = require('fs').Stats`), :101-110 (`instanceof Stats` + duck-typing), :29 (`Object.prototype.toString` saved reference — read only).
- Status: **rejected** — read-only use of a core class for type detection; crypto usage (:45-49) is plain API calls.

### C-014 — inherits
- Sites: node_modules/inherits/inherits.js:2-9 (re-exports `util.inherits`; browser fallback file not resolvable on Node).
- Status: **rejected** — `util.inherits` mutates only the new subclass constructor passed to it; `util` itself unmodified.

### C-015 — debug `exports.destroy = util.deprecate(() => {}, ...)`
- Sites: node_modules/debug/src/node.js:17-21.
- Status: **rejected** — wraps debug's own no-op function at require time; no core target.

### C-016 — serve-static/send request/response API usage (bulk)
- Sites: index.js:78-81 (405 path: `res.statusCode`/`setHeader`/`end`), :200-206 (redirect response); node_modules/send/index.js:165-190 (`error()` incl. `clearHeaders` via `res.getHeaderNames()`/`removeHeader` :777-781), :253-261 (`removeContentHeaderFields`), :269-275 (304 path), :369-392 (redirect), :490-592 (`send()`: `headersSent` read, header writes, `res.end()`), :675-705 (`stream()`: `fs.createReadStream(...).pipe(res)`, `stream.destroy()`, `onFinished`), :715-725 (`type()`), :736-768 (`setHeader()`).
- Status: **rejected** — exclusively documented public `ServerResponse`/`IncomingMessage`/stream API calls; targeted searches confirmed no assignment to any req/res method, no `_implicitHeader`/`_header(s)`/`_writableState`/`_readableState`/`outputData` access anywhere in scope.

### C-017 — pure leaf dependencies
- Sites/files: node_modules/encodeurl/index.js, escape-html/index.js, fresh/index.js, range-parser/index.js, statuses/index.js, toidentifier/index.js, ms/index.js, mime-db/index.js (JSON re-export), mime-types/index.js + mimeScore.js (populates its own export maps at require), ee-first/index.js (adds/removes its own listeners on passed emitters via public `on`/`removeListener`).
- Status: **rejected** — read in full; pure computation over arguments/own data; no core object writes.

## Unresolved

None.
