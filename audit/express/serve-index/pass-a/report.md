# Node.js patch audit: serve-index

- Verdict: confirmed patching
- Status: complete
- Input: npm package `serve-index` (Express directory-listing middleware), audited from a local git clone
- Library: serve-index 1.9.2, repo https://github.com/expressjs/serve-index, branch master, commit fc0c0abd890e79c3f16b0ea9cf49551b3ee66ecb, source checkout with resolved runtime dependencies installed under `$PACKAGE_ROOT/node_modules`; no local modifications
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Reproduction runtime: Node v24.19.0 (user env) and v26.13.0 (clean env); command `node repro/check-core-globals.js "$PACKAGE_ROOT"`
- Scope: production/runtime code only — `index.js` (692 lines, sole entrypoint; package.json has no `main`, so `index.js` resolves by default) plus `public/` assets (read-only runtime data), and the resolved runtime dependency tree: accepts@1.3.8, batch@0.6.1, debug@2.6.9, depd@1.1.2, escape-html@1.0.3, http-errors@1.8.1, inherits@2.0.4, mime-db@1.52.0, mime-types@2.1.35, ms@2.0.0, negotiator@0.6.3, parseurl@1.3.3, setprototypeof@1.2.0, statuses@1.5.0, toidentifier@1.0.1. Tests, docs, browser-only files (`debug/src/browser.js`, `inherits/inherits_browser.js`, never loaded under Node), and the never-required `debug/src/inspector-log.js` are out of scope.
- Coverage: source — complete for the entrypoint and all 15 resolved runtime dependencies' Node entry/initialization paths; upstream — depd issues corroborated via read-only GitHub queries; runtime — require-time behavior reproduced on Node 24/26; the env-gated `DEBUG_FD` branch of debug was verified statically only (legacy, throws on modern Node for the FILE case).

## Patching verdict

Patching was demonstrated, with important qualifications:

- 1 shared core-global mutation, transient (F-001): `require('serve-index')` unconditionally and synchronously swaps and restores `Error.prepareStackTrace` and `Error.stackTraceLimit` three times, via the transitive dependency depd@1.1.2 (serve-index -> http-errors@1.8.1 -> depd). Both globals are saved and restored on each swap; the reproduction shows zero permanent difference after load. The same swap re-runs at runtime whenever a depd deprecation message is produced (not triggered by serve-index's own usage).
- 1 core-backed instance override, optional/env-gated (F-002): debug@2.6.9's legacy `DEBUG_FD` path (activated only when the `DEBUG_FD` env var names a file descriptor other than 1/2) constructs a `net.Socket`/`tty.WriteStream`/`fs.SyncWriteStream` around the fd and shadows core stream behavior on that instance (`stream.read = null`, `stream.readable = false`), code copied from legacy Node core stdio bootstrap. It affects only debug's own internally created log stream; it never runs in a default environment, and its FILE branch throws on modern Node (`fs.SyncWriteStream` was removed).

No permanent, unconditional mutation of any Node.js core API, global, shared prototype, module loading, or core source was found anywhere in the inspected scope. serve-index's own `index.js` performs no patching at all: its `res.statusCode`/`res.setHeader`/`res.end` writes and `fs` calls are documented public API usage. All candidates were resolved; none remain unresolved.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd)

- Category: shared core mutation (transient, save/restore)
- Library site(s):
  - `$PACKAGE_ROOT/node_modules/depd/index.js:365-383` (`getStack()`: saves both globals, sets `Error.prepareStackTrace = prepareObjectStackTrace` and `Error.stackTraceLimit = Math.max(10, limit)`, calls `Error.captureStackTrace(obj)`, restores both) — https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/index.js (installed-artifact offsets cited; verified by hash)
  - `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:21-43` (lazy `callSiteToString` feature-detection getter: same swap with `Error.stackTraceLimit = 2`) — https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/lib/compat/index.js
- Origin: transitive — serve-index 1.9.2 -> http-errors@1.8.1 -> depd@1.1.2
- Core baseline: `Error.prepareStackTrace` / `Error.stackTraceLimit` are V8 stack-trace-API hooks on the `Error` global honored by Node; `$NODEJS_SOURCE/lib/internal/errors.js:136-170` at d44625a4b80 implements the per-realm polyfill that invokes a user-assigned `Error.prepareStackTrace` and installs Node's default `ErrorPrepareStackTrace` (`lib/internal/errors.js:168`). On current Node, `Error.prepareStackTrace` is therefore a populated own data property of `Error` whose value depd replaces.
- Exact mutation: data-property assignment on the `Error` built-in global — `Error.prepareStackTrace` replaced with depd's `prepareObjectStackTrace` (returns the raw CallSite array) and `Error.stackTraceLimit` replaced with `2` (compat probe) or `Math.max(10, current)` (`getStack`); both assigned back to the saved originals immediately after the synchronous `Error.captureStackTrace`/`obj.stack` sequence. No try/finally: an exception between swap and restore would leak the swapped state (no such throwing path was identified).
- Execution chain: `require('serve-index')` (`$PACKAGE_ROOT/index.js:17`) -> `require('http-errors')` -> `$PACKAGE_ROOT/node_modules/http-errors/index.js:15` `require('depd')('http-errors')` ->
  1. `depd/index.js:11` property read `require('./lib/compat').callSiteToString` triggers the lazy getter -> swap/restore pair 1 (`lib/compat/index.js:21-43`);
  2. `depd('http-errors')` call -> `depd/index.js:110` `getStack()` -> swap/restore pair 2;
  3. `http-errors/index.js:286` `deprecate.function(exports.ImATeapot, ...)` -> `wrapfunction` -> `depd/index.js:404` `getStack()` -> swap/restore pair 3.
  At runtime, any depd `log()` (`depd/index.js:183`) repeats the swap; serve-index's `createError(400|403|406)` calls (`$PACKAGE_ROOT/index.js:114,124,129,166`) use the non-deprecated signature and do not trigger it.
- Activation: unconditional at module load of serve-index in production; no guards, no opt-out (`process.noDeprecation` only suppresses message output, not the require-time `getStack` calls in `depd()`/`wrapfunction`).
- Scope and restoration: process-wide globals on the `Error` constructor; mutated only within a synchronous window containing a single `Error.captureStackTrace` plus one `obj.stack` access, then restored to the exact prior values. Single-threaded JS means no other code observes the window in normal operation; interleaving is possible for re-entrant stack capture inside a user-assigned hook, and historically for Node's own source-map machinery (see Upstream).
- Resulting behavior: during each window, any stack formatted through the hook yields a raw CallSite array instead of the formatted string, and stack depth is clamped/raised to the swapped limit; an application-assigned `Error.prepareStackTrace` (or Node's default/`--enable-source-maps` hook) is displaced for the window and reinstated afterward. After load: no observable difference (verified).
- Evidence: static trace above; reproduction `node repro/check-core-globals.js "$PACKAGE_ROOT"` on Node v24.19.0 and v26.13.0 recorded exactly six writes to `Error.prepareStackTrace` (`prepareObjectStackTrace` -> restore of Node's `ErrorPrepareStackTrace`, three pairs), `Error.stackTraceLimit` 10 -> 10 after load, and an empty `permanentCoreDiffsAfterRequire` list (also covering `EventEmitter.prototype`, `Error.prototype`, `http.ServerResponse.prototype`, `http.IncomingMessage.prototype`, `fs.stat/readdir/readFile/readFileSync`, `url.parse`, `process.nextTick` identities).
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed; maintainer discussion of exactly this `getStack` code); dougwilson/nodejs-depd#36 "Incompatible with --enable-source-maps node 12 option" (closed; real-world breakage where the swapped hook received source-map call sites, `TypeError: callSite.getFileName is not a function`); dougwilson/nodejs-depd#9 "Error is global Error.stackTraceLimit is too low" (closed bug on the global-limit interplay). All applicable to depd 1.1.2 as installed here.

### F-002: core stream instance overrides in debug's legacy `DEBUG_FD` path (env-gated)

- Category: instance override on library-created instances of core classes (optional activation)
- Library site(s): `$PACKAGE_ROOT/node_modules/debug/src/node.js:61-75` (fd/stream selection at require time) and `:167-226` (`createWritableStdioStream`) — https://github.com/debug-js/debug/blob/2.6.9/src/node.js — specifically `stream.readable = false` (:204), `stream.read = null` (:205), `stream._type` (:176,:188,:206), `stream._handle.unref()` (:181,:211), `stream.fd` (:221), `stream._isStdio = true` (:223), `var tty_wrap = process.binding('tty_wrap')` (:169), `new fs.SyncWriteStream(fd, { autoClose: false })` (:187)
- Origin: transitive — serve-index 1.9.2 -> debug@2.6.9 (`$PACKAGE_ROOT/index.js:18`)
- Core baseline: `net.Socket` inherits `Readable.prototype.read` (`$NODEJS_SOURCE/lib/internal/streams/readable.js:700`); `tty.WriteStream` extends `net.Socket` (`$NODEJS_SOURCE/lib/tty.js:111,144`); `fs.SyncWriteStream` no longer exists in `$NODEJS_SOURCE/lib/fs.js` (removed from core; DEP0061); `process.binding` survives only as a runtime-deprecated legacy loader whose allowlist still includes `tty_wrap` (`$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:108,127-137`). The assignments are a verbatim copy of legacy Node-core stdio bootstrap (the file's own comment: "Copied from `node/src/node.js`").
- Exact mutation: on the stream instance debug constructs for the configured fd — instance property `read` set to `null`, shadowing the inherited core `Readable.prototype.read` for that object; `readable` forced to `false`; legacy core-convention metadata `_type`, `fd`, `_isStdio` added; `_handle.unref()` invoked. No prototype or shared object is touched.
- Execution chain: `require('serve-index')` -> `require('debug')` -> `src/index.js` -> `src/node.js` module top level: `fd = parseInt(process.env.DEBUG_FD, 10) || 2` -> if fd is not 1/2, `util.deprecate(...)()` then `createWritableStdioStream(fd)` performs the writes.
- Activation: optional and env-gated — only when the process runs with `DEBUG_FD` set to a descriptor other than 1 or 2; never in a default environment; path deprecated by debug itself. On modern Node the `FILE` branch throws (`fs.SyncWriteStream` removed) and `process.binding('tty_wrap')` emits a runtime deprecation.
- Scope and restoration: confined to the single stream instance debug creates and owns for its log output; permanent for that instance's lifetime; no restoration; no core consumer outside debug observes the object.
- Resulting behavior: the owned socket/tty stream behaves write-only (its core `read` is disabled, `readable` state forced off) and does not keep the event loop alive — replicating what legacy core did for its own stdio streams.
- Evidence: static only (code shipped and reachable under the env gate); not executed because activation requires a non-default environment and the branch is partially broken on current Node. Counted separately from F-001 per optional activation.
- Upstream: deprecation URL embedded at `src/node.js:64` (git.io/debug_fd -> debug-js/debug discussion deprecating `DEBUG_FD`); the instance hacks reference joyent/node#1726 in comments. `DEBUG_FD` handling was removed entirely in debug 3.x.

## Candidate ledger and unresolved questions

Full ledger in `candidates.md` beside this report. Summary: 22 candidates — 3 confirmed sites mapping to 2 findings (C-010/C-011 -> F-001, C-015 -> F-002), 19 rejected, 0 unresolved.

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-010 | `node_modules/depd/index.js:365-383`, `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | unconditional require-time swap/restore; reproduced |
| C-011 | `node_modules/depd/lib/compat/index.js:21-43`, same globals | confirmed -> F-001 | lazy getter triggered by `depd/index.js:11` at require time |
| C-015 | `node_modules/debug/src/node.js:61-75,167-226`, core stream instance | confirmed -> F-002 | env-gated (`DEBUG_FD`) instance override, library-owned stream |
| C-001..C-009, C-012..C-014, C-016..C-022 | various | rejected as patch | documented API usage, library-owned objects/prototypes, or metadata-only writes — detail in `candidates.md` |

## Supporting context

- serve-index itself (`$PACKAGE_ROOT/index.js`) only calls documented core APIs: `res.statusCode =` (prototype default at `$NODEJS_SOURCE/lib/internal/http/server.js:285`, documented writable per instance), `res.setHeader`/`res.end` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813,1289`), `fs.stat/readdir/readFile/readFileSync` (`$NODEJS_SOURCE/lib/fs.js:2048,1888,422,605`), `Buffer.byteLength` (read-only). It adds `err.status` to an fs callback error (`index.js:143-145`) — ecosystem-convention metadata on a non-core-managed instance.
- parseurl@1.3.3 caches parse results as `req._parsedUrl`/`req._parsedOriginalUrl` on the core-backed `IncomingMessage` (`parseurl/index.js:54,84`). These keys do not exist in `$NODEJS_SOURCE/lib/_http_incoming.js` (verified) — added metadata per the audit contract, not an override.
- batch@0.6.1 inherits via direct `Batch.prototype.__proto__ = EventEmitter.prototype` (`batch/index.js:51`) — non-standard style, but the write target is library-owned `Batch.prototype`; `EventEmitter.prototype` (`$NODEJS_SOURCE/lib/events.js:212,489`) is only read (confirmed by before/after own-key snapshot). `defer` aliases `process.nextTick` (read, `batch/index.js:16-18`).
- http-errors@1.8.1 builds its error classes with `util.inherits` from `Error` and, per created error, rebases a fresh `new Error` onto its own class via setprototypeof and redefines `message`/`name` on that instance (`http-errors/index.js:136-173,205-243`) — all library-created objects; `Error.captureStackTrace` is a documented V8 API call. setprototypeof@1.2.0 re-exports native `Object.setPrototypeOf` on modern Node; its fallbacks mutate only the object passed in.
- debug@2.6.9 rewrites/deletes `process.env.DEBUG` through its documented `enable`/`save` path, also once at require time, idempotently (`src/node.js:141-146,248`) — own configuration namespace via the documented mutable `process.env`.
- depd's `wrapfunction` (eval wrapper) and `wrapproperty`/`convertDataDescriptorToAccessor` redefine properties only on caller-supplied objects; the only activation in this tree wraps http-errors' own export (`http-errors/index.js:286`). Its `DeprecationError` defines properties on a library-created Error instance. `log()` uses documented `process.emit('deprecation', ...)`/`process.stderr.write`.
- accepts/negotiator are read-only wrappers over `req.headers` defining methods on their own prototypes; mime-types/mime-db/statuses/toidentifier/escape-html/ms perform load-time work only on their own exports. No package in the tree has install scripts.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js` + all dep entrypoints | `rg -n` sweeps for prototype/defineProperty/setPrototypeOf/`__proto__` writes (see `searches.md`) | only hits: batch inheritance, setprototypeof, http-errors instance work, depd defineProperty, own-prototype method definitions — all triaged in ledger |
| module interception / bindings | `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks|process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"` | single hit: `debug/src/node.js:169` `process.binding('tty_wrap')` (C-015/F-002); no loader hooks anywhere |
| monkeypatch keywords, global writes | `rg -n "monkey.?patch|\bshim\b|\bpolyfill\b|\boverride\b|\bpatch\b"`; `rg` for `globalThis`/`global`/`Buffer`/`process.stdout =` writes | no runtime hits beyond mime-db JSON type names and comments; no global-object writes |
| req/res writes | `rg -n "(req|request|res|response)\.[A-Za-z_$]+\s*=[^=]"` over serve-index, accepts, negotiator, parseurl | `index.js:103` `res.statusCode` (documented), `parseurl/index.js:54,84` metadata caching — no overrides |
| `$NODEJS_SOURCE/lib/internal/errors.js:136-170` | targeted read at d44625a4b80 | Node honors user-assigned `Error.prepareStackTrace` (V8 API polyfill); default `ErrorPrepareStackTrace` is the value depd displaces/restores |
| `$NODEJS_SOURCE/lib/internal/http/server.js:285`, `lib/internal/http/outgoing.js:813,1289` | targeted reads (`lib/_http_server.js` re-exports `lib/internal/http/`) | `statusCode` prototype default, `setHeader`, `end` — serve-index's res writes are documented usage |
| `$NODEJS_SOURCE/lib/_http_incoming.js` | `rg -n "_parsedUrl"` | absent — parseurl keys are library-owned |
| `$NODEJS_SOURCE/lib/fs.js`, `lib/internal/streams/readable.js:700`, `lib/tty.js:111,144`, `lib/internal/bootstrap/realm.js:108,127-137`, `lib/events.js:212,489` | targeted greps | fs public API present; `SyncWriteStream` absent (F-002 FILE branch broken on current Node); `tty_wrap` still in deprecated binding allowlist; stream/EventEmitter baselines for C-004/F-002 |
| reproduction | `node repro/check-core-globals.js "$PACKAGE_ROOT"` (Node v24.19.0 and v26.13.0 clean-env) | 6 `Error.prepareStackTrace` writes (3 swap/restore pairs), `stackTraceLimit` restored, no permanent core diffs |
| upstream depd | https://github.com/dougwilson/nodejs-depd/issues/32 , https://github.com/dougwilson/nodejs-depd/issues/36 , https://github.com/dougwilson/nodejs-depd/issues/9 (all closed) | corroborate F-001 design and a historical observable conflict with `--enable-source-maps` |
| provenance hashes (SHA-256, `$PACKAGE_ROOT`-relative) | `shasum -a 256` | `index.js` 92816331d63c4bb31d206f48ce1b1ff720258a10985bdee33b515f86d23588d3; `node_modules/depd/index.js` 244dbbca14b8aa9c9b6be04912283ab704b92f11dcb9b23beb2ba81402fecc99; `node_modules/depd/lib/compat/index.js` 76baf83317ac81045cefb9fcc8ec0d8e47dd0cfcbadd592f480349412e161861; `node_modules/debug/src/node.js` a3e83594a4ce88997e2e4fc66bc942b17b9d736290ad62560c7f09d6d0989ad0; `node_modules/batch/index.js` 1a74a4dbb93c86f96a2f79c88f2c0d3e5300560a1bf9704e731cab747779270c; `node_modules/http-errors/index.js` d7452a6c385a67c970b4506317db677facfda0c993e8d8f6360fe906ed8d41d4; `node_modules/parseurl/index.js` 811223d4a19492ccc642384dc84f0af4ad935557dfe8f63750d7ffd673e40f17; `node_modules/setprototypeof/index.js` 3e3495ca7ae72a7f0ca459f47dd3d97ae3a48fa4b1a669a31672be778cc97a5f |

## Coverage and limitations

- Entry points: `index.js` is the sole export surface (`module.exports = serveIndex` plus `serveIndex.html/json/plain`); `public/` is data loaded read-only (`fs.readFile`/`readFileSync`). No install scripts in the package or any dependency.
- Every resolved runtime dependency's Node entrypoint/initialization path was read (accepts, batch — full read, debug `src/index.js`+`src/node.js`+`src/debug.js`, depd + `lib/compat`, escape-html, http-errors — full read, inherits, mime-db, mime-types, ms, negotiator index + lib structure, parseurl — full read, setprototypeof — full read, statuses, toidentifier). Browser-only variants and `debug/src/inspector-log.js` (never required) excluded.
- Node.js baseline files read at d44625a4b80 are listed above; no recursive scan of the Node tree was performed. Published depd/debug line offsets may differ slightly from the installed-artifact offsets cited (installed files pinned by SHA-256 above).
- Branches not executed: debug's `DEBUG_FD` path (F-002, env-gated; static evidence only), depd's runtime `log()` re-swap (not reachable from serve-index's own call sites; same code as the reproduced require-time swap), `setprototypeof`/`inherits` legacy fallbacks (dead on modern Node). A tested branch cannot prove universal absence, but all shipped runtime code paths were read.
- Reproduction instrumentation note: `Error.stackTraceLimit` cannot be converted to an accessor without disabling V8 stack collection, so its intermediate writes were established statically and its restoration by before/after value; `Error.prepareStackTrace` writes were observed directly via accessor.
- What would change the verdict: evidence that the depd swap can leak (a throwing path between swap and restore), or a consumer-visible escape of debug's `DEBUG_FD` stream — none found.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at this path.
