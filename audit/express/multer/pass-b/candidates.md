# Candidate ledger — multer 2.5.0 patch audit (pass B)

Every candidate site surfaced by the pattern set and file reads, with the exact
object/key written and disposition. Statuses: confirmed / rejected / unresolved.
All paths relative to `$PACKAGE_ROOT`; core baselines relative to `$NODEJS_SOURCE`
(commit d44625a4b80c672215b469906ce583ce7eeeebaf).

## multer (direct)

| ID | Site | What it writes / does | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001 | lib/make-middleware.js:77 | `next = function (err) { resource.runInAsyncScope(originalNext, null, err) }` | rejected | Reassigns the **local parameter binding** inside the middleware closure; wraps the caller-supplied `next` for async-context preservation. No property of any core (or any) object is written. `AsyncResource`/`runInAsyncScope` are public API calls ($NODEJS_SOURCE lib/async_hooks.js:180,220) |
| C-002 | lib/make-middleware.js:136 | `req.body = Object.create(null)` on the live `http.IncomingMessage` | rejected | Adds a new library-owned key on a core-backed instance. `IncomingMessage` defines no `body` member ($NODEJS_SOURCE lib/_http_incoming.js — verified), so no core property/method is shadowed or replaced. Request-metadata addition per skill is not a patch |
| C-003 | lib/file-appender.js:13-14 | `req.files = []` / `req.files = Object.create(null)` | rejected | Same as C-002; `files` is not a core key |
| C-004 | lib/file-appender.js:57 | `this.req.file = file` | rejected | Same as C-002; `file` is not a core key |
| C-005 | lib/make-middleware.js:384-388 | `Object.defineProperty(file, 'stream', { configurable, enumerable:false, value: fileStream })` | rejected | Target is multer's own plain `file` object, not a core object; stores a reference to busboy's FileStream, does not modify the stream |
| C-006 | lib/make-middleware.js:66 (`req.pipe(busboy)` via defaultStreamHandler), :160/:231 (`req.unpipe(busboy)`), :169 (`req.resume()`), :168 (`drainStream(req)` — adds 'readable' listener + `stream.read()` loop, :39-43), :342/:361/:371 (`fileStream.resume()`) | Invokes documented Readable methods on the request / file streams | rejected | Calls, not reassignments. Core baselines: `pipe` lib/internal/streams/readable.js:978, `unpipe` :1180, `resume` :1327, `push` :411. T-02 confirmed no assignment to any of these names anywhere in scope |
| C-007 | lib/make-middleware.js:162,165 | `busboy.removeAllListeners()`; `busboy.on('error', function () {})` after teardown | rejected | Documented EventEmitter API calls on the library-owned busboy Writable instance; no `_events` direct access anywhere in scope (search T-02) |
| C-008 | lib/counter.js:8 | `Counter.prototype = Object.create(EventEmitter.prototype)` | rejected | Ordinary prototypal inheritance: writes Counter's **own** `prototype` property. `EventEmitter.prototype` itself is only read (as the proto of a new object), never mutated |
| C-009 | lib/multer-error.js:44 | `util.inherits(MulterError, Error)` | rejected | Documented util API; sets `MulterError.super_` and the [[Prototype]] of `MulterError.prototype`. `Error.prototype` is untouched |
| C-010 | storage/disk.js:54 (`fs.mkdirSync`), :71 (`fs.createWriteStream`), :73-75 (`file.path = finalPath`; WeakMap bookkeeping; `outStream.once('close', ...)`), :87 (`pipeline(file.stream, outStream, cb)`), :107-117 (`fs.open`/`fs.fsync`/`fs.close`), :100 (reads `outStream.bytesWritten`) | Uses fs/stream APIs around a core fs.WriteStream | rejected | All documented calls; the only writes are to multer's `file` object and module-local WeakMaps. `bytesWritten` is read-only use of a core-set instance field ($NODEJS_SOURCE lib/internal/fs/streams.js:415) |
| C-011 | storage/disk.js:125-160 | `_removeFile`: `delete file.destination/filename/path`; reads `outStream.closed`; `outStream.once('close'/'error')`, `outStream.removeListener(...)` :153-154, `outStream.destroy()` :157, `fs.unlink` | rejected | Deletes keys on the library `file` object only; all stream interaction is documented calls (`closed` is a core-recognized stream property, $NODEJS_SOURCE lib/internal/streams/utils.js:240-251). No method/field on the WriteStream is overwritten |
| C-012 | storage/memory.js:11-23 | `file.stream.on('data'/'end', ...)`; `Buffer.concat(chunks)` | rejected | Listener addition and Buffer API call; writes go to the callback's `info` object |
| C-013 | lib/make-middleware.js:75-79 | `new AsyncResource('multer')` + `runInAsyncScope` | rejected | Public async_hooks API usage (call only) — folded from C-001 chain |
| C-014 | lib/make-middleware.js:177-179, 237-248 | `req.once('end'/'error'/'close')`, `req.on('error'/'aborted'/'close')` | rejected | Documented listener registration on the request; no listener-table (`_events`) manipulation, no removal of other parties' listeners on `req` |
| C-015 | index.js:108-226; storage/disk.js:60,125; storage/memory.js:9,26; lib/file-appender.js:19-66 | Method definitions on `Multer.prototype`, `DiskStorage.prototype`, `MemoryStorage.prototype`, `FileAppender.prototype` | rejected | All library-owned constructors; no core prototype involved |

## busboy@1.6.0 (transitive)

| ID | Site | What it writes / does | Status | Reason |
| --- | --- | --- | --- | --- |
| C-016 | node_modules/busboy/lib/types/multipart.js:221 (`class Multipart extends Writable`), :565 (`_write`), :572 (`_destroy`), :585 (`_final`), :558 (`this.write(BUF_CRLF)`) | Implements Writable subclass hooks; writes only `this.*` own fields | rejected | Documented stream subclassing: core defines `_write` as the subclass extension point ($NODEJS_SOURCE lib/internal/streams/writable.js:837 throws ERR_METHOD_NOT_IMPLEMENTED unless provided; `_destroy` :1166). Defining them on a subclass instance/prototype is a supported extension, not a core mutation |
| C-017 | node_modules/busboy/lib/types/multipart.js:174-201 | `class FileStream extends Readable` with `_read`; sets `this.truncated`, `this._readcb`; `this._fileStream.emit('limit')` :479; `push(chunk)` / `push(null)` :478,482,517 | rejected | Documented Readable subclassing (`_read` baseline $NODEJS_SOURCE lib/internal/streams/readable.js:974; `push` :411). `truncated`/`_readcb` are busboy-owned fields on its own subclass instances; `emit('limit')` is a custom event on its own stream |
| C-018 | node_modules/busboy/lib/types/multipart.js:437-439, 456-459, 482-485, 554 | Saves/clears/restores `this._writecb` (the `cb` core passed into its own `_write`), hands it to `FileStream._readcb` for backpressure | rejected | `_writecb`/`_readcb` are busboy-owned own properties on busboy-owned instances; core keeps its write state in `_writableState` ($NODEJS_SOURCE lib/internal/streams/writable.js:350), which busboy never touches. Deferring the `_write` callback is the documented async-`_write` contract |
| C-019 | node_modules/busboy/lib/types/multipart.js:63,73,112; lib/types/urlencoded.js:88,96,124,132,149,159,188,196,213,295,315; lib/utils.js:434,442,450,458 | Calls `chunk.latin1Slice(...)`, `data.utf8Slice/ucs2Slice/base64Slice(...)` | rejected (noted as supporting context) | **Reads/calls of undocumented core Buffer.prototype methods** that core itself installs ($NODEJS_SOURCE lib/internal/buffer.js:1071-1076). Never assigned or wrapped — private API usage, not a patch |
| C-020 | node_modules/busboy/lib/types/multipart.js:432,574 | `this._bparser = ignoreData` | rejected | Replaces busboy's own parser field on its own instance with a no-op stub; `ignoreData` (:203-206) is a plain object, no core involvement |
| C-021 | node_modules/busboy/lib/types/urlencoded.js:7-239 | `class URLEncoded extends Writable` with `_write`/`_final`; all writes are `this._*` own fields; `this.emit('field'/'fieldsLimit')` | rejected | Same supported-extension analysis as C-016. (Not reachable from multer — multer only constructs busboy for `multipart/*` — but audited as part of busboy's entry path) |
| C-022 | node_modules/busboy/lib/index.js:5-57 | Factory: parses `cfg.headers['content-type']` (read), builds `instanceCfg`, returns `new type(instanceCfg)` | rejected | Reads headers off the caller-supplied object; writes only to its own config literal |
| C-023 | node_modules/busboy/lib/types/multipart.js:27-172 (HeaderParser), lib/utils.js:3-491 (parsers/decoders) | Builds `Object.create(null)` header/param maps; `process.nextTick(cb)` multipart.js:190 | rejected | Own-object writes and a documented timer-API call; `TextDecoder` (utils.js:467) is instantiated, not modified |

## streamsearch@1.1.0 (transitive via busboy)

| ID | Site | What it writes / does | Status | Reason |
| --- | --- | --- | --- | --- |
| C-024 | node_modules/streamsearch/lib/sbmh.js:26-95 (constructor/reset), :191-192 (`lookbehind.copy`, `lookbehind.set(data, ...)`), :241 (`data.copy(lookbehind, ...)`), :34 (`Buffer.allocUnsafe`) | Writes only `this._*` fields and the contents of its own lookbehind buffer; copies bytes between buffers via documented Buffer methods | rejected | Pure computation on library-owned state; chunk buffers are read (indexing, `memcmp`), never structurally modified; no prototype or core API touched |

## append-field@1.0.0 (transitive)

| ID | Site | What it writes / does | Status | Reason |
| --- | --- | --- | --- | --- |
| C-025 | node_modules/append-field/lib/set-value.js:12,14,18,23,37,39,41,43,50,52,58,59 (all `context[step.key] = ...` / `obj[...] = ...`); index.js:7-9 (reduce over steps) | Assembles nested values under client-controlled keys (including `__proto__`, `constructor`) into the `store` passed by the caller | rejected | The write target is always the store multer passes — `req.body = Object.create(null)` (make-middleware.js:136) — or intermediates append-field itself creates with `Object.create(null)` (set-value.js:39,49,57). On a null-prototype object a `__proto__`/`constructor` key is an inert **own** property; no `Object.prototype` (or any shared prototype) write is reachable. append-field has no special proto-key handling at all (search T-01: zero matches). Verified by reproduction R-02 (`Object.prototype` own-key set unchanged; `{}.x/y/z` undefined) and the installed artifact is byte-identical to registry append-field@1.0.0 (U-03) |

## type-is@1.6.18 / media-typer@0.3.0 / mime-types@2.1.35 / mime-db@1.52.0 (transitive)

| ID | Site | What it writes / does | Status | Reason |
| --- | --- | --- | --- | --- |
| C-026 | node_modules/type-is/index.js:23-28 (exports), :123-143 (`typeofrequest` reads `req.headers`), :241 (`type.parameters = undefined` on media-typer's result object) | Read-only against the request; writes only its own exports and parser-result objects | rejected | No core object written |
| C-027 | node_modules/media-typer/index.js:72-73 (exports), :160-186 (`params[key] = value`, `obj.parameters = params`), :202-210 (`getcontenttype` calls `obj.getHeader(...)` / reads `obj.headers`) | Builds plain result objects; reads headers | rejected | `getHeader` is invoked (read) on the caller's response-like object, never replaced |
| C-028 | node_modules/mime-types/index.js:30-39 (`exports.extensions = Object.create(null)`, `exports.types = Object.create(null)`, `populateMaps(...)` at require time), :149-190 (map population loop) | **Load-time work**: iterates mime-db JSON and fills the module's own two null-prototype maps; `var extname = require('path').extname` :16 captures a reference | rejected | All writes land on `module.exports` of mime-types itself; `path.extname` is referenced and called, never modified |
| C-029 | node_modules/mime-db/index.js:12 | `module.exports = require('./db.json')` | rejected | Static JSON export; no executable initialization |

## Summary

- Confirmed patches: **0**
- Rejected candidates: **29** (C-001 … C-029)
- Unresolved candidates: **0**
