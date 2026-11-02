# Node.js patch audit: response-time

- Verdict: confirmed patching
- Status: complete
- Input: npm package `response-time` (Express X-Response-Time middleware), local checkout at `$PACKAGE_ROOT`
- Library: response-time 2.3.4, git commit 3bd2651ea7fcf409ea780954e3113b3aaa0feb84 (https://github.com/expressjs/response-time, branch master), source checkout with installed runtime dependencies depd@2.0.0 and on-headers@1.1.0
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (v28.0.0-pre per src/node_version.h)
- Reproduction runtime: Node.js v24.19.0 (`node repro/repro.js "$PACKAGE_ROOT"`)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (sole shipped runtime file per package.json `files`) plus resolved runtime dependencies `depd@2.0.0` and `on-headers@1.1.0` (entrypoints read in full). Tests, docs, and devDependencies out of scope.
- Coverage: source complete (all runtime files read line-by-line); upstream corroborated (GHSA advisory via GitHub API, HISTORY changelogs); runtime behavior reproduced. Node baseline is main; version-specific core line numbers may differ on release lines (see limitations).

## Patching verdict

Patching is demonstrated, entirely through runtime dependencies; `$PACKAGE_ROOT/index.js` itself contains no write to any core object.

- Shared core mutations (permanent): **0**. `http.ServerResponse.prototype` and all other shared prototypes/globals are never permanently modified (verified statically and by reproduction).
- Instance/application overrides: **1** (F-001). `on-headers@1.1.0` replaces `res.writeHead` with an own-property wrapper on every `http.ServerResponse` instance passed through the middleware — a core-backed instance override on the hot production path, per request.
- Transient global mutations: **1** (F-002). `depd@2.0.0` writes `Error.prepareStackTrace` and `Error.stackTraceLimit` (process-wide globals consulted by Node core) inside `getStack()`, saving and synchronously restoring both. Executed unconditionally at `require('response-time')` time.
- Core module interception / core source rewrites: **0** (negative searches).
- Unresolved candidates: none. All candidates in the ledger are confirmed or rejected with reasons.

Both findings are transitive (target -> dependency); both activate on the default production path with no guards other than those described per finding.

## Confirmed Node.js patches

### F-001: `res.writeHead` replaced per response instance (on-headers)

- Category: instance or application override (core-backed instance; prototype untouched)
- Library site(s):
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` — the write: `res.writeHead = createWriteHead(res.writeHead, listener)` (https://github.com/jshttp/on-headers/blob/v1.1.0/index.js#L71)
  - `$PACKAGE_ROOT/node_modules/on-headers/index.js:30-52` — replacement factory `createWriteHead` (closure keeps the saved original `prevWriteHead`; delegates at line 50)
  - `$PACKAGE_ROOT/index.js:55` — activation call `onHeaders(res, function onHeaders () {...})` (https://github.com/expressjs/response-time/blob/3bd2651/index.js#L55)
- Origin: transitive — response-time@2.3.4 -> on-headers@1.1.0 (package.json dependency `on-headers: ~1.1.0`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-424` — `ServerResponse.prototype.writeHead = writeHead` (re-exported through `$NODEJS_SOURCE/lib/http.js:56-57`; legacy `lib/_http_server.js` re-exports the same). Core `writeHead` validates/sets status, merges headers (object via `setHeader`, 1D array via `removeHeader`+`appendHeader` at lines 459-468), and builds the status line. Core also calls `this.writeHead(...)` itself via `_implicitHeader` (`lib/internal/http/server.js:419-421`), so the instance override intercepts implicit header flushes too.
- Exact mutation: own-property assignment of key `writeHead` on each `http.ServerResponse` instance handled by the middleware. Shadows the core prototype method via ordinary property lookup. Saved original: closure variable `prevWriteHead` (on-headers/index.js:30), invoked at line 50 with the possibly rewritten argument list.
- Execution chain: `require('response-time')()` -> returned middleware `responseTime(req, res, next)` (`$PACKAGE_ROOT/index.js:52`) -> `onHeaders(res, listener)` (`$PACKAGE_ROOT/index.js:55`) -> argument checks (on-headers/index.js:62-69) -> write (on-headers/index.js:71).
- Activation: every request that passes through the middleware; unconditional (no environment guard, no version guard other than a load-time `typeof http.ServerResponse.prototype.appendHeader` feature check at on-headers/index.js:19 that only selects the 1D-array helper). Production path.
- Scope and restoration: per-response-instance only. The shared prototype is never modified (reproduction: identity check before/after require and after a full request both `true`). The shadow is never removed; it lives as long as the response object. A `fired` flag (on-headers/index.js:31,39-40) makes the listener run at most once per response.
- Resulting behavior: before — `res.writeHead(...)` runs core logic directly. After — the replacement first applies status code and header arguments itself (`setWriteHeadHeaders`, on-headers/index.js:119-146, using `this.statusCode = ...`, `setHeader`/`removeHeader`/`appendHeader`, mirroring the core merge semantics), then fires the listener (which, in response-time, computes `process.hrtime` diff and calls `res.setHeader('X-Response-Time', ...)` unless already set — `$PACKAGE_ROOT/index.js:56-59` and `:85-97`), honors a `statusCode` changed by the listener (on-headers/index.js:44-47), and finally delegates to the saved core `writeHead`. Practical effect: a header is injected after application code but before headers are flushed — behavior core alone does not offer.
- Evidence: static trace above plus reproduction (`repro/repro.js`, output in `repro/repro-output.txt`, Node v24.19.0): `res` has no own `writeHead` before the middleware, has one after; `res.writeHead !== ServerResponse.prototype.writeHead`; replacement is named `writeHead` to mimic core; `x-response-time` present on the wire; prototype identity unchanged throughout.
- Upstream: on-headers HISTORY.md 1.0.2 — "Fix `res.writeHead` patch missing return value" (upstream itself describes the mechanism as a patch). CVE-2025-7339 / GHSA-76c9-3jph-rj3q ("on-headers is vulnerable to http response header manipulation", severity low, vulnerable < 1.1.0, patched 1.1.0; confirmed via GitHub advisory API) — a real-world defect in this replacement's header-merging path; response-time 2.3.4 exists precisely to pull in the fixed on-headers ~1.1.0 (`$PACKAGE_ROOT/HISTORY.md`, 2.3.4 entry).

### F-002: transient write of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd)

- Category: transient global mutation (shared global written, saved, and synchronously restored)
- Library site(s):
  - `$PACKAGE_ROOT/node_modules/depd/index.js:386-387` — writes: `Error.prepareStackTrace = prepareObjectStackTrace` and `Error.stackTraceLimit = Math.max(10, limit)` (https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L386-L387)
  - `$PACKAGE_ROOT/node_modules/depd/index.js:395-396` — restores to saved `prep`/`limit`
  - `$PACKAGE_ROOT/node_modules/depd/index.js:381-399` — enclosing helper `getStack()`; replacement hook `prepareObjectStackTrace` at lines 405-407 returns the raw CallSite array
  - `$PACKAGE_ROOT/index.js:16` — activation: `var deprecate = require('depd')('response-time')`
- Origin: transitive — response-time@2.3.4 -> depd@2.0.0 (package.json dependency `depd: ~2.0.0`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:136-162` — Node's `prepareStackTraceCallback` explicitly consults a userland `globalThis.Error.prepareStackTrace` function (lines 149-150, main-context fallback at 155-156) before using the internal default `ErrorPrepareStackTrace` (lines 165-168). `Error.stackTraceLimit` is the V8/Node-managed global controlling captured frame count (see also `lib/internal/errors.js:181-188` where core itself saves/zeroes/restores it). Writing these properties therefore changes how Node core formats every stack captured while the write is in effect.
- Exact mutation: on the global `Error` constructor — key `prepareStackTrace` replaced by depd's `prepareObjectStackTrace` (returns structured CallSites instead of a formatted string) and key `stackTraceLimit` raised to at least 10. Saved originals: locals `prep` and `limit` (depd/index.js:382,384); both restored at lines 395-396 in the same synchronous call, after `Error.captureStackTrace(obj)` and the `obj.stack` access that triggers formatting.
- Execution chain (load-time): `require('response-time')` -> `$PACKAGE_ROOT/index.js:16` -> `depd('response-time')` (depd/index.js:103) -> `getStack()` (depd/index.js:108) -> writes at 386-387 -> restore at 395-396. Re-executed per deprecation event: `deprecate(msg)` (`$PACKAGE_ROOT/index.js:43`, only on the deprecated numeric-argument API) -> `log()` -> `getStack()` (depd/index.js:199); also from `wrapfunction`/`wrapproperty` (never called by response-time).
- Activation: unconditional at module load — importing response-time performs the write/restore once regardless of options, environment, or whether any deprecation fires. Production path.
- Scope and restoration: process-wide (whole main realm) for a synchronous window inside `getStack()`; no other user code runs in that window, and both values are restored exactly (reproduction recorded the write sequence `["prepareObjectStackTrace", <original>]` and verified restore-to-initial identity).
- Resulting behavior: within the window, any error stack formatted through the V8 hook would receive a raw CallSite array instead of a string; outside it, behavior is unchanged. Practical steady-state effect is nil; residual risk is limited to reentrancy edge cases (e.g., a hostile accessor or future lazy formatting of an error whose `.stack` getter runs inside the window would observe the swap).
- Evidence: static trace above plus reproduction: instrumented `Error.prepareStackTrace` accessor observed exactly two writes during `require('response-time')` and confirmed restoration to the pre-require value (which on modern Node is core's own `ErrorPrepareStackTrace` installed at bootstrap).
- Upstream: this is depd's documented stack-capture technique (standard V8 stack-trace API usage, https://v8.dev/docs/stack-trace-api#customizing-stack-traces); no corrective issue/PR applies. `$PACKAGE_ROOT/HISTORY.md` 2.3.3 notes the dep bump to depd@~2.0.0 ("Remove use of `eval`").

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | on-headers/index.js:71 — `res.writeHead =` on ServerResponse instance | confirmed -> F-001 | Own-property shadow of `ServerResponse.prototype.writeHead` ($NODEJS_SOURCE/lib/internal/http/server.js:423); reproduced |
| C-002 | on-headers/index.js:19 — `http.ServerResponse.prototype.appendHeader` | rejected as patch | `typeof` read for feature detection; no write to the prototype |
| C-003 | on-headers/index.js:129 — `this.statusCode = statusCode` | rejected as separate patch (part of F-001 behavior) | Documented writable instance property; replicates core writeHead's own assignment ($NODEJS_SOURCE/lib/internal/http/server.js:446) inside the replacement |
| C-004 | on-headers/index.js:108,153,158-179 — `setHeader`/`removeHeader`/`appendHeader` calls | rejected as patch | Documented public API calls on the instance; no override |
| C-005 | depd/index.js:386-387, 395-396 — `Error.prepareStackTrace`, `Error.stackTraceLimit` | confirmed -> F-002 | Shared-global writes consulted by core ($NODEJS_SOURCE/lib/internal/errors.js:149-156); saved and synchronously restored; reproduced |
| C-006 | depd/index.js:413-433 — `wrapfunction` (`new Function` codegen) | rejected as patch | Returns a new wrapper function; mutates no target object; never invoked by response-time (`deprecate.function` unused) |
| C-007 | depd/index.js:439-486 — `wrapproperty` (`Object.defineProperty` on caller-supplied object) | rejected as patch in this scope | Mutation helper exists but `deprecate.property` is never called by response-time runtime (sole use is `deprecate(message)` at $PACKAGE_ROOT/index.js:43); target object would be caller-chosen, not core by default |
| C-008 | depd/index.js:49-65 — `convertDataDescriptorToAccessor` | rejected as patch | Reachable only from unreached `wrapproperty` (C-007) |
| C-009 | depd/index.js:492-538 — `DeprecationError` `Object.defineProperty` calls | rejected as patch | Defines properties on a freshly created, library-owned Error instance; no shared/core object touched |
| C-010 | depd/index.js:251 — `process.emit('deprecation', err)` | rejected as patch | Standard EventEmitter call on `process`; emits a custom event, mutates nothing |
| C-011 | depd/index.js:23,154-179,186,256,260 — `process.cwd/noDeprecation/traceDeprecation/env/stderr` | rejected as patch | Reads and documented `stderr.write` call; no assignment to `process` or its members |
| C-012 | $PACKAGE_ROOT/index.js:53,56 — `process.hrtime()` | rejected as patch | Read-only core API call |
| C-013 | $PACKAGE_ROOT/index.js:86-96 — `res.getHeader`/`res.setHeader` | rejected as patch | Documented public response API calls; no override |
| C-014 | depd/lib/browser/index.js — browser stub | rejected / out of Node runtime scope | Loaded only via package.json `browser` field (bundlers); on Node, `require('depd')` resolves to depd/index.js; stub is no-op regardless |
| C-015 | Module-interception and bindings patterns (require.cache, Module._*, internalBinding, process.binding, 'internal/', '_http_') | rejected (negative) | Zero matches across all runtime files (searches P5/P6) |

No unresolved candidates.

## Supporting context

- `$PACKAGE_ROOT/index.js` is patch-free in isolation: it reads `process.hrtime()`, builds a header value, and uses only documented `res.getHeader`/`res.setHeader`. All patching behavior comes from its two dependencies.
- on-headers deliberately names its replacement function `writeHead` and preserves core's argument handling (including the 1D-array `removeHeader`+`appendHeader` dedup semantics that core applies at `$NODEJS_SOURCE/lib/internal/http/server.js:459-468` — this parity is exactly what CVE-2025-7339 fixed in 1.1.0). This is faithful-wrapper engineering, but it remains a copied re-implementation of part of core's `writeHead` argument processing executed before core runs.
- depd's `deprecate.function`/`deprecate.property` are general-purpose wrap/redefine helpers capable of patching arbitrary objects (including core ones) when a *consumer* directs them at such objects; response-time does not, so they stay supporting context here.
- depd's browser stub (depd/lib/browser/index.js) is a no-op variant; irrelevant on Node.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime files | Full reads: index.js (98 lines), node_modules/on-headers/index.js (180), node_modules/depd/index.js (538), node_modules/depd/lib/browser/index.js | Complete runtime surface; candidates C-001..C-014 |
| $PACKAGE_ROOT scoped searches | `rg -n --no-ignore <skill patterns P1-P6 + direct-write pattern>` over the four runtime files (see searches.md) | P5 (module interception) and P6 (bindings/internals) negative; all other hits accounted for in ledger |
| Dependency resolution | `$PACKAGE_ROOT/node_modules/.package-lock.json` | depd@2.0.0 (sha512-g7nH6P…), on-headers@1.1.0 (sha512-737ZY3…); matches package.json ranges |
| $NODEJS_SOURCE writeHead contract | `rg -n "writeHead|appendHeader" lib/http.js lib/_http_server.js lib/internal/http/server.js lib/internal/http/outgoing.js`; read lib/internal/http/server.js:405-495 | Prototype method at lib/internal/http/server.js:423; implicit-header path :419-421; header-merge semantics :444-485; `appendHeader` at lib/internal/http/outgoing.js:877 |
| $NODEJS_SOURCE prepareStackTrace contract | `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js`; read lib/internal/errors.js:85-170 | Userland `Error.prepareStackTrace` consulted at :149-156; default `ErrorPrepareStackTrace` :165-168 |
| Upstream advisory | `gh api /advisories/GHSA-76c9-3jph-rj3q` (read-only) | Published 2025-07-17, severity low, on-headers < 1.1.0 vulnerable, patched 1.1.0; bundled version is the patched one |
| Upstream changelogs | $PACKAGE_ROOT/HISTORY.md; node_modules/on-headers/HISTORY.md | response-time 2.3.4 = dep bump to on-headers ~1.1.0 for CVE-2025-7339; on-headers 1.0.2 entry calls the mechanism a "res.writeHead patch" |
| Reproduction | `node repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0; output in repro/repro-output.txt) | Confirms F-001 (instance shadow, prototype untouched, header live) and F-002 (two recorded writes, exact restoration) |

File hashes (sha256, $PACKAGE_ROOT-relative):
- index.js: d7ad960fcda2f4ed3c673dfd8cebc52a703200ce9f880d73cf84fe4c753e54a0
- node_modules/depd/index.js: 4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91
- node_modules/on-headers/index.js: 76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856
- node_modules/depd/lib/browser/index.js: 10b4d4a4e9d14e9e6a5ab7ced64405ef90e6bec94d479a8e223cbba88828ad79

## Coverage and limitations

- Entry points: single export `$PACKAGE_ROOT/index.js` (package.json `main` default, `files: [LICENSE, HISTORY.md, index.js]`); no install scripts, no conditional exports, no bin. Tests (`$PACKAGE_ROOT/test/`) out of scope per instructions.
- Dependencies: both runtime deps read in full at their resolved versions (depd@2.0.0, on-headers@1.1.0); neither has further runtime dependencies (lock confirms leaf packages). depd's `browser` entry not loaded on Node.
- Node.js baseline is main (v28.0.0-pre, d44625a4b80c672215b469906ce583ce7eeeebaf); on current release lines the same contracts live in `lib/_http_server.js` (older layout) — the findings do not depend on the layout, only on `writeHead` being a prototype method and `Error.prepareStackTrace` being a consulted global, both true across supported versions (package engines `>= 0.8`). Line numbers cited are valid at the pinned commit only.
- Branches not exercised at runtime: on-headers' no-`appendHeader` fallback (`set1dArrayWithSet`, pre-appendHeader Node); depd's deprecation-fired path (`log()`/`getStack()` per event — statically traced, same writes as F-002); depd `wrapfunction`/`wrapproperty` (unreached in this scope). A tested branch cannot prove universal absence, but every write site in the runtime files is enumerated in the ledger regardless of branch.
- What would change the verdict: a consumer-facing API change causing response-time to call `deprecate.function`/`deprecate.property` on core objects (would add a finding), or on-headers moving to a non-mutating mechanism (would remove F-001).

## Changes since the previous audit

First audit at this path (independent pass-b of a double-blind protocol; no other audit output consulted).
