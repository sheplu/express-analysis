# Node.js patch audit: connect-timeout

- Verdict: **confirmed patching — 2 active transitive findings + 1 legacy-gated dormant finding**; connect-timeout's own code writes only new library-owned keys
- Status: complete
- Input: issue sheplu/express-analysis#16 (`connect-timeout`, https://github.com/expressjs/timeout)
- Library: connect-timeout 1.9.1, git master @ `7377defb5b7b5a9c3d50fabd42c4dd46ad175d13`, runtime dependencies installed (`--ignore-scripts --omit=dev`): depd@1.1.2, ee-first, http-errors@1.6.3, ms, on-finished@2.3.0, on-headers@1.1.0, setprototypeof, statuses — note the **older dep generation** (depd 1.x, http-errors 1.x, on-finished 2.3.0) vs other packages in this series
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: writeHead wrapper observed; depd write/restore cycles captured — 3 pairs = 6 writes at require; assignSocket non-application confirmed)
- Scope: production/runtime code (`index.js`, 89 lines) plus all 8 runtime dependencies (16-file runtime scope). Tests/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (GHSA-76c9-3jph-rj3q; jshttp/on-finished commits e5f64aa8d7/87eff30f33; connect-timeout history commits cb5c2ee/300ea5d)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; same substance; one classification divergence (dormant on-finished patch) adjudicated consistently with the compression report — kept as a distinct legacy-gated finding.

## Patching verdict

connect-timeout's own writes are new library-owned keys on the live request: `req.timedout` (`index.js:48,60`) and `req.clearTimeout` (`index.js:56`) — neither exists on core `IncomingMessage` (verified). Historical direct wraps of `res.writeHead` and `socket.destroy` were **removed** from this package years ago (commits `cb5c2ee`, `300ea5d`); the remaining patches are all in dependencies it activates:

- 1 × **instance/application override** (F-001, on-headers): `res.writeHead` wrapper per response.
- 1 × **transient shared-global mutation** (F-002, depd@1.1.2 via http-errors@1.6.3): `Error.prepareStackTrace`/`stackTraceLimit` — **3 save/restore cycles (6 writes) at require time**, more than the depd@2 packages in this series, because depd 1.x's compat layer also fires.
- 1 × **legacy-gated dormant instance override** (F-003, on-finished@2.3.0): the "node.js 0.8 patch" `assignSocket` wrap — unreachable on modern Node.
- 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: `res.writeHead` instance wrapper (via on-headers)

- Category: instance/application override (transitive)
- Library site(s): `$PACKAGE_ROOT/index.js:66` (`onHeaders(res, …)` — clears the timeout before headers go out) → `node_modules/on-headers/index.js:71`
- Core baseline: `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`)
- Activation: unconditional per handled request; prototype untouched; never restored per instance
- Upstream: GHSA-76c9-3jph-rj3q / CVE-2025-7339 — installed 1.1.0 is the patched version

### F-002: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via http-errors → depd@1.1.2)

- Category: shared global mutation, transient (save → mutate → synchronous restore; no try/finally)
- Library site(s): `node_modules/depd/index.js:370-371` (writes) / `:379-380` (restores), **plus** `node_modules/depd/lib/compat/index.js:30-31/:39-40` (depd 1.x compat layer)
- Origin: connect-timeout → http-errors@1.6.3 → depd@1.1.2; fires unconditionally at `require('connect-timeout')`
- Evidence: instrumented reproduction observed **3 set/restore cycles = 6 global writes** during require, fully restored
- Note: depd 1.x also runs `eval` at require time for its compat wrapper (context only, no core mutation); depd's log-time re-entry is not triggered by connect-timeout's own `createError(503, …)` call — only by apps using deprecated http-errors signatures

### F-003: on-finished@2.3.0 `res.assignSocket` instance wrap — **legacy-gated, unreachable on modern Node**

- Category: instance override of a core method (version-gated legacy accommodation), dormant
- Library site(s): `node_modules/on-finished/index.js:186-196` (write at `:192`, labeled "node.js 0.8 patch"); gated at `:126` (`if (msg.socket === undefined)`)
- Origin: connect-timeout → on-finished@2.3.0 (activated with the **response** at `index.js:62`)
- Core baseline: `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE/lib/internal/http/server.js:312`); `OutgoingMessage` initializes the socket slot to `null` (`outgoing.js:187`), so the `undefined` guard can never pass; connect-timeout also attaches mid-request with the socket already assigned
- Evidence: static guard-chain analysis (both passes) + repro confirming non-application; jshttp commits `e5f64aa8d7`/`87eff30f33` confirm 0.8-only intent
- Adjudication: pass A rejected as dead code, pass B counted as confirmed-dormant; kept as a distinct legacy-gated finding for consistency with the compression report (shipped, dispatchable code within declared `engines >= 0.8`)

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (22 entries), `pass-b/candidates.md` (28 entries); 0 unresolved.

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:48,56,60` `req.timedout`/`req.clearTimeout` | rejected | new library-owned keys; no core members shadowed (repro-verified) |
| R-02 | historical `res.writeHead`/`socket.destroy` direct wraps | historical | removed by commits `cb5c2ee`, `300ea5d`; absent from 1.9.1 |
| R-03 | http-errors/setprototypeof/inherits | rejected | mutate only library-created Error objects |
| R-04 | `req.emit('timeout')` (`index.js:50`) | rejected (supporting context) | reuses an event name core also emits (`server.js:929-934`) — behavioral collision, not a patch |
| R-05 | depd `eval` at require | rejected | compat-wrapper construction, no core mutation |
| R-06 | loader interception / bindings / prototype sweeps | negative | zero hits across the 16-file runtime scope |

## Supporting context

- The `req.emit('timeout')` name overlap with core's own socket-timeout event is worth tracking: a future core change emitting `'timeout'` on IncomingMessage would tangle with this package's listeners.
- Older dependency generation means this package exercises depd 1.x's compat layer — more require-time global churn than its siblings.

**Node.js-change risk summary:** (a) `this.writeHead` instance dispatch (series-wide); (b) `OutgoingMessage` socket init `null`→`undefined` would awaken F-003; (c) depd transient swap exposure, amplified (6 writes per require); (d) `'timeout'` event-name collision.

Reconciliation note: passes A and B fully blind; identical substance on F-001/F-002 (same sites; A detailed the compat-layer line numbers, B the total fire count — consistent). Divergence on F-003 adjudicated as above. Orchestrator re-verified `index.js` sites, dep versions, and on-finished 2.3.0's guard chain (`:117-129` socket checks, `:186-196` wrap) directly.

Limitations: F-003's active path not executable (no Node 0.8 runtime); reproduction on Node v24.19.0; baseline is main (same contracts, different line numbers on older release lines).
