# Node.js patch audit: resolve-path

- Verdict: **confirmed patching**
- Status: complete
- Input: issue sheplu/express-analysis#27 (`resolve-path`, https://github.com/pillarjs/resolve-path)
- Library: resolve-path 1.4.0, git master @ `4b98ecfd39a342fbf8b909844a9ec13fe2fa8cc5`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): http-errors@1.6.3, path-is-absolute@1.0.1 (+ transitives depd@1.1.2, setprototypeof@1.1.0, statuses@1.5.0, inherits@2.0.3 nested under http-errors) — the **older dependency generation** (depd 1.x line)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes)
- Scope: production/runtime code — `index.js` plus all resolved runtime dependencies' runtime files (browser-field files excluded as unreachable under Node). Tests, docs, devDependencies excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream corroboration found (dougwilson/nodejs-depd#32, #36, #39, #41, #44, #53)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements (finding-granularity difference merged to the site convention); key sites re-verified directly during reconciliation.

## Patching verdict

resolve-path **patches Node.js core transitively and transiently** through depd@1.1.2, reached via http-errors@1.6.3. Unlike the depd@2.x consumers in this audit series, the old depd 1.x line has **two distinct patch sites** and additional import-time machinery:

- **F-001:** `getStack()` transiently swaps `Error.prepareStackTrace` and `Error.stackTraceLimit` (raised to ≥ 10), restoring both synchronously — fires **twice** at `require('resolve-path')` (depd factory init + `deprecate.function` wrap of http-errors' legacy `"I'mateapot"` export) and on every deprecation log.
- **F-002:** depd's compat module lazily re-runs the same swap with `stackTraceLimit = 2` during `callSiteToString` feature detection — fires once at depd load.

Total: 3 swap/restore pairs during a single `require('resolve-path')` (dynamically verified). 0 permanent mutations; 0 instance/application overrides; 0 module interception; 0 unresolved candidates. resolve-path's own `index.js` is clean (path/http-errors API consumption only).

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace`/`stackTraceLimit` (depd `getStack()`)

- Category: shared core mutation (process-global `Error` constructor properties), transient
- Library site(s): `node_modules/depd/index.js:370-371` (writes), `:366,:368` (saves), `:379-380` (restores) — https://github.com/dougwilson/nodejs-depd/blob/v1.1.2/index.js
- Origin: transitive — resolve-path -> http-errors@1.6.3 -> depd@1.1.2
- Core baseline: Node's bootstrap-installed default hook (`$NODEJS_SOURCE/lib/internal/errors.js:136-166`; assignable V8 hook honored at :149-157). Tempering context: core itself uses the identical transient `stackTraceLimit` pattern internally (`errors.js:181-188`).
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace`; `Error.stackTraceLimit = Math.max(10, limit)`; both restored to saved originals.
- Execution chain: `require('resolve-path')` -> `index.js` require of http-errors -> `http-errors/index.js:15` (`require('depd')('http-errors')` -> `depd/index.js:110` `getStack()`) and `http-errors/index.js:247-248` (`deprecate.function(exports.ImATeapot, ...)` -> `depd/index.js:404` `getStack()`); re-fires per deprecation log.
- Activation: unconditional at import time; production path.
- Scope and restoration: process-wide while held; synchronous same-tick restore; not exception-guarded.
- Resulting behavior: within each window, stacks captured anywhere format as depd's callsite array and capture depth is forced ≥ 10; baseline restored afterwards. Interferes with `--enable-source-maps` per upstream reports.
- Evidence: static (sites re-verified by orchestrator); dynamic (both passes, Node v24.19.0): accessor spy logged exactly 3 swap/restore pairs during require (this site contributing 2), 0 during success/400/403 exercising, full restoration; identity probe diff empty across all monitored surfaces.
- Upstream: dougwilson/nodejs-depd#32 (closed), #36/#39 (source-maps conflicts), #53 (`--frozen-intrinsics` failure — independent proof the writes target intrinsics).

### F-002: transient swap in depd compat lazy `callSiteToString` detection

- Category: shared core mutation (same two `Error` globals), transient
- Library site(s): `node_modules/depd/lib/compat/index.js:30-31` (writes, with `stackTraceLimit = 2`), `:22,:24` (saves), `:39-40` (restores) — lazy property defined at `:21`
- Origin: transitive — same chain; triggered by `depd/index.js:11` (`require('./lib/compat').callSiteToString`) materializing the lazy getter at depd load
- Core baseline: as F-001
- Exact mutation: same swap pattern; `stackTraceLimit` **lowered** to 2 within the window (vs raised in F-001)
- Activation: once per process at depd load (lazy initializer); unconditional on this chain
- Scope and restoration: process-wide while held; synchronous restore
- Resulting behavior: within the window, stack capture depth is clamped to 2 and formatting diverted — a concurrent capture in the same tick would observe a 2-frame callsite-array stack
- Evidence: static; dynamically covered by the 3-pair require-time trace (this site contributing 1; limit transiently observed at 2)
- Upstream: same depd issue set; the compat module (and the eval machinery) was removed in depd 2.x — consumers on http-errors ≥ 2 (newer deps) have a strictly smaller patch surface

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (20 entries), `pass-b/candidates.md` (16 entries) — same substantive sites, 0 unresolved in both. Key entries:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-01 | `depd/index.js:370-371,379-380` | confirmed -> F-001 | transient swap/restore; fires 2x at require + per log |
| C-02 | `depd/lib/compat/index.js:30-31,39-40` | confirmed -> F-002 | lazy feature-detect swap, limit=2; fires at depd load |
| C-03 | `depd/index.js:409-414` **eval-built wrapper** | rejected as patch | runs at import (via http-errors' `"I'mateapot"` wrap) but wraps a **library-owned** export, not core; import fails under `--disallow-code-generation-from-strings` (depd#41/#44/#53) — supporting context; removed in depd 2.x |
| C-04 | depd `wrapproperty` | rejected | no `deprecate.property` caller in this chain — unreachable |
| C-05 | `http-errors@1.6.3` `setPrototypeOf`/`defineProperty`/ctor prototypes | rejected | targets only self-created Error instances and its own ClientError/ServerError constructors (`util.inherits` baseline `$NODEJS_SOURCE/lib/util.js:344-363` mutates only the passed subclass) |
| C-06 | `setprototypeof@1.1.0` | rejected | export `===` native `Object.setPrototypeOf` (identity-verified); fallbacks dead and non-shared |
| C-07 | `path-is-absolute@1.0.1` | rejected | pure ponyfill; never imports or installs onto `path` (`path.isAbsolute` identity stable) |
| C-08 | `statuses@1.5.0` / nested `inherits@2.0.3` | rejected | self-populating export / re-export of `util.inherits` |
| C-09 | resolve-path `index.js` | rejected | path API consumption + throwing http-errors instances; no shared-object writes |

## Supporting context

- **depd 1.x eval machinery** (`index.js:409-414`): `deprecate.function` builds the wrapper with `eval()`. On this chain it executes at import time (http-errors wraps its deprecated teapot alias at `index.js:247-248`), so `require('resolve-path')` **fails outright under `--disallow-code-generation-from-strings`** and under `--frozen-intrinsics` (depd#53). Not a core patch (target is library-owned), but a real runtime-hardening incompatibility unique to the old dep generation.
- Node core itself transiently manipulates `stackTraceLimit` with the same save/restore idiom (`errors.js:181-188`) — context for severity assessment, not exculpation: depd still displaces a core-installed global from library code.
- http-errors 1.6.x builds error classes with `util.inherits` + own prototype writes — library-owned, documented pattern.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree | skill's six candidate pattern groups + eval/stack sweeps via scoped `rg -n` (logs: `pass-a/searches.md`, `pass-b/searches.md`) | groups 5/6 zero hits; eval hit ledgered as C-03 |
| `$NODEJS_SOURCE/lib/internal/errors.js:136-166,181-188`; `lib/util.js:344-363` | direct reads at `d44625a4b80` | F-001/F-002 baseline; inherits contract; core's own transient-limit idiom |
| Reproduction | `node pass-a/probe-transient-writes.js "$PACKAGE_ROOT"`, `probe-identities.js`; `node pass-b/repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | exactly 3 swap/restore pairs during require (limits 2 then 10/10), 0 during success/403/400/NUL/absolute-path exercising; empty before/after diff across path exports, Error/Object/Function prototypes, Module._*, require.extensions, process.binding, globals |
| Upstream depd | #32, #36, #39, #41, #44, #53 | corroborate both sites, eval incompatibilities, frozen-intrinsics failure |

## Coverage and limitations

- `Error.stackTraceLimit` cannot be accessor-trapped (V8 data-property fast path; the attempt itself crashes depd's detection — independent evidence the write targets a V8-read intrinsic); transient values logged at `prepareStackTrace` set events instead.
- Unexecuted branches statically cleared: setprototypeof/inherits legacy fallbacks (Node < 0.12), depd `wrapproperty`/DeprecationError paths, browser-field files, runtime deprecation-log windows (same mechanism as demonstrated).
- Repro on v24.19.0 only; the restoration argument is static/synchronous and version-independent.
- Verdict pinned to resolved versions; resolve-path declares `~1.6.3`/`1.0.1`, keeping it on the old depd line until the package itself updates.

## Changes since the previous audit

First audit of resolve-path in this workspace.
