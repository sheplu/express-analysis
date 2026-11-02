# Node.js patch audit: connect-timeout

- Verdict: confirmed patching
- Status: complete
- Input: npm package `connect-timeout` (Connect/Express request timeout middleware), local clone of https://github.com/expressjs/timeout
- Library: connect-timeout 1.9.1, branch master, commit 7377defb5b7b5a9c3d50fabd42c4dd46ad175d13, git source tree with installed runtime dependencies (sha256 of index.js: 21ee82535f98db33ec7eca17f4756da5d660970c6c17640f3693f5070337b0f2)
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (HTTP implementation under lib/internal/http/, re-exported by lib/http.js and the deprecated lib/_http_*.js shims)
- Reproduction runtime: Node.js v24.19.0 (`node repro.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: runtime entrypoint index.js (sole shipped file per package.json `files`) plus resolved runtime dependencies at $PACKAGE_ROOT/node_modules: http-errors@1.6.3 (-> depd@1.1.2, setprototypeof@1.1.0, statuses@1.5.0, inherits@2.0.3), ms@2.0.0, on-finished@2.3.0 (-> ee-first@1.1.1), on-headers@1.1.0. Tests, docs, and browser-only entrypoints (depd/lib/browser) out of scope.
- Coverage: source — all 16 runtime JS files pattern-scanned and read in full; upstream — GitHub advisory and commit-history corroboration for on-headers/on-finished; runtime — single reproduction on Node v24.19.0 confirming all static findings. No unresolved candidates.

## Patching verdict

**Confirmed patching.** connect-timeout does not itself write to any Node.js
core API, global, or prototype, but its runtime dependency graph applies:

- **1 per-request core-backed instance override (direct dependency, always
  active):** on-headers replaces `res.writeHead` on every `ServerResponse`
  instance the middleware touches (F-001). connect-timeout activates it
  unconditionally for every request (index.js:66).
- **1 transient shared-global mutation (transitive dependency, fires at
  require time):** depd temporarily reassigns `Error.prepareStackTrace` and
  `Error.stackTraceLimit` on the global `Error` constructor, with synchronous
  save/restore (F-002). It fires six times during `require('connect-timeout')`
  and again on each deprecation log.
- **1 conditional instance override, dormant on the audited baseline:**
  on-finished ships a `res.assignSocket` instance wrapper explicitly labeled a
  "node.js 0.8 patch" (F-003). Its guard (`msg.socket === undefined`) cannot
  pass on the audited Node.js baseline, where `OutgoingMessage` initializes the
  socket slot to `null`; it is reachable only on legacy Node ~0.8 runtimes,
  which the package's `engines` field (`>= 0.8`) still admits.

There are no shared prototype mutations that persist, no mutations of core
module exports, no module-loading interception (zero hits for require.cache /
require.extensions / Module._* / ESM hooks), no native-binding or Node-internal
module access, and no core source rewrites. connect-timeout's own writes on
`req` (`timedout`, `clearTimeout`) are new library-owned keys that shadow no
core member. No candidates remain unresolved.

## Confirmed Node.js patches

### F-001: `ServerResponse` instance `writeHead` replaced by on-headers wrapper

- Category: instance override (core-backed `http.ServerResponse` instances; shared prototype untouched)
- Library site(s): node_modules/on-headers/index.js:71 (write), :30-52 (wrapper), :119-180 (re-implemented argument/header handling); activated by $PACKAGE_ROOT/index.js:66 — https://github.com/expressjs/timeout/blob/7377defb5b7b5a9c3d50fabd42c4dd46ad175d13/index.js#L66, https://github.com/jshttp/on-headers/blob/v1.1.0/index.js#L71
- Origin: connect-timeout@1.9.1 -> on-headers@1.1.0 (direct runtime dependency)
- Core baseline: $NODEJS_SOURCE/lib/internal/http/server.js:423-424 (`ServerResponse.prototype.writeHead = writeHead`, a data property on the prototype; re-exported via lib/http.js and the deprecated lib/_http_server.js shim). Core `writeHead(statusCode[, reason][, headers])` validates the status code, sets statusMessage/statusCode, and merges the headers argument into `[kOutHeaders]` or the raw header string (server.js:424-480).
- Exact mutation: `res.writeHead = createWriteHead(res.writeHead, listener)` — an own `writeHead` data property is created on the response instance, shadowing the prototype method. The saved original (`prevWriteHead`, the prototype function on first wrap) is retained in a closure and invoked by the wrapper.
- Execution chain: `require('connect-timeout')` -> middleware returned by `timeout(time, options)` -> per request: index.js:66 `onHeaders(res, fn)` -> on-headers/index.js:71 write.
- Activation: unconditional for every request passing through the middleware; production path; no environment or version guard. Applied once per response instance per onHeaders call (the middleware calls it once).
- Scope and restoration: per `ServerResponse` instance; never restored — the own property persists for the instance lifetime. `ServerResponse.prototype.writeHead` itself is never written (verified by reproduction 2d), so responses outside the middleware are unaffected.
- Resulting behavior: before — core writeHead applies status/headers and flushes the header state in one native path. After — the wrapper first re-implements the argument parsing itself (`this.statusCode = statusCode`; array headers applied via `removeHeader`+`appendHeader` (or `setHeader` on old Node), object headers via `setHeader`), fires the registered listener exactly once before headers are committed (connect-timeout's listener clears the timeout timer), honors a listener-modified `this.statusCode` by rewriting the forwarded status argument and truncating args to length 1 (dropping a custom reason phrase in that case), then delegates to the saved core method with the trimmed argument list. Duplicate-header and validation behavior therefore follows the setHeader/appendHeader path rather than core writeHead's own merge logic.
- Evidence: static — complete write inventory P-7 (searches.md) plus wrapper source; reproduction R-01 on Node v24.19.0: `res` gains own `writeHead` only after the middleware runs (2a/2b), instance method differs from prototype method (2c), prototype identity unchanged (2d).
- Upstream: wrapper design is on-headers' documented mechanism since 1.0.0. GHSA-76c9-3jph-rj3q / CVE-2025-7339 (on-headers < 1.1.0, "http response header manipulation", patched in exactly the audited 1.1.0) demonstrates this wrapper's re-implementation can diverge from core behavior; 1.1.0 copies leading arguments and switched the array path to remove+append.

### F-002: transient reassignment of global `Error.prepareStackTrace` / `Error.stackTraceLimit` by depd

- Category: shared core-global mutation (temporary, save/restore; hooks on the global `Error` constructor that Node.js core itself coordinates on)
- Library site(s): node_modules/depd/index.js:366-380 (`getStack`: swap at :370-371, restore at :379-380); node_modules/depd/lib/compat/index.js:21-43 (same swap in the lazy `callSiteToString` probe, :30-31 and :39-40) — https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/index.js#L365-L383
- Origin: connect-timeout@1.9.1 -> http-errors@1.6.3 -> depd@1.1.2 (transitive)
- Core baseline: `Error.prepareStackTrace` is the V8 stack-trace customization hook on the JavaScript global `Error`; Node.js core installs and dispatches its own per-realm prepareStackTrace machinery ($NODEJS_SOURCE/lib/internal/errors.js:91-126; lib/internal/source_map/prepare_stack_trace.js). `Error.stackTraceLimit` globally bounds captured frames.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns raw CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)` (compat probe: `= 2`); originals saved to locals first, `Error.captureStackTrace(obj)` executed, then both restored.
- Execution chain: $PACKAGE_ROOT/index.js:15 `require('http-errors')` -> http-errors/index.js:15 `require('depd')('http-errors')` -> depd/index.js:110 `getStack()`; also depd/index.js:11 property access fires the compat lazy getter (compat/index.js:53-71 -> :21-43); also http-errors/index.js:247 `deprecate.function(...)` -> depd/index.js:404 `getStack()`; thereafter on every `deprecate()` log (depd/index.js:183).
- Activation: unconditional at `require('connect-timeout')` (module load, production path); recurs whenever http-errors emits a deprecation (e.g. non-4xx/5xx status passed to `createError`). Not reached per request in connect-timeout's normal flow (`createError(503, ...)` triggers no deprecation).
- Scope and restoration: process-global while held; restored synchronously within the same job before any other user code runs — no awaits or I/O between swap and restore. A throw from `Error.captureStackTrace`/the getter chain could in principle skip restoration (no try/finally), but no such path is reachable here.
- Resulting behavior: during the swap, any stack capture formats via depd's `prepareObjectStackTrace` instead of Node's source-map-aware default, and the frame limit is altered; observable only to synchronous re-entrancy (e.g. another prepareStackTrace getter). After restore, behavior is identical to baseline.
- Evidence: static — P-8 inventory (searches.md); reproduction R-01: an accessor planted on `Error.prepareStackTrace` recorded exactly 6 writes (3 swap/restore pairs) during `require()` of the package, with the original value restored afterwards (1a/1b).
- Upstream: standard depd behavior since 1.x (dougwilson/nodejs-depd, getStack unchanged through 1.1.2); the pattern follows the documented V8 stack-trace API (https://v8.dev/docs/stack-trace-api), referenced by Node core itself at lib/internal/errors.js:93.

### F-003: `ServerResponse` instance `assignSocket` override by on-finished ("node.js 0.8 patch") — dormant on the audited baseline

- Category: instance override (core-backed `ServerResponse`), conditionally activated; dormant/legacy on the audited Node.js baseline
- Library site(s): node_modules/on-finished/index.js:186-196 (`patchAssignSocket`, write at :192), guard at :126-129 — https://github.com/jshttp/on-finished/blob/v2.3.0/index.js#L186-L196
- Origin: connect-timeout@1.9.1 -> on-finished@2.3.0 (direct runtime dependency)
- Core baseline: $NODEJS_SOURCE/lib/internal/http/server.js:312-321 (`ServerResponse.prototype.assignSocket` — attaches the socket, emits `'socket'`, flushes). The constructor initializes the socket slot to `null`, never `undefined` ($NODEJS_SOURCE/lib/internal/http/outgoing.js:187 `this[kSocket] = null`; `socket` prototype accessor at outgoing.js:304).
- Exact mutation: `res.assignSocket = function _assignSocket(socket) { assignSocket.call(this, socket); callback(socket) }` — own property shadowing the prototype method; original captured at :187 and delegated to; never restored.
- Execution chain: $PACKAGE_ROOT/index.js:62 `onFinished(res, fn)` -> on-finished/index.js:52 `attachListener` -> :147 `attachFinishedListener` -> :126 `if (msg.socket === undefined)` -> :128 `patchAssignSocket(msg, onSocket)`.
- Activation: conditional and **not reachable through connect-timeout on the audited baseline**: the middleware runs mid-request when `res.socket` is already a socket (the `if (msg.socket)` branch at :117 returns first), and even for a detached response modern core yields `null`, not `undefined`. Reachable only on legacy Node ~0.8, where the socket slot started `undefined` and `res.on('socket')` was broken (comment at :191); the package's `engines: >= 0.8` still admits such runtimes.
- Scope and restoration: per instance when activated; no restoration. Prototype never written.
- Resulting behavior (when active): core `assignSocket` runs unchanged, then on-finished's socket callback fires — an observation wrapper that preserves core semantics while adding a hook core did not provide on 0.8.
- Evidence: static — P-4/P-7 (searches.md) and guard analysis against outgoing.js:187; reproduction R-01 on Node v24.19.0: `res` has no own `assignSocket` after the middleware (4b), prototype unchanged (4c), guard value false (4d).
- Upstream: jshttp/on-finished commits e5f64aa8d7 ("build: restore compatiblity with node 0.8", 2014-05-25) and 87eff30f33 ("build: ignore 0.8 code since istanbul does not run", 2015-12-19) confirm the code is acknowledged legacy-0.8-only.

## Candidate ledger and unresolved questions

Full ledger with per-candidate traces: candidates.md (28 candidates: 3 confirmed
across 5 sites, 24 rejected, 1 out of runtime scope, 0 unresolved). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | index.js:48,60 `req.timedout` on IncomingMessage | rejected as patch | new library-owned key; no `timedout` in lib/internal/http/incoming.js; repro 3a/3c |
| C-002 | index.js:56 `req.clearTimeout` on IncomingMessage | rejected as patch | new library-owned method; core has `setTimeout` (incoming.js:257) but no `clearTimeout`; global untouched; repro 3b/3d |
| C-003 | index.js:49 `req.emit('timeout', delay)` | rejected as patch | event emission, not a write; name collides with core `'timeout'` (server.js:929-934) — supporting context |
| C-004 | index.js:66 `onHeaders(res, ...)` | confirmed -> F-001 | per-request activation of the writeHead wrapper |
| C-005 | index.js:62 `onFinished(res, ...)` | rejected as patch | listener registration; leads to C-009/C-010 |
| C-006 | index.js:47,57,63,67 global timers | rejected as patch | ordinary API use, no reassignment |
| C-007 | on-headers/index.js:71 `res.writeHead =` wrapper vs server.js:423 | confirmed -> F-001 | instance override; prototype unchanged (repro 2a-2d) |
| C-008 | on-headers/index.js:19 appendHeader probe | rejected as patch | read-only feature detection |
| C-009 | on-finished/index.js:145,162 `msg.__onFinished` | rejected as patch | library-owned metadata key (repro 4a) |
| C-010 | on-finished/index.js:186-196 `res.assignSocket =` vs server.js:312 | confirmed -> F-003 | real override site, guard unpassable on baseline (outgoing.js:187; repro 4b-4d); legacy 0.8 only |
| C-011 | on-finished/index.js:31-33 defer | rejected as patch | capture/use of setImmediate/nextTick |
| C-012 | depd/index.js:366-380 Error.prepareStackTrace/stackTraceLimit swap | confirmed -> F-002 | transient global write with save/restore; fires at require (repro 1a/1b) |
| C-013 | depd/lib/compat/index.js:21-43 same swap | confirmed -> F-002 (second site) | fired by lazy getter at depd load |
| C-014 | depd/index.js:397-417 wrapfunction (eval) | rejected as patch | wraps caller-supplied function; only used on http-errors' own export (index.js:247) |
| C-015 | depd/index.js:423-470 wrapproperty/defineProperty | rejected as patch | not activated in this graph; caller-owned targets |
| C-016 | depd/index.js:235 `process.emit('deprecation')` | rejected as patch | custom event emission on core emitter, no mutation |
| C-017 | depd/index.js:476-522 DeprecationError defineProperties | rejected as patch | library-created error instance |
| C-018 | depd/lib/browser/index.js | out of scope | browser-only entrypoint, not loaded by Node |
| C-019 | http-errors/index.js:121,164,211 inherits(..., Error) | rejected as patch | ordinary inheritance; writes nothing on Error/Error.prototype |
| C-020 | http-errors/index.js:143,190 setPrototypeOf(err, ...) | rejected as patch | [[Prototype]] of library-created `new Error(...)` instances |
| C-021 | http-errors/index.js:146-207 defineProperty message/name | rejected as patch | same library-owned instances |
| C-022 | http-errors/index.js:93,140,187 Error.captureStackTrace | rejected as patch | supported capture API, no reassignment |
| C-023 | http-errors/index.js:247 `exports["I'mateapot"]` wrap | rejected as patch | wraps the library's own export |
| C-024 | setprototypeof/index.js:1-15 | rejected as patch | pure helper; `Object.setPrototypeOf` on modern Node; only library-owned targets in this graph |
| C-025 | statuses/index.js export population | rejected as patch | own exports only |
| C-026 | ms/index.js | rejected as patch | no core API usage at all |
| C-027 | ee-first/index.js:43,62 ee.on/removeListener | rejected as patch | supported EventEmitter API |
| C-028 | nested inherits@2.0.3 | rejected as patch | re-export of util.inherits |

No unresolved candidates.

## Supporting context

- **`req.timedout` / `req.clearTimeout` (index.js:48/56/60):** new per-request
  own properties on the core-backed `IncomingMessage` instance — documented
  library API, shadowing nothing in core (incoming.js has no such members).
  Request metadata / library-owned extension, not patching.
- **`'timeout'` event-name collision (index.js:49):** connect-timeout emits
  `'timeout'` on `req` with a number payload, while core emits the same event
  on req/res from `socketOnTimeout` with the socket as payload
  ($NODEJS_SOURCE/lib/internal/http/server.js:929-934) and
  `req.setTimeout(cb)` registers listeners on that same name
  (incoming.js:257-259). Listeners attached either way can be triggered by the
  other source with an unexpected argument type. Behavioral overlap through a
  supported emitter API — not a mutation.
- **on-finished private-API reads:** `isFinished` reads `msg.finished`,
  `msg.complete`, `msg.upgrade`, `socket.writable/readable`
  (on-finished/index.js:65-80). `finished` is a real (deprecated) data property
  initialized in core (outgoing.js:180). Reads only.
- **on-headers feature probe:** read of
  `http.ServerResponse.prototype.appendHeader` at module load
  (on-headers/index.js:19).
- **http-errors/setprototypeof/inherits:** all prototype and defineProperty
  operations target library-created error objects and library-owned
  constructors (HttpError/ClientError/ServerError); `Error` itself is only
  subclassed and `Error.captureStackTrace` called — supported extension.
- **depd `eval` wrapper (depd/index.js:410):** arity-preserving deprecation
  wrapper applied solely to http-errors' own `ImATeapot` export at load.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime tree (16 JS files) | skill pattern set P-1..P-6 + supplemental P-7..P-9 (`rg -n --no-ignore`, full log in searches.md) | complete write inventory; P-5 (module interception) and P-6 (bindings/internals) zero hits |
| $PACKAGE_ROOT/index.js, node_modules/{on-headers,on-finished,depd,http-errors,setprototypeof,statuses,ms,ee-first,inherits} | full-file reads | all candidate traces in candidates.md; sha256 hashes in Coverage section |
| $NODEJS_SOURCE/lib/http.js, lib/_http_server.js | follow re-exports | HTTP implementation at this ref lives in lib/internal/http/; _http_server.js is a deprecated shim (DEP0199) |
| $NODEJS_SOURCE/lib/internal/http/server.js | `rg -n` writeHead/assignSocket/'timeout' + reads :312-330, :423-480, :929-934 | baselines for F-001, F-003, and the 'timeout' event collision |
| $NODEJS_SOURCE/lib/internal/http/incoming.js | `rg -n timedout|clearTimeout|setTimeout|'timeout'` | only `setTimeout` at :257; proves C-001/C-002 are new keys |
| $NODEJS_SOURCE/lib/internal/http/outgoing.js | reads :160-200, :285-310 | `this.finished = false` (:180), `this[kSocket] = null` (:187), socket accessor (:304) — F-003 guard unpassable |
| $NODEJS_SOURCE/lib/internal/errors.js, lib/internal/source_map/prepare_stack_trace.js | `rg -n prepareStackTrace` | Node core's own prepareStackTrace machinery — context for F-002 |
| GitHub Advisory Database | `gh api '/advisories?affects=on-headers'` | GHSA-76c9-3jph-rj3q / CVE-2025-7339: on-headers < 1.1.0 header manipulation via this wrapper; audited 1.1.0 is the first patched version |
| jshttp/on-finished history | `gh api 'repos/jshttp/on-finished/commits?path=index.js'` | e5f64aa8d7 (2014) / 87eff30f33 (2015): patchAssignSocket is acknowledged Node-0.8 legacy code |
| Reproduction | `node repro.js "$PACKAGE_ROOT"` (script beside report), Node v24.19.0 | confirms F-001 instance-only override, F-002 require-time swap+restore (6 writes), F-003 dormancy, C-001/C-002 new keys |

## Coverage and limitations

- Entry points: index.js is the only shipped runtime file (package.json
  `files`); all four declared runtime dependencies and their transitive runtime
  dependencies (depd, setprototypeof, statuses, inherits, ee-first) read in
  full at the installed, lockfile-resolved versions listed in Scope.
- Node.js files read (targeted, per skill table): lib/http.js (re-exports),
  lib/_http_server.js (shim tail), lib/internal/http/server.js (:312-330,
  :423-480, :929-934), lib/internal/http/incoming.js (:257-260),
  lib/internal/http/outgoing.js (:160-200, :285-310), plus `rg` for
  prepareStackTrace in lib/internal/errors.js. No recursive core-tree scans.
- Branches excluded: tests/, docs, examples; depd/lib/browser (browser-only
  mapping); depd/lib/compat/callsite-tostring.js and event-listener-count.js
  are loaded only on legacy runtimes lacking `CallSite.toString`/
  `EventEmitter.listenerCount` — read anyway; they contain no writes to core
  objects.
- Limitations: (1) F-003's active behavior on genuine Node 0.8 was not
  executed (no such runtime); dormancy on modern Node is proven statically and
  by reproduction, activation on 0.8 is established from the guard semantics
  and upstream commit history. (2) The reproduction covers one runtime
  (v24.19.0); the Node baseline for static comparison is main@d44625a4b80,
  which is newer than any LTS — on older supported lines the same contracts
  hold via lib/_http_server.js / _http_outgoing.js, but line numbers differ.
  (3) `ms`, `statuses`, `ee-first` codes.json/data paths were pattern-scanned
  and read; no dynamic code generation exists there. Nothing else would be
  expected to change the verdict.
- Provenance hashes (sha256, relative to $PACKAGE_ROOT):
  - index.js 21ee82535f98db33ec7eca17f4756da5d660970c6c17640f3693f5070337b0f2
  - node_modules/on-headers/index.js 76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856
  - node_modules/on-finished/index.js b0314432e091ecc1f7095ac5f49c6705d5fb559b0c3fd22e2d750ef59e76fa24
  - node_modules/depd/index.js 244dbbca14b8aa9c9b6be04912283ab704b92f11dcb9b23beb2ba81402fecc99
  - node_modules/depd/lib/compat/index.js 76baf83317ac81045cefb9fcc8ec0d8e47dd0cfcbadd592f480349412e161861
  - node_modules/http-errors/index.js ddbc667ac4552a98c35705903989470feb9e0269d3db4823b04beef432777684
  - node_modules/setprototypeof/index.js a6f0cb10a8015d386fb71416031b55fa0df423a69da629f4a07aadb4763acb12
  - node_modules/statuses/index.js 4f8b0e8e9e9cff773ba540daf8a065d9b19b2ee1d108acc0172614f81b11ef0b
  - node_modules/ms/index.js 4bd92209cb9dacf3e3773e725acb7aaec43ea9e78540324e4d0f73e5ce9adef7
  - node_modules/ee-first/index.js 29d3cccddc7148f48715bfc94eb6f7b9f9132a5ecb704b9d4b713de87e7603dd
  - node_modules/http-errors/node_modules/inherits/inherits.js 7af9a5f76c00f72bed44b83824a8acd67febcfd3d34fd293c20c35aa7e6657f6

## Changes since the previous audit

First audit (independent pass-b of a double-blind protocol; no prior report
read or updated).
