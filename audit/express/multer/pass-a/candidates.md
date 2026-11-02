# Candidate ledger — multer 2.5.0 patch audit (pass A)

Scope: `$PACKAGE_ROOT` runtime files + resolved runtime dependencies (append-field@1.0.0, busboy@1.6.0, streamsearch@1.1.0, type-is@1.6.18, media-typer@0.3.0, mime-types@2.1.35, mime-db@1.52.0).
Every candidate produced by the searches in `searches.md` is accounted for below.
Status values: confirmed (→ finding), rejected (not a Node.js patch), unresolved.

**Result: 0 confirmed, 29 rejected, 0 unresolved.**

## Multer direct (target package)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001 | `lib/make-middleware.js:136` | `req.body = Object.create(null)` — property write on the live `http.IncomingMessage` instance | rejected | Additive application-data property (Express ecosystem convention). `IncomingMessage` defines no `body` API (`$NODEJS_SOURCE/lib/_http_incoming.js` greps negative), so nothing core is shadowed or replaced. Instance-scoped, per-request. |
| C-002 | `lib/file-appender.js:13` (`req.files = []`), `:14` (`req.files = Object.create(null)`), `:27-33` (push into `req.files`), `:57` (`this.req.file = file`) | `req.files`/`req.file` writes on the request instance | rejected | Same classification as C-001: additive app data, no core API named `file`/`files` on IncomingMessage. |
| C-003 | `lib/make-middleware.js:76-79` | Reassigns local `next` to a wrapper calling `resource.runInAsyncScope(originalNext, null, err)` | rejected | Wraps the caller-supplied Express callback in a local variable; uses documented `async_hooks.AsyncResource` API. No core object touched. |
| C-004 | `lib/make-middleware.js:66` (`req.pipe(busboy)`), `:160` & `:231` (`req.unpipe(busboy)`), `:169` (`req.resume()`) | Stream plumbing on the core-backed request | rejected | All are method *calls* of documented `Readable.prototype` methods (verified at `$NODEJS_SOURCE/lib/internal/streams/readable.js:978` pipe, `:1180` unpipe, `:1327` resume). No reassignment of any of these methods anywhere in scope (search B in `searches.md` negative). |
| C-005 | `lib/make-middleware.js:39-43` | `drainStream(req)`: adds a `'readable'` listener and loops `stream.read()` | rejected | Additive listener + documented read calls; no mutation. |
| C-006 | `lib/make-middleware.js:159-166` | `busboy.removeAllListeners()`; `busboy.on('error', noop)` after teardown | rejected | Listener-set mutation on the library-owned busboy `Writable` subclass instance, not on a core object or shared prototype. |
| C-007 | `lib/make-middleware.js:384-388` | `Object.defineProperty(file, 'stream', {...})` | rejected | Target `file` is a library-created plain object; defines a non-enumerable library property. |
| C-008 | `lib/counter.js:8` | `Counter.prototype = Object.create(EventEmitter.prototype)` | rejected | Ordinary prototypal inheritance: replaces the library constructor's own prototype; `events.EventEmitter.prototype` itself is never written (repro confirms `emit`/`on`/`removeAllListeners` identity unchanged). |
| C-009 | `lib/multer-error.js:44` | `util.inherits(MulterError, Error)` | rejected | `util.inherits` sets the prototype of library-owned `MulterError.prototype` to `Error.prototype` and adds `super_` to the library constructor. `Error.prototype` untouched (repro: `Error.prototype` key set unchanged). |
| C-010 | `storage/disk.js:53` (`fs.mkdirSync`), `:73` (`fs.createWriteStream`), `:107` (`fs.open`), `:113` (`fs.fsync`), `:114` (`fs.close`), `:137`,`:139` (`fs.unlink`) | Filesystem operations | rejected | Pure *calls* of documented `fs` APIs (presence verified: `$NODEJS_SOURCE/lib/fs.js:741,1647,1740,2418,3971`). Search A found no assignment to any `fs.*` property. |
| C-011 | `storage/disk.js:76-77` (`openStreams.set(file, outStream)`, `outStream.once('close', ...)`), `:142-160` (`outStream.once('close'/'error')`, reads `outStream.closed`, `outStream.destroy()`), `:97` (reads `outStream.bytesWritten`) | Interaction with a core `fs.WriteStream` instance | rejected | Listener additions, a documented `destroy()` call, and reads of documented properties (`closed`, `bytesWritten`). The WeakMaps are keyed by the library's `file` object; no property is written onto the core stream instance. |
| C-012 | `storage/disk.js:84` | `pipeline(file.stream, outStream, cb)` | rejected | Call of documented `stream.pipeline`; no mutation. |
| C-013 | `storage/memory.js:12-16` | `file.stream.on('data'/'end', ...)` | rejected | Additive listeners on busboy's library-owned `FileStream`; `Buffer.concat` is a call. |
| C-014 | `storage/memory.js:27` (`delete file.buffer`), `storage/disk.js:128-130` (`delete file.destination/filename/path`), `lib/file-appender.js:49,61` (`delete this.req.files[...]`, `delete placeholder.fieldname`) | Property deletions | rejected | All targets are library-created objects (`file`, `placeholder`, the `req.files` container multer itself created in C-002). No core object property deleted. |
| C-015 | `index.js:108,167,179,190,199,209`; `storage/*.js`; `lib/file-appender.js:19,40,55`; `lib/counter.js:10-22` | Definitions on the library's own constructor prototypes; `Object.assign(placeholder, file)` at `lib/file-appender.js:62` | rejected | Library-owned prototypes and plain objects only. |
| C-016 | `lib/make-middleware.js:2,75` | `require('async_hooks').AsyncResource`; `new AsyncResource('multer')` | rejected | Documented public API instantiation/call; no hook registration that alters core behavior (AsyncResource only propagates context). |
| C-029 | `lib/make-middleware.js:177-179` (`req.once('end'/'error'/'close')`), `:237-248` (`req.on('error'/'aborted'/'close')`) | Listener additions on the core-backed request | rejected | Additive, documented EventEmitter usage; observation only, no replacement of core behavior. |

## busboy@1.6.0 (multer → busboy)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-017 | `node_modules/busboy/lib/types/multipart.js:221` (`class Multipart extends Writable`), `:565` (`_write`), `:572` (`_destroy`), `:585` (`_final`), `:558` (`this.write(BUF_CRLF)`) | Subclass of `stream.Writable` implementing the underscore hooks | rejected | Exactly the documented subclass contract: `$NODEJS_SOURCE/lib/internal/streams/writable.js:837-841` shows the default `_write` throws `ERR_METHOD_NOT_IMPLEMENTED` (subclasses must supply it); `:410-419` accepts write/destroy/final as supported overrides. Methods are defined on busboy's own class prototype, never on `Writable.prototype`. |
| C-018 | `node_modules/busboy/lib/types/multipart.js:174-201` | `class FileStream extends Readable`; implements `_read` (`:194`); sets `this.truncated` (`:177`), `this._readcb` (`:178`) on its own instances | rejected | Documented `_read` override point (`$NODEJS_SOURCE/lib/internal/streams/readable.js:699` "You can override either this method, or the async _read(n)"); `truncated`/`_readcb` are library-defined instance properties on the subclass instance, not core stream internals. |
| C-019 | `node_modules/busboy/lib/types/multipart.js:482-486` | Backpressure: `this._fileStream._readcb = this._writecb; this._writecb = null` — defers the `_write` callback | rejected | Writes library-defined properties on its own instances. Holding the `_write(chunk, enc, cb)` callback until drain is the documented Writable mechanism, not an override of core behavior. |
| C-020 | `node_modules/busboy/lib/types/multipart.js:63,73,112` and `node_modules/busboy/lib/utils.js:434,442,450,458` (also `urlencoded.js:88,96,124,...`) | Calls `chunk.latin1Slice(...)`, `utf8Slice`, `ucs2Slice`, `base64Slice` | rejected | *Calls* of undocumented core `Buffer.prototype` methods that Node itself installs (`$NODEJS_SOURCE/lib/internal/buffer.js:1071-1076`). Private API usage (read/call), zero mutation; repro confirms `Buffer.prototype` key set and `latin1Slice`/`utf8Slice` identities unchanged. Logged as supporting context; upstream mscdex/busboy#319 (closed) corroborates this is a usage concern, not a patch. |
| C-021 | `node_modules/busboy/lib/types/urlencoded.js:7` (`class URLEncoded extends Writable`), `:56` (`_write`), `:220` (`_final`) | Writable subclass | rejected | Same as C-017. Additionally not reachable from multer (multer only constructs busboy for `multipart/*` content types), inspected anyway. |
| C-022 | `node_modules/busboy/lib/types/multipart.js:479-480` | `this._fileStream.emit('limit')`; `this._fileStream.truncated = true` | rejected | Custom event and library-defined property on its own `FileStream` subclass instance. |
| C-027 | `node_modules/busboy/lib/index.js` (whole file) | Factory returning `new type(instanceCfg)` | rejected | Pure construction/dispatch; no core interaction beyond requiring the type modules. |
| C-028 | `node_modules/busboy/lib/utils.js:467` | `new TextDecoder(this)` in `decoders.other` | rejected | Call of the global TextDecoder constructor (no mutation). (Side note, non-core: `other` is an arrow function so `bind(charset)` at `utils.js:416` cannot rebind `this` — a latent busboy bug, irrelevant to patching.) |

## streamsearch@1.1.0 (multer → busboy → streamsearch)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-023 | `node_modules/streamsearch/lib/sbmh.js` (whole file; notably `:34` `Buffer.allocUnsafe`, `:100` `Buffer.from`, `:191-192` `lookbehind.copy`/`lookbehind.set`, `:241` `data.copy(lookbehind, ...)`) | Boyer-Moore-Horspool matcher state | rejected | Plain exported class, no stream subclassing, no prototype access. Buffer methods are called; content writes land only in its own `_lookbehind` buffer. Incoming `data` chunks are read or copied *from*, never written to. |

## append-field@1.0.0 (multer → append-field)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-024 | `node_modules/append-field/lib/set-value.js:12-23` (setLastValue writes `context[step.key]`), `:37-59` (intermediate container writes); `node_modules/append-field/lib/parse-path.js:37-44` (bracket keys can be `__proto__`/`constructor`) | Computed-key writes into the store passed by the caller — prototype-pollution-adjacent | rejected | In multer's usage the root store is `req.body = Object.create(null)` (`lib/make-middleware.js:136`) and every intermediate object append-field creates is `Object.create(null)` (`set-value.js:39,49,57`), so a `__proto__` key becomes an ordinary own property; array steps use numeric keys only (`parse-path.js:28-35`, `parseInt`). No reachable write to `Object.prototype` or any shared/core prototype. Reproduction sent `__proto__[polluted]` and `a[__proto__][x]` fields: `Object.prototype` unchanged, `req.body` stayed null-prototype. Does not write `__proto__` as a mutation vector anywhere in its own code (no literal `__proto__`/`setPrototypeOf` in the package — P3 search negative). |

## type-is@1.6.18 / media-typer@0.3.0 / mime-types@2.1.35 / mime-db@1.52.0

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-025 | `node_modules/mime-types/index.js:31-40` | Populates its own `exports.extensions`/`exports.types` (null-prototype maps) from mime-db; `require('path').extname` used read-only | rejected | Writes only to its own module exports; `path` never assigned to. |
| C-026 | `node_modules/type-is/index.js` (reads `req.headers` at `:93-94,140`); `node_modules/media-typer/index.js:202-212` (`getcontenttype` calls `obj.getHeader(...)` / reads `obj.headers`) | Request inspection | rejected | Read-only access to documented request surface; no write to any request/response/core object. `mime-db` exports static JSON (`node_modules/mime-db/index.js:12`). |

## Unresolved

None.
