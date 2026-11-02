# Candidate ledger: express-session 1.19.0 (pass-b)

Target: `$PACKAGE_ROOT` = express-session @ 8947e169ae838b22cc1af198e50e370e6fc09f96 (v1.19.0).
Core baseline: `$NODEJS_SOURCE` @ d44625a4b80c672215b469906ce583ce7eeeebaf.
Every candidate site surfaced by the searches in searches.md is listed, including rejected ones.
Status values: confirmed (-> finding ID in report.md), rejected (not a Node.js patch), unresolved (none).

## Target package: index.js

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001 | index.js:269 (`res.end = function end(chunk, encoding)`) | Own property `end` on the live `http.ServerResponse`; shadows `OutgoingMessage.prototype.end` ($NODEJS_SOURCE/lib/internal/http/outgoing.js:1289). Original saved at index.js:266 (`_end`), delegated at 281/286/344/378. Per request; never restored; prototype untouched (repro-verified). | confirmed -> F-001 | reachable write on a core-backed instance; replaces core method behavior for that response |
| C-002 | index.js:266-267 (`var _end = res.end; var _write = res.write`) | Reads/captures only. `res.write` is invoked via `_write.call` (314, 320) but never reassigned. | rejected | no write to `res.write`; capture is part of F-001's delegation |
| C-003 | index.js:235 (`onHeaders(res, function(){...})`) | Delegates to on-headers, which writes `res.writeHead` (see C-030). Listener appends `Set-Cookie` via `res.setHeader` (index.js:711-721) — documented API. | confirmed -> F-002 (via dependency) | activation site of the transitive instance override |
| C-004 | index.js:294-295 (`if (!res._header) res._implicitHeader()`) | Nothing — reads private core state `_header` ($NODEJS_SOURCE/lib/internal/http/outgoing.js:188) and calls private core method `_implicitHeader` ($NODEJS_SOURCE/lib/internal/http/server.js:419). | rejected | private API read/invoke; no mutation; supporting context |
| C-005 | index.js:159 (`req.sessionID =`), 160 (`req.session =`), 232 (`req.sessionID =`) | New own properties on the live `http.IncomingMessage`. | rejected | request metadata; no `IncomingMessage` prototype member named `session`/`sessionID` exists (negative grep of $NODEJS_SOURCE/lib/_http_incoming.js); skill: adding request metadata is not a patch |
| C-006 | index.js:229 (`req.sessionStore = store`) | New own property on req. | rejected | same as C-005 |
| C-007 | index.js:158 (`store.generate = function(req){...}`) | Method added to the application/library-owned store object (MemoryStore or user-provided Store subclass). | rejected | library-owned object, not a core object |
| C-008 | index.js:428-440 (`Object.defineProperty(sess, 'reload'/'save', ...)` in `wrapmethods`) | Own-property shadowing of `Session.prototype.reload/save` on the library's own Session instance; originals saved (414-415) and delegated. | rejected | Session is library-owned; no core involvement |
| C-009 | index.js:65-67 (`defer` = setImmediate / process.nextTick fallback) | Nothing — reads globals/`process` API. | rejected | plain use of documented APIs |
| C-010 | index.js:651-667 (`hash()` via `crypto.createHash('sha1')`), 712 (`signature.sign`) | Nothing — crypto consumption. | rejected | documented API use |
| C-011 | index.js:717-720 (`res.getHeader('Set-Cookie')` / `res.setHeader('Set-Cookie', header)`) | Response header state via documented API. | rejected | documented header API; no method replacement |

## Target package: session/*.js

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-012 | session/store.js:40 (`util.inherits(Store, EventEmitter)`), session/memory.js:49 (`util.inherits(MemoryStore, Store)`) | Sets up prototype chain of library constructors onto `events.EventEmitter` ($NODEJS_SOURCE/lib/events.js:212) via documented `util.inherits` ($NODEJS_SOURCE/lib/util.js:344). `EventEmitter.prototype` itself is not modified. Documented in README ("compliant session store ... must be an EventEmitter"). | rejected | ordinary documented inheritance, explicitly not a patch per skill |
| C-013 | session/store.js:100 (`req.session = new Session(req, sess)` in `createSession`) | Own property on req (live IncomingMessage when called from middleware; plain object literal when called from `Store.prototype.load`, store.js:72). | rejected | same as C-005 |
| C-014 | session/session.js:25-26, 47-143 (`Object.defineProperty(this, 'req'/'id')`, `defineMethod(Session.prototype, ...)`) | Properties/methods on library-owned Session instances and Session.prototype. | rejected | library-owned prototype |
| C-015 | session/session.js:110 (`delete this.req.session`) | Removes the library's own property from req. | rejected | deletes a library-added own property; core object shape otherwise untouched |
| C-016 | session/cookie.js:51 (`Cookie.prototype = {...}`) | Replaces the prototype of the library's own Cookie constructor. | rejected | library-owned prototype |
| C-017 | session/memory.js:58-157 (`MemoryStore.prototype.* =`), 42/82 (`this.sessions = Object.create(null)`) | Library-owned prototype/instance state. | rejected | library-owned |

## Dependencies

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-030 | on-headers@1.1.0 index.js:71 (`res.writeHead = createWriteHead(res.writeHead, listener)`) | Own property `writeHead` on the live ServerResponse; shadows `ServerResponse.prototype.writeHead` ($NODEJS_SOURCE/lib/internal/http/server.js:423-424). Previous value saved in closure (`prevWriteHead`), delegated (index.js:50). Wrapper re-implements argument-header application via setHeader/appendHeader/removeHeader (119-180). Per request via C-003; never restored. | confirmed -> F-002 | reachable core-backed instance override applied by express-session on every handled request |
| C-031 | on-headers@1.1.0 index.js:19 (`typeof http.ServerResponse.prototype.appendHeader`) | Nothing — load-time feature detection read. | rejected | read-only |
| C-032 | depd@2.0.0 index.js:386-387 / 395-396 (`getStack()`: `Error.prepareStackTrace = prepareObjectStackTrace`, `Error.stackTraceLimit = Math.max(10, limit)`, then restore) | Global `Error` constructor properties — the V8 stack-trace hook honored by Node ($NODEJS_SOURCE/lib/internal/errors.js:145-150). Saved and synchronously restored. Activated at `require('express-session')` (index.js:20, session/cookie.js:15 -> depd():108) and on every deprecation log (log():199). | confirmed -> F-003 | real reachable write to a shared global core API, transient with verified restoration |
| C-033 | depd@2.0.0 index.js:413-433 (`wrapfunction`, `new Function` wrapper), 439-486 (`wrapproperty` + `convertDataDescriptorToAccessor` `Object.defineProperty(obj, prop, ...)`) | Would redefine properties/functions on arbitrary caller-supplied objects. | rejected | not activated: express-session never calls `deprecate.function`/`deprecate.property` (negative grep over index.js + session/) |
| C-034 | depd@2.0.0 index.js:492-538 (`DeprecationError`: defineProperty `constructor`/`message`/`name`/`namespace`/`stack` incl. stack getter/setter) | Own descriptors on an `Error` instance depd itself constructs. | rejected | instance it owns; customizing your own Error object is not a core patch |
| C-035 | depd@2.0.0 index.js:251 (`process.emit('deprecation', err)`), 260 (`process.stderr.write`), 154/170 (`process.noDeprecation`/`traceDeprecation` reads) | Emits events / writes output via documented APIs. | rejected | documented API use |
| C-036 | debug@2.6.9 src/debug.js:139 (`exports.save(namespaces)`) + src/node.js:139-147 (`save`: `process.env.DEBUG = namespaces` / `delete process.env.DEBUG`), triggered at load by src/node.js:248 (`exports.enable(load())`) | `process.env.DEBUG` — writes back the value just read (or deletes an absent key). | rejected | `process.env` is a documented mutable API; value-preserving write; no core behavior replaced |
| C-037 | debug@2.6.9 src/node.js:61-69 + 167-226 (DEBUG_FD path: `process.binding('tty_wrap')` read at 169; `new fs.SyncWriteStream` at 187; `stream.readable = false`, `stream.read = null`, `stream._type`, `stream._isStdio`, `stream._handle.unref()` on the stream it creates) | Only streams debug itself constructs; plus a private-binding read and use of a deprecated internal fs class. Explicitly labeled "Copied from `node/src/node.js`" (line 161). | rejected | env-gated (`DEBUG_FD` set to neither 1 nor 2) — not activated by express-session; mutations are on self-created instances; copied core code does not replace core |
| C-038 | debug@2.6.9 src/inspector-log.js:10-15 (`console._stdout = nullStream; console.log(...); console._stdout = stdout`) | Would transiently swap the private `_stdout` of the global console. | rejected | unreachable dead file: not required by debug's entry chain (src/index.js -> node.js/browser.js -> debug.js; negative grep) |
| C-039 | debug@2.6.9 src/browser.js (exports.storage, localStorage use, Function.prototype.apply.call read at 123); depd@2.0.0 lib/browser/index.js | Browser-only state; no Node core objects. | rejected | conditional browser/Electron-renderer entrypoints (`process.type === 'renderer'`, package.json `browser` field); not the Node runtime path |
| C-040 | debug@2.6.9 src/node.js:85-100 (`exports.formatters.o/O =`), src/debug.js:9-29 (exports wiring) | debug's own module exports. | rejected | library-owned module object |
| C-041 | safe-buffer@5.2.1 index.js:12-18 (`module.exports = buffer` or `copyProps(buffer, exports); exports.Buffer = SafeBuffer`), 24-27 (`SafeBuffer.prototype = Object.create(Buffer.prototype)`, `copyProps(Buffer, SafeBuffer)`) | Modern branch (taken on baseline/repro runtimes: `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` all present): re-exports the core `buffer` module object unmodified. Legacy branch: copies properties onto safe-buffer's own `exports` and own `SafeBuffer` constructor. Core `buffer` module and `Buffer.prototype` are never written. | rejected | no mutation of core in either branch; `Object.create(Buffer.prototype)` reads the prototype, it does not modify it |
| C-042 | parseurl@1.3.3 index.js:54 (`req._parsedUrl =`), 84 (`req._parsedOriginalUrl =`), 52/82 (`parsed._raw =`), 128-139 (`new Url()` + property fills) | New own caching properties on req; fills a `url.Url` instance it creates (legacy public class, read via `url.Url`). | rejected | metadata caching on the instance; `_parsedUrl` is an ecosystem convention, not a core member (negative grep in $NODEJS_SOURCE/lib/_http_incoming.js); `url.parse`/`Url` consumed, not replaced |
| C-043 | uid-safe@2.1.5 index.js:50 (`global.Promise` read); random-bytes@1.0.0 index.js:47 (same), 21 (`crypto.randomBytes === crypto.pseudoRandomBytes` identity read), 75-99 (`crypto.randomBytes` with retry + `setTimeout`) | Nothing — reads and documented API calls. | rejected | read-only global checks; normal crypto/timer use |
| C-044 | cookie@0.7.2 index.js:23-24 (`Object.prototype.toString`/`hasOwnProperty` aliases), 15-16 (own exports) | Nothing beyond its own exports — pure string parse/serialize; zero `require` of core modules. | rejected | reads only |
| C-045 | cookie-signature@1.0.7 index.js (crypto.createHmac/createHash use; own exports) | Nothing beyond its own exports. | rejected | documented crypto use |
| C-046 | ms@2.0.0 index.js | Pure computation; no core modules at all. | rejected | no candidate writes |

## Unresolved

None. Every candidate surfaced by the searches was traced to the exact object written and classified.
