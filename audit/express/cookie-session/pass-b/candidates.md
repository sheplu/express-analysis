# Candidate ledger: cookie-session 2.1.1 (pass-b)

Target: `$PACKAGE_ROOT` = cookie-session @ 75f53bb8f9118067955b344fb4ba550ed0e39318 (v2.1.1).
Node.js baseline: `$NODEJS_SOURCE` @ d44625a4b80c672215b469906ce583ce7eeeebaf.
Every candidate site surfaced by the searches in searches.md is accounted for below.
Statuses: confirmed (-> finding ID in report.md), rejected (with reason), negative (pattern produced no hits). No unresolved candidates remain.

## cookie-session (direct, `$PACKAGE_ROOT/index.js`)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001a | index.js:114 `onHeaders(res, setHeaders)` | Activates on-headers' replacement of `res.writeHead` on the live ServerResponse, once per request, before `next()` | confirmed -> F-001 | See C-001b; this is the activation site. Listener later calls `cookies.set()` (Set-Cookie writes) from inside the wrapped writeHead |
| C-003 | index.js:70-75 `Object.defineProperty(req, 'session', {...})` | Adds accessor property `session` (configurable: true, enumerable: true, get `getSession`/set `setSession`) on the live `http.IncomingMessage` | rejected as patch | `session` is not a core key: zero hits in `$NODEJS_SOURCE/lib/internal/http/incoming.js`. Library-owned metadata on a core-backed instance; no core property shadowed or replaced. Enumerability noted: the key is visible to `Object.keys(req)` and spreads (repro confirmed descriptor: enumerable true, configurable true, get+set) |
| C-004 | index.js:67 `req.sessionOptions = Object.create(opts)` | Adds own data property `sessionOptions` on the live IncomingMessage | rejected as patch | Library-owned key; not a core property (same incoming.js check). Request metadata per skill |
| C-005a | index.js:148 `Object.defineProperty(this, '_ctx', ...)` | Non-enumerable `_ctx` on a new `Session` instance | rejected as patch | Session is a library-owned constructor |
| C-005b | index.js:202,215,228 `Object.defineProperty(Session.prototype, 'isChanged'/'isNew'/'isPopulated', ...)` | Getters on library prototype | rejected as patch | `Session.prototype` is library-owned; not a core prototype |
| C-005c | index.js:15 `require('safe-buffer').Buffer` + Buffer.from calls (254, 268) | None (reads) | rejected as patch | Uses safe-buffer's re-exported core Buffer; calls only. See C-011 |

## on-headers@1.1.0 (direct dependency)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001b | on-headers/index.js:71 `res.writeHead = createWriteHead(res.writeHead, listener)` | Assigns own data property `writeHead` on the live ServerResponse instance, shadowing `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`). Wrapper (index.js:30-52) re-implements argument handling: sets `this.statusCode` (line 129), applies header args through `setHeader`/`appendHeader`/`removeHeader` (lines 82-180), fires listener once, propagates listener-changed status code, then calls the saved original with trimmed args | confirmed -> F-001 | Core-backed instance override, unconditional on every middleware-handled request. Prototype itself untouched (repro: prototype identity unchanged, own property appears only after middleware). Never restored for the response's lifetime |
| C-010 | on-headers/index.js:19 `typeof http.ServerResponse.prototype.appendHeader === 'function'` | None (read) | rejected as patch | Module-load feature detection; selects between `set1dArrayWithAppend` and `set1dArrayWithSet`. No write to the prototype |
| C-010b | on-headers/index.js:108,129,153,160,167,177 `res.setHeader/appendHeader/removeHeader`, `this.statusCode = statusCode` | Response header map / status code state | rejected as patch | Documented OutgoingMessage/ServerResponse API calls on the instance's own state (part of F-001's wrapper behavior, not separate patches) |

## cookies@0.9.1 (direct dependency)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-006 | cookies/index.js:147-148 `var setHeader = res.set ? http.OutgoingMessage.prototype.setHeader : res.setHeader; setHeader.call(res, 'Set-Cookie', headers)` | Set-Cookie header state on the response | rejected as patch | READ of the core prototype method plus a `.call` — no assignment to the prototype or instance method slot. Notable: when `res.set` exists (Express-like res), it deliberately bypasses any instance-level `setHeader` override by invoking the raw core prototype function (supporting context in report) |
| C-007 | cookies/index.js:116 `res.getHeader("Set-Cookie")` then pushCookie + setHeader | Replaces the Set-Cookie header value array via the documented header API | rejected as patch | Supported `OutgoingMessage.prototype.setHeader/getHeader` contract (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813,914`); mutates header data, not core code or method slots. No `res._headers`/symbol poking, no reassignment of res members |
| C-008a | cookies/index.js:194-202 `Cookie.prototype.path/expires/.../overwrite = ...` | Defaults on library prototype | rejected as patch | `Cookie` is library-owned |
| C-008b | cookies/index.js:226-231 `Object.defineProperty(Cookie.prototype, 'maxage', ...)` | Accessor alias on library prototype | rejected as patch | Library-owned prototype |
| C-008c | cookies/index.js:232 `deprecate.property(Cookie.prototype, 'maxage', ...)` | depd redefines `maxage` descriptor with logging get/set (depd/index.js:485) | rejected as patch | Target object is library-owned `Cookie.prototype`; depd mutates only the caller-supplied owner object |
| C-009 | cookies/index.js:278-286 `Cookies.connect = Cookies.express = ...` sets `req.cookies = res.cookies = new Cookies(...)` | Would add own properties to live req/res | rejected as patch | Dead code for this target: cookie-session never calls `Cookies.connect`/`Cookies.express` (only `new Cookies(req, res, {keys})`, `.get`, `.set`); would be instance metadata regardless |
| C-009b | cookies/index.js:60-80 constructor | Writes `this.secure/request/response/keys` on the Cookies instance only | rejected as patch | Stores references to req/res; does not modify them |
| C-009c | cookies/index.js:10 `require('depd')('cookies')` | Triggers depd `getStack()` at module load | confirmed (chain) -> F-002 | Activation site for C-002 |
| C-009d | cookies/index.js:120,260-264 reads `req.protocol`, `req.socket.encrypted`/`req.connection.encrypted` | None (reads) | rejected as patch | Private/deprecated-alias core reads (`connection` is a deprecated alias of `socket`); no write |

## depd@2.0.0 (transitive: cookies -> depd)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-002 | depd/index.js:386-387 (writes), 395-396 (restore) in `getStack()` | Global `Error.prepareStackTrace` = depd's `prepareObjectStackTrace`; `Error.stackTraceLimit` = `Math.max(10, limit)`; both restored to saved originals before return | confirmed -> F-002 | Reachable, unconditional write to a shared global at cookie-session require time (index.js:17 -> cookies:10 -> depd():108 -> getStack()); re-runs on deprecation logging. Transient: fully synchronous window, restoration verified by repro (`prepareStackTraceUnchanged:true`) |
| C-014 | depd/index.js:23 `var basePath = process.cwd()` | None (read) | rejected as patch | Require-time READ only; depd 2.0.0 performs no require-time global write |
| C-015 | depd/index.js:413-433 `wrapfunction` (`new Function(...)`) | Creates and returns a new wrapper function | rejected as patch | Applied only to caller-supplied functions; within this scope never applied to a core function; cookies does not call `deprecate.function` |
| C-016 | depd/index.js:49-65 `convertDataDescriptorToAccessor` + 485 `Object.defineProperty(obj, prop, descriptor)` in `wrapproperty` | Redefines property descriptor on caller-supplied object | rejected as patch | Only invocation in scope: `Cookie.prototype.maxage` (library-owned, C-008c) |
| C-017 | depd/index.js:186,251 `eehaslisteners(process, 'deprecation')`, `process.emit('deprecation', err)` | Emits custom event on the `process` emitter | rejected as patch | Documented EventEmitter API call; fires only on deprecated usage with listeners attached; no core state replaced |
| C-017b | depd/index.js:256-260 `process.stderr.isTTY` read, `process.stderr.write(...)` | Writes bytes to stderr | rejected as patch | I/O via documented stream API; not a mutation of core objects |
| C-018 | depd/index.js:492-538 `DeprecationError` defineProperty on new Error | Customizes own Error instance (`constructor`, `message`, `name`, `namespace`, `stack` accessor) | rejected as patch | depd-created instance; core `Error.prototype` untouched |

## debug@3.2.7 (direct dependency; Node entry src/index.js -> src/node.js + src/common.js)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-012 | debug/src/common.js:244 `createDebug.enable(createDebug.load())` -> common.js:159 `createDebug.save(namespaces)` -> node.js:118-126 `process.env.DEBUG = namespaces` / `delete process.env.DEBUG` | `process.env` entry `DEBUG` | rejected as patch | Documented mutable env API used as intended. At require time it rewrites the identical value (DEBUG set) or deletes an absent key (DEBUG unset) — repro: `debugEnvUnchanged:true`. Not an override of core behavior |
| C-013a | debug/src/node.js:43-65 `exports.inspectOpts = Object.keys(process.env).filter(...)...` | debug's own exports | rejected as patch | Reads env; writes own module object |
| C-013b | debug/src/node.js:146-153 `init(debug)` sets `debug.inspectOpts` | debug instance object | rejected as patch | Library-owned function object |
| C-013c | debug/src/node.js:161-176 `formatters.o/.O` assignment; node.js:24,32 `exports.colors` | debug's own exports/formatters | rejected as patch | Own module state |
| C-013d | debug/src/node.js:26-34 `require('supports-color')` in try/catch | None here | rejected as patch | supports-color not installed in this tree; require throws, swallowed. Reads `supportsColor.level` only if present |
| C-013e | debug/src/node.js:71 `tty.isatty(process.stderr.fd)`, 108 `process.stderr.write(...)` | stderr I/O | rejected as patch | Documented API calls |
| C-013f | debug/src/common.js:8-54 setup() writes `createDebug.*` | debug's own function object | rejected as patch | Own state |
| C-013g | debug/src/browser.js (whole file) | localStorage etc. | rejected as patch | Unreachable under Node: src/index.js:7-11 selects node.js unless Electron-renderer/nwjs |

## safe-buffer@5.2.1 (direct dependency)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-011a | safe-buffer/index.js:12-13 `module.exports = buffer` | Nothing — re-exports the core `buffer` module object unmodified | rejected as patch | Active branch on all modern Node (`Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` exist: `$NODEJS_SOURCE/lib/buffer.js:351,454,473,496`). Repro: `require('safe-buffer') === require('buffer')` -> true; `Buffer.from` identity unchanged |
| C-011b | safe-buffer/index.js:16-17 `copyProps(buffer, exports); exports.Buffer = SafeBuffer` | safe-buffer's own exports | rejected as patch | Legacy branch (pre-Buffer.from Node only, unreachable here); copies FROM core onto own exports — direction matters: core module object never written |
| C-011c | safe-buffer/index.js:24 `SafeBuffer.prototype = Object.create(Buffer.prototype)` | SafeBuffer's own prototype slot | rejected as patch | Creates a NEW object inheriting from `Buffer.prototype`; does not mutate `Buffer.prototype` |
| C-011d | safe-buffer/index.js:27 `copyProps(Buffer, SafeBuffer)` | SafeBuffer function object | rejected as patch | Copies statics FROM core Buffer onto SafeBuffer |

## keygrip@1.1.0, tsscmp@1.0.6, ms@2.1.3 (transitive)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-019a | keygrip/index.js:30-44 `this.sign/verify/index = ...`; 47 `Keygrip.sign = ...` throw stubs | Own instance / own constructor | rejected as patch | crypto.createHmac calls only; no core object touched |
| C-019b | tsscmp/lib/index.js:18,31-33 `crypto.timingSafeEqual` feature check, `crypto.pseudoRandomBytes/createHmac` | None (reads/calls) | rejected as patch | Feature detection is a read; double-HMAC compare implemented in library code without replacing `crypto.timingSafeEqual` |
| C-019c | ms/index.js (162 lines) | Pure parse/format functions, module.exports assignment | rejected as patch | No core references at all |

## Scope-wide negative patterns

| ID | Pattern set | Status | Result |
| --- | --- | --- | --- |
| C-020a | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | negative | 0 hits across index.js + all 8 deps |
| C-020b | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | negative | 0 hits across index.js + all 8 deps |
| C-020c | `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive) | negative (as patch leads) | Only depd's own "Wrap property in a deprecation message" doc comments (depd/index.js:436,469,477; depd/lib/browser/index.js:57) — all traced to C-016 |
| C-020d | npm lifecycle hooks (preinstall/install/postinstall) in target + all dep package.json files | negative | None present |
| C-020e | Hidden/dot files under node_modules deps | negative | Only `tsscmp/.travis.yml` (CI config, inert) |
