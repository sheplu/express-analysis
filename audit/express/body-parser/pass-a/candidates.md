# Candidate ledger: body-parser 2.4.0 patch audit (pass A)

Every candidate site surfaced by the searches in `searches.md`, with what it
writes/modifies and its resolution. Paths are relative to `$PACKAGE_ROOT`
(body-parser 2.4.0 at commit 151a0d9e72682662fd32b439da4693b4459a70b3) or
`$NODEJS_SOURCE` (nodejs/node commit d44625a4b80c672215b469906ce583ce7eeeebaf).

Totals: 28 candidates — 1 confirmed (F-001), 27 rejected, 0 unresolved.

## First-party (body-parser) candidates

### C-001 — `lib/read.js:52-53` and `lib/read.js:194` — `req.body` writes
- Writes: `req.body = undefined` (only when `'body' in req` is false) and
  `req.body = parse(str, encoding)` on the live `http.IncomingMessage`.
- Status: REJECTED as patch.
- Reason: adds/updates a library-defined data property on a core-backed instance
  (request metadata). No core method, accessor, or prototype is replaced;
  `IncomingMessage` defines no `body` member in `$NODEJS_SOURCE/lib/internal/http/incoming.js`.
  The skill explicitly excludes "merely adding request metadata".

### C-002 — `lib/read.js:119,151,165-171,249` — `req.pipe(stream)`, `req.unpipe(...)`, `req.resume()`, `stream.destroy()`, `stream.on('error', ...)`
- Writes: none — method calls on public stream API.
- Status: REJECTED. Documented `stream.Readable` API usage; no reassignment of
  any stream method and no `_readableState` writes anywhere in first-party code.

### C-026 — `lib/types/urlencoded.js:103` — `qs.parse(body, { allowPrototypes: true, ... })`
- Writes: via qs, keys (including `__proto__`-named keys) onto qs-created
  parse-result objects.
- Status: REJECTED as patch. qs's merge/compact operate only on the result
  object graph it creates; shared `Object.prototype` is never mutated
  (`qs/lib/utils.js`, `qs/lib/parse.js` scanned — no writes to core-owned
  objects). This is an application-level input-hardening consideration, not a
  Node.js patch; out of audit scope beyond this note.

(Additional first-party checks: no `_body` flag anywhere in runtime code; no
prototype/defineProperty/loader-hook/global/binding patterns matched — see
`searches.md` S1-S5.)

## Dependency candidates

### C-003 — `node_modules/depd/index.js:386-387` — `Error.prepareStackTrace` / `Error.stackTraceLimit`
- Writes: `Error.prepareStackTrace = prepareObjectStackTrace` (line 386) and
  `Error.stackTraceLimit = Math.max(10, limit)` (line 387) on the global `Error`
  constructor; prior values saved (382, 384) and restored (395-396) after one
  `Error.captureStackTrace(obj)` + `obj.stack` read. Not exception-safe (no
  `try/finally`).
- Activation: `depd/index.js:108` (`depd()` factory) — runs at
  `require('body-parser')` via `lib/read.js:14 -> http-errors/index.js:15`;
  also `depd/index.js:199` (`log()`) on each deprecation emission.
- Core target: shared global hook consumed by Node core
  (`$NODEJS_SOURCE/lib/internal/errors.js:149-150`) and by V8.
- Status: CONFIRMED -> F-001 (transient shared-global mutation; reproduced on
  Node 24 — see `repro-error-hook-write.js` / `repro-restore-check.js`).

### C-004 — `depd/index.js:471-519` (`wrapproperty`, defineProperty at 485)
- Writes: redefines a property descriptor on a caller-supplied object.
- Status: REJECTED. Never invoked in this scope: http-errors uses only
  `deprecate(message)` (`http-errors/index.js:73`); `deprecate.property` /
  `deprecate.function` have no callers in the installed tree.

### C-005 — `depd/index.js:48-64` (`convertDataDescriptorToAccessor`, defineProperty at 62)
- Status: REJECTED. Only reachable from `wrapproperty` (C-004); not activated.

### C-006 — `depd/index.js:492-544` (`DeprecationError`, defineProperty at 496,500,507,514,521)
- Writes: own properties on a freshly created `new Error()` the library returns.
- Status: REJECTED. Library-owned instance; no shared object touched. Also only
  reachable when a `process.on('deprecation')` listener exists.

### C-007 — `node_modules/on-finished/index.js:189-198` (`patchAssignSocket`, write at 195)
- Writes: `res.assignSocket = function _assignSocket (socket) { assignSocket.call(this, socket); callback(socket) }`
  — an own-property wrapper shadowing core `ServerResponse.prototype.assignSocket`
  (`$NODEJS_SOURCE/lib/internal/http/server.js:312`, re-exported via
  `lib/_http_server.js`) on a core-backed instance. Wrapper preserves original
  behavior and adds a callback (Node 0.8 workaround for broken 'socket' event;
  code comment: "node.js 0.8 patch").
- Call site: `on-finished/index.js:130`, guarded by `msg.socket` falsy AND
  `msg.socket === undefined` AND `typeof msg.assignSocket === 'function'`.
- Status: REJECTED for this scope (unreachable). body-parser invokes
  `onFinished(req, ...)` / `onFinished.isFinished(req)` only on the request
  (`lib/read.js:46,156,245-250`), never on `res`. `IncomingMessage` gets
  `this.socket = socket` at construction (`$NODEJS_SOURCE/lib/internal/http/incoming.js:77`)
  and has no `assignSocket` method, so both guards block the write. Documented
  in the report as a dormant conditional core-backed instance override in
  dependency code.

### C-008 — `on-finished/index.js:147,164` — `msg.__onFinished = createListener(msg)` / `= null`
- Status: REJECTED. Library-owned metadata property added to the message
  instance; no core member shadowed (`IncomingMessage`/`OutgoingMessage` define
  no `__onFinished`).

### C-009 — `node_modules/http-errors/index.js:139,208` — `setPrototypeOf(err, ClientError.prototype / ServerError.prototype)`
- Writes: changes the [[Prototype]] of a freshly created `new Error(msg)`
  (lines 133/201) before returning it.
- Status: REJECTED. Instance created and owned by the library; shared
  `Error.prototype` is read (via the inherits chain), never written.
  `setprototypeof` resolves to native `Object.setPrototypeOf` on Node >= 18.

### C-010 — `http-errors/index.js:142-157,211-226` — `Object.defineProperty(err, 'message'/'name', ...)`
- Status: REJECTED. Own properties on the library-created error instance.

### C-011 — `http-errors/index.js:245-251` (`nameFunc`, defineProperty at 249)
- Status: REJECTED. Sets `name` on library-created constructors
  (ClientError/ServerError).

### C-012 — `node_modules/setprototypeof/index.js:3-17`
- Writes: module exports `Object.setPrototypeOf || setProtoOf || mixinProperties`;
  `setProtoOf` does `obj.__proto__ = proto` (line 6).
- Status: REJECTED. On Node >= 0.12 the export IS native `Object.setPrototypeOf`
  (no wrapper); polyfill branches are dead on the supported engine range
  (body-parser engines: node >= 18). The only in-tree callers (C-009) pass
  library-owned objects.

### C-013 — `node_modules/safer-buffer/safer.js:25` — `safer.Buffer.prototype = Buffer.prototype`
- Writes: sets the `prototype` property of `Safer` — a plain `{}` created at
  line 19 and owned by safer-buffer. Core `Buffer.prototype` is only READ
  (aliased), never assigned to or modified.
- Status: REJECTED. Loaded at body-parser load time via iconv-lite 0.7.3
  (declared dep "safer-buffer >= 2.1.2 < 3.0.0"); still no core write.

### C-014 — `safer-buffer/safer.js:61` — `safer.kStringMaxLength = process.binding('buffer').kStringMaxLength`
- Status: REJECTED. Read-only access to the deprecated private
  `process.binding` API, wrapped in try/catch; result stored on safer's own
  export object. Private API READ — supporting context, not a patch.

### C-015 — `node_modules/iconv-lite/lib/streams.js:19,66` + `_transform`/`_flush` definitions
- Writes: `IconvLiteEncoderStream.prototype = Object.create(Transform.prototype, ...)`
  (same for decoder) and method definitions on those library-owned prototypes.
- Status: REJECTED. Documented stream subclassing via the supported
  `_transform`/`_flush` extension points; `Transform.prototype` is read, not
  modified. Also verified: no `extendNodeEncodings`, no `Buffer.prototype`, no
  `_readableState`/`_writableState` references anywhere in iconv-lite 0.7.3.

### C-016 — `iconv-lite/lib/index.js:140-172` — load-time `enableStreamingAPI(require('stream'))`
- Status: REJECTED. All writes land on iconv-lite's own `module.exports`
  (stream classes, `encodeStream`/`decodeStream`, `supportsStreams`).

### C-017 — `node_modules/raw-body/index.js:170-181` — `stream._readableState` / `stream._decoder` access
- Reads: `var state = stream._readableState` (176); checks `stream._decoder ||
  (state && (state.encoding || state.decoder))` (177) to reject streams with a
  string encoding set.
- Status: REJECTED. Read-only private API usage; fields verified at
  `$NODEJS_SOURCE/lib/internal/streams/readable.js:333-334` (set by
  `setEncoding`, line 631). No write to the stream beyond listener add/remove
  and `pause()`.

### C-018 — `node_modules/unpipe/index.js:38-67`
- Behavior: modern branch calls public `stream.unpipe()`; legacy (streams1)
  branch INVOKES existing `close` listeners named `cleanup`/`onclose`.
- Status: REJECTED. No assignment to any stream member; legacy branch is dead
  on streams with native `unpipe` (all supported Node). Invoking core-installed
  pipe-cleanup listeners is private-behavior reliance, not mutation.

### C-019 — `node_modules/debug/src/node.js:205,209` — `process.env.DEBUG = namespaces` / `delete process.env.DEBUG`
- Writes: environment variable on the core-backed `process.env` object; executes
  at module load via `createDebug.enable(createDebug.load())`
  (`debug/src/common.js:287`) and on any later `debug.enable()` call.
- Status: REJECTED as patch. `process.env` is documented-mutable process state;
  at load the write round-trips the pre-existing `DEBUG` value (or deletes an
  absent key) — an effective no-op; no core API behavior is replaced. Data
  write, analogous to C-001.

### C-020 — `debug/src/common.js:122` — `Object.defineProperty(debug, 'enabled', ...)`
- Status: REJECTED. Accessor on debug's own per-namespace function instance.

### C-021 — `node_modules/content-type/dist/index.js:29` — `C.prototype = Object.create(null)`
- Status: REJECTED. Local `NullObject` constructor private to the module
  (null-prototype object factory).

### C-022 — `node_modules/function-bind/implementation.js:78-80` — `Empty.prototype = target.prototype; bound.prototype = new Empty(); Empty.prototype = null`
- Status: REJECTED. Writes to the polyfill's own `Empty`/`bound` functions;
  `function-bind/index.js:5` exports native `Function.prototype.bind` on any
  modern engine, so the implementation is dead here anyway.

### C-023 — `node_modules/get-intrinsic/index.js` — `INTRINSICS['%...%'] = ...` (e.g., line 159) and `Function('return ...')` evaluation
- Status: REJECTED. All assignments populate get-intrinsic's own lookup table
  with REFERENCES to intrinsics; `Function` evaluation is used to obtain hidden
  constructors (reads). No write to any core-owned object. The dependent
  es-helper family — es-errors, es-object-atoms, es-define-property,
  math-intrinsics, get-proto, gopd, has-symbols, hasown,
  call-bind-apply-helpers, call-bound, object-inspect, side-channel,
  side-channel-list/map/weakmap — was swept for writes touching core globals:
  only reads/own-export assignments found (e.g.,
  `call-bind-apply-helpers/functionCall.js:4` exports `Function.prototype.call`
  — a read).

### C-024 — `node_modules/dunder-proto/set.js:10,32` — `obj.__proto__ = ...`
- Status: REJECTED. Line 10 is a feature test on a local literal; line 32 is the
  exported setter, but `dunder-proto/set` is not required by any module in this
  installed tree (verified: only `dunder-proto/get` is imported, by get-proto /
  get-intrinsic). Dead code in scope.

### C-025 — `node_modules/inherits/inherits.js`
- Status: REJECTED. Exports core `util.inherits`; applied only to library
  constructors (http-errors HttpError/ClientError/ServerError). The
  prototype-mutating `inherits_browser.js` branch is unreachable on Node.

### C-027 — `node_modules/es-define-property/index.js:5-11`, `node_modules/gopd/index.js:5-12` — load-time feature tests
- Status: REJECTED. `Object.defineProperty`/`getOwnPropertyDescriptor` exercised
  against fresh literals (`{}`/`[]`) to detect support; results cached on own
  exports.

### C-028 — `on-finished/index.js:205-230`, `raw-body/index.js:290-308` — `AsyncResource` wrapping
- Status: REJECTED. `new AsyncResource(...)` + `runInAsyncScope.bind(res, fn, null)`
  is documented async_hooks API usage; binds a core method to a library-owned
  resource instance without modifying any shared object.

## Unresolved

None.
