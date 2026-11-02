# Candidate ledger — connect-timeout 1.9.1 patch audit (pass A)

Target: `$PACKAGE_ROOT` = connect-timeout@1.9.1 (expressjs/timeout @ 7377defb5b7b5a9c3d50fabd42c4dd46ad175d13) with installed runtime deps.
Node baseline: `$NODEJS_SOURCE` @ d44625a4b80c672215b469906ce583ce7eeeebaf.
Every candidate from the searches in searches.md is accounted for below. Statuses: confirmed / rejected / historical. No unresolved candidates.

## Confirmed

### C-001 — on-headers: `res.writeHead` instance override -> F-001
- Site: `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`); wrapper built at lines 30-52.
- Activated by: `$PACKAGE_ROOT/index.js:66-68` (`onHeaders(res, ...)`) on every request through the middleware.
- Writes/modifies: own data property `writeHead` on the live `http.ServerResponse`, shadowing `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423-424`). Wrapper sets statusCode/headers via `setHeader`/`removeHeader`+`appendHeader` and fires listener before delegating to the saved original.
- Status: **confirmed** (instance/application override, transitive via on-headers@1.1.0). Dynamic proof in repro-output.txt.

### C-002 — depd: `Error.prepareStackTrace` / `Error.stackTraceLimit` transient global writes -> F-002
- Site: `$PACKAGE_ROOT/node_modules/depd/index.js:370-371` (set) and 379-380 (restore) inside `getStack()` (365-383).
- Activated by: require-time chain connect-timeout -> http-errors (index.js:15 `depd('http-errors')` -> depd/index.js:110; index.js:247 `deprecate.function` -> depd/index.js:404) and at any runtime deprecation log.
- Writes/modifies: global `Error.prepareStackTrace` (replaced with `prepareObjectStackTrace`) and `Error.stackTraceLimit` (set to max(10, current)); both restored synchronously; no try/finally.
- Status: **confirmed** (shared global mutation, transient, transitive via http-errors@1.6.3 -> depd@1.1.2). Repro observed 6 writes during require, fully restored.

### C-003 — depd compat: same globals in lazy `callSiteToString` init -> F-002 (same finding)
- Site: `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:30-31` (set, limit=2) and 39-40 (restore), lazy property defined at 21-42, triggered by `require('depd')` module init (`depd/index.js:11` reads the property).
- Status: **confirmed**, folded into F-002 (identical mutation, additional site).

## Rejected

### C-004 — on-finished `patchAssignSocket`: `res.assignSocket` instance override (node 0.8 only)
- Site: `$PACKAGE_ROOT/node_modules/on-finished/index.js:186-196`; guard at 126-129 (`if (msg.socket === undefined)` after `msg.on('socket', ...)`).
- Would write: own `assignSocket` property on the live ServerResponse wrapping core `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE/lib/internal/http/server.js:312`).
- Status: **rejected as current patch** — unreachable on the baseline: `OutgoingMessage` constructor sets `this[kSocket] = null` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`) and the `socket` prototype accessor returns that value (outgoing.js:304-310), so `msg.socket` is `null`, never `undefined`. Node-0.8-only legacy branch (code comment: "res.on('socket', callback) is broken in 0.8"). Repro: no own `assignSocket` after middleware ran. Would become a confirmed instance override only on node 0.8.

### C-005 — connect-timeout: `req.timedout`
- Site: `$PACKAGE_ROOT/index.js:48` (`= true` in timer) and `:60` (`= false` per request).
- Writes: new own boolean key on the live core `IncomingMessage`.
- Status: **rejected as patch** — new library-owned key; `timedout` does not exist on core IncomingMessage (grep of `$NODEJS_SOURCE/lib/internal/http/incoming.js` negative; repro: `'timedout' in IncomingMessage.prototype` is false). Request metadata per skill.

### C-006 — connect-timeout: `req.clearTimeout`
- Site: `$PACKAGE_ROOT/index.js:56-58`.
- Writes: new own method key on the live core `IncomingMessage` (closure over the timer id; calls global `clearTimeout`, does not modify it).
- Status: **rejected as patch** — new library-owned method; core IncomingMessage defines `setTimeout` (incoming.js:257) but no `clearTimeout`, so nothing is shadowed or overridden.

### C-007 — connect-timeout: `req.emit('timeout', delay)`
- Site: `$PACKAGE_ROOT/index.js:49`.
- Status: **rejected as patch** — core EventEmitter `emit` call; nothing mutated or replaced. Context: shares the `'timeout'` event name used by `IncomingMessage.prototype.setTimeout(msecs, callback)` listener registration (incoming.js:257-262), so user callbacks registered there would also fire; event-name collision, not a mutation. `emit` itself is never reassigned anywhere in scope (S7 negative for `.emit =`).

### C-008 — on-finished: `msg.__onFinished`
- Site: `$PACKAGE_ROOT/node_modules/on-finished/index.js:145` (set) and `:162` (cleared to null).
- Status: **rejected as patch** — new library-owned bookkeeping key on the live response; underscore-prefixed but library-owned (no such member in core http files).

### C-009 — on-finished/ee-first: listener attachment on res and socket
- Sites: on-finished/index.js:104, 114, 124 (`first([[msg,'end','finish']])`, `first([[socket,'error','close']])`, `msg.on('socket', ...)`), ee-first/index.js:43, 62 (`ee.on`, `ee.removeListener`).
- Status: **rejected as patch** — supported EventEmitter API usage; no core member written.

### C-010 — on-headers: feature detection read
- Site: `$PACKAGE_ROOT/node_modules/on-headers/index.js:19` (`typeof http.ServerResponse.prototype.appendHeader === 'function'`).
- Status: **rejected** — read-only.

### C-011 — setprototypeof entry
- Site: `$PACKAGE_ROOT/node_modules/setprototypeof/index.js:1-15`.
- Status: **rejected as patch** — exports `Object.setPrototypeOf` by reference (or `__proto__`-assignment/property-copy fallbacks that act on caller-passed objects); does not modify `Object`, `Object.setPrototypeOf`, or any prototype at load; only callers in scope are C-012.

### C-012 — http-errors: `setPrototypeOf(err, ClientError/ServerError.prototype)`
- Sites: `$PACKAGE_ROOT/node_modules/http-errors/index.js:143, 190`.
- Status: **rejected as patch** — prototype reassignment of Error instances the library itself just constructed (lines 137, 184), to library-owned prototypes. No shared/core object affected.

### C-013 — http-errors: `inherits(HttpError, Error)` etc.
- Sites: `$PACKAGE_ROOT/node_modules/http-errors/index.js:121, 164, 211`.
- Status: **rejected as patch** — ordinary `util.inherits` subclassing (nested inherits@2.0.3 re-exports `util.inherits`); `Error`/`Error.prototype` untouched.

### C-014 — http-errors: writes on ClientError/ServerError prototypes
- Sites: `$PACKAGE_ROOT/node_modules/http-errors/index.js:166-168, 213-215`; also `Object.defineProperty(err, 'message'|'name', ...)` at 146-159, 193-206 on own instances.
- Status: **rejected as patch** — library-owned prototypes/instances only.

### C-015 — depd: `eval` in `wrapfunction`
- Site: `$PACKAGE_ROOT/node_modules/depd/index.js:410`.
- Status: **rejected as patch** — generates an arity-preserving wrapper around the function passed in; the only call in scope wraps http-errors' own export `exports["I'mateapot"]` (http-errors/index.js:247-248). Wraps a library export, not core. `eval` use noted as supporting context.

### C-016 — depd: `wrapproperty` / `convertDataDescriptorToAccessor`
- Sites: `$PACKAGE_ROOT/node_modules/depd/index.js:423-470` and 51-67 (both call `Object.defineProperty(obj, prop, ...)`).
- Status: **rejected as patch** — mutates caller-provided objects; `deprecate.property` is never called anywhere in this dependency tree (grep negative outside depd itself), so no core object is ever passed.

### C-017 — depd: `defineProperty` on DeprecationError
- Site: `$PACKAGE_ROOT/node_modules/depd/index.js:480-519`.
- Status: **rejected** — descriptor writes on a freshly created library error object.

### C-018 — depd: process interaction
- Sites: `$PACKAGE_ROOT/node_modules/depd/index.js:25` (`process.cwd()` read), 137/142/154/159 (flag/env reads), 170 (`eventListenerCount(process, 'deprecation')` read), 235 (`process.emit('deprecation', err)`), 240-244 (`process.stderr.isTTY` read, `process.stderr.write`).
- Status: **rejected as patch** — reads and supported API calls (emitting a custom event on `process` adds no state and replaces nothing).

### C-019 — depd compat: `lazyProperty` defineProperty
- Site: `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:52-70` (and invocations at 21, 45).
- Status: **rejected** — defines lazy properties on depd's own `module.exports`. The `eventListenerCount` lazy value resolves to `EventEmitter.listenerCount` by reference (compat/index.js:46) — a read, not a write.

### C-020 — nested inherits@2.0.3
- Site: `$PACKAGE_ROOT/node_modules/http-errors/node_modules/inherits/inherits.js`.
- Status: **rejected** — re-exports `util.inherits`; `inherits_browser.js` fallback unreachable under Node (only on require('util') failure).

### C-021 — ms@2.0.0, statuses@1.5.0, ee-first@1.1.1
- Sites: `$PACKAGE_ROOT/node_modules/ms/index.js`, `$PACKAGE_ROOT/node_modules/statuses/index.js` (+codes.json), `$PACKAGE_ROOT/node_modules/ee-first/index.js`.
- Status: **rejected** — pure string/number parsing, static data tables on own exports, and listener bookkeeping respectively; no core references beyond EventEmitter method calls (ee-first). Full files read.

### C-022 — historical direct wraps in connect-timeout itself
- Sites (historical refs, not in 1.9.1): pre-2014 `index.js` assigned `res.writeHead` directly and wrapped `req.socket.destroy`.
- Status: **historical / rejected for current version** — removed by https://github.com/expressjs/timeout/commit/cb5c2ee5aa7700dfaf16945db8fe03c113d5c38d ("use on-headers instead of patching writeHead") and https://github.com/expressjs/timeout/commit/300ea5dcac8b67a6c7c3a3dd937f705dd8bb6c4b ("Use on-finished instead of override socket destroy"). Current index.js wraps/reassigns nothing on req or res directly (S7: only `timedout`/`clearTimeout` key additions); `destroy` and `emit` are not reassigned anywhere in scope.

## Category sweeps with no candidates
- Module loading interception (`require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`): zero hits in runtime scope.
- Native/internal access (`process.binding`, `process._linkedBinding`, `internalBinding`, `'_http_'`, `'internal/'` specifiers): zero hits.
- `globalThis`/bare `global` writes, `Buffer` usage: zero hits (S2: only `process` reads/emits listed above).
- Core source rewrites (on-disk patching of `$NODEJS_SOURCE` or shipped copies of core files): none; no core-copied code in scope.
