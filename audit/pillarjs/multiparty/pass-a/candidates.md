# Pass A candidate ledger: multiparty@4.3.1

Paths relative to `$PACKAGE_ROOT` (multiparty @ `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d`).
Node baseline: `$NODEJS_SOURCE` @ `d44625a4b80c672215b469906ce583ce7eeeebaf`.

Status key: **confirmed** (demonstrated core patch), **rejected** (traced, not a patch), **unresolved** (could not be settled). Final tally: 1 confirmed, 30 rejected, 0 unresolved.

## multiparty itself (index.js)

| ID | Site and core target | Status | Reason / evidence |
| --- | --- | --- | --- |
| C-001 | `index.js:51` — `util.inherits(Form, stream.Writable)` | rejected | Supported subclassing. Core `util.inherits` ($NODEJS_SOURCE/lib/util.js:344-363) writes only `ctor.super_` and sets `Form.prototype`'s [[Prototype]]; `stream.Writable` and its prototype are only read, never written. |
| C-002 | `index.js:55` — `stream.Writable.call(self, { emitClose: false })` | rejected | Documented constructor option, honored at $NODEJS_SOURCE/lib/internal/streams/writable.js:193,324. Configures the library's own instance; no core mutation. |
| C-003 | `index.js:240` — `Form.prototype._write = function(...)` | rejected | Documented Writable subclass extension point ($NODEJS_SOURCE/lib/internal/streams/writable.js:23,410). Defined on multiparty's own prototype, not on core's. |
| C-004 | `index.js:167-168` — `req._readableState`, `state.encoding`, `state.decoder`, `req._decoder` | rejected | Private/internal API **reads** only (guard against an encoding-set request); zero writes to `req` anywhere in index.js (interactions limited to `on/once/removeListener/pipe/resume`). Core state lives at $NODEJS_SOURCE/lib/internal/streams/readable.js:333-334,363. Supporting context, not a patch. |
| C-005 | `index.js:551-559` — `destStream.headers/.name/.filename/.byteOffset/.byteCount = ...` on a `stream.PassThrough` | rejected | Additive metadata properties on a **library-created** PassThrough instance handed to the application as the "part" object. Runtime check: none of these names exists anywhere on the PassThrough prototype chain (Node v24.19.0) — nothing core is shadowed or replaced. |
| C-006 | `index.js:570,578` — `util.inherits(LimitStream, stream.Transform)`; `LimitStream.prototype._transform = ...` | rejected | Same as C-001/C-003: documented Transform subclassing with `_transform` extension point; mutates only library-owned objects. |
| C-007 | `index.js:157` — `self.handleError = handleError` | rejected | Instance property write on multiparty's own `Form` instance (a Writable subclass instance the library constructed); `handleError` is not a core member name. Library-owned state. |
| C-008 | `index.js:188` — `CONTENT_TYPE_BOUNDARY_RE.lastIndex = ...` | rejected | Mutation of a library-owned RegExp object, not core. |
| C-009 | `index.js:18` — `var Buffer = require('safe-buffer').Buffer` | rejected | Local binding shadowing the `Buffer` identifier inside the module only; the global `Buffer` is untouched. Resolves to the real core `Buffer` (see C-010). Used only via documented statics (`alloc`, `isBuffer`, `byteLength`: index.js:579-580,833,836). |
| C-010 | `index.js:111,236,521,598,643` — `process.nextTick(...)` | rejected | Documented core API calls; no assignment to `process`. |

## safe-buffer@5.2.1

| ID | Site and core target | Status | Reason / evidence |
| --- | --- | --- | --- |
| C-011 | `node_modules/safe-buffer/index.js:12-18` — branch on `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` | rejected | On every Node in multiparty's support window that has these statics (Node >= 4.5), the taken branch is line 13 `module.exports = buffer` — a pure re-export of the core buffer module object with **no write to it**. Reproduction: `require('safe-buffer') === require('buffer')` → true; `.Buffer === core Buffer` → true. The legacy `else` branch (lines 16-17) writes only to safe-buffer's own `exports`. |
| C-012 | `node_modules/safe-buffer/index.js:24,27` — `SafeBuffer.prototype = Object.create(Buffer.prototype)`; `copyProps(Buffer, SafeBuffer)` | rejected | Creates a **new** prototype object inheriting from `Buffer.prototype` (no write to it) and copies statics **from** core Buffer **onto** the library-owned `SafeBuffer` function. Direction of writes is core -> library. On the modern branch `SafeBuffer` is not even exported. |

## depd@2.0.0 (transitive via http-errors)

| ID | Site and core target | Status | Reason / evidence |
| --- | --- | --- | --- |
| C-013 | `node_modules/depd/index.js:386-387,395-396` (`getStack`) — writes `Error.prepareStackTrace` and `Error.stackTraceLimit` on the global `Error` constructor | **confirmed -> F-001** | Transient shared-global mutation with synchronous restore. Reachable unconditionally at module load: multiparty `index.js:11` -> http-errors `index.js:15` `require('depd')('http-errors')` -> depd `index.js:108` `getStack()`. Verified by reproduction (sentinel function survived require; depd's replacement was in effect during its capture). |
| C-014 | `node_modules/depd/index.js:413-433` (`wrapfunction`) — returns wrapped copy of a passed function | rejected | Creates and returns a new function; mutates nothing itself. Unreachable in this scope: http-errors never calls `deprecate.function`, multiparty never requires depd directly. |
| C-015 | `node_modules/depd/index.js:439-486` (`wrapproperty`) + `index.js:49-65` (`convertDataDescriptorToAccessor`) — `Object.defineProperty(obj, prop, ...)` on a caller-supplied object | rejected | Would be a patch **if** invoked with a core object, but it is unreachable in the inspected runtime scope: zero calls to `deprecate.property` in http-errors or multiparty (G3/G4 searches). |
| C-016 | `node_modules/depd/index.js:492-538` (`DeprecationError`) — five `Object.defineProperty(error, ...)` calls | rejected | All on a freshly constructed, library-owned `Error` instance; `Error.prototype` untouched. Also only reachable when a `process.on('deprecation')` listener exists and a deprecation fires (multiparty never triggers one: all its `createError` statuses are 400/413/415). |
| C-017 | `node_modules/depd/index.js:251` — `process.emit('deprecation', err)` | rejected | Documented EventEmitter usage emitting an additive custom event; replaces nothing. |
| C-018 | `node_modules/depd/index.js:260` — `process.stderr.write(...)` | rejected | Documented API call; no mutation. |
| C-019 | `node_modules/depd/index.js:23,154-175` — `process.cwd()`, `process.noDeprecation`, `process.env.*`, `process.traceDeprecation` | rejected | Read-only access to process state/flags. |

## http-errors@2.0.0

| ID | Site and core target | Status | Reason / evidence |
| --- | --- | --- | --- |
| C-020 | `node_modules/http-errors/index.js:15` — `require('depd')('http-errors')` at module top level | rejected as its own patch; activation chain for F-001 | The depd factory call is what executes `getStack()` (C-013) at require time. The line itself mutates nothing. |
| C-021 | `node_modules/http-errors/index.js:117,160,229` — `inherits(HttpError, Error)`, `inherits(ClientError/ServerError, HttpError)` | rejected | `inherits` resolves to core `util.inherits` (see C-027); writes land only on the library-owned constructors `HttpError`/`ClientError`/`ServerError`. `Error.prototype` is read, never written. |
| C-022 | `node_modules/http-errors/index.js:139,208` — `setPrototypeOf(err, ClientError.prototype / ServerError.prototype)` | rejected | Re-prototypes a **freshly created, library-owned** `Error` instance onto a library prototype (pre-class subclass emulation). No shared core object is modified; `Error.prototype` descriptor set unchanged (reproduction diff: NONE). |
| C-023 | `node_modules/http-errors/index.js:142-155,211-224` — `Object.defineProperty(err, 'message'/'name', ...)` | rejected | Own-instance definitions on the same freshly created error; does not touch `Error.prototype.message/name`. |
| C-024 | `node_modules/http-errors/index.js:163-165,232-234` — `ClientError.prototype.status/statusCode/expose = ...` | rejected | Writes to library-owned prototypes only. |
| C-025 | `node_modules/http-errors/index.js:244-251` (`nameFunc`) — `Object.defineProperty(func, 'name', desc)` | rejected | Renames the library's own generated constructors. |
| C-026 | `node_modules/http-errors/index.js:89,136,205` — `Error.captureStackTrace(err, ...)` | rejected | Documented V8/Node API **call**; captures onto the library's own instance, mutates no shared state. |

## inherits@2.0.4, setprototypeof@1.2.0

| ID | Site and core target | Status | Reason / evidence |
| --- | --- | --- | --- |
| C-027 | `node_modules/inherits/inherits.js:5` — `module.exports = util.inherits` | rejected | Read-only re-export of core `util.inherits` (reproduction: identity true). No mutation at load. |
| C-028 | `node_modules/inherits/inherits_browser.js:6-24` — prototype rewiring fallback | rejected | Reachable only via the `browser` package.json field (bundlers), never in Node runtime; even then it writes only the caller's `ctor`. |
| C-029 | `node_modules/setprototypeof/index.js:3-17` — `module.exports = Object.setPrototypeOf \|\| ...`; fallbacks write `obj.__proto__` / mixin props | rejected | Re-exports the standard built-in on any modern runtime (reproduction: identity true); nothing mutated at load. Fallbacks (ES5-era engines only) mutate the caller-supplied object — in this scope only fresh http-errors instances (C-022). |

## statuses@2.0.1, toidentifier@1.0.1, uid-safe@2.1.5, random-bytes@1.0.0

| ID | Site and core target | Status | Reason / evidence |
| --- | --- | --- | --- |
| C-030 | `node_modules/statuses/index.js`, `node_modules/toidentifier/index.js` | rejected | Pure data tables / string transforms; no core module touched beyond `require('./codes.json')`. |
| C-031 | `node_modules/uid-safe/index.js:50`, `node_modules/random-bytes/index.js:21,47,77,96` — `global.Promise` read, `crypto.randomBytes === crypto.pseudoRandomBytes` comparison, `crypto.randomBytes(...)` calls, `setTimeout` | rejected | All read-only feature detection and documented API calls; no assignment to `global`, `crypto`, or timers. |
