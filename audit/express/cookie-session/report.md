# Node.js patch audit: cookie-session

- Verdict: **confirmed patching — 2 transitive findings (instance override + transient global mutation)**; cookie-session's own code performs no core mutation but unconditionally activates both
- Status: complete
- Input: issue sheplu/express-analysis#13 (`cookie-session`, https://github.com/expressjs/cookie-session)
- Library: cookie-session 2.1.1, git master @ `75f53bb8f9118067955b344fb4ba550ed0e39318`, runtime dependencies installed (`--ignore-scripts --omit=dev`): cookies@0.9.1, debug, depd@2.0.0, keygrip, ms, on-headers@1.1.0, safe-buffer, tsscmp
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: writeHead override observed with prototype untouched; depd write/restore sequence captured)
- Scope: production/runtime code (`index.js`, 290 lines) plus all 8 runtime dependencies' entry/init paths. Tests/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (CVE-2025-7339/GHSA-76c9-3jph-rj3q; cookie-session's own 2014 changelog "Use on-headers instead of writeHead patching")
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict and findings**; one minor count discrepancy (depd firing once vs twice at require) resolved by orchestrator source inspection — see reconciliation note.

## Patching verdict

cookie-session's own `index.js` writes only library-owned keys on the request (accessor `req.session` via `Object.defineProperty`, `req.sessionOptions` — neither exists on core `IncomingMessage`). Both patches are transitive and unconditionally activated on the production path:

- 1 × **instance/application override** (F-001, on-headers): `res.writeHead` own-property wrapper on every handled response.
- 1 × **transient shared-global mutation** (F-002, depd via cookies): `Error.prepareStackTrace`/`stackTraceLimit` save→write→restore, firing **twice** at `require('cookie-session')`.
- 0 shared-prototype/loader/core-source patches; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: `res.writeHead` instance wrapper (via on-headers)

- Category: instance/application override (transitive)
- Library site(s): `$PACKAGE_ROOT/index.js:114` (`onHeaders(res, setHeaders)`) → `node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`)
- Origin: cookie-session → on-headers@1.1.0
- Core baseline: `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`); intercepts core's `_implicitHeader` dispatch too
- Exact mutation: own data property shadowing the prototype method; wrapper re-implements core argument handling (statusCode + header args replayed through `setHeader`/`appendHeader`/`removeHeader` instead of core's raw fast path), fires the session-save listener before headers flush, then delegates to the saved original
- Activation: unconditional per handled request; prototype untouched (repro-verified)
- Upstream: CVE-2025-7339 / GHSA-76c9-3jph-rj3q fixed in the installed 1.1.0; cookie-session's own changelog (2014) reads "Use on-headers instead of writeHead patching" — the mechanism moved, the instance patch remains

### F-002: transient swap of `Error.prepareStackTrace` / `Error.stackTraceLimit` (via cookies → depd)

- Category: shared global mutation, transient (save → mutate → synchronous restore; no try/finally)
- Library site(s): `node_modules/depd/index.js:386-387/395-396`
- Origin: cookie-session → cookies@0.9.1 → depd@2.0.0; **fires twice at require**: (1) `cookies/index.js:10` `require('depd')('cookies')` factory, (2) `cookies/index.js:232` module-level `deprecate.property(Cookie.prototype, 'maxage', …)`; plus on any deprecation log
- Core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:136-166` (core consults userland `Error.prepareStackTrace`)
- Evidence: reproduction captured the write sequence `['function','undefined','function','undefined']` (two write/restore pairs) at require; restoration verified
- Judgment note (recorded by both passes): defensible as supporting context under a stricter definition excluding synchronously-restored writes; counted confirmed for consistency with the series (same mechanism in express, body-parser, response-time, morgan, express-session)

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (16 entries), `pass-b/candidates.md` (20+ entries); 0 unresolved. Key rejections (agreed):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `Object.defineProperty(req, 'session', {…})` accessor + `req.sessionOptions` | rejected | library-owned keys; `session` not a core IncomingMessage member; enumerable+configurable accessor on the instance |
| R-02 | `cookies/index.js:147-148` `http.OutgoingMessage.prototype.setHeader.call(res, …)` | rejected | **reads** the core prototype method and `.call`s it to bypass instance wrappers (e.g. Express's res.set) — call, not write |
| R-03 | `cookies/index.js:232` `deprecate.property(Cookie.prototype, …)` | rejected as separate patch | property wrap on cookies' **own** Cookie.prototype (library object); its only core effect is firing F-002's transient swap at require |
| R-04 | cookies secure detection (`req.protocol`, `socket.encrypted` reads) | rejected | read-only |
| R-05 | debug `process.env.DEBUG` load-time write | rejected | documented env API round-trip |
| R-06 | safe-buffer | rejected | pure re-export of core buffer on modern Node (identity-checked) |
| R-07 | keygrip / tsscmp / ms | rejected | crypto call-only / pure |
| R-08 | loader interception / internal bindings / install hooks / native addons | negative | zero hits across the whole scope |

## Supporting context

- `cookies`' deliberate use of `OutgoingMessage.prototype.setHeader.call(res, …)` is the inverse of patching: it *bypasses* instance-level wrappers to reach the pristine core method. It does, however, hard-depend on that prototype method's identity/signature.
- Fifth audit in this series activating the on-headers mechanism; classifications consistent throughout.

**Node.js-change risk summary:** (a) `this.writeHead` instance dispatch (as before); (b) `OutgoingMessage.prototype.setHeader` being renamed/moved would break `cookies`' direct prototype call; (c) depd transient swap exposure as before (restore not exception-safe).

Reconciliation note: passes A and B fully blind; identical verdict and findings. Discrepancy resolved: pass A observed two depd write/restore pairs at require, pass B attributed one — orchestrator inspection found the second activation at `cookies/index.js:232` (module-level `deprecate.property`), confirming pass A's count; pass B's statement that depd's *module load itself* performs no global writes is also correct (the factory call does).

Limitations: Node baseline is main (contracts stable across release lines); `supports-color` optional dep not installed (dead branch); browser-only branches of debug/depd and safe-buffer's legacy branch unreachable under Node; reproduction on Node v24.19.0 covering the default middleware path.
