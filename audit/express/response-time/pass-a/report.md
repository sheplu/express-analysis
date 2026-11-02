# Node.js patch audit: response-time

- Verdict: confirmed patching
- Status: complete
- Input: npm package `response-time` (Node.js X-Response-Time header middleware), local clone at `$PACKAGE_ROOT`
- Library: version 2.3.4, git commit `3bd2651ea7fcf409ea780954e3113b3aaa0feb84` (https://github.com/expressjs/response-time, branch master), source checkout; runtime dependencies installed at `$PACKAGE_ROOT/node_modules`: depd@2.0.0, on-headers@1.1.0 (lockfile-verified integrity hashes)
- Node.js baseline: main branch, commit `d44625a4b80c672215b469906ce583ce7eeeebaf` at `$NODEJS_SOURCE`
- Reproduction runtime: Node.js v24.19.0 (scripts `repro-onheaders.js`, `repro-depd.js` beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (sole shipped runtime file per `package.json` `files`) plus resolved runtime dependencies depd@2.0.0 (`node_modules/depd/index.js`) and on-headers@1.1.0 (`node_modules/on-headers/index.js`). Tests, docs, CI excluded.
- Coverage: source — full read of all three runtime files plus depd's browser entry; upstream — changelogs, GitHub security advisory GHSA-76c9-3jph-rj3q (read-only `gh api`); runtime — two reproductions executed. No limitations material to the verdict.

## Patching verdict

Patching is demonstrated, entirely through runtime dependencies; `$PACKAGE_ROOT/index.js` itself contains no mutating write to any core object.

- Instance/application overrides: **1** — on-headers assigns an own `writeHead` property on every `http.ServerResponse` instance passed through the middleware, shadowing `ServerResponse.prototype.writeHead` for that response (F-001). Fires per-request, unconditionally, in the normal production path.
- Shared core/global mutations: **1** — depd temporarily writes the process-global `Error.prepareStackTrace` and `Error.stackTraceLimit` during synchronous stack capture, then restores both (F-002). Fires unconditionally at `require('response-time')` time, and again only on a deprecated-API call path.
- No shared-prototype mutation, no module-loading interception, no core source rewrite, no `internalBinding`/`process.binding` use. All candidates resolved; none unresolved.

## Confirmed Node.js patches

### F-001: per-instance override of `http.ServerResponse` `writeHead` (on-headers)

- Category: instance or application override (core-backed instance override; prototype untouched)
- Library site(s):
  - `$PACKAGE_ROOT/index.js:55` — `onHeaders(res, function onHeaders () { ... })` inside the returned middleware
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` — `res.writeHead = createWriteHead(res.writeHead, listener)`
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:30-52` — replacement `writeHead` wrapper
  - Pinned source: https://github.com/jshttp/on-headers/blob/v1.1.0/index.js
- Origin: transitive — response-time@2.3.4 -> on-headers@1.1.0 (`dependencies: "on-headers": "~1.1.0"`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-520` (`ServerResponse.prototype.writeHead = writeHead`), re-exported through `$NODEJS_SOURCE/lib/_http_server.js:34`. Core `writeHead` validates statusCode 100-999, sets `statusMessage`/`statusCode`, merges header arguments into `kOutHeaders` only when the progressive API was already used, otherwise passes the raw header argument straight to `_storeHeader` (fast path), then builds the status line (`:486-497`) and stores the header (`:520`).
- Exact mutation: own-property assignment `res.writeHead = <wrapper>` on each `ServerResponse` instance; the wrapper closes over the previous `res.writeHead` (normally the prototype method) and a `fired` flag.
- Execution chain: `require('response-time')()` returns middleware -> per request `responseTime(req, res, next)` (`index.js:52`) -> `onHeaders(res, listener)` (`index.js:55`) -> write at `on-headers/index.js:71`. The wrapper then fires on the first `writeHead` invocation — explicit, or implicit via `res.end()` -> `_implicitHeader()` -> `this.writeHead(this.statusCode)` (`$NODEJS_SOURCE/lib/internal/http/server.js:419-421`), which dispatches to the instance property.
- Activation: unconditional production path; installed for every request/response handled by the middleware, no guards, no opt-out.
- Scope and restoration: limited to response instances passed through the middleware; `ServerResponse.prototype.writeHead` is never touched (verified by reproduction). No un-wrap — the own property persists for the response's lifetime; the wrapper delegates to the saved original.
- Resulting behavior (before/after):
  - Before: header arguments to `writeHead(code[, reason][, headers])` may take core's fast path directly into `_storeHeader` without becoming visible to `getHeader()`.
  - After: the wrapper's `setWriteHeadHeaders` (`on-headers/index.js:119-146`) re-implements header-argument processing by always calling `res.setHeader`/`res.appendHeader`/`res.removeHeader` before delegating, forcing the progressive path and making such headers observable and mutable pre-flush; it sets `this.statusCode = statusCode` (`:129`) before core validation runs (an invalid code is assigned to the instance property before the original throws); it strips the header argument from the delegated call; the response-time listener runs once just before headers flush and injects `X-Response-Time` via `res.setHeader` (`$PACKAGE_ROOT/index.js:96`); if the listener changes `res.statusCode`, the updated code is passed along and any custom reason phrase argument is dropped (`on-headers/index.js:44-47`, `args.length = 1`).
  - Practical effect for this package: timing header added to every response; `writeHead` semantics subtly differ from core for responses under the middleware.
- Evidence: static trace above; reproduction `node repro-onheaders.js "$PACKAGE_ROOT"` (Node v24.19.0) — output: own `writeHead` before middleware `false`, after `true`; `res.writeHead === ServerResponse.prototype.writeHead` `false`; prototype unchanged `true`; `x-response-time` header set on the implicit (`res.end()`) path `true`.
- Upstream: on-headers HISTORY 1.0.2 — "Fix `res.writeHead` patch missing return value" (upstream itself calls it a patch). CVE-2025-7339 / GHSA-76c9-3jph-rj3q ("on-headers vulnerable to http response header manipulation", severity low, vulnerable `<1.1.0`, published 2025-07-17; confirmed via read-only `gh api`) — a bug in exactly this wrapper's array-header handling; the audited on-headers@1.1.0 contains the fix, and response-time 2.3.4 was released specifically to pick it up (`$PACKAGE_ROOT/HISTORY.md`, 2.3.4 entry).

### F-002: temporary write of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd)

- Category: shared core mutation — process-global, temporary (synchronous save/restore within one tick)
- Library site(s):
  - `$PACKAGE_ROOT/index.js:16` — `var deprecate = require('depd')('response-time')` (module top level)
  - `$PACKAGE_ROOT/node_modules/depd/index.js:381-399` — `getStack()`: saves `Error.stackTraceLimit` (`:382`) and `Error.prepareStackTrace` (`:384`), assigns `Error.prepareStackTrace = prepareObjectStackTrace` (`:386`) and `Error.stackTraceLimit = Math.max(10, limit)` (`:387`), calls `Error.captureStackTrace(obj)` (`:390`), reads `obj.stack` (`:393`, which invokes the replacement), restores both (`:395-396`)
  - Pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js
- Origin: transitive — response-time@2.3.4 -> depd@2.0.0 (`dependencies: "depd": "~2.0.0"`)
- Core baseline: `Error.prepareStackTrace`/`Error.stackTraceLimit` are V8 stack-trace APIs on the shared `Error` global that Node.js core itself consults: `$NODEJS_SOURCE/lib/internal/errors.js:136-163` `prepareStackTraceCallback` checks `globalThis.Error?.prepareStackTrace` (`:149-150`) and the main-context `Error.prepareStackTrace` (`:155-156`) and, when a userland function is assigned, calls it instead of Node's `defaultPrepareStackTrace` (`:96-112`). Node core uses the same transient save/assign/restore pattern on `Error.stackTraceLimit` internally (`lib/internal/errors.js:181-188`, `:416-419`).
- Exact mutation: data-property assignment on the global `Error` constructor — `Error.prepareStackTrace` replaced by depd's `prepareObjectStackTrace` and `Error.stackTraceLimit` raised to `max(10, current)`; both restored to the saved values immediately after one `Error.captureStackTrace` + `obj.stack` read.
- Execution chain:
  1. Unconditional, at load: `require('response-time')` -> `index.js:16` -> `depd('response-time')` -> `getStack()` at `depd/index.js:108` (used to resolve the caller file for `deprecate._file`).
  2. Conditional, at call: `responseTime(<number>)` (deprecated back-compat form, `index.js:41-44`) -> `deprecate(...)` -> `log()` -> second `getStack()` at `depd/index.js:199`. Not reached for object/function/omitted options. `NO_DEPRECATION`/`process.noDeprecation` suppress the log output, not the require-time capture.
- Activation: path 1 fires on every process that loads response-time, with no guards; path 2 only on deprecated API usage.
- Scope and restoration: process-global `Error` affects all realms' stack formatting during the window, but the window is fully synchronous within the `require`/call — no user or async code runs inside it, and both properties are restored (verified by reproduction). A pre-existing userland `Error.prepareStackTrace` is bypassed only for depd's own capture and is reinstated afterwards.
- Resulting behavior: during the window, any stack string materialization would use `prepareObjectStackTrace` (returns raw CallSite array) via Node's `prepareStackTraceCallback`; in practice only depd's own `obj.stack` is read. After restore, behavior is identical to before. Residual edge cases: an accessor-defined `Error.prepareStackTrace` installed by another tool (e.g. an APM or source-map library) observes the extra get/set cycle; under `--frozen-intrinsics` the assignment would throw at `require` time.
- Evidence: static trace above; reproduction `node repro-depd.js "$PACKAGE_ROOT"` (Node v24.19.0) — an accessor instrumented on `Error.prepareStackTrace` recorded writes `["prepareObjectStackTrace","sentinelPrepare"]` during `require('response-time')`, with the sentinel function and `Error.stackTraceLimit` both restored afterwards.
- Upstream: no dedicated issue located for this mechanism; it is depd's long-standing documented stack-capture technique (present since depd 1.x). Node core's own identical transient `stackTraceLimit` pattern (`lib/internal/errors.js:181-188`) indicates the technique is an accepted V8 API usage; noted here because it is nonetheless a reachable write to a shared global.

## Candidate ledger and unresolved questions

Full ledger in `candidates.md` beside this report; summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:16` `require('depd')('response-time')` | confirmed -> F-002 | depd() -> getStack() at depd/index.js:108, unconditional at load |
| C-002 | `$PACKAGE_ROOT/index.js:43` `deprecate(...)` | confirmed -> F-002 (conditional path) | log() -> getStack() at depd/index.js:199; deprecated number-arg form only |
| C-003 | `$PACKAGE_ROOT/index.js:55` `onHeaders(res, fn)` | confirmed -> F-001 | per-request instance override installation |
| C-004 | `$PACKAGE_ROOT/index.js:53,56,90,96` `process.hrtime`/`toFixed`/`res.getHeader`/`res.setHeader` | rejected as patch | documented read/call API use, no mutation of core objects |
| C-005 | `on-headers/index.js:71` `res.writeHead = createWriteHead(...)` | confirmed -> F-001 | the actual write; shadows `ServerResponse.prototype.writeHead` per instance |
| C-006 | `on-headers/index.js:19` reads `http.ServerResponse.prototype.appendHeader` | rejected as patch | read-only feature detection |
| C-007 | `on-headers/index.js:129` `this.statusCode = statusCode` | rejected as separate patch | documented writable instance property; part of F-001 wrapper behavior |
| C-008 | `depd/index.js:386-387,395-396` `Error.prepareStackTrace`/`stackTraceLimit` writes | confirmed -> F-002 | temporary global mutation with save/restore |
| C-009 | `depd/index.js:413-433` `wrapfunction` (`new Function` wrapper) | rejected as patch (dormant) | returns a wrapper; mutates nothing itself; response-time never calls `deprecate.function` |
| C-010 | `depd/index.js:439-486` `wrapproperty` + `convertDataDescriptorToAccessor` (:49-65) — `Object.defineProperty` at :62,:485 | rejected as patch (dormant) | capable of redefining caller-supplied object properties, but response-time never calls `deprecate.property`; no core object reachable |
| C-011 | `depd/index.js:492-538` `DeprecationError` defineProperty calls | rejected as patch | defines properties on a library-created Error instance (library-owned object) |
| C-012 | `depd/index.js:251` `process.emit('deprecation')` | rejected as patch | EventEmitter API call on `process`; emits custom event, mutates nothing |
| C-013 | `depd/index.js:154,170` `process.noDeprecation`/`process.traceDeprecation` reads | rejected as patch | read-only use of core-populated flags (supporting context) |
| C-014 | `depd/lib/browser/index.js` (browser field entry) | rejected as patch / out of Node runtime path | no-op implementation; not resolved in Node; read in full, mutates nothing |

Unresolved: none.

## Supporting context

- `process.noDeprecation` / `process.traceDeprecation` (depd/index.js:154,170) are core-populated flags read by depd — private API reads, no mutation.
- on-headers' `set1dArrayWithAppend` (`on-headers/index.js:158-170`) deliberately mirrors core `writeHead` remove-then-append array semantics (`$NODEJS_SOURCE/lib/internal/http/server.js:455-468`): copied core semantics, not a replacement of core code. The older `set1dArrayWithSet` fallback (Node without `appendHeader`) uses `setHeader` and therefore dedupes where core would append — a compatibility divergence inside the F-001 wrapper, noted under F-001.
- depd's `wrapfunction`/`wrapproperty` are a general-purpose patching toolkit exported on the `deprecate` object, but response-time activates neither (verified: the only `deprecate` usage is the plain message call at `index.js:43`).
- `deprecate._file`, `_warned`, etc. are properties on depd's own function object; `DeprecationError` decorates a library-created error. Library-owned objects only.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime files | full reads: `index.js`, `node_modules/depd/index.js`, `node_modules/depd/lib/browser/index.js`, `node_modules/on-headers/index.js` | complete runtime surface; candidates C-001..C-014 |
| `$PACKAGE_ROOT` scoped searches | skill patterns S1-S6 plus targeted S7 (`Error.(prepareStackTrace\|stackTraceLimit\|captureStackTrace)`) and S8 (`writeHead`/assignments) via `rg -n --no-ignore` (see `searches.md`) | all hits triaged; S5 (module interception) and S6 (internal bindings) negative |
| `$PACKAGE_ROOT/package-lock.json` | `rg -n '"node_modules/depd"\|"node_modules/on-headers"' -A 4` | depd@2.0.0, on-headers@1.1.0 with registry integrity hashes |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | targeted read :330-520; `grep -n` for `writeHead`/`_implicitHeader` | core baseline for F-001; `_implicitHeader` at :419 confirms the instance wrapper intercepts implicit header flush |
| `$NODEJS_SOURCE/lib/_http_server.js` | `grep -n "require('internal/http/server')"` | :34 — public module re-exports internal implementation |
| `$NODEJS_SOURCE/lib/internal/errors.js` | targeted read :86-175; `grep -n prepareStackTrace\|stackTraceLimit` | core baseline for F-002; `prepareStackTraceCallback` honors userland `Error.prepareStackTrace` (:149-156) |
| on-headers advisory | `gh api /repos/expressjs/on-headers/security-advisories/GHSA-76c9-3jph-rj3q` (read-only) | CVE-2025-7339, severity low, vulnerable `<1.1.0`, published 2025-07-17; audited version contains the fix |
| Changelogs | `$PACKAGE_ROOT/HISTORY.md`, `node_modules/on-headers/HISTORY.md` | 2.3.4 released to pick up on-headers 1.1.0 CVE fix; on-headers 1.0.2 entry names the `res.writeHead` wrapper a "patch" |
| Reproductions | `node repro-onheaders.js "$PACKAGE_ROOT"`, `node repro-depd.js "$PACKAGE_ROOT"` (Node v24.19.0) | both patches demonstrated dynamically; prototype integrity and global restoration confirmed |

## Coverage and limitations

- Entry points: single export `index.js` (package `files`: LICENSE, HISTORY.md, index.js); no install scripts, no conditional exports, no dist/bundled artifacts. `test/` excluded per scope.
- Dependencies: both resolved runtime dependencies read in full at their installed versions (depd@2.0.0, on-headers@1.1.0); depd's browser entry read and excluded from the Node path; no transitive runtime dependencies beyond Node builtins (`path`, `http`).
- Node.js baseline: targeted files only (`lib/internal/http/server.js`, `lib/_http_server.js`, `lib/internal/errors.js`) at commit `d44625a4b80c672215b469906ce583ce7eeeebaf`; no recursive core scan. Note the baseline is Node main; on older release lines `writeHead` lives in `lib/_http_server.js` directly with equivalent semantics — this does not change any finding.
- Reproduction runtime v24.19.0 differs from the baseline checkout; both findings are also statically proven, so the version gap is immaterial.
- Branches not exercised: deprecated number-argument call path (C-002) verified statically only; `set1dArrayWithSet` legacy branch (pre-`appendHeader` Node) not executed. Neither affects the verdict.
- F-002 classification judgment: the `Error.prepareStackTrace`/`stackTraceLimit` write is transient with synchronous restoration; it is reported as a confirmed shared-global mutation per the skill's definition (reachable write to a global), with its temporary scope documented. An auditor weighting permanence over reachability could downgrade it to supporting context; the write itself is not in dispute (demonstrated by reproduction).

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous findings to revalidate.
