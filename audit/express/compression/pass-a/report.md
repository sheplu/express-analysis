# Node.js patch audit: compression

- Verdict: **confirmed patching** (instance/application overrides only; zero shared core mutations)
- Status: complete
- Input: npm package `compression` (Node.js compression middleware), local clone at `$PACKAGE_ROOT`
- Library: compression 1.8.2, git commit 0f9707417bd53d41a319fce8bdb80dfa08b435c8 (https://github.com/expressjs/compression, branch master; matches latest release v1.8.2), plain source package (`files`: index.js only); no local changes
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf; no local changes
- Reproduction runtime: Node.js v24.19.0 (`node repro.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: runtime only — `index.js` plus resolved runtime dependencies installed with `--ignore-scripts --omit=dev`: bytes@3.1.2, compressible@2.0.18 (-> mime-db@1.54.0), debug@2.6.9 (-> ms@2.0.0), destroy@1.2.0, negotiator@0.6.4, on-headers@1.1.0, safe-buffer@5.2.1, vary@1.1.2. Tests, examples, docs excluded.
- Coverage: source complete (entrypoint + every dependency entrypoint and followed transitive imports read); upstream corroborated for the destroy workaround (nodejs/node#23734) and the 1.8.2 close-handling commit; runtime reproduction executed on one modern Node version (legacy-gated branches verified statically only).

## Patching verdict

compression patches Node.js at the **per-response instance level, on every
request it handles**: when the middleware runs it reassigns `write`, `end`, and
`on` as own properties of the live `http.ServerResponse` instance (shadowing
`OutgoingMessage.prototype.write/end` and `EventEmitter.prototype.on`), adds a
library-owned `flush` method, and — transitively through on-headers@1.1.0 —
reassigns `writeHead` on the same instance. Originals are saved and delegated
to; the replacements reroute the response body through a zlib compression
stream and re-target `'drain'` listeners.

Counts:

- Shared core mutations (prototypes, globals, module objects, loaders, core
  source): **0** — verified statically (no prototype/global writes in scope,
  no loader hooks) and dynamically (prototype identity unchanged after require
  and after a full compressed request).
- Instance/application overrides, active on current Node: **4** (F-001..F-004;
  F-004 is transitive via on-headers@1.1.0).
- Instance-level core-internal mutations, legacy-gated: **1 finding, 3 sites**
  (F-005, transitive via destroy@1.2.0) — statically present writes to zlib
  stream internals (`_binding`/`_handle` replacement, `destroyed`,
  `_needDrain`) that version guards make unreachable on Node >= 10.15.1,
  including the audited baseline; compression's declared engine range
  (`>= 0.8.0`) still nominally covers the EOL runtimes where they execute.
- Unresolved candidates: **0**. All other candidates rejected (ledger in
  `candidates.md`).

All patching is scoped to the specific response (and compression-stream)
objects of a request passing through the middleware, lasts for the lifetime of
that response, and is never applied to shared prototypes; other server routes
or responses not passing through the middleware are untouched.

## Confirmed Node.js patches

### F-001: `res.write` — own-property replacement of `OutgoingMessage.prototype.write` on the live response instance

- Category: instance/application override
- Library site(s): `$PACKAGE_ROOT/index.js:101-113` (assignment at 101; original saved at 90) — https://github.com/expressjs/compression/blob/0f9707417bd53d41a319fce8bdb80dfa08b435c8/index.js#L101
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1027` (`OutgoingMessage.prototype.write`), inherited by ServerResponse via `$NODEJS_SOURCE/lib/internal/http/server.js:259`; core `write` queues/sends the chunk on the socket and returns socket backpressure
- Exact mutation: `res.write = function write (chunk, encoding) {...}` — creates an own data property `write` on the ServerResponse instance that shadows the prototype method; `var _write = res.write` (index.js:90) captures the original first
- Execution chain: app `require('compression')(opts)` -> middleware `compression(req, res, next)` runs for a request -> assignment executes unconditionally before `next()` (index.js:101)
- Activation: production default; every request routed through the middleware, regardless of whether compression is ultimately applied
- Scope and restoration: single response instance; never restored (own property persists; after a compression stream exists the original is only reachable via the saved `_write`)
- Resulting behavior: after headers are negotiated, writes are diverted into a zlib Gzip/Deflate/BrotliCompress stream (`stream.write(toBuffer(chunk, encoding))`, index.js:110-112) whose output is forwarded to the socket via the saved `_write` (index.js:250-254); if headers are not yet sent it first auto-calls `this.writeHead(this.statusCode)` (index.js:106-107); returns `false` after `end` (index.js:102-104); the returned backpressure signal reflects the compression stream, not the socket
- Evidence: static assignment; reproduction: `res` has no own `write` before the middleware, own `write` after, `res.write !== OutgoingMessage.prototype.write` while the prototype method's identity is unchanged (repro lines [3]-[5], [9], [12]); gzip round trip succeeds ([10]-[11])
- Upstream: long-standing documented design of expressjs/compression ("The middleware will attempt to compress response bodies…", README); no Node.js accommodation involved

### F-002: `res.end` — own-property replacement of `OutgoingMessage.prototype.end` on the live response instance

- Category: instance/application override
- Library site(s): `$PACKAGE_ROOT/index.js:115-140` (assignment at 115; original saved at 88) — https://github.com/expressjs/compression/blob/0f9707417bd53d41a319fce8bdb80dfa08b435c8/index.js#L115
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289` (`OutgoingMessage.prototype.end(chunk, encoding, callback)`); core `end` finalizes the message, flushes headers, supports a completion callback, returns `this`
- Exact mutation: `res.end = function end (chunk, encoding) {...}` — own property shadowing the inherited core method
- Execution chain: identical to F-001; assignment executes unconditionally when the middleware runs
- Activation: production default, every handled request
- Scope and restoration: single response instance; not restored; original invoked via saved `_end` either directly (no compression, index.js:129-131) or from the compression stream's `'end'` handler (index.js:256-258)
- Resulting behavior: before headers are sent it estimates `Content-Length` from the final chunk for the threshold check (index.js:120-127) and triggers `writeHead`; with a compression stream active, the final chunk goes to `stream.end(...)` and the real `res.end` runs only after the compressor flushes; subsequent calls return `false` instead of `this`; the optional `callback` argument of core `end` is not forwarded on the compressed path
- Evidence: static assignment; reproduction lines [4], [6], [9], [12]
- Upstream: same as F-001

### F-003: `res.on` — own-property replacement of `EventEmitter.prototype.on` on the live response instance ('drain' interception)

- Category: instance/application override
- Library site(s): `$PACKAGE_ROOT/index.js:142-155` (assignment at 142; original saved at 89; buffered listeners re-targeted at 159 and 243 via `addListeners`, index.js:274-278) — https://github.com/expressjs/compression/blob/0f9707417bd53d41a319fce8bdb80dfa08b435c8/index.js#L142
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/events.js:615-619` (`EventEmitter.prototype.on = EventEmitter.prototype.addListener`), inherited by ServerResponse through the stream/EventEmitter chain; core `on` attaches the listener to the emitter it is called on
- Exact mutation: `res.on = function on (type, listener) {...}` — own property shadowing the inherited core method
- Execution chain: identical to F-001
- Activation: production default, every handled request
- Scope and restoration: single response instance; not restored. Interception semantics: non-`'drain'` listeners pass through to the saved `_on`; `'drain'` listeners are (a) buffered in a local array while the compression decision is pending, (b) attached to the zlib stream once it exists (index.js:147-149, 243), or (c) re-attached to the response itself via `_on` if compression is declined (`nocompress`, index.js:157-161, after which pass-through resumes because `listeners` is null)
- Resulting behavior: application `'drain'` listeners added through `res.on` may never observe the socket's own drain events; they fire from the compression stream instead, matching the backpressure value returned by the overridden `res.write`. compression itself couples the two streams with `stream.pause()`/`stream.resume()` on real socket drain (index.js:250-262). Buffered registration returns `this` to preserve chaining
- Evidence: static assignment; reproduction lines [4], [7], [9]
- Upstream: same as F-001

### F-004: `res.writeHead` — own-property wrapper over `ServerResponse.prototype.writeHead` via on-headers@1.1.0

- Category: instance/application override (transitive)
- Library site(s): `$PACKAGE_ROOT/index.js:174` (`onHeaders(res, onResponseHeaders)`); write at `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`), wrapper at on-headers/index.js:30-52 — https://github.com/jshttp/on-headers/blob/v1.1.0/index.js#L71
- Origin: compression -> on-headers@1.1.0
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-424` (`ServerResponse.prototype.writeHead`); core `writeHead` stores status/reason and serializes any headers passed as arguments directly into the header block, taking precedence over `setHeader` state
- Exact mutation: own data property `writeHead` on the instance whose value is a new function closing over the previous `writeHead` (whatever it was at call time — composable with other wrappers) and the listener
- Execution chain: middleware -> `onHeaders(res, ...)` (index.js:174) -> assignment; the wrapper later runs when anything calls `res.writeHead` — including compression's own overridden `write`/`end` (index.js:107, 126) and Node core's implicit-header path, which calls `this.writeHead(this.statusCode)` (`$NODEJS_SOURCE/lib/internal/http/server.js:420`)
- Activation: production default, every handled request; listener fires once (guarded by `fired`)
- Scope and restoration: single response instance; not restored; original reachable only through the closure
- Resulting behavior: before the real `writeHead` runs, (1) `this.statusCode` is set and any headers passed as arguments are converted into `setHeader`/`appendHeader` calls (on-headers/index.js:119-146, 1D raw arrays via `removeHeader`+`appendHeader`, index.js:158-170) so they become visible/mutable through the headers API — a semantic change from core, where writeHead-supplied headers bypass `getHeader`; (2) compression's `onResponseHeaders` listener runs and may set `Content-Encoding`, delete `Content-Length`, add `Vary: Accept-Encoding`, and create the zlib stream (index.js:174-263); (3) the saved writeHead is invoked with the (possibly updated) status code and trimmed arguments
- Evidence: static; reproduction lines [4], [8], [9]; on-headers README documents the wrap
- Upstream: on-headers is the jshttp-maintained standard mechanism for header hooks; v1.1.0 added the appendHeader path

### F-005: zlib stream core-internal writes in destroy@1.2.0 — legacy-gated, unreachable on the audited baseline

- Category: instance override / core-internal state mutation (transitive, version-gated to EOL Node)
- Library site(s): `$PACKAGE_ROOT/node_modules/destroy/index.js:84-87` (replaces `stream._binding` or `stream._handle` with a fake `{ close: ... }` object), `node_modules/destroy/index.js:115-117` + 195-197 (`stream._needDrain = true`, later `this._binding.clear()`), `node_modules/destroy/index.js:126` (`stream.destroyed = true` before `stream.close()`) — https://github.com/stream-utils/destroy/blob/v1.2.0/index.js#L84
- Origin: compression -> destroy@1.2.0; triggered from `$PACKAGE_ROOT/index.js:169-172` (response `'close'` listener) and `index.js:236-240` (close raced stream creation)
- Core baseline: `$NODEJS_SOURCE/lib/zlib.js:395` (`class ZlibBase extends Transform`), `lib/zlib.js:455` (`this._handle = handle` — the real native-handle slot), `lib/zlib.js:529-532` (own `_destroy(err, cb)` calling `_close(this)`); `destroyed` is core stream state
- Exact mutation: on the zlib stream instance compression created: replacement of the internal native-binding reference with a stub, and writes to `destroyed`/`_needDrain` state flags
- Execution chain: client disconnect -> response `'close'` -> `destroy(stream)` -> `isZlibStream` -> `destroyZlibStream`/`closeZlibStream` -> guarded branch
- Activation: **not reachable on the audited baseline or any Node >= 10.15.1.** Guards: `_binding` branch requires Node < 0.10 zlib; `destroyed = true` branch requires Node 7/8 (zlib `_destroy` identical to `Transform.prototype._destroy`); `_binding`/`_handle` stub requires a zlib stream with no `destroy` function (Node < 8) that `_hadError`. On the baseline, zlib streams own `_destroy`, so destroy@1.2.0 takes the plain `stream.destroy()` branch (destroy/index.js:121-123) — no mutation. compression's `engines` field (`>= 0.8.0`) nominally still admits the EOL runtimes where these writes execute. Brotli streams are not matched by `isZlibStream` at all and get plain `stream.destroy()`
- Scope and restoration: the library-created per-response zlib stream only (never the ServerResponse); permanent for that stream's teardown
- Resulting behavior (on EOL Node only): forces zlib's buggy `close()` to no-op on the native handle / marks the stream destroyed before close, avoiding "zlib binding closed" errors and a native-memory leak
- Evidence: static only (branches cannot execute on the available runtime); baseline comparison above
- Upstream: destroy/index.js:99 cites https://github.com/nodejs/node/pull/23734 ("zlib: do not leak on destroy") — verified CLOSED/unmerged; the leak was addressed in Node by other changes, and modern `ZlibBase._destroy` -> `_close` releases the handle, which is why the modern branch needs no workaround. compression commit 151f63e (released in 1.8.2) added the `'close'` -> `destroy(stream)` chain

## Candidate ledger and unresolved questions

Full ledger with reasons: `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-002 | index.js:101 `res.write` vs outgoing.js:1027 | confirmed -> F-001 | own-property shadowing, repro [5] |
| C-003 | index.js:115 `res.end` vs outgoing.js:1289 | confirmed -> F-002 | own-property shadowing, repro [6] |
| C-004 | index.js:142 `res.on` vs events.js:619 | confirmed -> F-003 | own-property shadowing, repro [7] |
| C-005 | index.js:174 -> on-headers/index.js:71 `res.writeHead` vs server.js:423 | confirmed -> F-004 | transitive wrap, repro [8] |
| C-010..C-012 | destroy/index.js:84-87,115-117,126 zlib internals | confirmed -> F-005 (legacy-gated) | unreachable on Node >= 10.15.1 |
| C-001 | index.js:93 `res.flush` | rejected as patch | library-owned addition; no core `flush` on baseline |
| C-006..C-009, C-013..C-025 | saved originals, private reads, env writes, self-owned objects, pure deps | rejected as patch | see `candidates.md` |

Unresolved: none.

## Supporting context

- `res.flush` (index.js:93-97) is a **library-owned addition** (flushes the
  compression stream); baseline `OutgoingMessage` has `flushHeaders`
  (outgoing.js:1461) but no `flush`, so nothing core is shadowed on current
  Node. On very old Node (<= 4-era) it would have shadowed the then-deprecated
  `OutgoingMessage.prototype.flush`.
- `headersSent(res)` (index.js:343-347) falls back to reading the core-private
  `res._header` when `headersSent` is not a boolean — a dormant legacy read on
  the baseline.
- safe-buffer@5.2.1 on modern Node simply re-exports the core `buffer` module
  object unmodified (`module.exports = buffer`); its copy helpers only ever
  write into library-owned objects. No Buffer patching.
- debug@2.6.9 writes `process.env.DEBUG` back at import time (documented
  `process.env` semantics, value-preserving) and, only when the deprecated
  `DEBUG_FD` is set to an fd other than 1/2, reads
  `process.binding('tty_wrap')` and mutates stdio-like stream instances it
  creates for itself (code copied from old Node bootstrap; the `FILE` branch
  uses `fs.SyncWriteStream`, which no longer exists on the baseline). None of
  this touches shared core state.
- destroy@1.2.0's `suppress` mode (`removeAllListeners('error')` + noop
  listener) is never activated by compression (single-argument calls).
- negotiator/vary/bytes/compressible/ms/mime-db are pure parsing/data; vary
  only uses the documented `getHeader`/`setHeader` API.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js` + all dep entrypoints | skill candidate sweeps S1-S6 (see `searches.md`) | all core-object writes found are the instance assignments in F-001..F-005; no prototype/global/loader writes; S5 (module interception) zero hits |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | `rg -n "OutgoingMessage\.prototype\.(write|end|flush|on)\b|prototype\.flushHeaders"` | write:1027, end:1289, flushHeaders:1461, no `flush` — baselines for F-001/F-002 and the C-001 rejection |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | `rg -n "writeHead|ObjectSetPrototypeOf\(ServerResponse"` + read 210-260, 415-425 | writeHead:423-424; inheritance:259-260; core implicit-header path calls `this.writeHead` (420) proving the F-004 wrapper intercepts implicit headers too |
| `$NODEJS_SOURCE/lib/events.js` | `rg -n "EventEmitter\.prototype\.on\b|addListener"` | on = addListener at 615/619 — baseline for F-003 |
| `$NODEJS_SOURCE/lib/zlib.js` | `rg -n "_destroy|this\._handle|class ZlibBase"` + read 440-460, 525-545 | ZlibBase:395, `_handle`:455, own `_destroy`:529 — proves destroy@1.2.0 takes the non-mutating branch on the baseline (F-005 gating) |
| Reproduction | `node repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | prototypes identity-stable after require and after a gzip round trip; own properties `write,end,on,flush,writeHead` appear on `res` only after the middleware runs |
| expressjs/compression history | `git log -S 'onResponseClose' -- index.js` in `$PACKAGE_ROOT` | commit 151f63e "fix: destroy compression stream on response close" (in 1.8.2) — activation chain for F-005 |
| nodejs/node#23734 | `gh pr view 23734 --repo nodejs/node` | "zlib: do not leak on destroy" — CLOSED, unmerged; cited by destroy@1.2.0 as rationale; workaround is historical on current Node |
| expressjs/compression releases | `gh api repos/expressjs/compression/releases/latest` | v1.8.2 (2026-09-11) — audited commit is the current release |

## Coverage and limitations

- Entry points: `index.js` (sole shipped runtime file per `package.json`
  `files`); all 10 resolved runtime deps' entrypoints read in full or swept,
  plus followed transitive imports (`debug/src/{index,node,debug}.js`,
  `negotiator/lib/*` sweep, `mime-db/db.json` re-export). debug's
  `browser.js`/`inspector-log.js` are not on the Node require path (Electron
  renderer only) — excluded branch.
- Node.js baseline files read (targeted only): `lib/http.js` (re-exports),
  `lib/internal/http/outgoing.js`, `lib/internal/http/server.js`,
  `lib/events.js`, `lib/zlib.js`. On this main-branch checkout the HTTP
  implementation lives under `lib/internal/http/`; released Node lines ship the
  same methods in `lib/_http_outgoing.js`/`lib/_http_server.js`.
- Branches not executed: F-005's legacy branches (require EOL Node < 10.15.1)
  — static verification only; debug's `DEBUG_FD` != 1/2 path; on-headers'
  no-`appendHeader` fallback (pre-appendHeader Node). None can affect the
  verdict on current Node; executing them on an EOL runtime would only confirm
  the already-recorded legacy-gated writes.
- Reproduction covered one runtime (v24.19.0); a tested branch cannot prove
  universal absence, but the statics are exhaustive over the shipped runtime
  files.
- What would change the verdict: nothing found suggests shared-core mutation;
  the verdict could expand only if an application composed compression with
  other middleware in ways outside this package's code (out of scope).
- Provenance (SHA-256, relative to `$PACKAGE_ROOT`):
  - index.js `332fbd6dca91e7a8937398dabf967df2d66e53908a1174a648860346fff40c61`
  - node_modules/on-headers/index.js `76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856`
  - node_modules/destroy/index.js `b54f50db059987726ce2bdadca5d66a1e3ceef183aa5f43ce61aa53f05c36cb7`
  - node_modules/safe-buffer/index.js `184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1`
  - node_modules/debug/src/node.js `a3e83594a4ce88997e2e4fc66bc942b17b9d736290ad62560c7f09d6d0989ad0`
  - node_modules/debug/src/debug.js `d8d1c1d6c387ab67c3f28d78fd0b20b9becd69442db9d3efe110ca464b509c8a`
  - node_modules/debug/src/index.js `9a34fedeb2d269c46ed94e6f13039eb0d16d866dd460ec66fa3acd78122fa9fe`
  - node_modules/vary/index.js `8e40311960636d40473c57e335bbca115036766bf150df296b941256432ab410`
  - node_modules/negotiator/index.js `2e01e2337b17fb2036c1cd4e43832370510950f0cfdfbab63d67877879c542ae`
  - node_modules/compressible/index.js `95c3bfff3e8e1719d93c7784adb4f24dc1ed3371ac2446067a58717bd9ad8bcd`
  - node_modules/bytes/index.js `893fcbbbe962dc00e40dc2e4b20e76e92d874dd257345003c6575d940e91a37f`
  - node_modules/ms/index.js `4bd92209cb9dacf3e3773e725acb7aaec43ea9e78540324e4d0f73e5ce9adef7`
  - node_modules/mime-db/index.js `2ccebf3d525708c915c6a86ffbb68e5023d34c9bc30b6b4021db9ebbc6ca9ecc`

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at
this output path.
