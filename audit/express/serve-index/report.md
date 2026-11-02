# Node.js patch audit: serve-index

- Verdict: **confirmed patching — 1 transitive, transient shared-global mutation (depd)**; serve-index's own code performs no patching
- Status: complete
- Input: issue sheplu/express-analysis#18 (`serve-index`, https://github.com/expressjs/serve-index)
- Library: serve-index 1.9.2, git master @ `fc0c0abd890e79c3f16b0ea9cf49551b3ee66ecb`, runtime dependencies installed (`--ignore-scripts --omit=dev`, 15 packages): accepts, batch@0.6.1, debug@2.6.9, depd@1.1.2, escape-html, http-errors@1.8.1, inherits, mime-db, mime-types, ms, negotiator, parseurl, setprototypeof@1.2.0, statuses, toidentifier
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; pass A also v26.13.0) — instrumented swap capture: 3 set/restore cycles (6 writes) at require, full restoration, empty permanent-core-diff list
- Scope: production/runtime code (`index.js`, 692 lines) plus all 15 runtime dependencies' entry/init paths (`batch` read in full). Tests/docs excluded; `public/` assets are read-only runtime data.
- Coverage: source complete; runtime reproduction done; upstream corroborated (dougwilson/nodejs-depd#9, #32, #36 — source-maps breakage caused by the swap)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; agreement on the depd finding; one classification divergence (debug's env-gated `DEBUG_FD` path) adjudicated to supporting context for cross-series consistency — see reconciliation note.

## Patching verdict

serve-index's own `index.js` performs zero patching: its writes are `res.statusCode`/`err.status` metadata and documented `setHeader`/`end`/fs calls. One patch arrives transitively and fires unconditionally at import:

- 1 × **transient shared-global mutation** (F-001, depd@1.1.2 via http-errors@1.8.1): `Error.prepareStackTrace`/`Error.stackTraceLimit` save→write→restore, **3 cycles at bare `require('serve-index')`**.
- 0 permanent/unconditional core mutations anywhere in the 16-package tree; 0 module-loading interception; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via http-errors → depd@1.1.2)

- Category: shared global mutation, transient (save → mutate → synchronous restore; **no try/finally** — a throwing stack accessor could skip restore)
- Library site(s): `node_modules/depd/index.js:365-383` (`getStack`), `node_modules/depd/lib/compat/index.js:21-43` (lazy `callSiteToString` probe)
- Origin: serve-index → http-errors@1.8.1 (`index.js:15` depd factory, `:286` `deprecate.function`) → depd@1.1.2; compat getter forced by `depd/index.js:11`
- Activation: unconditionally at `require('serve-index')` — exactly **3 swap/restore cycles** (compat probe + factory + wrapfunction), verified by instrumented reproduction on Node v24.19.0 (pass A also v26.13.0); re-fires on every depd deprecation log process-wide (not reachable from serve-index's own non-deprecated `createError(4xx)` usage)
- Core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:136-170` (Node installs/honors the hook depd displaces)
- Upstream: dougwilson/nodejs-depd#32, #36 (`--enable-source-maps` breakage caused by this exact swap), #9
- Note: `Error.stackTraceLimit` restoration verified by before/after value — V8 rejects accessor instrumentation on that property (documented in `pass-a/searches.md`)

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (22 entries), `pass-b/candidates.md` (23 entries); 0 unresolved. Key rejections (agreed):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `batch/index.js:51` `Batch.prototype.__proto__ = EventEmitter.prototype` | rejected | write to batch's **own** prototype (constructor-less inheritance); `EventEmitter.prototype` verified unchanged; safe per core's lazy `_events` init |
| R-02 | http-errors `setprototypeof`/`defineProperty` | rejected | library-created Error instances; setprototypeof@1.2.0 re-exports native `Object.setPrototypeOf` |
| R-03 | parseurl `req._parsedUrl`/`_parsedOriginalUrl` | rejected | metadata cache keys absent from core (`lib/_http_incoming.js`); `new url.Url()` fast path uses the documented legacy export |
| R-04 | serve-index `res.statusCode`/`err.status`/`setHeader`/`end`/fs/Buffer | rejected | documented API + library metadata |
| R-05 | debug `process.env.DEBUG` load-time write | rejected | own documented config namespace, idempotent |
| R-06 | **debug@2.6.9 `DEBUG_FD` path** (`src/node.js:61-75,167-226`: `stream.readable = false`, `stream.read = null`, `_type`/`fd` writes, `_handle.unref()`, `process.binding('tty_wrap')` read) | rejected as patch → supporting context | env-gated (only when `DEBUG_FD` names an fd other than 1/2); all writes land on a tty/net stream **debug itself creates and owns** for logging — same classification as this debug version received in the compression and morgan audits; FILE branch is dead on modern Node (`fs.SyncWriteStream` removed). Adjudicated: pass A counted it as an optional instance-override finding; pass B rejected it; series precedent keeps it out of confirmed findings. |
| R-07 | accepts/negotiator | rejected | own wrapper objects; read `req.headers` only |
| R-08 | mime-types/statuses load-time maps | rejected | own exports |
| R-09 | loader interception / Buffer-global tampering / install scripts | negative | zero hits tree-wide |

## Supporting context

- The debug `DEBUG_FD` branch (R-06) is vendored-from-core hack code (its comments quote the old core workaround); it reads the deprecated private `process.binding('tty_wrap')` — a forward-compat exposure if Node removes `process.binding`, but only on that env-gated path.
- http-errors 1.8.1 + depd 1.1.2 is the older dep generation (as in connect-timeout) — the compat layer accounts for the extra swap cycle.

**Node.js-change risk summary:** (a) depd transient swap (3× per require; restore not exception-safe; known to break `--enable-source-maps` per upstream issues); (b) `process.binding('tty_wrap')` removal would break debug's `DEBUG_FD` path (env-gated only).

Reconciliation note: passes A and B fully blind; agreement on F-001 (same sites, same 3-cycle count, same upstream citations). Divergence on debug's `DEBUG_FD` path adjudicated to supporting context: the mutated stream is created and owned by debug (not core-handed shared state), the path is env-gated and partially dead on modern Node, and the identical code was classified as rejected in the compression and morgan audits — cross-series consistency controls. Orchestrator re-verified dep versions, the http-errors import chain (`index.js:17`), `batch/index.js:49-53`, and `debug/src/node.js:200-208` directly.

Limitations: debug `DEBUG_FD` branch verified statically only; depd log-time re-swap not reachable from serve-index's own usage; published upstream line offsets may differ slightly from installed artifacts (pass A pinned files by SHA-256); Node baseline is main.
