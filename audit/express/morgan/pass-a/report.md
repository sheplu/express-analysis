# Node.js patch audit: morgan

- Verdict: confirmed patching
- Status: complete
- Input: npm package `morgan` (Node.js HTTP request logger middleware), local source at `$PACKAGE_ROOT`
- Library: morgan 1.12.1, git clone of https://github.com/expressjs/morgan, branch master, commit `b1272e70812dbc504321eeb5a43d14b0822c150d`, source artifact (shipped runtime file: `index.js`); no local modifications observed
- Node.js baseline: main branch, commit `d44625a4b80c672215b469906ce583ce7eeeebaf`, unmodified checkout at `$NODEJS_SOURCE`
- Reproduction runtime: Node.js v24.19.0 (`node repro.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime only — `$PACKAGE_ROOT/index.js` plus resolved runtime dependencies at `$PACKAGE_ROOT/node_modules`: basic-auth 2.0.1, debug 2.6.9, depd 2.0.0, ee-first 1.1.1, ms 2.0.0, on-finished 2.4.2, on-headers 1.1.0, safe-buffer 5.1.2. Tests, docs, examples, and browser-only files out of scope
- Coverage: full-content read of all 12 runtime JS files; systematic pattern sweep (see `searches.md`); targeted Node.js source verification (lib/internal/http/{server,outgoing,incoming}.js via the lib/_http_* re-export shims, lib/internal/errors.js, lib/internal/bootstrap/realm.js); upstream corroboration via morgan HISTORY.md and the published on-headers advisory; runtime reproduction executed

## Patching verdict

**Confirmed patching — two findings, both transitive, neither a shared-prototype
or module-loading patch.**

- 1 core-backed **instance override** (F-001): via `on-headers`, morgan replaces
  the `writeHead` method on every live `http.ServerResponse` it logs (default,
  non-`immediate` mode). The prototype is never touched; the override is
  per-response and is exercised by Node core itself through the implicit-header
  path.
- 1 **shared global mutation, transient** (F-002): via `depd`, morgan's require
  step (and any later deprecation emission) temporarily replaces
  `Error.prepareStackTrace` and raises `Error.stackTraceLimit`, restoring both
  synchronously after `Error.captureStackTrace` returns. At the audited Node
  baseline, `Error.prepareStackTrace` is a core-installed function, so the write
  genuinely swaps core-managed behavior during the capture window.

No mutation of core prototypes, no `require.cache`/`Module._*`/loader-hook
interception (negative search), no core source rewrites, no patching helper
dependencies (shimmer etc.). The `on-finished` `patchAssignSocket` branch — an
instance override of `res.assignSocket` — is statically and dynamically
unreachable at the audited baseline (Node 0.8-only guard; see C-006 and
supporting context). All 24 ledger candidates were resolved; none are
unresolved.

## Confirmed Node.js patches

### F-001: `http.ServerResponse` instance `writeHead` replaced by on-headers wrapper

- Category: instance or application override (core-backed instance; no shared mutation)
- Library site(s): `$PACKAGE_ROOT/index.js:171` (`onHeaders(res, recordStartTime)`) → `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`); wrapper body `node_modules/on-headers/index.js:30-51`, re-implemented argument/header processing `:112-176`. Upstream source: https://github.com/expressjs/on-headers (v1.1.0)
- Origin: transitive — morgan 1.12.1 -> on-headers@1.1.0 (declared `~1.1.0`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-424` (`ServerResponse.prototype.writeHead = writeHead`, re-exported via `lib/_http_server.js` and `lib/http.js`); implicit-header path `$NODEJS_SOURCE/lib/internal/http/server.js:419-421` (`_implicitHeader` calls `this.writeHead(this.statusCode)`). Original behavior: core `writeHead` parses status/reason/headers and serializes the status line and headers exactly once, directly from its own arguments
- Exact mutation: own-property assignment `res.writeHead = <wrapper>` on each logged response instance, shadowing the prototype method. The wrapper (a) runs `setWriteHeadHeaders` first — sets `this.statusCode` (on-headers index.js:129) and applies any headers argument through `res.setHeader`/`res.appendHeader`/`res.removeHeader` *before* core runs; (b) fires the listener (morgan's `recordStartTime`, so `res._startAt`/`res._startTime` are captured at header-write time); (c) if the listener changed `res.statusCode`, rewrites the forwarded arguments (`args[0] = this.statusCode; args.length = 1`); (d) delegates to the saved original with the truncated argument list (headers argument is consumed by the wrapper, not passed to core)
- Execution chain: `require('morgan')` → app calls `morgan(format[, options])` → returned `logger` middleware runs per request → `onHeaders(res, recordStartTime)` (index.js:171) → write at on-headers index.js:71. Node core later invokes the wrapper either via an explicit `res.writeHead(...)` call or via `_implicitHeader` on first body write/end
- Activation: production default — every request passing through the middleware unless `options.immediate` is truthy (index.js:166-175). No env guard, no version guard
- Scope and restoration: per-response instance only; `ServerResponse.prototype.writeHead` verified identical before/after require and during a live request. Never restored — the own property persists for the life of the response object (single-use objects in practice). Multiple middlewares stack wrappers
- Resulting behavior: before — core `writeHead` processes its arguments itself in one pass; after — header/status processing is front-run by library code through the progressive header API, morgan's timer fires at header time, and core receives a possibly rewritten, headers-stripped argument list. The semantic difference is real and has upstream security history: in on-headers <1.1.0 this same wrapper mishandled array-form headers (CVE-2025-7339, "http response header manipulation"); the audited 1.1.0 copy contains the fix (removeHeader+appendHeader pass, on-headers index.js:150-176)
- Evidence: static trace above; reproduction (`repro.js`, Node v24.19.0): `res.writeHead` is an own property differing from `ServerResponse.prototype.writeHead` during a request, fires on the implicit-header path (`res.end()` with no explicit `writeHead` call — `res._startAt` recorded and status token logged), prototype unchanged (`proto_writeHead_unchanged_*: true`)
- Upstream: morgan HISTORY.md 1.10.1 ("deps: on-headers@~1.1.0 — Fix CVE-2025-7339"); advisory https://github.com/expressjs/on-headers/security/advisories/GHSA-76c9-3jph-rj3q (published, vulnerable <1.1.0, patched 1.1.0 — confirmed via GitHub API)

### F-002: `Error.prepareStackTrace` / `Error.stackTraceLimit` temporarily replaced by depd `getStack`

- Category: shared core mutation — transient, synchronously restored
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:381-398` (`getStack`; writes at :386-387, restores at :395-396). Call sites reached from morgan: depd factory `:108` and `wrapproperty` `:455` (both at require time), `log` `:199` (per emitted deprecation), `wrapfunction` `:419` (not reached by morgan). Upstream source: https://github.com/dougwilson/nodejs-depd (v2.0.0)
- Origin: transitive — morgan 1.12.1 -> depd@2.0.0 (declared `~2.0.0`)
- Core baseline: at the audited ref Node *installs* a default `Error.prepareStackTrace` (`ErrorPrepareStackTrace`, `$NODEJS_SOURCE/lib/internal/errors.js:168`, installed at `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:509`) and dispatches every `error.stack` materialization through `prepareStackTraceCallback` (`$NODEJS_SOURCE/lib/internal/errors.js:136-150`), which invokes whatever function is assigned to `globalThis.Error.prepareStackTrace`. `Error.stackTraceLimit` is the engine-wide frame-count setting
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns the raw CallSite array instead of a formatted string) and `Error.stackTraceLimit = Math.max(10, limit)`; after `Error.captureStackTrace(obj)` and reading `obj.stack`, both previous values are written back
- Execution chain: `require('morgan')` → `require('depd')('morgan')` (index.js:29) → depd factory → `getStack()` (depd index.js:108) → writes; and `deprecate.property(morgan, 'default', ...)` (index.js:198) → `wrapproperty` → `getStack()` (depd index.js:455) → writes. Later: any deprecated usage (e.g. `morgan(options)` object form, index.js:97; undefined format, index.js:101; `buffer` option, index.js:121; `morgan.default` access) → `log` → `getStack()` (depd index.js:199)
- Activation: the two require-time executions are unconditional — they run on `require('morgan')` regardless of `--no-deprecation`/`NO_DEPRECATION` (those only gate the `log` path, depd index.js:186-189). Production, no opt-out
- Scope and restoration: process-wide global (`Error` constructor properties) during a purely synchronous window; both values restored before `getStack` returns. No lasting change — verified by reproduction (post-require value is Node's own `ErrorPrepareStackTrace`; `stackTraceLimit` equal to its prior value)
- Resulting behavior: while set, any stack-trace materialization in the same synchronous window would receive depd's raw-CallSite formatting and the raised frame limit instead of Node's default formatting (including source-map-aware preparation). Because the window is synchronous and depd triggers the capture itself, practical interference is limited to re-entrant captures (e.g. from another `prepareStackTrace` hook or getter invoked during capture); the write is nevertheless a real, reachable replacement of a core-installed global function
- Evidence: static trace above; reproduction (`repro.js`): an accessor observer on `Error.prepareStackTrace` recorded exactly two write pairs during `require('morgan')` — `prepareObjectStackTrace` then restore to `ErrorPrepareStackTrace` — and `stackTraceLimit_restored: true`
- Upstream: pattern long-established in depd (same code in 1.x/2.x); V8 stack-trace API documented at https://v8.dev/docs/stack-trace-api; Node's default-install of `Error.prepareStackTrace` visible at the audited ref (lib/internal/bootstrap/realm.js:509). No upstream issue asserts breakage for this transient swap; none found necessary to the finding

## Candidate ledger and unresolved questions

Full ledger with per-candidate evidence: `candidates.md` (24 candidates: 2
confirmed, 22 rejected, 0 unresolved). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | on-headers/index.js:71, `res.writeHead` (ServerResponse instance) | confirmed -> F-001 | Own-property replacement of core-backed method; reproduced |
| C-002 | depd/index.js:386-387/:395-396, `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-002 | Transient global swap at require time; reproduced |
| C-003 | index.js:134-136/:574-577, `req._startAt`/`_startTime`/`_remoteAddress` | rejected as patch | Library-owned metadata keys; no collision in core http sources (negative grep) |
| C-004 | index.js:139-140/:171, `res._startAt`/`_startTime` | rejected as patch | Same as C-003; triggering mechanism is F-001 |
| C-005 | on-finished/index.js:147/:164, `msg.__onFinished` | rejected as patch | Library-owned bookkeeping key; no core collision |
| C-006 | on-finished/index.js:189-199, `res.assignSocket` instance override | rejected as patch (unreachable at baseline) | Guard `msg.socket === undefined` (index.js:128) cannot pass: core initializes `kSocket = null` behind a prototype accessor (outgoing.js:187/:304-316); reproduced (`socket === null`; no own `assignSocket`). Node 0.8-only legacy branch |
| C-007/C-008 | index.js:117/:469-491, `process.stdout` default stream, buffer stream | rejected as patch | Read + public `write()` only; buffer variant wraps in a new object |
| C-009/C-010 | depd defineProperty sites (:62/:485/:496-521) | rejected as patch | Targets are morgan's own exports object and depd's own Error instances |
| C-011 | depd/index.js:251/:260, `process.emit('deprecation')`, stderr write | rejected as patch | Public EventEmitter/stream API |
| C-012 | debug/src/node.js:163-226, `process.binding('tty_wrap')`, stream property sets | rejected as patch | Env-gated (`DEBUG_FD` not 1/2); mutates streams debug itself creates; private binding is read-only; copied core code replaces nothing |
| C-013 | debug/src/node.js:143-145, `process.env.DEBUG` write/delete | rejected as patch | Documented env API on own process; load-time call is value-preserving |
| C-014 | debug/src/inspector-log.js:11-14, `console._stdout` swap | rejected as patch | Dead code — not required by any runtime entrypoint in debug 2.6.9 (negative grep) |
| C-015 | safe-buffer/index.js:11-24, buffer re-export / copyProps | rejected as patch | Reads core; writes only to library objects; modern branch re-exports core module untouched |
| C-016–C-024 | feature-detect reads, `new Function` codegen, `res._header`/`req.connection` reads, on-finished state reads/listeners, AsyncResource, ee-first listeners, basic-auth header read, process reads | rejected as patch | Read-only use, library-owned write targets, or documented APIs throughout — details in `candidates.md` |

No unresolved candidates remain.

## Supporting context

- **Dormant Node 0.8 instance patch in on-finished (C-006).** `patchAssignSocket`
  (on-finished/index.js:189-199) exists precisely to monkeypatch
  `res.assignSocket` on Node 0.8, where the `'socket'` event was broken and
  `res.socket` started `undefined`. morgan's `engines` field still claims
  `>= 0.8.0`, so on a 0.8 runtime this would be a second instance override; at
  the audited baseline (and any Node >= 0.10) it is dead code.
- **Private/deprecated core API reads (no writes):** `res._header` fallback in
  morgan's `headersSent` helper (index.js:549-551; modern core exposes the
  `headersSent` getter at outgoing.js:1007-1012, making the fallback
  unreachable); `req.connection.remoteAddress` (index.js:535; deprecated alias
  accessor); `process.binding('tty_wrap')` in debug's env-gated legacy branch.
- **Copied core code not replacing core:** debug 2.6.9's
  `createWritableStdioStream` (src/node.js:163-226) is an acknowledged copy of
  old `node/src/node.js` bootstrap code; it builds debug's own output stream and
  replaces nothing in core.
- **Library-owned metadata on core instances:** `req._startAt`, `req._startTime`,
  `req._remoteAddress`, `res._startAt`, `res._startTime` (morgan),
  `msg.__onFinished` (on-finished). Verified collision-free against
  `$NODEJS_SOURCE/lib/internal/http/` and the `lib/_http_*.js` shims.
- **Baseline quirk worth recording:** at the audited Node ref the `_http_server`/
  `_http_outgoing`/`_http_incoming` modules are deprecated re-export shims
  (DEP0199) over `lib/internal/http/`; all core citations above follow the
  re-exports.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree | `cat package.json`, `git log -1`, per-dep package.json reads, `find <dep> -name '*.js'` | morgan 1.12.1 @ b1272e7; 8 resolved runtime deps pinned (versions above); 12 runtime JS files enumerated and fully read |
| `$PACKAGE_ROOT` candidate sweep | 10 bounded `rg -n --no-ignore` pattern sets over the 12 runtime files (full log in `searches.md`) | All write/replacement candidates enumerated; module-interception patterns returned zero hits (negative) |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | `grep -n "writeHead\|assignSocket\|_implicitHeader"`, `sed -n '305,335p'`, `sed -n '415,500p'` | `writeHead` prototype install :423, `_implicitHeader` :419-421, `assignSocket` :312 (emits `'socket'` :319) — baselines for F-001/C-006 |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | `grep`/`sed` targeted reads | `kSocket = null` :187, `socket` accessor :304-316, `_header` :188, `headersSent` getter :1007-1012 — C-006 unreachability, C-018 context |
| `$NODEJS_SOURCE/lib/internal/http/`, `lib/_http_*.js` | `grep -rn "_startAt\|_startTime\|_remoteAddress\|__onFinished"` | No hits (negative) — morgan/on-finished keys are collision-free |
| `$NODEJS_SOURCE/lib/internal/errors.js`, `lib/internal/bootstrap/realm.js` | `grep -n "prepareStackTrace"`, `grep -rn "ErrorPrepareStackTrace" lib/internal/bootstrap/` | Node installs default `Error.prepareStackTrace` (:168 / realm.js:509) and honors user assignment (:136-150) — baseline for F-002 |
| on-headers advisory | https://github.com/expressjs/on-headers/security/advisories/GHSA-76c9-3jph-rj3q (GitHub API, read-only) | Published; CVE-2025-7339; vulnerable <1.1.0, patched 1.1.0; audited copy is the patched 1.1.0 — demonstrates the wrapper's behavioral reach |
| morgan changelog | `$PACKAGE_ROOT/HISTORY.md` (1.10.1, 1.12.x entries) | Records the on-headers 1.1.0 bump for CVE-2025-7339; no entry suggests additional patching surface |
| Reproduction | `node repro.js "$PACKAGE_ROOT"` (Node v24.19.0; script and full JSON output summarized in `searches.md`) | Confirms F-001 (instance-only override, implicit-header interception), F-002 (two transient write/restore pairs at require), C-006 unreachability, C-003/C-004/C-005 own-property metadata |

## Coverage and limitations

- Entry points: `index.js` (sole shipped runtime file per `files` in
  package.json) plus the resolved entrypoints of all 8 installed runtime
  dependencies, including debug's root `node.js` shim and the Electron-renderer
  conditional (`src/browser.js`, not loaded under Node and not audited beyond
  reachability). `depd/lib/browser/index.js` likewise excluded (browser field
  only). Tests, docs, `.github`, karma config out of scope.
- Dependency tree fully covered at the resolved versions; no optional or
  install-script code exists in any of the 9 packages (no `postinstall`/`preinstall`).
- Node.js verification limited, per skill, to the files named above at commit
  `d44625a4b80c672215b469906ce583ce7eeeebaf`; no recursive scan of the Node tree.
- Branches not executed: `immediate` mode (statically traced: skips both
  `onHeaders` and `onFinished`, removing F-001's per-request activation but not
  F-002), `buffer` option, `DEBUG`/`DEBUG_FD`-enabled debug output, the
  `process.on('deprecation')` listener path in depd, and all Node 0.8
  compatibility branches (C-006, C-018) — each resolved statically. A tested
  branch set cannot prove universal absence, but every discovered write site was
  individually resolved.
- The reproduction runtime (v24.19.0) is older than the baseline checkout
  (main); both exhibit the same contracts relied on here (prototype `writeHead`,
  `socket` accessor over `kSocket = null`, default `Error.prepareStackTrace`).
  Verdict would change only if morgan were run on Node 0.8 (C-006 would become a
  second confirmed instance override) — explicitly out of the audited baseline.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at
this output path.
