# Node.js patch audit: serve-static

- Verdict: **confirmed patching — 1 transitive, transient shared-global mutation (depd)**; no persistent patch, no instance override, no module interception, no core source rewrite
- Status: complete
- Input: issue sheplu/express-analysis#19 (`serve-static`, https://github.com/expressjs/serve-static)
- Library: serve-static 2.2.1 (working tree master @ `6e3606f2892df213e8fa738b51a36ba711e86ce8`, a few commits past the v2.2.1 tag; shipped runtime file is 2.2.1), runtime dependencies installed (`--ignore-scripts --omit=dev`, 19 packages): send@1.2.1 (central engine, lib read in full), http-errors@2.0.1, depd@2.0.0, on-finished@2.4.2, mime-types@3.0.2 + mime-db@1.54.0, debug, ee-first, encodeurl, escape-html, etag, fresh, inherits, ms, parseurl, range-parser, setprototypeof, statuses, toidentifier
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: instrumented swap capture at require with full restoration; core function identities across http/fs/stream unchanged; live-request run confirming the dormant on-finished branch unreached)
- Scope: production/runtime code (`index.js`, 208 lines) plus every runtime dependency's entry/init path. Tests/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (dougwilson/nodejs-depd#32, #36)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict and single finding, zero disagreements**; dependency chain re-verified directly during reconciliation.

## Patching verdict

serve-static and send use only documented response APIs — notably, **nothing in this tree reassigns or wraps any res or ReadStream method** (no `writeHead` use at all, no `_implicitHeader`/`_header` access anywhere — unlike most siblings in this series). The one patch is the familiar transitive depd swap:

- 1 × **transient shared-global mutation** (F-001): `Error.prepareStackTrace`/`Error.stackTraceLimit` save→write→restore at `require('serve-static')`.
- 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via send → http-errors → depd)

- Category: shared global mutation, transient (save → mutate → synchronous restore; no try/finally)
- Library site(s): `node_modules/depd/index.js:386-396` (`getStack`)
- Origin: serve-static (`index.js:20` `require('send')`) → send@1.2.1 (`index.js:15` `require('http-errors')`) → http-errors@2.0.1 (`index.js:15` depd factory) → depd@2.0.0
- Activation: unconditionally at `require('serve-static')` (reproduction counted the write/restore pair(s) — 2 writes to `prepareStackTrace` observed); **per-request count is 0** — depd's `deprecate()` only fires for out-of-range status codes that serve-static/send never produce
- Core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:149-150` (core consults the hook; core stack preparation is redirected during the fully synchronous window)
- Evidence: static + accessor-instrumented reproduction on Node v24.19.0 (full restoration; zero residual core changes)
- Upstream: dougwilson/nodejs-depd#32, #36

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (17 entries), `pass-b/candidates.md` (21 entries); 0 unresolved. Key rejections (agreed):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | on-finished@2.4.2 `patchAssignSocket` (`index.js:128-131,189-199`) | rejected (dormant) | guard `msg.socket === undefined` never true (core sets `kSocket = null`, `outgoing.js:187`, accessor `:304`); send attaches mid-request with socket assigned; **confirmed unreached in a live-request repro**; Node 0.8-only legacy |
| R-02 | send's `SendStream.prototype.pipe` (`send/index.js:403`) | rejected | method defined on send's **own** legacy-Stream subclass prototype — library-owned; res/ReadStream methods never reassigned |
| R-03 | send's response handling | rejected | documented APIs only (`setHeader`/`getHeader`/`removeHeader`/`getHeaderNames`/`end`/`statusCode`/`headersSent`); **no `_header`, no `_implicitHeader`, no `writeHead` anywhere in the tree** |
| R-04 | `req._parsedUrl`, `msg.__onFinished`, cached-URL mutation | rejected | library-owned metadata/convention keys |
| R-05 | setprototypeof | rejected | native `Object.setPrototypeOf` on Node ≥ 18; targets library objects |
| R-06 | http-errors/depd `defineProperty` | rejected | library-created objects |
| R-07 | debug `process.env.DEBUG` round-trip (`src/node.js:205,209`) | rejected | idempotent env-data write |
| R-08 | mime handling | rejected | send 1.x uses mime-types@3 (+ mime-db@1.54.0) — pure own-map building at load (the legacy `mime` package is not in this tree) |
| R-09 | module interception / bindings / install scripts / leaf deps (encodeurl, escape-html, fresh, etag, …) | negative | zero hits; all 13 leaf deps pure |

## Supporting context

- This is the **cleanest large tree in the series**: send streams files to the response via documented API only, making serve-static/send notably robust to core HTTP internals changes compared to the on-headers/res.end-wrapping siblings.
- The dormant on-finished pattern appears here for the 4th time (compression, morgan, connect-timeout) — same `kSocket = null` dormancy proof, this time also runtime-confirmed unreached during a live request.

**Node.js-change risk summary:** (a) depd transient swap (require-time only in this tree; restore not exception-safe — though no throwing path exists here); (b) `OutgoingMessage` socket init `null`→`undefined` would awaken the dormant on-finished wrap; (c) nothing else — documented-API-only usage.

Reconciliation note: passes A and B fully blind; identical verdict and single finding (same chain, sites, dormancy proofs). A described SendStream's own-prototype `pipe` shadow, B confirmed no res/ReadStream method is ever reassigned — complementary. Orchestrator re-verified the import chain (`index.js:20` → `send/index.js:15` → `http-errors/index.js:15`), dep versions, and `SendStream.prototype.pipe` at `send/index.js:403`.

Limitations: reproduction on Node v24.19.0 (baseline claims static, file:line-pinned at d44625a4b80); working tree is a few commits past the v2.2.1 tag (runtime file identical to the release); Node baseline main has HTTP under `lib/internal/http/*` (citations use those files).
