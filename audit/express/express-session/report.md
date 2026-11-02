# Node.js patch audit: express-session

- Verdict: **confirmed patching — 2 per-request instance overrides (1 direct, 1 transitive) + 1 transient shared-global mutation (transitive)**; no persistent shared core mutation
- Status: complete
- Input: issue sheplu/express-analysis#12 (`express-session`, https://github.com/expressjs/session)
- Library: express-session 1.19.0 (+ unreleased master changes), git master @ `8947e169ae838b22cc1af198e50e370e6fc09f96`, runtime dependencies installed (`--ignore-scripts --omit=dev`): cookie, cookie-signature, debug@2.6.9, depd@2.0.0, ms, on-headers@1.1.0, parseurl, random-bytes, safe-buffer, uid-safe
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: prototypes verified untouched; depd write/restore captured — 4 writes at require; wrap behavior exercised)
- Scope: production/runtime code (`index.js` 741 lines, `session/cookie.js`, `session/memory.js`, `session/session.js`, `session/store.js`) plus all 10 runtime dependencies' entry/init paths. Tests/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (CVE-2025-7339/GHSA-76c9-3jph-rj3q; HISTORY.md's own "res.end patch"/"res.writeHead patch" wording)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict and findings**; sites and exact line numbers re-verified directly during reconciliation.

## Patching verdict

express-session rewires the response path per instance and triggers the usual depd transient global swap. No shared prototype, module-loading, or core-source patching anywhere in the tree (statically proven and runtime-reproduced):

- 1 × **direct instance/application override** (F-001): `res.end` replaced on every handled response to commit the session before finishing.
- 1 × **transitive instance/application override** (F-002, on-headers): `res.writeHead` wrapper for the Set-Cookie hook.
- 1 × **transitive transient shared-global mutation** (F-003, depd): `Error.prepareStackTrace`/`stackTraceLimit` save→write→restore at require time (fired from both `index.js:20` and `session/cookie.js:15`) and per deprecation log.
- 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: `res.end` own-property replacement on every live ServerResponse (direct)

- Category: instance/application override
- Library site(s): `$PACKAGE_ROOT/index.js:269` (`res.end = function end(chunk, encoding) {…}`); originals saved at `:266-267` (`_end`, `_write` — **`res.write` is captured but never reassigned**)
- Core baseline: `OutgoingMessage.prototype.end` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289`)
- Exact mutation: own data property shadowing the prototype method; the wrapper makes `end` idempotent (`if (ended) return false`), defers the final flush until the session store save/destroy/touch callback completes, splits the final write (`writetop`/`writeend`), and forces `res._implicitHeader()` when headers are unsent
- Activation: every request handled by the middleware; production path
- Scope/restoration: per-instance, permanent for the response lifetime; prototype untouched (repro-verified)
- Behavior deltas vs core contract: altered return value on duplicate calls, duplicate-call swallowing, and the `end(chunk, encoding, callback)` callback is not forwarded on wrapped paths — same contract-drift class as compression's F-002
- Evidence: static + reproduction (both passes)

### F-002: `res.writeHead` instance wrapper (via on-headers)

- Category: instance/application override (transitive)
- Library site(s): `node_modules/on-headers/index.js:71`; activated at `$PACKAGE_ROOT/index.js:235` (`onHeaders(res, …)` — fires the Set-Cookie emission hook)
- Origin: express-session → on-headers@1.1.0
- Core baseline: `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423-424`); intercepts core's `_implicitHeader` dispatch too
- Upstream: CVE-2025-7339 / GHSA-76c9-3jph-rj3q fixed in the shipped 1.1.0; upstream changelog itself calls this the "res.writeHead patch"

### F-003: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via depd)

- Category: shared global mutation, transient (save → mutate → synchronous restore; no try/finally)
- Library site(s): `node_modules/depd/index.js:386-387/395-396`
- Origin: express-session → depd@2.0.0; activated unconditionally at `require('express-session')` from `index.js:20` **and** `session/cookie.js:15` (4 global writes captured at require), plus on every deprecation log
- Evidence: instrumented accessors (both passes); full synchronous restoration confirmed after require and after a fired deprecation

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (25 entries), `pass-b/candidates.md` (29 entries); 0 unresolved. Key rejections (agreed):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `req.session`/`req.sessionID`/`req.sessionStore`; parseurl `req._parsedUrl` | rejected | new own instance props; no core member shadowed (`lib/_http_incoming.js` verified) |
| R-02 | `res._header` read / `res._implicitHeader()` call inside F-001 | rejected as separate patch | core-**private API usage** within the wrapper, not an additional mutation |
| R-03 | `util.inherits(Store, EventEmitter)` (session/store.js) | rejected | documented inheritance |
| R-04 | safe-buffer | rejected | modern branch re-exports core buffer unmodified |
| R-05 | debug@2.6.9 `process.env.DEBUG` round-trip; `process.binding('tty_wrap')` | rejected | env-gated read paths; never activated in a server process |
| R-06 | depd `wrapfunction`/`wrapproperty` | rejected | never called by express-session |
| R-07 | uid-safe / random-bytes crypto usage | rejected | call-only |
| R-08 | loader interception / core-source sweeps | negative | zero hits tree-wide |

## Supporting context

- The `res.end` wrap is the package's core mechanism (sessions must be persisted before the response closes); Node provides no supported hook for "before response finishes with ability to delay it", which is why this is instance rewiring. HISTORY.md's own changelog language ("res.end patch") confirms maintainer intent.
- Fourth audit in this series activating on-headers and depd — classifications consistent with compression, response-time, morgan.

**Node.js-change risk summary:** (a) `end`-contract drift: core changes relying on `end()` return semantics, duplicate-call behavior, or callback forwarding would surface latent differences on wrapped responses; (b) `this.writeHead` instance dispatch (as before); (c) `res._implicitHeader`/`res._header` are **core-private** — renaming them breaks session commit outright (this is the strongest private-API dependency in the series so far); (d) depd transient swap exposure as before.

Reconciliation note: passes A and B fully blind; identical verdict and findings; pass A additionally characterized the end-contract deltas, pass B confirmed `res.write` is never reassigned — complementary, no conflicts. Orchestrator re-verified exact line numbers (`:235`, `:266-267`, `:269`) and both depd activation sites directly.

Limitations: Node baseline is main (HTTP internals under `lib/internal/http/*` behind DEP0199 shims; line numbers commit-pinned); reproduction on Node v24.19.0; depd log-time re-entry and legacy branches (pre-`Buffer.from` safe-buffer, `DEBUG_FD`, browser builds) proven statically unable to add core patches.
