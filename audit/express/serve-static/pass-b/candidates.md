# Candidate ledger: serve-static 2.2.1 (pass-b)

Every candidate site produced by the skill's pattern searches over the
runtime tree, with the exact object/key written, activation, and disposition.
Paths are `$PACKAGE_ROOT`-relative; core references are `$NODEJS_SOURCE`-relative
(commit d44625a4b80).

Status legend: **confirmed** (demonstrated Node.js patch), **rejected**
(traced; not a patch of Node.js core), **unresolved** (none).

## C-001 — depd getStack(): Error.prepareStackTrace / Error.stackTraceLimit swap — CONFIRMED -> F-001

- Sites: `node_modules/depd/index.js:382` (save limit), `:384` (save prep), `:386` (`Error.prepareStackTrace = prepareObjectStackTrace`), `:387` (`Error.stackTraceLimit = Math.max(10, limit)`), `:390` (`Error.captureStackTrace(obj)`), `:393` (`obj.stack` read triggers prepareObjectStackTrace), `:395-:396` (restore both).
- Object/key: the shared global `Error` constructor; keys `prepareStackTrace` (function) and `stackTraceLimit` (number). Saved originals: yes (`prep`, `limit` locals). Restoration: synchronous, unconditional, same function body, no try/finally (an exception between swap and restore would leak the patch, but `captureStackTrace` and `prepareObjectStackTrace` have no throwing paths here).
- Activation chain: `require('serve-static')` (`index.js:20` requires send) -> `node_modules/send/index.js:15` requires http-errors -> `node_modules/http-errors/index.js:15` `require('depd')('http-errors')` -> `depd()` `node_modules/depd/index.js:108` `getStack()`. Fires at require time, exactly once per process (http-errors is the sole depd consumer in this tree; `depd()` called once; no other load-time `getStack()` callers).
- Per-request activation: `log()` (`depd/index.js:199`) also calls `getStack()`, but is reached only via `deprecate()` at `http-errors/index.js:73`, which requires `createError()` with status < 400 or >= 600. serve-static/send only invoke `createError` with 400/403/404/412/416/500 (send `SendStream.prototype.error`, serve-static directory/error listeners), so per-request count is 0. `wrapfunction` (`:419`) / `wrapproperty` (`:455`) also call `getStack()` but are never invoked in this tree (see C-008).
- Core baseline: V8 stack-trace API on the `Error` global; Node core installs and honors it — `lib/internal/errors.js:136-150` (`prepareStackTraceCallback` delegates to `globalThis.Error.prepareStackTrace` when set).
- Evidence: full read; reproduction (`repro-check.js`, Node v24.19.0): exactly 2 instrumented writes to `Error.prepareStackTrace` during require (`prepareObjectStackTrace`, then the saved original `ErrorPrepareStackTrace`), value restored; `Error.stackTraceLimit` value restored (accessor instrumentation of the limit is impossible — V8 requires a data property; verified empirically when the accessor disabled stack capture).

## C-002 — on-finished patchAssignSocket: instance wrap of res.assignSocket — REJECTED (unreachable on supported Node)

- Sites: `node_modules/on-finished/index.js:189-199` (`res.assignSocket = function _assignSocket (socket) { assignSocket.call(this, socket); callback(socket) }`, saving the original at `:190`); guard at `:128` (`if (msg.socket === undefined)`); call at `:130`.
- Object/key: would write own property `assignSocket` on a live `http.ServerResponse` instance, shadowing the core prototype method (`lib/internal/http/server.js:312`). Saved original: yes, delegated to. Restoration: never removed from the instance.
- Why rejected: on the baseline (and every Node since 0.10), `OutgoingMessage` initializes the socket slot to `null`, not `undefined` — `lib/internal/http/outgoing.js:187` (`this[kSocket] = null`) with a `socket` accessor at `:295-:315` returning `this[kSocket]`. Therefore `msg.socket === undefined` is always false and `patchAssignSocket` is dead code (the code comment itself says "node.js 0.8 patch"). Additionally, in send's only usage (`node_modules/send/index.js:690`, `onFinished(res, cleanup)` inside `SendStream.prototype.stream`), the response is mid-request with its socket already assigned, so `attachFinishedListener` takes the `msg.socket` truthy early return at `:119-:123` and never reaches the guard. Reproduction confirmed `ServerResponse.prototype.assignSocket` identity unchanged after require (the function only ever targets instances anyway).
- Classification if it were reachable: instance/application override (core-backed instance method wrap). Dormant legacy; not counted.

## C-003 — on-finished attachListener: msg.__onFinished — REJECTED

- Sites: `node_modules/on-finished/index.js:143,147,164` (`msg.__onFinished = createListener(msg)`, later reset to `null`).
- Object/key: own property `__onFinished` on the live ServerResponse. Library-owned queue key; shadows nothing — `grep -n "__onFinished" $NODEJS_SOURCE/lib/internal/http/{incoming,outgoing,server}.js` is negative. Instance metadata, not a core patch.

## C-004 — parseurl memoization: req._parsedUrl / req._parsedOriginalUrl — REJECTED

- Sites: `node_modules/parseurl/index.js:54` (`req._parsedUrl = parsed`), `:84` (`req._parsedOriginalUrl = parsed`), plus `parsed._raw` on the parsed object (`:52,:82`).
- Object/key: own cache properties on the live `http.IncomingMessage`. Core defines neither key (negative grep as in C-003). Express-ecosystem convention; adding request metadata does not establish a patch (skill rule). Activation: per request via `$PACKAGE_ROOT/index.js:86-87,189`.

## C-005 — serve-static redirect listener mutates cached originalUrl — REJECTED

- Sites: `$PACKAGE_ROOT/index.js:192-193` (`originalUrl.path = null`, `originalUrl.pathname = collapseLeadingSlashes(...)`) on the object returned by `parseUrl.original(req)`.
- Object/key: properties of the legacy `url.Url` instance (or plain object) that parseurl created and cached on `req._parsedOriginalUrl`. This is data mutation of a library-cached object — no core API/prototype/global is replaced. Side effect worth noting (later `parseurl.original(req)` callers in the same request observe the mutated pathname), recorded as supporting context.

## C-006 — setprototypeof polyfill export — REJECTED

- Sites: `node_modules/setprototypeof/index.js:3` (`module.exports = Object.setPrototypeOf || (...)`), `:6` (`obj.__proto__ = proto` fallback), `:10-16` (mixin fallback).
- On Node >= 18 (package engines) `Object.setPrototypeOf` exists, so the module re-exports the native function unchanged; nothing is assigned to `Object`. Fallbacks, even if active, mutate only the object passed in — used by http-errors solely on error instances it just created. Load-time feature detection, not a patch.

## C-007 — http-errors constructors: inherits / setPrototypeOf / defineProperty — REJECTED

- Sites: `node_modules/http-errors/index.js:117` (`inherits(HttpError, Error)`), `:139/:208` (`setPrototypeOf(err, ClientError|ServerError.prototype)`), `:142-155/:211-224` (defineProperty `message`/`name` on the new err), `:163-165/:232-234` (status/statusCode/expose on the library-owned constructor prototypes), `:244-251` (`nameFunc` defineProperty on its own constructor function), `:258-278` (populateConstructorExports on its own exports).
- All writes target objects http-errors created (error instances, ClientError/ServerError/HttpError constructors, its exports). `inherits` sets the library constructor's prototype chain to extend `Error` — ordinary inheritance; `Error.prototype` and the `Error` global are never written. Activation: constructor table built at load; instances per call.

## C-008 — depd wrapfunction / wrapproperty — REJECTED (not activated)

- Sites: `node_modules/depd/index.js:413-433` (`wrapfunction`: returns a new wrapper via `new Function`, does not mutate the target), `:439-486` (`wrapproperty`: `Object.defineProperty(obj, prop, descriptor)` at `:485`, converting data to accessor at `:49-65`).
- These mutate caller-designated objects and could patch core if ever handed a core object — but they are exposed only as `deprecate.function`/`deprecate.property` (`:123-124`) and nothing in this dependency tree calls either (rg for `deprecate.function|deprecate.property|\.property\(` over the runtime tree: only the definition sites). Potential-but-unactivated helper, not a patch in scope.

## C-009 — depd DeprecationError — REJECTED

- Sites: `node_modules/depd/index.js:492-538` (defineProperty `constructor`/`message`/`name`/`namespace`/`stack` on `new Error()` it just created). Library-created instance; also only reachable from `log()` with a `process.on('deprecation')` listener. Not a patch.

## C-010 — debug save(): process.env.DEBUG write/delete at load — REJECTED

- Sites: `node_modules/debug/src/node.js:203-211` (`process.env.DEBUG = namespaces` / `delete process.env.DEBUG`), reached at load via `node_modules/debug/src/common.js:287` (`createDebug.enable(createDebug.load())` -> `enable` `:162-164` -> `save`).
- Object/key: `process.env` (core-backed env object), key `DEBUG` — the library's own configuration key, written back to the exact value just read (or deleted when unset: a no-op). Environment configuration, not a rewrite of any Node API/behavior.

## C-011 — debug own-object definitions — REJECTED

- Sites: `node_modules/debug/src/common.js:122-139` (`Object.defineProperty(debug, 'enabled', ...)` on its own debug function), `:8-33` (properties on its own `createDebug`), `node_modules/debug/src/node.js:18-21` (`exports.destroy = util.deprecate(() => {}, ...)` — wraps debug's own no-op), `:124-149` (`exports.inspectOpts` from env reads), `:194` (`process.stderr.write` — documented API call). All own-object writes or plain core API calls.

## C-012 — send SendStream prototype and Stream inheritance — REJECTED

- Sites: `node_modules/send/index.js:155` (`util.inherits(SendStream, Stream)`), `:165-768` (`SendStream.prototype.error/hasTrailingSlash/isConditionalGET/isPreconditionFailure/removeContentHeaderFields/notModified/headersAlreadySent/isCachable/onStatError/isFresh/isRangeFresh/redirect/pipe/send/sendFile/sendIndex/stream/type/setHeader`).
- All methods are defined on send's own constructor prototype; `Stream.prototype` is untouched (`util.inherits` only sets `SendStream.super_` and `SendStream.prototype`'s [[Prototype]]; reproduction confirmed `Stream.prototype.pipe` identity unchanged). Methods named `pipe`/`setHeader` shadow stream/response method names only on SendStream instances — a supported extension pattern, explicitly not a patch per the skill.
- Also verified here: send never assigns to any property of `res` other than `statusCode` (C-013) and never assigns to the fs ReadStream it creates (`:680` `fs.createReadStream`, `:682` `stream.pipe(res)`, `:686` `stream.destroy()`, `:693/:702` listener adds) — calls only.

## C-013 — send res.statusCode assignments — REJECTED

- Sites: `node_modules/send/index.js:184` (error), `:273` (304), `:386` (301), `:564` (206).
- `statusCode` is the documented settable response property; core defines the default as a prototype data property (`lib/internal/http/server.js:285` `ServerResponse.prototype.statusCode = 200`) precisely so instances shadow it by assignment. Core-sanctioned use.

## C-014 — serve-static res writes — REJECTED

- Sites: `$PACKAGE_ROOT/index.js:78-81` (405 path: `res.statusCode`, `setHeader`, `end`), `:200-206` (301 redirect: same APIs).
- Same reasoning as C-013; all documented OutgoingMessage APIs (`lib/internal/http/outgoing.js:813,1289`).

## C-015 — etag fs.Stats instanceof — REJECTED

- Sites: `node_modules/etag/index.js:22` (`Stats = require('fs').Stats`), `:106` (`obj instanceof Stats`), `:29` (`Object.prototype.toString` saved reference, read-only). Read-only use of a core class for type detection; no write.

## C-016 — inherits re-export — REJECTED

- Sites: `node_modules/inherits/inherits.js:1-9` — re-exports `util.inherits` under Node (feature-tested). No mutation; the browser fallback (`inherits_browser.js`) is unreachable under Node.

## C-017 — mime-types load-time map build — REJECTED

- Sites: `node_modules/mime-types/index.js:36-42` (`exports.extensions`/`exports.types` = `Object.create(null)`, `populateMaps` at load), `:154-184` (fills its own maps from mime-db; pushes to its own `_extensionConflicts`), `node_modules/mime-types/mimeScore.js` (pure scoring), `node_modules/mime-db/index.js:12` (`module.exports = require('./db.json')`). Own-exports initialization only; relevant to "mime load-time behavior" question — no global/core effect.

## C-018 — statuses load-time maps — REJECTED

- Sites: `node_modules/statuses/index.js:25-56` (message/code/codes/redirect/empty/retry maps on its own export). Own-object initialization.

## C-019 — Error.captureStackTrace calls — REJECTED

- Sites: `node_modules/http-errors/index.js:89,136,205`; `node_modules/depd/index.js:390`. Documented V8 API invocation (writes a `stack` property on the passed library-created object); does not modify the `Error` global. The depd call site's surrounding swap is covered by C-001.

## C-020 — on-finished wrap(): AsyncResource bind — REJECTED

- Sites: `node_modules/on-finished/index.js:220-235` (`new asyncHooks.AsyncResource(...)`, `res.runInAsyncScope.bind(res, fn, null)`), `:23/:206-212` (guarded `require('async_hooks')`), `:31-34` (`setImmediate` vs `process.nextTick` defer selection — reads globals only). Binds its own callback to an AsyncResource via public API; no core mutation.

## C-021 — ee-first listener management — REJECTED

- Sites: `node_modules/ee-first/index.js:43` (`ee.on(event, fn)`), `:62` (`ee.removeListener(...)`), `:70` (`thunk.cancel` on its own thunk). Public EventEmitter API on passed-in emitters (res and its socket); adding/removing listeners is not patching.

## Unresolved

None.
