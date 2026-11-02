# Node.js patch audit: morgan

- Verdict: confirmed patching
- Status: complete
- Input: npm package `morgan` (Node.js HTTP request logger middleware), local source checkout
- Library: morgan 1.12.1, git commit b1272e70812dbc504321eeb5a43d14b0822c150d (tag 1.12.1, expressjs/morgan, branch master), source checkout with installed runtime node_modules; runtime surface `$PACKAGE_ROOT/index.js` (596 lines)
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Reproduction runtime: Node.js v24.19.0 (`node repro-writehead.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` plus resolved runtime dependencies at `$PACKAGE_ROOT/node_modules`: basic-auth@2.0.1, debug@2.6.9, depd@2.0.0, on-finished@2.4.2, on-headers@1.1.0, ee-first@1.1.1 (via on-finished), ms@2.0.0 (via debug), safe-buffer@5.1.2 (via basic-auth). Tests/docs out of scope.
- Coverage: all runtime source files of morgan and every resolved dependency read in full; targeted Node.js baseline reads (`lib/http.js`, `lib/_http_server.js`, `lib/internal/http/{server,outgoing,incoming,common,client,agent}.js`, `lib/internal/http.js`, `lib/fs.js`); upstream corroboration via jshttp/on-headers release/advisory; one live reproduction run. No unresolved candidates.

## Patching verdict

Patching is demonstrated, applied entirely through runtime dependencies that morgan activates — morgan's own code performs no patch.

- Shared core mutations (permanent): **0**. No Node.js prototype, core module export, global API, module-loading, or core-source modification persists. `ServerResponse.prototype.writeHead` verified unchanged after morgan runs (reproduction).
- Instance/application overrides: **1 confirmed (F-001)**. In its default (non-immediate) mode, morgan causes on-headers@1.1.0 to replace `res.writeHead` on every live `http.ServerResponse` instance it middles, shadowing the core prototype method with a wrapper for the lifetime of that response. Origin: morgan -> on-headers@1.1.0; activation: per request, production default.
- Transient shared-global write: **1 confirmed (F-002)**. depd@2.0.0 temporarily reassigns the global `Error.prepareStackTrace` and `Error.stackTraceLimit` (V8 stack-trace API) at morgan require time and on each deprecation log, saving and synchronously restoring the originals. Reported as a confirmed write for completeness; it has no observable lasting effect (reproduction confirms restoration).
- Conditional legacy override, not reachable at the audited baseline: on-finished's `patchAssignSocket` (`res.assignSocket` instance override) is guarded by `msg.socket === undefined`, a Node.js 0.8 condition. At the audited Node.js baseline `OutgoingMessage` initializes its socket slot to `null` behind a prototype accessor, and morgan attaches while the socket is already assigned, so the branch is dead (C-005, rejected; reproduction confirms not applied).
- Unresolved candidates: none. Excluded branches: debug's Electron-renderer entry (`src/browser.js`), depd's `browser` entry, and debug's `DEBUG_FD != 1|2` stream path are not loaded/reached in a Node.js server process (documented under coverage).

## Confirmed Node.js patches

### F-001: `res.writeHead` replaced per-instance on live `http.ServerResponse` objects (on-headers)

- Category: instance or application override (core-backed instance method shadowing; no shared prototype mutation)
- Library site(s):
  - `$PACKAGE_ROOT/index.js:171` — `onHeaders(res, recordStartTime)` (activation), https://github.com/expressjs/morgan/blob/b1272e70812dbc504321eeb5a43d14b0822c150d/index.js#L171
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` — `res.writeHead = createWriteHead(res.writeHead, listener)`, https://github.com/jshttp/on-headers/blob/v1.1.0/index.js
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:30-52` — wrapper `writeHead` implementation
- Origin: morgan@1.12.1 -> on-headers@1.1.0 (transitive)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423` (`ServerResponse.prototype.writeHead = writeHead`, implementation at 424+; re-exported via `lib/_http_server.js` and `lib/http.js`), commit d44625a4b80c672215b469906ce583ce7eeeebaf. Original behavior: `writeHead(statusCode[, reason][, headers])` records status/reason and merges the supplied headers into the outgoing header state when the header block is rendered.
- Exact mutation: an own data property `writeHead` is defined on the live response instance, shadowing the inherited core prototype method. The replacement is a closure-named `function writeHead(statusCode)` that captures the previous `res.writeHead` (the core function) and morgan's `recordStartTime` listener.
- Execution chain: app installs `morgan(format[, options])` -> returned `logger` middleware runs per request (`index.js:132`) -> default non-immediate branch (`index.js:166-175`) -> `onHeaders(res, recordStartTime)` (`index.js:171`) -> on-headers `onHeaders()` -> `res.writeHead = createWriteHead(res.writeHead, listener)` (`on-headers/index.js:71`).
- Activation: per request, at middleware execution time; production default (`opts.immediate` falsy). Not applied when `immediate: true`. No version guards.
- Scope and restoration: single `ServerResponse` instance per request; never restored — the wrapper remains the instance's own `writeHead` for the response lifetime and delegates to the saved core function. The shared `ServerResponse.prototype.writeHead` is untouched (verified by reproduction).
- Resulting behavior: before — header/status arguments are processed inside core `writeHead` when headers are rendered; after — the wrapper first re-implements argument processing itself (`setWriteHeadHeaders`, `on-headers/index.js:119-146`): it assigns `this.statusCode`, applies header-object arguments via `res.setHeader` and header-array arguments via `res.removeHeader`+`res.appendHeader` (feature-detected at `on-headers/index.js:19-20` against `OutgoingMessage.prototype.appendHeader`, `$NODEJS_SOURCE/lib/internal/http/outgoing.js:877`), fires the listener once before headers are flushed (morgan uses this to set `res._startAt`/`res._startTime`, `index.js:574-577`), may collapse the forwarded arguments to `[statusCode]`, then calls the saved core `writeHead`. Headers thus flow through the setHeader/appendHeader path instead of core's writeHead merge path — a real semantic divergence class: on-headers < 1.1.0 had an exploitable divergence here (CVE-2025-7339), fixed in the audited 1.1.0 by the appendHeader strategy.
- Evidence: static trace above; reproduction (`repro-writehead.js`, Node v24.19.0): after middleware, `resWriteHeadIsOwnProperty: true`, `resWriteHeadIsCoreFunction: false`, `prototypeWriteHeadUnchanged: true`.
- Upstream: jshttp/on-headers release v1.1.0 (fixes CVE-2025-7339, GHSA-76c9-3jph-rj3q — header-manipulation flaw in this exact wrapper, confirming it replaces core header processing); wrapping behavior is on-headers' documented purpose.

### F-002: `Error.prepareStackTrace` / `Error.stackTraceLimit` temporarily reassigned (depd)

- Category: shared global mutation — temporary, synchronously restored (V8 stack-trace API on the global `Error` constructor)
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:381-399` (`getStack()`: write at 386-387, restore at 395-396), https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js ; reached from `$PACKAGE_ROOT/index.js:29` (`require('depd')('morgan')` -> `depd/index.js:108`), `$PACKAGE_ROOT/index.js:198` (`deprecate.property` -> `depd/index.js:455`), and each `deprecate()` call (`depd/index.js:199`)
- Origin: morgan@1.12.1 -> depd@2.0.0 (transitive)
- Core baseline: the global `Error` constructor (JS intrinsic; `prepareStackTrace`/`captureStackTrace`/`stackTraceLimit` are the V8 stack-trace API exposed by the Node.js runtime). Default: `Error.prepareStackTrace` is `undefined`; `Error.stackTraceLimit` is `10`. No `$NODEJS_SOURCE/lib` file defines these (engine-level).
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` and `Error.stackTraceLimit = Math.max(10, limit)`; a stack is captured with `Error.captureStackTrace(obj)` and `obj.stack` is materialized; both globals are then restored to their saved prior values.
- Execution chain: `require('morgan')` -> `require('depd')('morgan')` -> `depd()` -> `getStack()` -> global writes; again via `deprecate.property(morgan, 'default', ...)` at module load, and on every deprecation log at runtime.
- Activation: unconditional at morgan require time (twice), plus per deprecation message; production code path, no guards.
- Scope and restoration: process-global for the duration of a synchronous window in which no other user code executes; fully restored before `getStack()` returns. Any pre-existing custom `prepareStackTrace` is preserved and reinstalled.
- Resulting behavior: within the window, stack serialization for the captured object returns raw CallSite arrays instead of strings; no lasting or externally observable behavior change in single-threaded synchronous execution.
- Evidence: static trace; reproduction: `prepareStackTraceRestored: true`, `stackTraceLimitRestored: true` after `require(morgan)`.
- Upstream: standard documented V8 stack-trace API usage pattern (the API is only usable via assignment to the `Error` global); no corrective upstream issue applicable.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` beside this report; summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:134-136` — `req._startAt/_startTime/_remoteAddress` on live `IncomingMessage` | rejected as patch | library-owned metadata keys; no collision in Node http sources (grep over `lib/internal/http/*.js`, `lib/_http_*.js`, `lib/http.js` returned zero hits) |
| C-002 | `$PACKAGE_ROOT/index.js:139-140,574-577` — `res._startAt/_startTime` on live `ServerResponse` | rejected as patch | same: additive metadata, no core member shadowed |
| C-003 | `$PACKAGE_ROOT/index.js:171` -> on-headers `index.js:71` — `res.writeHead` instance replacement | confirmed -> F-001 | shadows `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`) per instance |
| C-004 | on-finished `index.js:147` — `msg.__onFinished` on live `ServerResponse` | rejected as patch | library-owned key; no collision in Node http sources |
| C-005 | on-finished `index.js:189-199` — `res.assignSocket` instance override (`patchAssignSocket`) | rejected as patch (unreachable at baseline) | guard `msg.socket === undefined` (`index.js:128`) never true: `OutgoingMessage` sets `this[kSocket] = null` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`) behind a prototype `socket` accessor (outgoing.js:304-316), and morgan attaches after `assignSocket` ran (`server.js:312-321`), so `attachFinishedListener` early-returns at `index.js:119-123`; Node 0.8-only legacy branch; reproduction: `patchAssignSocketApplied: false` |
| C-006 | on-finished `index.js:220-235` — AsyncResource wrap | rejected as patch | documented `async_hooks` API usage; no mutation |
| C-007 | ee-first `index.js:43,62` — `ee.on`/`removeListener` on res and socket | rejected as patch | additive EventEmitter listener attach/remove with cleanup |
| C-008 | depd `index.js:381-399` — `Error.prepareStackTrace`/`stackTraceLimit` swap | confirmed -> F-002 | temporary shared-global write, synchronously restored |
| C-009 | depd `index.js:439-486` — `Object.defineProperty(obj, prop, ...)` (`wrapproperty`) | rejected as patch | target is morgan's own export object (`index.js:198`), not core |
| C-010 | depd `index.js:492-538` — `defineProperty` on new Error instance | rejected as patch | depd-owned error instance |
| C-011 | depd `index.js:251` — `process.emit('deprecation', err)` | rejected as patch | event emission on `process`; no API/behavior replaced |
| C-012 | debug `src/node.js:248` -> `src/debug.js:139` -> `src/node.js:139-147` — `process.env.DEBUG` write/delete at require time | rejected as patch | value-preserving round-trip of env state (`save(load())`); configuration state, not API behavior; reproduction: `debugEnvPreserved: true` |
| C-013 | debug `src/node.js:169` — `process.binding('tty_wrap')` | rejected as patch | read-only private API, env-gated (`DEBUG_FD` not 1/2) |
| C-014 | debug `src/node.js:187` — `new fs.SyncWriteStream(...)` | rejected as patch | env-gated branch; `fs.SyncWriteStream` no longer exported at baseline (only `lib/internal/fs/sync_write_stream.js`), branch would throw; creates a new object regardless |
| C-015 | debug `src/node.js:85-100` — `exports.formatters.o/.O` | rejected as patch | debug's own exports object |
| C-016 | safe-buffer `index.js:11-17,24` — `module.exports = buffer`, `copyProps` | rejected as patch | modern branch re-exports the core `buffer` module unmodified; `copyProps` copies from core onto library-owned objects only |
| C-017 | basic-auth `index.js` | rejected as patch | pure header read/parse; no writes to req or core |
| C-018 | ms `index.js` | rejected as patch | pure parse/format functions |
| C-019 | `$PACKAGE_ROOT/index.js:458`, depd `index.js:425` — `new Function` | rejected as patch | generates library-owned functions; no loader/module interception |
| C-020 | `$PACKAGE_ROOT/index.js:117,129` — `process.stdout` reference, `createBufferStream` | rejected as patch | stdout used as write target; buffer option wraps it in a new `{ write }` object without mutating it |
| C-021 | on-headers `index.js:19` — read of `http.ServerResponse.prototype.appendHeader` | rejected as patch | read-only feature detection at require time |
| C-022 | on-headers `index.js:129,158-180` — wrapper writes `this.statusCode`, calls `setHeader/appendHeader/removeHeader` | merged into F-001 | behavior of the confirmed wrapper; uses public per-instance APIs |
| C-023 | debug `src/node.js:63-65` — `util.deprecate(noop)()` | rejected as patch | env-gated warning emission only |
| C-024 | `$PACKAGE_ROOT/index.js:501-504,588-596` — `morgan[name] = ...` (format/token registry) | rejected as patch | writes on morgan's own export object |

Unresolved: none.

## Supporting context

- Instance metadata annotation (not patches): morgan writes `req._startAt`, `req._startTime`, `req._remoteAddress`, `res._startAt`, `res._startTime` on live core http objects (`$PACKAGE_ROOT/index.js:134-140`, set by `recordStartTime` at 574-577), and on-finished writes `res.__onFinished` (`node_modules/on-finished/index.js:147`). None of these keys exist anywhere in the Node.js http implementation at the audited baseline (negative grep over `$NODEJS_SOURCE/lib/http.js`, `lib/_http_*.js`, `lib/internal/http/*.js`), so no core member is shadowed. These names are a shared express-ecosystem convention (response-time/express use the same keys).
- Private core API reads: morgan's `headersSent()` fallback reads `res._header` (`index.js:550`) only when `res.headersSent` is not a boolean (Node 0.8 fallback; dead at baseline, where `headersSent` is defined); `getip()` reads the deprecated `req.connection` alias (`index.js:535`). debug's env-gated `createWritableStdioStream` uses `process.binding('tty_wrap')` and the removed `fs.SyncWriteStream` (C-013/C-014). Reads/instantiations only; nothing core-visible is replaced.
- Dormant legacy patch code: on-finished ships `patchAssignSocket` explicitly commented "Patch ServerResponse.prototype.assignSocket for node.js 0.8" (comment overstates: it assigns an own instance property, not the prototype). Unreachable at the audited baseline (C-005).
- debug@2.6.9 rewrites `process.env.DEBUG` with its own just-read value at require time (C-012) — environment state round-trip, not behavior modification. morgan never calls `debug.enable()` with new values.
- safe-buffer@5.1.2 (via basic-auth) resolves to a plain re-export of the core `buffer` module on any Buffer.from-capable Node (C-016).
- `new Function` code generation in morgan's `compile()` and depd's `wrapfunction` creates library-owned functions only (C-019); morgan never passes core functions to `deprecate.function`.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js` + all 8 dependency runtime files | full reads; skill pattern set P1-P6 via bounded `rg -n --no-ignore` (see `searches.md`) | all candidate sites enumerated (C-001..C-024); zero module-interception hits (P5 empty) |
| `$PACKAGE_ROOT` provenance | `git log -1` | b1272e70812dbc504321eeb5a43d14b0822c150d, tag 1.12.1, expressjs/morgan master |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | targeted read/grep: `writeHead|appendHeader|assignSocket|emit('socket'` | `ServerResponse.prototype.writeHead = writeHead` (:423, impl :424+); `assignSocket` (:312-321) assigns socket and emits `'socket'` before middleware runs; `statusCode = 200` prototype default (:285) |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | targeted read/grep: socket init, `appendHeader`, `writableEnded` | `this[kSocket] = null` (:187); `socket` prototype accessor (:304-316) — never `undefined` on a constructed response; `appendHeader` (:877); `writableEnded` accessor (:1014) |
| `$NODEJS_SOURCE` http sources (http.js, `_http_*.js`, `internal/http/*.js`, internal/http.js) | `rg -n "_startAt|_startTime|_remoteAddress|__onFinished"` | zero matches — no collision with morgan/on-finished instance keys |
| `$NODEJS_SOURCE/lib/fs.js` | `rg -c "SyncWriteStream" lib/fs.js lib/internal/fs/sync_write_stream.js` | only internal file matches — `fs.SyncWriteStream` not exported at baseline (C-014) |
| jshttp/on-headers upstream | `gh api repos/expressjs/on-headers/releases` (resolves to jshttp/on-headers) — release v1.1.0 | CVE-2025-7339 / GHSA-76c9-3jph-rj3q fixed in the audited 1.1.0 by appendHeader strategy; corroborates the wrapper's replacement of core header processing (F-001) |
| Reproduction | `node repro-writehead.js "$PACKAGE_ROOT"` (Node v24.19.0) | confirms F-001 own-property override with prototype untouched; F-002 restoration; C-005 not applied; C-012 env preserved; morgan/on-finished metadata keys own-properties only |

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (sole shipped runtime file per `package.json` `files`); no install scripts; no conditional exports. Dependencies resolved at `$PACKAGE_ROOT/node_modules` and read in full: basic-auth@2.0.1, debug@2.6.9 (`src/index.js` -> `src/node.js` -> `src/debug.js`; `ms@2.0.0`), depd@2.0.0, on-finished@2.4.2 (`ee-first@1.1.1`), on-headers@1.1.0, safe-buffer@5.1.2.
- Branches excluded as not loaded in a Node.js server process: debug `src/browser.js` (Electron-renderer only, `src/index.js:6-10`) and debug `src/inspector-log.js` (not required by any runtime file); depd `lib/browser/index.js` (bundler `browser` field only). Env-gated branches noted but not executed: `DEBUG_FD` not in {1,2} (C-013/C-014), `buffer`/`immediate` morgan options (immediate mode skips F-001 activation — stated in F-001).
- Node.js baseline: main @ d44625a4b80c672215b469906ce583ce7eeeebaf, where the http implementation lives in `lib/internal/http/` with `lib/_http_*.js` as re-export shims; file references pinned to that layout. On release lines (e.g. 22.x/24.x) equivalent code lives in `lib/_http_server.js`/`lib/_http_outgoing.js`; the reproduction on Node v24.19.0 confirms identical observable behavior there.
- Reproduction covers the default non-immediate middleware path on a real HTTP round-trip; `immediate: true`, `buffer`, and deprecation-log paths were verified statically only. A tested branch cannot prove universal absence, but every candidate write site in the inspected scope was resolved.
- What would change the verdict: none anticipated for this scope; running morgan on Node 0.8-era runtimes would make C-005 an active instance override (out of baseline scope).

## Changes since the previous audit

First audit (independent pass-b; no prior report read or updated, per double-blind protocol).
