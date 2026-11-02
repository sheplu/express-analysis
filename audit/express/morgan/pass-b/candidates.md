# Candidate ledger — morgan 1.12.1 patch audit (pass-b)

Every candidate site surfaced by the skill's pattern set (P1-P6, see `searches.md`)
plus full-file reads of all runtime sources. Paths are `$PACKAGE_ROOT`-relative
(dependencies under `node_modules/`) and `$NODEJS_SOURCE`-relative for core.
Statuses: confirmed (-> finding ID), rejected (with reason), unresolved (none).

## Morgan direct (index.js)

| ID | Site | What it writes/modifies | Status | Reason / evidence |
| --- | --- | --- | --- | --- |
| C-001 | index.js:134-136 | `req._startAt = undefined`, `req._startTime = undefined`, `req._remoteAddress = getip(req)` — own properties on live core `http.IncomingMessage` | rejected | Additive metadata on an instance; keys do not exist in core: `rg "_startAt|_startTime|_remoteAddress|__onFinished"` over `$NODEJS_SOURCE/lib/http.js`, `lib/_http_*.js` (7 files), `lib/internal/http/*.js` (6 files), `lib/internal/http.js` = 0 hits. No core member shadowed; skill: adding request metadata does not establish a patch. Per-request activation; keys persist on the instance (GC'd with it). |
| C-002 | index.js:139-140 + 574-577 (`recordStartTime`, called on req at :143 and on res via onHeaders listener) | `res._startAt`, `res._startTime` (and `this._startAt = process.hrtime()`, `this._startTime = new Date()`) on live core `ServerResponse`/`IncomingMessage` | rejected | Same as C-001 — zero collisions in Node http sources at d44625a4b80. Reproduction confirms they become own properties only. |
| C-003 | index.js:171 `onHeaders(res, recordStartTime)` | Activates on-headers' per-instance `writeHead` replacement (see C-025) | confirmed -> F-001 | Default (non-immediate) mode runs this for every request. Skipped when `opts.immediate` is truthy (index.js:166-168). |
| C-019a | index.js:458 `new Function('tokens, req, res', js)` in `compile()` | Creates a new library-owned format function from a string | rejected | Code generation only; no loader hook, no core function replaced. Also depd analog at C-019b. |
| C-020 | index.js:117 `opts.stream \|\| process.stdout`; index.js:469-491 `createBufferStream(stream, interval)` | Holds a reference to `process.stdout`; buffer option returns a NEW `{ write }` object wrapping it | rejected | `process.stdout` is written to via its public `write` API, never mutated/replaced; the "swap" at index.js:129 reassigns a local variable only. |
| C-024 | index.js:501-504 (`format()`: `morgan[name] = fmt`), index.js:588-596 (`token()`: `morgan[name] = wrapper`), index.js:198 `deprecate.property(morgan, 'default', ...)` | Properties on morgan's own `module.exports` function object | rejected | Library-owned object; `deprecate.property` redefines `morgan.default` via `Object.defineProperty` (depd index.js:485) on the morgan export, not on any core object. |
| C-026 | index.js:550 `Boolean(res._header)` in `headersSent()` | Read of private core field `res._header` | rejected | Read-only fallback, only reached when `res.headersSent` is not boolean (Node 0.8); at baseline `headersSent` exists, so dead. Supporting context, not a write. |
| C-027 | index.js:535 `req.connection && req.connection.remoteAddress` | Read of deprecated `connection` alias accessor | rejected | Read-only; `connection` is a core-provided accessor alias. |

## on-headers@1.1.0 (activated by morgan index.js:171)

| ID | Site | What it writes/modifies | Status | Reason / evidence |
| --- | --- | --- | --- | --- |
| C-025 (merged into C-003) | node_modules/on-headers/index.js:71 `res.writeHead = createWriteHead(res.writeHead, listener)` | Own data property `writeHead` on each live `ServerResponse`, shadowing `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`) | confirmed -> F-001 | Core-backed instance override. Wrapper (index.js:30-52) pre-processes status/headers via `setWriteHeadHeaders` (:119-146), fires listener once, delegates to saved core function. Never restored for the instance lifetime; prototype untouched (reproduction: `prototypeWriteHeadUnchanged: true`). |
| C-021 | node_modules/on-headers/index.js:19-20 | Reads `http.ServerResponse.prototype.appendHeader` at require time to pick `set1dArrayWithAppend` vs `set1dArrayWithSet` | rejected | Read-only feature detection; `appendHeader` exists at baseline (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:877`), so the append strategy is active (part of F-001 behavior). |
| C-022 | node_modules/on-headers/index.js:129 (`this.statusCode = statusCode`), :104-110 (`setHeader`), :148-180 (`setHeader`/`removeHeader`/`appendHeader`) | Writes `statusCode` own property and header state on the live response via public APIs | merged into F-001 | These are the wrapper's replacement semantics for core writeHead argument processing (core baseline: server.js:424+ incl. `this.statusCode = statusCode` at :446). Counted as F-001 behavior, not separate patches. |

## on-finished@2.4.2 (activated by morgan index.js:174 `onFinished(res, logRequest)`)

| ID | Site | What it writes/modifies | Status | Reason / evidence |
| --- | --- | --- | --- | --- |
| C-004 | node_modules/on-finished/index.js:147 `attached = msg.__onFinished = createListener(msg)` (cleared at :164) | Own property `__onFinished` on the live `ServerResponse` | rejected | Library-owned bookkeeping key; zero hits in Node http sources; self-clearing after fire. Metadata, not an override. |
| C-005 | node_modules/on-finished/index.js:189-199 `patchAssignSocket`: `res.assignSocket = function _assignSocket (socket) {...}` | Would shadow `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE/lib/internal/http/server.js:312-321`) on the instance | rejected — unreachable at audited baseline | Guard chain: attachFinishedListener early-returns when `msg.socket` is truthy (:119-123) — true in morgan's flow because the connection listener calls `res.assignSocket(socket)` (server.js:1410 / :1275) before user middleware runs. Even for an unattached response, `OutgoingMessage` initializes `this[kSocket] = null` (outgoing.js:187) behind the prototype `socket` accessor (outgoing.js:304-316), so `msg.socket === undefined` (:128) is false (`null !== undefined`). Branch targets Node 0.8 (comment :181, istanbul ignore :188), where `socket` was left undefined and the `'socket'` event was unreliable. Reproduction: `patchAssignSocketApplied: false`. Note: morgan only ever passes the response to on-finished; the IncomingMessage path never reaches this code either (same guard). |
| C-006 | node_modules/on-finished/index.js:220-235 `wrap()` + :206-212 `tryRequireAsyncHooks` | Creates `AsyncResource` and binds listener | rejected | Documented `async_hooks` API usage; creates new objects, mutates nothing core. |
| C-028 | node_modules/on-finished/index.js:32-34 `defer` | Chooses `setImmediate` or `process.nextTick` wrapper | rejected | Reads/calls core schedulers; no assignment to them. |

## ee-first@1.1.1 (via on-finished index.js:106,116)

| ID | Site | What it writes/modifies | Status | Reason / evidence |
| --- | --- | --- | --- | --- |
| C-007 | node_modules/ee-first/index.js:43 `ee.on(event, fn)`, :62 `ee.removeListener(...)`, :70 `thunk.cancel = cleanup` | Adds/removes listeners for `end`/`finish` on the response and (socket branch) `error`/`close` on the socket | rejected | Additive, documented EventEmitter API with symmetric cleanup; `thunk` is a new library object. In morgan's flow only `[[res, 'end', 'finish']]` is registered (socket listener set requires the pre-assignment path, see C-005). No core state replaced. |

## depd@2.0.0 (activated at morgan require time, index.js:29 and :198)

| ID | Site | What it writes/modifies | Status | Reason / evidence |
| --- | --- | --- | --- | --- |
| C-008 | node_modules/depd/index.js:386-387 (`Error.prepareStackTrace = prepareObjectStackTrace`; `Error.stackTraceLimit = Math.max(10, limit)`), restore :395-396 | Global `Error` constructor properties (V8 stack-trace API) | confirmed -> F-002 | Reachable unconditionally: morgan require -> `depd('morgan')` -> `getStack()` (depd :108); again via `deprecate.property` (:455) at load, and `log()` (:199) per deprecation. Saved and synchronously restored; no user code runs in the window. Reproduction: both restored after require. Classified as a transient shared-global write. |
| C-009 | node_modules/depd/index.js:439-486 `wrapproperty` + :49-65 `convertDataDescriptorToAccessor` (`Object.defineProperty(obj, prop, descriptor)` at :62/:485) | Redefines `morgan.default` as deprecating accessor pair | rejected | Target object is morgan's own export (index.js:198); never called on a core object in this scope. |
| C-010 | node_modules/depd/index.js:492-538 `DeprecationError` (`Object.defineProperty(error, ...)` x5) | Properties on a freshly created Error instance | rejected | depd-owned instance; the global Error prototype is untouched. |
| C-011 | node_modules/depd/index.js:251 `process.emit('deprecation', err)`; :260 `process.stderr.write(...)` | Emits event / writes to stderr | rejected | Public API calls on `process`; no assignment. Only reached when a deprecation actually fires. |
| C-019b | node_modules/depd/index.js:425-430 `new Function('fn','log','deprecate','message','site', ...)` in `wrapfunction` | Generates a deprecation wrapper function | rejected | morgan never calls `deprecate.function`; even when used, it returns a new function for the caller to assign — no core write here. |

## debug@2.6.9 (+ ms@2.0.0) (activated at morgan require time, index.js:28)

| ID | Site | What it writes/modifies | Status | Reason / evidence |
| --- | --- | --- | --- | --- |
| C-012 | node_modules/debug/src/node.js:248 `exports.enable(load())` -> src/debug.js:139 `exports.save(namespaces)` -> src/node.js:139-147 `delete process.env.DEBUG` / `process.env.DEBUG = namespaces` | Writes/deletes the `DEBUG` key on `process.env` (core-backed global) at require time | rejected | Value-preserving round-trip: `save(load())` writes back the exact current value (or deletes an absent key). Environment/config state, not an API or behavior override; nothing core-executed changes. Reproduction: `DEBUG` value identical across `require('morgan')`. morgan never calls `debug.enable/disable` afterwards. |
| C-013 | node_modules/debug/src/node.js:169 `process.binding('tty_wrap')` (+ `.guessHandleType(fd)` :173) | Reads a legacy internal binding | rejected | Read-only private API; reached only when `DEBUG_FD` env var is set to something other than 1/2 (:61-69). Creates new streams; mutates nothing. |
| C-014 | node_modules/debug/src/node.js:186-188 `new fs.SyncWriteStream(fd, { autoClose: false })`; also :176/:206 `stream._type`, :204-205 `stream.readable/read`, :221-223 `stream.fd/_isStdio` | Instantiates removed private core class; sets properties on the NEW stream it creates | rejected | Same env-gated branch as C-013. `fs.SyncWriteStream` is not exported at baseline (`rg -c SyncWriteStream lib/fs.js` = 0; only `lib/internal/fs/sync_write_stream.js`), so this branch would throw; regardless all writes land on the newly created object. |
| C-015 | node_modules/debug/src/node.js:85-100 `exports.formatters.o/.O`; src/debug.js:9-29 exports wiring, :20-21 `exports.names/skips`, :117-124 properties on each `debug` instance | debug's own module exports and created functions | rejected | Library-owned objects only. |
| C-018 | node_modules/ms/index.js (entire file) | Pure parse/format helpers, module-local constants | rejected | No core interaction of any kind (full read). |
| C-029 | node_modules/debug/src/node.js:64 `util.deprecate(function(){}, '...')()` | Invokes a deprecated-wrapped noop (emits process warning) | rejected | Env-gated (`DEBUG_FD` not 1/2); emission only, no mutation. |

## basic-auth@2.0.1 (+ safe-buffer@5.1.2) (activated per `:remote-user` token, morgan index.js:348)

| ID | Site | What it writes/modifies | Status | Reason / evidence |
| --- | --- | --- | --- | --- |
| C-017 | node_modules/basic-auth/index.js (entire file) | Reads `req.headers.authorization`, base64-decodes, returns new `Credentials` | rejected | Pure read/parse (full read); no writes to req or any core object. |
| C-016 | node_modules/safe-buffer/index.js:11-17 (`module.exports = buffer` modern branch; legacy `copyProps(buffer, exports)` + `exports.Buffer = SafeBuffer`), :24 `copyProps(Buffer, SafeBuffer)`, :26-62 statics on `SafeBuffer` | Re-exports or copies from the core `buffer` module | rejected | Modern branch (taken on every Buffer.from-capable Node, incl. baseline) re-exports the core module object without touching it. `copyProps` copies FROM core TO library-owned objects (`exports`, `SafeBuffer`); the core `buffer` module and `Buffer` class are never written. |

## Negative results (whole-scope)

- P5 (module loading interception): `require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks` — zero hits across all 15 runtime files.
- No `__proto__`, `setPrototypeOf`, `Reflect.set/defineProperty/setPrototypeOf`, `Object.assign` hits on core objects; no `extends`/`inherits()` of core classes anywhere in scope.
- No `internalBinding`, no `'internal/'` or `'_http_'` string requires (debug's `process.binding` is the sole binding reference, C-013).
- No install/postinstall scripts in morgan or any dependency package.json.

Unresolved candidates: none.
