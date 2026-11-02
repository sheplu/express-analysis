# Node.js patch audit: response-time

- Verdict: **confirmed patching — 2 transitive findings (instance override + transient global mutation)**; response-time's own code performs no patching
- Status: complete
- Input: issue sheplu/express-analysis#9 (`response-time`, https://github.com/expressjs/response-time)
- Library: response-time 2.3.4, git master @ `3bd2651ea7fcf409ea780954e3113b3aaa0feb84`, runtime dependencies installed (`--ignore-scripts --omit=dev`): depd@2.0.0, on-headers@1.1.0
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: instrumented global-write capture; prototype-integrity snapshots)
- Scope: production/runtime code (`index.js`, 98 lines) plus both runtime dependencies read in full. Tests/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (CVE-2025-7339/GHSA-76c9-3jph-rj3q; on-headers changelog; depd issues)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict and identical findings**; activation sites re-verified directly during reconciliation.

## Patching verdict

response-time's own `index.js` contains no mutating write to any core object — it reads `process.hrtime()` and calls `res.setHeader`. Both patches come from its two runtime dependencies, and both are the exact mechanisms documented in this audit series for compression (on-headers) and express/body-parser (depd):

- 1 × **instance/application override** (F-001, on-headers): own-property `writeHead` wrapper on every response passing through the middleware.
- 1 × **transient shared-global mutation** (F-002, depd): save→write→restore of `Error.prepareStackTrace`/`Error.stackTraceLimit`, firing unconditionally at `require('response-time')`.
- 0 shared-core prototype mutations (verified by reproduction); 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: `res.writeHead` instance wrapper (via on-headers)

- Category: instance/application override (transitive)
- Library site(s): `node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`); activated per-request from `$PACKAGE_ROOT/index.js:55` (`onHeaders(res, …)`), unconditional for every response handled by the middleware
- Core baseline: `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`); core's `_implicitHeader` dispatches via `this.writeHead` (`server.js:419`), so the wrapper also intercepts the implicit `res.end()` flush
- Exact mutation: own data property shadowing the prototype method; saved original delegated to after the timing listener runs
- Resulting behavior: X-Response-Time header computed and set just before headers are written; wrapper forces writeHead header args through `setHeader`/`appendHeader` (vs core fast path `server.js:423-520`) and sets statusCode before core validation; a custom reason phrase can be dropped if the listener changes statusCode
- Scope/restoration: per-instance, permanent for the response lifetime; prototype untouched (repro-verified)
- Upstream: on-headers' own changelog describes the mechanism as a "res.writeHead patch"; CVE-2025-7339 / GHSA-76c9-3jph-rj3q was a bug in this wrapper — fixed in the bundled 1.1.0, which is the very reason response-time 2.3.4 exists

### F-002: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via depd)

- Category: shared global mutation, transient (save → mutate → synchronous restore; not exception-safe — no try/finally)
- Library site(s): `node_modules/depd/index.js:386-387` (writes), `:395-396` (restores), inside `getStack()`
- Origin: transitive — response-time → depd@2.0.0; activation chain `$PACKAGE_ROOT/index.js:16` (`require('depd')('response-time')`) → depd factory (`depd/index.js:108`) → `getStack()`
- Activation: **unconditional at require time, every load, regardless of options** (deprecation *logging* is conditional; the global write is not); fires again on the deprecated number-argument call path (`index.js:43` → `log()` → `getStack()`)
- Core baseline: Node honors userland `Error.prepareStackTrace` (`$NODEJS_SOURCE/lib/internal/errors.js:136-163`)
- Evidence: reproduction on Node v24.19.0 recorded the write sequence via instrumented accessors with full restoration confirmed
- Scope: process-global but same-tick; no observable effect on other consumers on the normal path

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (14 entries), `pass-b/candidates.md` (17 entries incl. negative sweeps); 0 unresolved.

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| C-001 | on-headers writeHead wrapper | confirmed → F-001 | instance override |
| C-002 | depd Error globals | confirmed → F-002 | transient global write |
| R-01 | depd `wrapfunction`/`wrapproperty` mutation helpers | rejected | exist in depd but never invoked by response-time |
| R-02 | depd `defineProperty` on DeprecationError | rejected | library-owned Error object |
| R-03 | on-headers `appendHeader` feature detection | rejected | read-only |
| R-04 | `res.setHeader` (index.js) / process reads | rejected | documented API usage |
| R-05 | loader interception / bindings / prototype sweeps | negative | zero hits |

## Supporting context

- This package is a minimal composition of the two most common patch mechanisms in the expressjs ecosystem; the findings are identical in kind to compression (F-004 there) and express/body-parser (depd finding there). Cross-reports kept consistent.

**Node.js-change risk summary:** (a) if core stops dispatching `_implicitHeader` via `this.writeHead` or caches the method, the timing header silently disappears; (b) a V8/Node change deferring `prepareStackTrace` reads would expose depd's swap; (c) depd's restore lacks try/finally — an exception inside `captureStackTrace` would leave the global replaced.

Reconciliation note: passes A and B fully blind; identical verdict, identical findings (same sites/lines/activation). Zero disagreements. Orchestrator re-verified `index.js:16` (depd at require) and `index.js:55` (onHeaders per request) and dep versions (on-headers 1.1.0, depd 2.0.0).

Limitations: Node baseline is main (commit-pinned core line numbers; contracts hold across supported release lines); on-headers' pre-appendHeader fallback and depd's deprecation-fired path statically traced only; reproduction on Node v24.19.0.
