# Node.js patch audit: send

- Verdict: confirmed patching (transient, transitive, load-time global `Error` hook swap; no permanent mutation and no shared-prototype mutation found)
- Status: complete
- Input: issue sheplu/express-analysis#23 — `send` (streaming static file server, https://github.com/pillarjs/send)
- Library: send@1.2.1, `$PACKAGE_ROOT` = pillarjs/send default branch `master` @ 092f3fc77f0e796519ac328c543c11cced8f2244; runtime deps installed with `npm install --ignore-scripts --omit=dev` (debug@4.4.3, depd@2.0.0, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, etag@1.8.1, fresh@2.0.0, http-errors@2.0.1, inherits@2.0.4, mime-db@1.54.0, mime-types@3.0.2, ms@2.1.3, on-finished@2.4.2, range-parser@1.3.0, setprototypeof@1.2.0, statuses@2.0.2, toidentifier@1.0.1)
- Node.js baseline: `$NODEJS_SOURCE` main @ d44625a4b80c672215b469906ce583ce7eeeebaf (read-only)
- Reproduction runtime: Node v24.19.0 (`repro/repro.js`, output in `repro/results.txt`)
- Scope: production/runtime only — `$PACKAGE_ROOT/index.js` (sole shipped file per package.json `files`) plus every resolved runtime dependency's entrypoint and reachable helpers. Tests, examples, docs, devDependencies, and browser-only variants excluded.
- Coverage: source complete for the scope above; upstream corroboration via depd issues #32/#36/#50; runtime reproduction executed (require + 200/206-Range/404 over a real `http.createServer` with `send(req, path).pipe(res)`).

## Patching verdict

**Confirmed patching — 2 confirmed mutations, both transient shared-global writes
from one mechanism, both transitive (send -> http-errors@2.0.1 -> depd@2.0.0),
both executed unconditionally at `require('send')`:**

- F-001: `Error.prepareStackTrace` is replaced (and then restored) by depd's
  `getStack()`. On the audited Node baseline this replaces a *Node-core-owned*
  default function installed at bootstrap, not an empty userland slot.
- F-002: `Error.stackTraceLimit` is raised to `Math.max(10, current)` (and then
  restored) in the same synchronous window.

Instance/application overrides confirmed: 0. The one candidate in that category
(on-finished's `patchAssignSocket`, C-003) is dormant legacy code whose guard is
unreachable on Node >= 18; statically verified against core and confirmed inert
at runtime. No permanent mutation of any core module, shared prototype,
global-object key, module loader, or binding was found; the runtime reproduction
measured zero steady-state differences across require and a full serve cycle.
Unresolved candidates: none.

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` — transient replacement with `prepareObjectStackTrace`

- Category: shared core mutation (global `Error` hook; transient — save/replace/restore within one synchronous call)
- Library site(s): node_modules/depd/index.js:384-386 (save + replace), :395 (restore); trigger sites node_modules/depd/index.js:108 (`depd()` factory), :199 (`log()`); consumer site node_modules/http-errors/index.js:15; entry site $PACKAGE_ROOT/index.js:15. Pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399, https://github.com/jshttp/http-errors/blob/2.0.1/index.js#L15
- Origin: transitive — send@1.2.1 -> http-errors@2.0.1 -> depd@2.0.0
- Core baseline: `$NODEJS_SOURCE` lib/internal/bootstrap/realm.js:492-510 (`setupPrepareStackTrace` installs the default as an own data property of `Error`), lib/internal/errors.js:168-170 (`ErrorPrepareStackTrace`), lib/internal/errors.js:135-161 (`prepareStackTraceCallback` dispatches `error.stack` formatting to whatever function sits on `Error.prepareStackTrace`). Original behavior: default string formatting of stacks (with source-map support routed through `internalPrepareStackTrace`).
- Exact mutation: data write `Error.prepareStackTrace = prepareObjectStackTrace` (a function returning the raw V8 `CallSite[]`), followed after `Error.captureStackTrace(obj)` + `obj.stack` read by the restoring write `Error.prepareStackTrace = <saved value>`.
- Execution chain: `require('send')` -> $PACKAGE_ROOT/index.js:15 `require('http-errors')` -> http-errors/index.js:15 `require('depd')('http-errors')` -> depd/index.js:108 `getStack()` -> depd/index.js:386 write. Second reachable chain: any depd deprecation log -> depd/index.js:199 `getStack()` (not triggered by send's own code paths, which only create 4xx/5xx errors).
- Activation: unconditional at module load; no guards, no env switch. Every process that requires send performs the swap once during require.
- Scope and restoration: process-global (all consumers of `error.stack` formatting) during the swap window; restored synchronously in the same call (depd/index.js:395). No await/IO inside the window. Restoration is faithful (same function reference), confirmed at runtime.
- Resulting behavior: during the window, any stack trace materialized in-process would be formatted as a raw CallSite array instead of Node's default string. Practical impact is confined to the synchronous window; historically it conflicted with Node's source-map machinery (`--enable-source-maps`, depd#36) and surfaces in ESM/CallSite edge cases (depd#50). After restore, behavior is identical to baseline.
- Evidence: static — depd/index.js:381-399 is the only assignment to a core/global object property in the entire runtime scope (supplemental search, searches.md). Runtime — `node repro/repro.js "$PACKAGE_ROOT"` on Node v24.19.0: an accessor trap recorded exactly two writes, both in the require phase: `prepareObjectStackTrace` then the restore of Node's own `ErrorPrepareStackTrace`; steady-state before/after snapshots show zero differences (repro/results.txt).
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed — maintainer-acknowledged design); dougwilson/nodejs-depd#36 (closed, source-maps interaction); dougwilson/nodejs-depd#50 (open, CallSite API edge case). Behavior present and unchanged in depd v2.0.0 as resolved in this tree.

### F-002: `Error.stackTraceLimit` — transient raise to `Math.max(10, limit)`

- Category: shared core mutation (global `Error` configuration property; transient — save/replace/restore)
- Library site(s): node_modules/depd/index.js:382 (save), :387 (write), :396 (restore). Pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399
- Origin: transitive — send@1.2.1 -> http-errors@2.0.1 -> depd@2.0.0
- Core baseline: V8/Node global `Error.stackTraceLimit`, default 10; consumed by `Error.captureStackTrace` frame collection (documented V8 stack-trace API; Node core treats it as writable configuration, cf. `isErrorStackTraceLimitWritable` usage in `$NODEJS_SOURCE` lib/internal/errors.js).
- Exact mutation: `Error.stackTraceLimit = Math.max(10, Error.stackTraceLimit)` then restore of the saved value.
- Execution chain: identical to F-001 (same `getStack()` body, same load-time trigger).
- Activation: unconditional at `require('send')`; also on any depd deprecation log.
- Scope and restoration: process-global during the synchronous window; restored to the exact prior value. With the default limit (10) the write is value-neutral; with a user-lowered limit (<10), any error created inside the window would capture more frames than configured.
- Resulting behavior: effectively invisible under defaults; momentarily overrides a user-configured limit below 10.
- Evidence: static as for F-001; runtime — `Error.stackTraceLimit` observed at 10 before, during both trap events, and after the run (repro/results.txt).
- Upstream: same depd issues as F-001.

## Candidate ledger and unresolved questions

Full ledger with reasons: `candidates.md` (same directory). Summary:

| ID | Site and core target | Status |
| --- | --- | --- |
| C-001 | depd/index.js:386,395 — `Error.prepareStackTrace` | confirmed -> F-001 |
| C-002 | depd/index.js:387,396 — `Error.stackTraceLimit` | confirmed -> F-002 |
| C-003 | on-finished/index.js:128-131,189-199 — instance wrap of `res.assignSocket` (core `ServerResponse.prototype.assignSocket`) | rejected as patch (dormant: guard `msg.socket === undefined` unreachable on Node >= 18 — core sets `kSocket = null` in `$NODEJS_SOURCE` lib/internal/http/outgoing.js:187 behind the `socket` accessor at :304; send attaches onFinished only to live responses, index.js:690; repro: no own `assignSocket` on any served res) |
| C-004 | on-finished/index.js:143-151 — `msg.__onFinished` expando | rejected (library-owned instance metadata) |
| C-005 | setprototypeof/index.js:3,6,12 — `__proto__`/mixin polyfill | rejected (native `Object.setPrototypeOf` always selected on Node >= 18; fallbacks mutate caller objects only) |
| C-006 | http-errors/index.js:117,160,229 — `inherits(..., Error)` | rejected (util.inherits mutates only the library ctor; `$NODEJS_SOURCE` lib/util.js) |
| C-007..C-009 | http-errors instance `setPrototypeOf`/`defineProperty`/ctor naming | rejected (library-created objects) |
| C-010 | debug/src/node.js:203-210 via common.js:287 — writes/deletes `process.env.DEBUG` at import | rejected as patch (env state write; value-neutral at init; no API replaced) |
| C-011..C-013 | debug own-function defineProperty; `util.deprecate` wrapper; inherits re-export | rejected |
| C-014..C-017 | send/index.js:155 `util.inherits(SendStream, Stream)`; own-prototype methods incl. `pipe`; res state writes; fs/stream public API | rejected (documented extension/subclass and public API usage) |
| C-018 | ee-first listener add/remove on req/res/socket | rejected (public EventEmitter API, self-cleaning) |
| C-019 | etag/index.js:22 `require('fs').Stats` | rejected (read-only instanceof check) |
| C-020..C-021 | depd `wrapfunction`/`wrapproperty`/`DeprecationError` | rejected (patching capability never invoked in this tree; http-errors only calls `deprecate(message)`) |
| C-022 | encodeurl/escape-html/fresh/ms/range-parser/statuses/toidentifier/mime-db/mime-types | rejected (pure modules; init builds own exports only) |
| C-023..C-025 | optional supports-color; on-finished AsyncResource wrap; browser-only variants | rejected (absent/public API/not loaded under Node) |

Unresolved: none.

## Supporting context

- on-finished sets a library expando `__onFinished` on core req/res instances
  (observed at runtime on streamed responses) and ee-first attaches/removes
  listeners on the response socket — private-namespace metadata and public
  EventEmitter usage, not patches.
- The on-finished "node.js 0.8 patch" (C-003) is genuine patch *code* kept for
  a runtime send no longer supports (engines >= 18). If it ever ran it would be
  a per-instance wrap-and-delegate shadow of `ServerResponse.prototype.assignSocket`,
  not a shared prototype mutation.
- debug@4.4.3 rewrites/deletes `process.env.DEBUG` during import
  (`enable(load())`) — process state, value-neutral at init, no API change.
- send mutates response *state* only through the documented ServerResponse API
  (setHeader/removeHeader/statusCode/end) and subclasses `stream.Stream` via
  `util.inherits` with its own prototype methods (including a library-owned
  `pipe` shadow on its own subclass).

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime tree (24 JS files) | six skill pattern groups + 3 supplemental `rg` searches (searches.md) | Only core/global property assignment in scope: depd/index.js:386-387,395-396 |
| $NODEJS_SOURCE lib/internal/http/outgoing.js:187,304-316; lib/internal/http/server.js:312; lib/internal/http/incoming.js:77 | targeted `grep`/`sed` reads | `socket` is `null`-initialized accessor-backed -> C-003 guard unreachable; assignSocket baseline recorded |
| $NODEJS_SOURCE lib/util.js (`inherits`) | targeted read | superCtor never mutated -> C-006/C-014 rejected |
| $NODEJS_SOURCE lib/internal/errors.js:85-170; lib/internal/bootstrap/realm.js:492-510 | targeted read | Core installs default `Error.prepareStackTrace` (`ErrorPrepareStackTrace`) at bootstrap; depd's swap replaces a core-owned function -> F-001 baseline |
| dougwilson/nodejs-depd issues | `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` | #32 (closed, design acknowledged), #36 (closed, --enable-source-maps conflict), #50 (open, CallSite edge case) — corroborate F-001/F-002 |
| jshttp/on-finished issues | `gh search issues --repo jshttp/on-finished "assignSocket"` | No upstream issue on the 0.8 patch; only unrelated #10 |
| Runtime reproduction | `node repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | 0 steady-state diffs require-phase and exercise-phase across http/fs/stream/events prototypes, Object/Array/String/Function prototypes, Object.assign, Module._load/_resolveFilename, require.extensions/cache, process.binding, global keys; trap caught exactly the 2 transient prepareStackTrace writes during require; 200/206/404 served correctly; no instance `assignSocket` override |

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (only shipped runtime file; package.json
  `files` = LICENSE/README/index.js). All 16 runtime dependencies' resolved
  entrypoints read (depd, on-finished, http-errors, debug chain in full; pure
  transforms skimmed structurally after zero-hit searches). Browser variants
  (debug/src/browser.js, depd/lib/browser, inherits_browser.js) excluded as
  unreachable under Node; `supports-color` optional require absent from the tree.
- Node.js baseline is `main` (d44625a4b80), newer than the v24.19.0 reproduction
  runtime; the facts relied on (null-initialized `kSocket`, accessor `socket`,
  bootstrap-installed `Error.prepareStackTrace`, `util.inherits` semantics) were
  additionally confirmed behaviorally on v24.19.0 by the reproduction. Exact
  line numbers cited are for the main checkout.
- Branches not executed: depd deprecation logging (`log()`/`getStack()` at
  runtime — same mechanism as F-001/F-002, statically identical), depd
  `wrapfunction`/`wrapproperty` (no caller in scope), on-finished
  `patchAssignSocket` body (unreachable guard), setprototypeof fallbacks
  (native path always taken), HEAD/dotfile/redirect/412/416 send paths (share
  the same res API surface as the exercised 200/206/404). A tested branch
  cannot prove universal absence, but every mutation-shaped site in scope is
  accounted for in the ledger.
- What would change the verdict: nothing known outstanding; removing depd (as
  some jshttp successors have done) would downgrade the verdict to "no confirmed
  patching in the inspected scope".

## Changes since the previous audit

First audit (pass B, blind — no prior pass-b report existed; pass-a artifacts not read per protocol).
