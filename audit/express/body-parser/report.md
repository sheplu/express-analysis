# Node.js patch audit: body-parser

- Verdict: **confirmed patching — 1 transitive, transient shared-global mutation (depd)**; body-parser's own code performs no patching
- Status: complete
- Input: issue sheplu/express-analysis#5 (`body-parser`, https://github.com/expressjs/body-parser)
- Library: body-parser 2.4.0, git master @ `151a0d9e72682662fd32b439da4693b4459a70b3`, runtime dependencies installed (`--ignore-scripts --omit=dev`, 37 packages + nested)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: instrumented global-write capture during require + restoration control)
- Scope: production/runtime code (`index.js`, `lib/**`) plus all resolved runtime dependencies (high-risk deps read in full: iconv-lite, raw-body, unpipe, on-finished, qs + side-channel family, http-errors, setprototypeof, get-intrinsic/es-* family, safer-buffer, debug, depd). Tests/examples/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (dougwilson/nodejs-depd#32, #36, #50)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, identical single finding, same calibration nuance independently recorded by both**; activation chain re-verified directly during reconciliation.

## Patching verdict

body-parser itself only writes library-owned metadata onto the live request (`req.body` at `lib/read.js:53,194` — core defines no `body` key; the old `req._body` flag is gone in 2.4.0) and performs no core mutation. Across the full runtime tree there is **no persistent patching, no module-loading interception, no core source rewrite, and no prototype mutation of core objects**.

One reachable write to shared globals exists, transitively:

- 1 × **transient shared-global mutation** (F-001, via depd@2.0.0): save → replace → synchronously restore `Error.prepareStackTrace` / `Error.stackTraceLimit`.
- 0 unresolved candidates in either pass.

Calibration nuance (recorded independently by both passes): `Error.prepareStackTrace` is a documented user-assignable V8/Node hook (Node core itself consults it as a customization point, `$NODEJS_SOURCE/lib/internal/errors.js:136-161`), and depd restores within the same tick with no observable window. Under a "documented hooks used with save/restore are supported extension use" reading, the verdict would be *no confirmed patching*. It is counted as confirmed here because it is a demonstrated reachable write-and-replace of a shared global, consistent with the express audit's treatment of the same mechanism.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via depd)

- Category: shared global mutation, transient (save → mutate → synchronous restore)
- Library site(s): `node_modules/depd/index.js:386-387` (writes; saves at :382/:384), `:395-396` (restores), inside `getStack()`
- Origin: transitive — body-parser → http-errors@2.0.1 (`http-errors/index.js:15` `require('depd')('http-errors')`) → depd@2.0.0; body-parser reaches http-errors via `lib/read.js:14`
- Core baseline: `Error.prepareStackTrace` (default undefined; consulted by `$NODEJS_SOURCE/lib/internal/errors.js:149-150`), `Error.stackTraceLimit` (default 10)
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace; Error.stackTraceLimit = Math.max(10, limit)`; both restored after `Error.captureStackTrace(obj)`
- Execution chain: `require('body-parser')` → `lib/read.js:14` → http-errors → depd factory (`depd/index.js:108`) → `getStack()`; also on each deprecation emission
- Activation: unconditional at import time; production path
- Scope and restoration: process-global but restored synchronously in the same tick; **restore is not exception-safe** (no try/finally — an exception in `captureStackTrace`/`prepareObjectStackTrace` would leave the hook replaced)
- Resulting behavior: momentary replacement of the global stack-trace formatter; no behavior observable by other consumers on the normal path (verified by reproduction)
- Evidence: static sites re-verified at reconciliation; reproduction on Node v24.19.0 (both passes: exactly two writes observed during require; restoration confirmed)
- Upstream: dougwilson/nodejs-depd#32 ("Why is this library overwriting Error type?", closed), #36, #50

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (28 entries), `pass-b/candidates.md` (24 entries); 0 unresolved. Key rejections (agreed by both passes):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | on-finished@2.4.2 `index.js:195` `patchAssignSocket` — instance wrapper over `ServerResponse.prototype.assignSocket` (baseline `$NODEJS_SOURCE/lib/internal/http/server.js:312`) | rejected (latent, unreachable here) | body-parser passes only the **request** (IncomingMessage) to on-finished; IncomingMessage has no `assignSocket`, the :192 guard bails, and `isFinished` short-circuits when socket is falsy; Node 0.8-era branch |
| R-02 | `lib/read.js:53,194` `req.body` writes | rejected | library-owned metadata key on the live req; core defines no `body` |
| R-03 | http-errors `setPrototypeOf`/`defineProperty` | rejected | re-prototypes only self-created Error instances/subclass constructors |
| R-04 | safer-buffer `Safer.prototype = Buffer.prototype`; `process.binding('buffer')` | rejected | copies core statics onto its **own** export object; binding call is read-only in try/catch |
| R-05 | iconv-lite@0.7.3 | rejected | standard documented Transform `_transform`/`_flush` subclassing; the historical `extendNodeEncodings` Buffer-patching code is absent from this version |
| R-06 | raw-body `_readableState`/`_decoder` access | rejected | private-state **reads** only |
| R-07 | unpipe | rejected | public `stream.unpipe()` on Node ≥ 18; never touches `_events` |
| R-08 | qs `__proto__` defineProperty writes | rejected | target its own parse-result objects (anti-pollution defense) |
| R-09 | get-intrinsic / es-* / dunder-proto / side-channel family | rejected | read/cache-only; writes go to module-local INTRINSICS map; `dunder-proto/set` never required; load-time `__proto__` ops hit local literals |
| R-10 | setprototypeof | rejected | exports native `Object.setPrototypeOf` on Node ≥ 18; callers re-prototype library-owned objects |
| R-11 | debug@4.4.3 `process.env.DEBUG` load-time write/delete | rejected | documented-mutable own env key; no API override |
| R-12 | loader interception / install scripts / native code | negative | zero hits across the 39-package runtime tree (incl. nested mime-types/mime-db under type-is) |

## Supporting context

- on-finished's `patchAssignSocket` is a *real* latent instance-override pattern — it matters for packages that call `onFinished(res, …)` (e.g. compression's audit, finalhandler). For body-parser it is statically unreachable; tracked here so cross-package reports stay consistent.
- qs's side-channel machinery (used for parse-depth tracking) is intrinsic-handling, not intrinsic-mutation.

Reconciliation note: passes A and B fully blind; identical verdict, identical finding (same sites/lines/chain), and — notably — the same classification nuance recorded independently. No disagreements. Orchestrator re-verified `lib/read.js:14` → `http-errors/index.js:15` → `depd/index.js:382-396` chain and `req.body` sites directly.

Limitations: reproduction on Node v24.19.0 only; legacy fallbacks (setprototypeof/unpipe/on-finished 0.8 paths, safer-buffer fallbacks, debug browser entry, qs browser bundle) excluded by guard analysis rather than execution; Node baseline is main @ d44625a4b80 (assignSocket now under `lib/internal/http/server.js` — conclusions unaffected for release lines).
