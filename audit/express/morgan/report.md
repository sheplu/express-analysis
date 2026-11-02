# Node.js patch audit: morgan

- Verdict: **confirmed patching — 2 transitive findings (instance override + transient global mutation)**; morgan's own code performs no patching
- Status: complete
- Input: issue sheplu/express-analysis#10 (`morgan`, https://github.com/expressjs/morgan)
- Library: morgan 1.12.1, git master @ `b1272e70812dbc504321eeb5a43d14b0822c150d`, runtime dependencies installed (`--ignore-scripts --omit=dev`): basic-auth, debug@2.6.9, depd@2.0.0, ee-first, ms, on-finished@2.4.x, on-headers@1.1.0, safe-buffer@5.1.2
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: live writeHead-override observation with prototype untouched; Error-hook write/restore capture; patchAssignSocket non-application confirmed)
- Scope: production/runtime code (`index.js`, 596 lines) plus all 8 runtime dependencies' runtime files read in full. Tests/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (CVE-2025-7339/GHSA-76c9-3jph-rj3q)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict and findings, zero disagreements**; activation sites re-verified directly during reconciliation.

## Patching verdict

morgan's own code writes only library-owned metadata (`req._startAt`/`req._startTime`/`req._remoteAddress`, `res._startAt`/`res._startTime` — `index.js:134-140`; zero name collisions in core http sources) and reads/writes streams via public API. Both patches come from dependencies morgan activates:

- 1 × **instance/application override** (F-001, on-headers): `res.writeHead` own-property wrapper installed per request in default (non-immediate) mode.
- 1 × **transient shared-global mutation** (F-002, depd): `Error.prepareStackTrace`/`Error.stackTraceLimit` save→write→restore, executed at `require('morgan')` (twice: deprecate factory `index.js:29` and `deprecate.property` `index.js:198`) and on each deprecation log.
- 0 shared-prototype or module-loading patches; `ServerResponse.prototype` verified untouched at runtime; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: `res.writeHead` instance wrapper (via on-headers)

- Category: instance/application override (transitive)
- Library site(s): `$PACKAGE_ROOT/index.js:171` (`onHeaders(res, recordStartTime)`) → `node_modules/on-headers/index.js:71` (wrapper body :30-52)
- Origin: morgan → on-headers@1.1.0
- Core baseline: `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`); core's `_implicitHeader` (`:419-421`) dispatches via `this.writeHead`, so the wrapper intercepts implicit header flushes too
- Exact mutation: own data property shadowing the prototype method; wrapper records response start time, re-routes writeHead header/status args through `setHeader`/`appendHeader`, then delegates to the saved core function
- Activation: every response in default mode; **skipped in `immediate` mode** (logs on request, no onHeaders hook)
- Scope/restoration: per-instance, never restored for the instance lifetime; prototype untouched (repro-verified)
- Upstream: CVE-2025-7339 / GHSA-76c9-3jph-rj3q — divergence bug in this exact wrapper, fixed in the audited 1.1.0

### F-002: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via depd)

- Category: shared global mutation, transient (save → mutate → synchronous restore; no try/finally)
- Library site(s): `node_modules/depd/index.js:386-387` (writes), `:395-396` (restores)
- Origin: morgan → depd@2.0.0; reached from `$PACKAGE_ROOT/index.js:29` (factory) and `:198` (`deprecate.property`) — **two write/restore pairs observed at require time**, plus per deprecation emission
- Core baseline: Node installs its own default `Error.prepareStackTrace` (`$NODEJS_SOURCE/lib/internal/errors.js:168`, `bootstrap/realm.js:509`) and honors userland overrides — so the swap genuinely redirects core stack preparation during the window
- Evidence: reproduction captured both write/restore pairs on Node v24.19.0
- Scope: process-global, same-tick restore; no lasting observable effect on the normal path

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (24 entries), `pass-b/candidates.md` (29 entries); 0 unresolved. Key rejections (agreed):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:134-140` `_startAt`/`_startTime`/`_remoteAddress`; on-finished `__onFinished` | rejected | library-owned metadata; zero collisions in core http sources (negative grep at baseline) |
| R-02 | on-finished `patchAssignSocket` (instance `res.assignSocket` override) | rejected (unreachable) | guard needs `msg.socket === undefined`; core initializes `kSocket = null` behind a prototype accessor (`outgoing.js:187`) and morgan attaches after `assignSocket` (`server.js:312-321,:1410`); Node 0.8-only dormant branch; **repro confirmed not applied** |
| R-03 | debug@2.6.9 require-time `process.env.DEBUG` write | rejected | value-preserving round-trip (`save(load())`); env state, not behavior; repro confirmed identical |
| R-04 | debug `console._stdout` swap (inspector-log.js) | rejected | dead code, never required in 2.6.9 |
| R-05 | safe-buffer@5.1.2 | rejected | plain re-export of core buffer (modern branch) |
| R-06 | basic-auth / ms / ee-first | rejected | pure parsing/time/listener helpers |
| R-07 | morgan's stream handling | rejected | reads `process.stdout`, writes via public stream API only |
| R-08 | loader interception (P5) / bindings (P6) | negative | zero hits tree-wide |

## Supporting context

- Third audit in this series activating the on-headers + depd pair (compression, response-time) — mechanisms and classifications kept consistent across reports.
- on-finished is here called with the **response** (unlike body-parser), making the `patchAssignSocket` reachability question real; both passes independently proved it dormant on any Node ≥ 0.10 via the `kSocket = null` initialization.

**Node.js-change risk summary:** (a) `this.writeHead` instance dispatch (same as compression/response-time); (b) deferred `prepareStackTrace` reads would expose depd's swap; (c) if `OutgoingMessage` ever initialized socket to `undefined` instead of `null`, on-finished would begin **actively wrapping `res.assignSocket`** on live responses — a currently-dormant patch that a one-line core change would awaken.

Reconciliation note: passes A and B fully blind; identical verdict and findings (same sites/lines); same classification nuance on F-002's transience. Zero disagreements. Orchestrator re-verified `index.js:29/:171/:198` and the metadata writes.

Limitations: `immediate`/`buffer`/deprecation-log branches resolved statically; debug browser/Electron and `DEBUG_FD` branches not loaded in a Node server process; baseline is main (release lines keep `lib/_http_*.js` as real files — behavior confirmed identical via repro).
