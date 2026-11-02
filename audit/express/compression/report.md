# Node.js patch audit: compression

- Verdict: **confirmed patching — instance/application overrides only** (no shared core prototype, global, module-loading, or core-source mutation)
- Status: complete
- Input: issue sheplu/express-analysis#4 (`compression`, https://github.com/expressjs/compression)
- Library: compression 1.8.2, git master @ `0f9707417bd53d41a319fce8bdb80dfa08b435c8` (matches latest release), runtime dependencies installed (`--ignore-scripts --omit=dev`)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: prototype-identity snapshots before/after require + full gzip round trip — unchanged)
- Scope: production/runtime code (`index.js`) plus all 10 resolved runtime dependencies (bytes, compressible, debug, destroy, mime-db, ms, negotiator, on-headers, safe-buffer, vary). Tests/examples/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (nodejs/node#23734 closed-unmerged; CVE-2025-7339 for on-headers < 1.1.0)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator. Identical verdict and findings F-001–F-004; one classification divergence on destroy's legacy writes, adjudicated by direct source inspection (see F-005 and reconciliation note).

## Patching verdict

compression never mutates a shared Node.js core object: all prototype identities (`OutgoingMessage.prototype`, `ServerResponse.prototype`, `EventEmitter.prototype`, zlib prototypes) are untouched, there is no module-loading interception, and no global pollution — verified statically and at runtime. What it does is rewire the response path **per instance**:

- 4 always-active **instance/application overrides** (F-001–F-004): own-property shadows installed on each live `http.ServerResponse` handled by the middleware (3 direct, 1 transitive via on-headers@1.1.0). Originals saved and delegated; instance-scoped; never restored for the response's lifetime.
- 1 **legacy-gated** set of instance writes to core-internal zlib state via destroy@1.2.0 (F-005): shipped and dispatchable, but statically unreachable on Node ≥ 10.15.1 — on the audited baseline the taken branch is plain documented `stream.destroy()`.
- 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: `res.write` own-property shadow on live ServerResponse

- Category: instance/application override
- Library site: `$PACKAGE_ROOT/index.js:101`
- Origin: direct
- Core baseline: `OutgoingMessage.prototype.write` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1027`)
- Exact mutation: `res.write = function write(chunk, encoding) {…}` — own data property shadowing the prototype method; original saved as `_write` and delegated on the nocompress path
- Execution chain: middleware → per-request proxy installation → body writes diverted into the zlib stream
- Activation: every response passing through the middleware; production path
- Scope/restoration: instance-scoped, permanent for the response lifetime
- Resulting behavior: response body is rerouted through gzip/deflate; `writeHead(statusCode)` forced if headers unsent
- Evidence: static + reproduction (`pass-a/repro.js`, `pass-b/repro.js`)

### F-002: `res.end` own-property shadow

- Category: instance/application override
- Library site: `$PACKAGE_ROOT/index.js:115`
- Core baseline: `OutgoingMessage.prototype.end` (`outgoing.js:1289`)
- Exact mutation: `res.end = function end(chunk, encoding) {…}`; triggers length estimation + writeHead, sends the final chunk to `stream.end()`; the real `end` is deferred until the zlib stream finishes. Note: core `end` callback argument is not forwarded on the compressed path.
- Activation/scope: as F-001

### F-003: `res.on` own-property shadow

- Category: instance/application override
- Library site: `$PACKAGE_ROOT/index.js:142`
- Core baseline: `EventEmitter.prototype.on/addListener` (`$NODEJS_SOURCE/lib/events.js:615-619`)
- Exact mutation: `res.on = function on(type, listener) {…}` — intercepts only `'drain'` listeners (buffered, re-targeted to the zlib stream, or re-attached to res on the nocompress path); all other events delegated to saved `_on`
- Activation/scope: as F-001

### F-004: `res.writeHead` instance wrapper (via on-headers)

- Category: instance/application override (transitive)
- Library site(s): `node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`); installed from `$PACKAGE_ROOT/index.js:174`
- Origin: compression → on-headers@1.1.0
- Core baseline: `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`)
- Exact mutation: own-property wrapper around the previous `writeHead`; converts writeHead header args into `setHeader`/`appendHeader` calls, fires compression's header listener (filter/vary/encoding negotiation) exactly once before delegating
- Notable: core's own `_implicitHeader` path dispatches through `this.writeHead` (`server.js:419-421`), so the wrapper also intercepts core-internal header emission — this is what makes the mechanism work for implicit headers
- Upstream: CVE-2025-7339 affected this exact wrapper pre-1.1.0 (resolved version is fixed)

### F-005: destroy@1.2.0 writes to core-internal zlib instance state — **legacy-gated, unreachable on Node ≥ 10.15.1**

- Category: instance override of core-internal state (version-gated legacy accommodation)
- Library sites: `node_modules/destroy/index.js:84-87` (fake `_binding`/`_handle` replacement in `closeZlibStream` when `_hadError`), `:112-119` (`_needDrain = true`, `_binding.clear()` — Node < 0.10 branch), `:126` (`destroyed = true` — Node 7/8 branch), `:195-197` (`onDrainClearBinding`)
- Origin: compression → destroy@1.2.0 (used for zlib stream teardown)
- Core baseline: modern zlib owns `_destroy` (`$NODEJS_SOURCE/lib/zlib.js:529` ZlibBase), so `destroyZlibStream`'s dispatch (`stream._destroy !== Stream.Transform.prototype._destroy`) takes the plain documented `stream.destroy()` branch on Node ≥ 10.15.1 / ^11.1 / ≥ 12
- Activation: only on EOL Node (< 0.10, 6–8, or error paths exposing `_binding`/`_handle`) — within compression's declared `engines >= 0.8.0` but outside any supported Node today
- Evidence: static (guard chain read in full by both passes + orchestrator); the referenced core fix PR nodejs/node#23734 is closed-unmerged, explaining why the workaround was kept
- Adjudication note: pass A counted this as a confirmed legacy-gated patch, pass B as a boundary case; final ruling records it as a distinct finding with explicit unreachability on the audited baseline, so the site stays tracked without overstating modern impact.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (23 entries), `pass-b/candidates.md` (21 entries); 0 unresolved. Key rejections (agreed):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:93` `res.flush = flush` | rejected | library-owned **addition** — no `flush` exists on baseline `OutgoingMessage.prototype` (only `flushHeaders`); nothing shadowed |
| R-02 | safe-buffer | rejected | re-exports core `buffer` module unmodified on modern Node |
| R-03 | debug@2.6.9 | rejected | writes `process.env.DEBUG` (documented), `process.binding('tty_wrap')` read, mutates only self-created streams behind deprecated `DEBUG_FD` |
| R-04 | vary | rejected | documented `setHeader('Vary', …)` on the passed instance |
| R-05 | bytes / ms / mime-db / compressible / negotiator | rejected | pure data/parsing; no core interaction |
| R-06 | destroy error-suppression branch | rejected | never activated by compression's call pattern |
| R-07 | loader interception / globals / prototype sweeps | negative | zero hits in index.js and all 10 deps |

## Supporting context

- destroy's `isZlibStream` omits `BrotliCompress`/`BrotliDecompress`, so brotli streams always take plain `stream.destroy()` — the legacy branches cannot fire for brotli regardless of Node version.
- The `res.write`/`end`/`on` shadows are the classic connect-era middleware pattern; Node offers no supported hook for response body interception, which is why this is instance rewiring rather than a documented extension point.

**Node.js-change risk summary:** compression depends on (a) `writeHead`/`_implicitHeader` continuing to dispatch via `this.writeHead` (instance lookup) — if core ever calls the prototype method directly or caches it, on-headers (F-004) and therefore compression's header negotiation silently breaks; (b) instance own-properties continuing to shadow `write`/`end`/`on` — frozen/sealed response instances or private-field dispatch would break F-001–F-003; (c) zlib continuing to own `_destroy` — if that identity check changes, destroy could fall into its Node-7/8 branch (F-005) on modern Node.

Reconciliation note: passes A and B fully blind; identical verdict and F-001–F-004 (same sites/lines). Single classification divergence (destroy) adjudicated by orchestrator source inspection as described. Orchestrator re-read `index.js:98-176`, `on-headers/index.js:60-80`, `destroy/index.js` guard chain before finalizing.

Limitations: legacy Node (< 10) branches, brotli teardown, and debug's deprecated `DEBUG_FD` path analyzed statically only; reproduction covers the modern gzip path on Node v24.19.0; Node baseline is main where HTTP lives under `lib/internal/http/` (public `_http_*.js` are re-export shims — same methods).
