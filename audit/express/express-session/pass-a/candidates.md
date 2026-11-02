# Candidate ledger: express-session pass A

Target: `$PACKAGE_ROOT` = expressjs/session @ 8947e169ae838b22cc1af198e50e370e6fc09f96 (v1.19.0 + unreleased).
Every candidate site surfaced by the searches in `searches.md`, with the exact write/modification,
owning object, and disposition. Statuses: confirmed (-> finding ID in report.md), rejected, unresolved.
There are no unresolved candidates.

## Confirmed

### C-001 -> F-001: `res.end` instance override (direct)
- Site: `$PACKAGE_ROOT/index.js:269` (`res.end = function end(chunk, encoding) {...}`); saved originals `index.js:266` (`var _end = res.end`), `index.js:267` (`var _write = res.write`); wrapper body `index.js:269-379`.
- Writes: own data property `end` on the live `http.ServerResponse` instance, shadowing `OutgoingMessage.prototype.end` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289`).
- Classification detail: saved original (`_end`, `_write` in closure), delegation (`_end.call(res, ...)` at `index.js:281,286,344,378`; `_write.call(res, ...)` at `index.js:314,320`), activation = every middleware-handled request (after guards at `index.js:188-217`), no restoration (per-response instance lifetime), shared prototype untouched (repro-verified).
- Behavior deltas vs core: async deferral of real end until store destroy/save/touch completes; duplicate-end suppression returning `false` (`index.js:270-272`); return value is write()'s boolean/true instead of `this`; `end(chunk, encoding, callback)` callback dropped in wrapped paths; forced `_implicitHeader()` + last-byte split write (`index.js:294-320`).
- Status: confirmed -> F-001.

### C-002 -> F-002: `res.writeHead` instance override via on-headers (transitive)
- Site: activation `$PACKAGE_ROOT/index.js:235` (`onHeaders(res, listener)`); write `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`); wrapper `node_modules/on-headers/index.js:30-51`.
- Writes: own data property `writeHead` on the live `http.ServerResponse` instance, shadowing `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423-424`).
- Classification detail: saved original (`prevWriteHead` closure), delegation (`prevWriteHead.apply(this, args)` at `on-headers/index.js:50`), one-shot listener (`fired` flag), activation = every middleware-handled request, no restoration, prototype untouched (repro-verified). Wrapper pre-applies status/headers via `this.statusCode`/`setHeader`/`appendHeader` (`on-headers/index.js:112-139`) before delegating with trimmed args; listener is express-session's Set-Cookie writer (`index.js:235-263`, `setcookie` at `index.js:711-721`).
- Status: confirmed -> F-002.

### C-003 -> F-003: transient `Error.prepareStackTrace` / `Error.stackTraceLimit` global writes via depd (transitive)
- Site: activation `$PACKAGE_ROOT/index.js:20`, `$PACKAGE_ROOT/session/cookie.js:15` (`require('depd')('express-session')` -> `depd()` -> `getStack()`); log-time `deprecate()` calls at `index.js:122,127,147,614,627`, `session/cookie.js:89` (-> `log()` -> `getStack()`). Writes `$PACKAGE_ROOT/node_modules/depd/index.js:386` (`Error.prepareStackTrace = prepareObjectStackTrace`), `:387` (`Error.stackTraceLimit = Math.max(10, limit)`); restores `:395-396`.
- Writes: properties on the global `Error` constructor (realm-wide), restored synchronously in the same frame after `Error.captureStackTrace(obj)` (`:390`).
- Classification detail: saved originals (`prep`, `limit`), full synchronous restoration, unconditional activation at require time (observed 4 writes: set/restore x 2 depd() calls), repeat activation per deprecation log.
- Status: confirmed -> F-003 (shared global mutation, transient/restored).

## Rejected

### C-004: saved references `_end`/`_write`
- Site: `$PACKAGE_ROOT/index.js:266-267`. Reads of instance-resolved methods, no write. Part of F-001 mechanism. Rejected.

### C-005: `res._header` read and `res._implicitHeader()` call
- Site: `$PACKAGE_ROOT/index.js:294-296`. Private core API read/invocation only (baselines `$NODEJS_SOURCE/lib/internal/http/outgoing.js:188,1003`; `lib/internal/http/server.js:419`). No property written. Rejected; kept as supporting context.

### C-006: `req.sessionID` / `req.session` / `req.sessionStore` assignments
- Sites: `$PACKAGE_ROOT/index.js:159-160` (inside `store.generate`), `:229`, `:232`; `$PACKAGE_ROOT/session/store.js:100` (`req.session = new Session(req, sess)`).
- Writes: own enumerable data properties added to the `http.IncomingMessage` instance. Core defines none of these names (`rg -n "session" $NODEJS_SOURCE/lib/internal/http/incoming.js` -> no matches), so nothing is shadowed or overridden; repro confirms `IncomingMessage.prototype` unchanged. Library-owned request metadata per the skill's extension rule. Rejected.

### C-007: `store.generate = function(req){...}`
- Site: `$PACKAGE_ROOT/index.js:158-173`. Write of a library-API property onto the store object (user-supplied or MemoryStore; prototype chain includes `EventEmitter.prototype`, which has no `generate`). Library-owned member on a library/user object; also `store.on(...)` registrations at `index.js:179-184` are supported EventEmitter API. Rejected.

### C-008: `Object.defineProperty(sess, 'reload'|'save', ...)` (wrapmethods)
- Site: `$PACKAGE_ROOT/index.js:428-440` (plus rewrap at `:402-410`). Defines non-enumerable methods on the library-owned `Session` instance, shadowing the library's own `Session.prototype` methods. No core object involved. Rejected.

### C-009: `Session` constructor/prototype defineProperty
- Sites: `$PACKAGE_ROOT/session/session.js:25-26` (per-instance `req`/`id`), `:47,58,71,88,109,123` via `defineMethod` (`:136-143`). All on library-owned objects. Rejected.

### C-010: `util.inherits` from EventEmitter
- Sites: `$PACKAGE_ROOT/session/store.js:40` (`util.inherits(Store, EventEmitter)`), `$PACKAGE_ROOT/session/memory.js:49`. Documented inheritance: mutates only `Store`/`MemoryStore` constructors and their prototypes' [[Prototype]]; `EventEmitter.prototype` itself is not written. Rejected.

### C-011: MemoryStore prototype methods and session map
- Site: `$PACKAGE_ROOT/session/memory.js:40-187`. `MemoryStore.prototype.*` definitions and `this.sessions` (null-prototype object) are entirely library-owned; `defer` (`:25-27`) only reads `setImmediate`/`process.nextTick`. Rejected.

### C-012: `Cookie.prototype = {...}`
- Site: `$PACKAGE_ROOT/session/cookie.js:51-152`. Replaces the library's own constructor prototype. Rejected.

### C-013: `delete this.req.session`
- Site: `$PACKAGE_ROOT/session/session.js:110`. Deletes the library-added `session` property from the request instance (restores core shape). Not a core member deletion. Rejected.

### C-014: parseurl request cache properties
- Site: `$PACKAGE_ROOT/node_modules/parseurl/index.js:54` (`req._parsedUrl = parsed`), `:84` (`req._parsedOriginalUrl = parsed`); activated from `index.js:202` (`parseUrl.original(req)`). Adds cache metadata to the core-backed instance; no such member exists in `$NODEJS_SOURCE/lib/internal/http/incoming.js` (negative grep). No core function replaced; `url.parse`/`Url` are only read (`parseurl/index.js:15-17`). Rejected.

### C-015: debug@2.6.9 require-time `process.env.DEBUG` write-back
- Site: `$PACKAGE_ROOT/node_modules/debug/src/node.js:248` (`exports.enable(load())` at module load) -> `node_modules/debug/src/debug.js:138-139` (`enable` -> `exports.save`) -> `node_modules/debug/src/node.js:139-147` (`delete process.env.DEBUG` when unset, else `process.env.DEBUG = namespaces`).
- Activated unconditionally when express-session is required (`index.js:19`). Mutates process environment data (round-trips the current value; delete when unset is a no-op), not a core API/function/prototype. Rejected as patch; noted in supporting context.

### C-016: debug `process.binding('tty_wrap')`
- Site: `$PACKAGE_ROOT/node_modules/debug/src/node.js:169` inside `createWritableStdioStream`, reached only when `DEBUG_FD` is set to an fd other than 1/2 (`:61-69`); also uses `fs.SyncWriteStream` (`:186-188`). Read-only private binding/API access, conditional, not activated by express-session. Rejected.

### C-017: safe-buffer@5.2.1
- Site: `$PACKAGE_ROOT/node_modules/safe-buffer/index.js:12-18`. Modern branch: `module.exports = buffer` (re-export of the core module object, unmodified). Legacy branch: `copyProps(buffer, exports)` copies INTO its own exports; `copyProps(Buffer, SafeBuffer)` copies core statics onto the library function; `SafeBuffer.prototype = Object.create(Buffer.prototype)` writes only the library constructor. express-session reads `.Buffer` (`index.js:16`). No core write. Rejected.

### C-018: on-headers require-time feature detection
- Site: `$PACKAGE_ROOT/node_modules/on-headers/index.js:19` (`typeof http.ServerResponse.prototype.appendHeader === 'function'`). Read-only against `$NODEJS_SOURCE/lib/internal/http/outgoing.js:877`. Rejected.

### C-019: depd `wrapfunction` / `wrapproperty`
- Site: `$PACKAGE_ROOT/node_modules/depd/index.js` (`deprecate.function`, `deprecate.property`; `convertDataDescriptorToAccessor`; `Function` constructor codegen). Capable of wrapping arbitrary functions/properties, but express-session never invokes them: `rg -n "deprecate\.(function|property)" $PACKAGE_ROOT/index.js $PACKAGE_ROOT/session/` -> no matches; only `deprecate(message)` log calls exist. Dormant capability. Rejected.

### C-020: cookie@0.7.2 builtin references
- Site: `$PACKAGE_ROOT/node_modules/cookie/index.js:23-24` (`var __toString = Object.prototype.toString`, `__hasOwnProperty = Object.prototype.hasOwnProperty`). Read-only captures; module is pure parse/serialize. Rejected.

### C-021: uid-safe@2.1.5 / random-bytes@1.0.0
- Sites: `$PACKAGE_ROOT/node_modules/uid-safe/index.js` (uses `random-bytes`, reads `global.Promise`), `$PACKAGE_ROOT/node_modules/random-bytes/index.js` (reads `crypto.randomBytes`/`crypto.pseudoRandomBytes` identities, calls `crypto.randomBytes`). No writes to core objects. Rejected.

### C-022: cookie-signature@1.0.7
- Site: `$PACKAGE_ROOT/node_modules/cookie-signature/index.js`. Pure `crypto.createHmac`/`createHash` use; exports `sign`/`unsign` only. Rejected.

### C-023: ms@2.0.0
- Site: `$PACKAGE_ROOT/node_modules/ms/index.js` (via debug). Pure conversion; grep for require/prototype/defineProperty/global/process returned nothing. Rejected.

### C-024: `setcookie` header write
- Site: `$PACKAGE_ROOT/index.js:711-721` (`res.getHeader`/`res.setHeader('Set-Cookie', ...)`). Supported public `OutgoingMessage` API; data write to response headers, not an API override. Rejected.

### C-025: on-headers `setWriteHeadHeaders` status/header application
- Site: `$PACKAGE_ROOT/node_modules/on-headers/index.js:112-139` (`this.statusCode = statusCode`, `setHeader`/`appendHeader`/`removeHeader` calls). Public-API data writes performed inside the F-002 wrapper's delegation path; counted as part of F-002's behavior, not a separate patch site. Folded into F-002.

## Unresolved

None.
