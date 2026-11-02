# Node.js patch audit: vhost

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#17 (`vhost`, https://github.com/expressjs/vhost)
- Library: vhost 3.0.2, git master @ `f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99`; **zero runtime dependencies** (empty node_modules after `--omit=dev` install)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (pass A: only own-key `vhost` added to req; all checked core prototypes/descriptors unchanged)
- Scope: production/runtime code — `index.js` (164 lines), the entire runtime surface. Tests/docs excluded.
- Coverage: source complete (full assignment inventory — 23 assignments, all classified); runtime reproduction done (pass A); upstream issue search empty
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, consistent ledgers (9 vs 6 entries), zero disagreements**; key facts re-verified directly during reconciliation.

## Patching verdict

vhost cannot patch Node.js core by construction: its single 164-line runtime file contains **zero `require`/`import` statements** (orchestrator-verified) — it never loads a core module — and it has no runtime dependencies, so no transitive vector exists either. Its only interaction with core-backed objects:

- `req.vhost = vhostdata` (`index.js:61`) — the only write to a live core-backed object; a library-owned metadata key (the package's documented public API), verified absent from core `IncomingMessage`; the value is an `Object.create(null)` object (`index.js:153-160`), closing any pollution path.
- `req.headers.host` reads (`index.js:77,140`) — read-only use of the documented lazy `headers` accessor (`$NODEJS_SOURCE/lib/internal/http/incoming.js:125`); headers never mutated.
- `handle(req, res, next)` dispatch (`index.js:64`) — transparent; no req/res method wrapped, saved, or replaced.
- `Object.prototype.toString.call(val)` (`index.js:102`) — read-only brand check.

0 confirmed patches; 0 unresolved candidates; all six skill pattern groups negative.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (9 entries), `pass-b/candidates.md` (6 entries) — same substance, all rejected, 0 unresolved.

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:61` `req.vhost =` | rejected | additive library metadata; no core member named `vhost` (negative grep across core http sources) |
| R-02 | `index.js:77,140` `req.headers.host` | rejected | read-only accessor use |
| R-03 | `index.js:102` `Object.prototype.toString.call` | rejected | read-only intrinsic |
| R-04 | `index.js:153-160` null-prototype object writes | rejected | fresh library-owned object |
| R-05 | `index.js:64` handler dispatch | rejected | no wrapping/replacement |
| R-06 | historical pre-3.0 `server.emit('request', …)` | historical | public API use; removed in v3.0.0, absent from audited source |
| R-07 | P1–P6 sweeps (imports/globals/mutation/vocab/loader/bindings) | negative | zero hits |

## Supporting context

- Simplest package in this audit series: a pure host-matching function with handler dispatch. The `req.vhost` key is its documented API surface.

**Node.js-change risk:** none identified. The only core dependency is the shape of `req.headers` (documented) and the hypothetical collision if core ever added a `vhost` member to IncomingMessage.

Reconciliation note: passes A and B fully blind; identical verdict; consistent ledgers; zero disagreements. Orchestrator independently confirmed zero `require()` calls and re-read `index.js:58-65,150-162`.

Limitations: audit covers the git checkout (not npm tarball bytes); reproduction exercised the string-pattern branch (other branches static); Node baseline is main (`_http_incoming.js` DEP0199 shim followed to `lib/internal/http/incoming.js`).
