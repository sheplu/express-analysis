# Node.js patch audit: serve-static

- Verdict: confirmed patching (one transient, synchronously-restored shared-global mutation via a transitive dependency; no persistent patch)
- Status: complete
- Input: npm package `serve-static` (Node.js static file serving middleware), pass A of a double-blind protocol
- Library: serve-static 2.2.1, git commit 6e3606f2892df213e8fa738b51a36ba711e86ce8 (https://github.com/expressjs/serve-static, branch master), source checkout with installed runtime dependencies (19 packages, no install scripts)
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (v28.0.0-pre per src/node_version.h)
- Reproduction runtime: Node.js v24.19.0 (`node repro-prepare-stack-trace.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (sole shipped runtime file per package.json `files`) plus all 19 resolved runtime dependencies under `$PACKAGE_ROOT/node_modules` (send 1.2.1, debug 4.4.3, depd 2.0.0, ee-first 1.1.1, encodeurl 2.0.1, escape-html 1.0.3, etag 1.8.1, fresh 2.0.0, http-errors 2.0.1, inherits 2.0.4, mime-db 1.54.0, mime-types 3.0.2, ms 2.1.3, on-finished 2.4.2, parseurl 1.3.3, range-parser 1.3.0, setprototypeof 1.2.0, statuses 2.0.2, toidentifier 1.0.1). Tests, docs, and release scripts out of scope.
- Coverage: source — complete (every runtime file in scope read; `send/index.js` read in full); upstream — corroborated via depd issue tracker; runtime — reproduction run on Node v24.19.0 confirming static findings. Browser-only entry variants (`debug/src/browser.js`, `depd/lib/browser/index.js`, `inherits/inherits_browser.js`) are not resolvable on Node and were excluded from activation analysis after confirming their selection guards.

## Patching verdict

Patching is demonstrated, with one confirmed finding and narrow scope:

- Shared core/global mutations: **1** (F-001) — transitive, via `send -> http-errors -> depd`. `depd`'s `getStack()` reassigns the shared globals `Error.prepareStackTrace` and `Error.stackTraceLimit`, captures a stack, then synchronously restores both. It fires unconditionally at `require('serve-static')` time. Node.js core consults `globalThis.Error.prepareStackTrace` when preparing `error.stack` ($NODEJS_SOURCE/lib/internal/errors.js:149-150), so during the write window core stack-trace preparation is redirected to depd's callback. No mutation persists after the synchronous section; reproduction confirmed write + restore and no residual change.
- Instance/application overrides: **0 reachable**. One dormant candidate exists — on-finished's `patchAssignSocket` wraps `res.assignSocket` on a single response instance (`node_modules/on-finished/index.js:195`) — but its guard `msg.socket === undefined` cannot be satisfied at the baseline: `OutgoingMessage` initializes its socket slot to `null` ($NODEJS_SOURCE/lib/internal/http/outgoing.js:187) behind a prototype accessor ($NODEJS_SOURCE/lib/internal/http/outgoing.js:304), so `res.socket` is `null` or a socket, never `undefined`. The branch is Node 0.8-only legacy code (its own comment says so) and was additionally shown unreached in a live-request reproduction.
- Core module interception / core source rewrites: **0**. No `require.cache`/`require.extensions`/`Module._*`/loader-hook/binding usage anywhere in scope.
- serve-static's own code (`index.js`) and send's `SendStream` never reassign any method or property of `req`/`res`/core prototypes; they only call documented public APIs (`setHeader`, `removeHeader`, `getHeader(Names)`, `statusCode`, `end`, `headersSent`, `pipe` into `res`, `stream.destroy()`).

No unresolved candidates remain.

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` / `Error.stackTraceLimit` transiently reassigned by depd `getStack()`

- Category: shared core/global mutation (transient, synchronously restored)
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:386-387` (writes), `:390` (capture), `:395-396` (restore) — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L398
- Origin: transitive — serve-static 2.2.1 -> send@1.2.1 (`$PACKAGE_ROOT/node_modules/send/index.js:15`) -> http-errors@2.0.1 (`$PACKAGE_ROOT/node_modules/http-errors/index.js:15`) -> depd@2.0.0
- Core baseline: `Error.prepareStackTrace` is the V8 stack-trace hook that Node.js core reads on every `error.stack` materialization — $NODEJS_SOURCE/lib/internal/errors.js:136-150 (`prepareStackTraceCallback` checks `typeof globalThis.Error?.prepareStackTrace === 'function'` and delegates to it). Default: unset (`undefined`). `Error.stackTraceLimit` is the global frame-count limit (default 10).
- Exact mutation: data-property assignment `Error.prepareStackTrace = prepareObjectStackTrace` (a function returning the raw CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)`; after `Error.captureStackTrace(obj)` and reading `obj.stack`, both are restored by assignment to the saved prior values (including restoring `undefined`).
- Execution chain: `require('serve-static')` (`$PACKAGE_ROOT/index.js:20`) -> `require('send')` (`send/index.js:15`) -> `require('http-errors')` -> `require('depd')('http-errors')` (`http-errors/index.js:15`) -> `depd()` (`depd/index.js:103`) -> `getStack()` (`depd/index.js:108` -> `:381-398`). Also re-fires from `log()` (`depd/index.js:199`) on any `deprecate()` message; in this tree send only creates 4xx/5xx errors, so the deprecation path (`http-errors/index.js:72-74`, non-4xx/5xx status) never logs during normal serve-static operation — the require-time activation is the unconditional one.
- Activation: unconditional at module load; production code; no environment or option guard.
- Scope and restoration: process-wide globals on the shared `Error` constructor; mutated only within a fully synchronous section with no user code interleaved (the only code executed under the mutation is V8 stack capture plus depd's own callback), then restored by reassignment. Edge cases: a pre-existing accessor-defined or non-writable `Error.prepareStackTrace` would observe the write or reject it (this is how the reproduction observes the writes); any third-party hook (e.g. source-map support installed via `Error.prepareStackTrace`) is bypassed for depd's own capture during the window.
- Resulting behavior: before — `error.stack` preparation uses the application/default hook; during the window — stack preparation returns raw CallSite objects per depd's callback and the frame limit is at least 10; after — prior behavior restored exactly. Practical effect: none persistent; transient interference is limited to the capture itself (historically visible as breakage with other `Error.prepareStackTrace` consumers, see Upstream).
- Evidence: static — sites above plus core consultation at $NODEJS_SOURCE/lib/internal/errors.js:149-150; dynamic — `node repro-prepare-stack-trace.js "$PACKAGE_ROOT"` (Node v24.19.0) instruments `Error.prepareStackTrace` with an accessor and observed exactly one install-write (function) followed by a restore-write (undefined) at require time, with `Error.prepareStackTrace === undefined` and `Error.stackTraceLimit` unchanged afterwards, and zero writes while serving a live request.
- Upstream: https://github.com/dougwilson/nodejs-depd/issues/32 ("Why is this library overwriting Error type?", closed) quotes exactly this `getStack()` code and discusses collisions with other `prepareStackTrace` consumers (`callSite.getFileName is not a function`); https://github.com/dougwilson/nodejs-depd/issues/36 (closed) records an interaction with Node 12 `--enable-source-maps`. The code is present and unchanged in the audited depd@2.0.0.

No other patches were demonstrated. In particular, no persistent mutation of any `http`, `stream`, `events`, or `fs` API exists anywhere in the inspected scope.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` beside this report; summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | node_modules/depd/index.js:386-396 — `Error.prepareStackTrace`/`Error.stackTraceLimit` | confirmed -> F-001 | Reachable at require time; transient, restored; core consults the hook (lib/internal/errors.js:149-150) |
| C-002 | node_modules/on-finished/index.js:128-131, 189-199 — instance override of `res.assignSocket` | rejected as patch (dormant/legacy) | Guard `msg.socket === undefined` unsatisfiable at baseline: socket slot initialized to `null` (lib/internal/http/outgoing.js:187, accessor :304); Node 0.8-only per code comment; repro shows no own `assignSocket` during a live request |
| C-003 | node_modules/debug/src/node.js:203-210 — `process.env.DEBUG` write/delete at require (common.js:287) | rejected as patch | Data write to env, idempotent (re-writes same value or deletes an absent key); no API/behavior replacement; repro: `process.env.DEBUG` unchanged |
| C-004 | node_modules/send/index.js:155, 403 — `SendStream` subclass of legacy `Stream`; own-prototype `pipe` | rejected as patch | Shadows `pipe` on its own prototype only; `Stream.prototype.pipe` (lib/internal/streams/legacy.js:17) untouched (identity verified in repro) |
| C-005 | index.js:192-193 — mutates cached parsed-URL object (`originalUrl.path/pathname`) | rejected as patch | Mutates the parseurl-cached object under the library-convention `req._parsedOriginalUrl`/`req._parsedUrl`; side effect confined to parseurl consumers; no core behavior replaced |
| C-006 | node_modules/parseurl/index.js:51, 86 — `req._parsedUrl`/`req._parsedOriginalUrl` | rejected as patch | Adds library-owned metadata to a core-backed instance; no override |
| C-007 | node_modules/on-finished/index.js:147, 164 — `msg.__onFinished` | rejected as patch | Library-owned metadata property on `res` |
| C-008 | node_modules/http-errors/index.js:117, 136-165, 205-234 — `inherits(HttpError, Error)`, `setPrototypeOf`/`defineProperty` on own errors | rejected as patch | Ordinary subclassing and mutation of errors it constructs; `Error` builtin and its prototype untouched |
| C-009 | node_modules/setprototypeof/index.js:3-16 — `obj.__proto__` fallback | rejected as patch | Exports `Object.setPrototypeOf` on modern engines; fallback mutates caller-passed objects (here: http-errors' own errors), never core objects |
| C-010 | node_modules/depd/index.js:186, 251, 260 — `process.emit('deprecation')`, `process.stderr.write` | rejected as patch | API calls / custom event emission; nothing reassigned |
| C-011 | node_modules/depd/index.js:413-485 — `wrapfunction`/`wrapproperty` (defineProperty on caller objects) | rejected as patch (unreachable) | No caller of `deprecate.function`/`deprecate.property` anywhere in this tree (search-verified) |
| C-012 | node_modules/debug/src/common.js:122 and setup assignments | rejected as patch | `defineProperty` on debug's own function objects |
| C-013 | node_modules/etag/index.js:22, 101-110 — `fs.Stats` instanceof/duck-typing | rejected as patch | Read-only type check |
| C-014 | node_modules/inherits/inherits.js — re-export of `util.inherits` | rejected as patch | Sets prototype of the new constructor only; `util` unmodified |
| C-015 | node_modules/debug/src/node.js:17-21 — `util.deprecate(() => {}, ...)` at require | rejected as patch | Wraps debug's own no-op function |
| C-016 | index.js:78-81, 200-206; node_modules/send/index.js:165-190, 253-275, 369-392, 490-592, 675-705, 736-768 — req/res usage incl. `clearHeaders` | rejected as patch | Exclusively documented public `ServerResponse`/`IncomingMessage` API calls; searches found no assignment to any req/res method or core prototype |
| C-017 | encodeurl, escape-html, fresh, range-parser, statuses, toidentifier, ms, mime-db, mime-types, ee-first (entry files) | rejected as patch | Read in full: pure computation over own data/arguments; ee-first only adds/removes its own listeners via public `on`/`removeListener` |

Unresolved: none.

## Supporting context

- serve-static/send are consumers, not patchers, of core HTTP: `stream.pipe(res)` (`index.js:124`) resolves to `SendStream.prototype.pipe` (`send/index.js:403`), which stores `this.res`, validates the path, then streams via `fs.createReadStream(...).pipe(res)` (`send/index.js:680-682`) — the normal legacy-stream to `ServerResponse` flow. Cleanup uses the public `stream.destroy()` and `onFinished(res, cb)`; error paths emit on the library-owned `SendStream` emitter or write a plain error response. send has no `_implicitHeader`, `_headers`, `_header`, or writable/readable-state access (search-verified); header handling is entirely via `getHeader`/`getHeaderNames`/`setHeader`/`removeHeader`.
- send 1.x resolves content types via `mime-types`@3 backed by the `mime-db` dataset (pure data); the old `mime` 1.x engine of send 0.x is not present in this tree.
- `fresh`, `etag`, `encodeurl`, `escape-html` are pure functions over headers/entities (C-013/C-017); `etag` reads `fs.Stats` solely for duck-typing.
- on-finished's Node 0.8 `patchAssignSocket` (C-002) is retained dormant legacy code; at the baseline, responses receive their socket via `res.assignSocket(socket)` before the request handler runs ($NODEJS_SOURCE/lib/internal/http/server.js:1410, definition :312), and even queued pipelined responses expose `socket === null`, never `undefined`. Were it ever reached, it would be an own-property wrapper on a single response instance that calls through to the original — an instance override, not a shared mutation.
- Express-family request metadata convention: parseurl caches on `req._parsedUrl`/`req._parsedOriginalUrl` (C-006) and serve-static's redirect listener mutates that cached object (C-005) so later `parseurl.original(req)` callers observe the collapsed pathname. This is cross-middleware state on a library-owned property, not a core patch.
- debug@4 writes `process.env.DEBUG` back at require time (C-003) as part of its persist-namespaces design; behaviorally a no-op at load (same value or deleting an absent key). The optional `supports-color` dependency is not installed and not resolvable from debug, so its code never runs.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime tree | `rg -n --no-ignore` sweeps per skill (imports; prototype/defineProperty; globals; patch/wrap/shim keywords; module interception; bindings/internals) — full log in `searches.md` | Module-interception and binding/internal searches: zero hits. All other hits triaged into the ledger |
| $PACKAGE_ROOT/index.js, node_modules/send/index.js (997 lines), on-finished, depd, http-errors, debug, and all 13 leaf deps | full-file reads | Only writes to core-shared state: C-001 (confirmed) and dormant C-002; everything else library-owned or public API calls |
| $NODEJS_SOURCE/lib/internal/http/outgoing.js:130-200, 304-316 | targeted read | `this[kSocket] = null` in constructor; `socket` is a prototype accessor — `res.socket` can never be `undefined`; C-002 guard unsatisfiable |
| $NODEJS_SOURCE/lib/internal/http/server.js:312-321, 1405-1415 | targeted read | `assignSocket` definition and its invocation before the request handler; pipelined responses queued with socket slot `null` |
| $NODEJS_SOURCE/lib/stream.js:55; lib/internal/streams/legacy.js:11-60 | targeted read | `require('stream')` is the legacy `Stream` with prototype `pipe`; send subclasses it and shadows `pipe` on its own prototype only |
| $NODEJS_SOURCE/lib/internal/errors.js:136-150 | targeted grep+read | Core `prepareStackTraceCallback` delegates to `globalThis.Error.prepareStackTrace` when set — establishes that F-001's write redirects core behavior during the window |
| depd upstream | https://github.com/dougwilson/nodejs-depd/issues/32 ; https://github.com/dougwilson/nodejs-depd/issues/36 | Closed issues confirming the `Error.prepareStackTrace` overwrite design and real-world collisions; code unchanged in audited depd@2.0.0 |
| Reproduction | `node repro-prepare-stack-trace.js "$PACKAGE_ROOT"` (Node v24.19.0) | PASS: observed install+restore writes to `Error.prepareStackTrace` at require time; `http.ServerResponse.prototype.setHeader/assignSocket`, `OutgoingMessage.prototype.end`, `Stream.prototype.pipe`, `EventEmitter.prototype.emit`, `process.env.DEBUG`, `Error.stackTraceLimit` all identical after require; live request added no own-property overrides on `res` and triggered no further writes |
| Lifecycle scripts | `rg '"(pre|post)?install"|"prepare"' node_modules/*/package.json package.json` | No matches — no install-time patching vector |

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (only shipped runtime file; `scripts/version-history.js` is a release tool, out of scope). All 19 runtime dependencies inspected at their resolved entrypoints; every runtime `.js` file in the dependency tree (25 files) was read or swept, with send, on-finished, depd, http-errors, debug, parseurl, and all leaf packages read in full or near-full.
- Node.js baseline files read: lib/internal/http/outgoing.js, lib/internal/http/server.js, lib/stream.js, lib/internal/streams/legacy.js, lib/internal/errors.js (targeted sections) at commit d44625a4b80c672215b469906ce583ce7eeeebaf. The baseline's `lib/_http_*.js` files are deprecated re-export shims (DEP0199) over `lib/internal/http/*`; citations use the internal files.
- Branches excluded with rationale: browser variants of debug/depd/inherits (unresolvable under Node's module resolution in this tree); `setprototypeof` legacy-engine fallbacks (modern V8 has `Object.setPrototypeOf`); on-finished's Node 0.8 branch (unreachable at baseline — this is the one item whose status would change on a Node 0.8-era runtime, far below the package's `engines: node >= 18`).
- Reproduction ran on Node v24.19.0, not on a build of the baseline commit; the baseline claims are static (file:line verified at the pinned commit). The tested-branch caveat applies: the repro exercises one GET request path; the static search coverage, not the repro, is the basis for the universal "no reassignment of req/res methods" claim.
- Upstream corroboration was limited to the depd issue tracker (directly on point); no serve-static/send/Node.js issue search was needed for the verdict since all other candidates were settled statically.
- What would change the verdict: discovery of a reachable caller of `deprecate.function`/`deprecate.property` in scope (none exist), or a runtime old enough to satisfy C-002's guard.

## Changes since the previous audit

First audit (pass A, double-blind; no prior report read or updated).
