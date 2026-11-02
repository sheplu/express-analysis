# Node.js patch audit: serve-favicon

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#8 (`serve-favicon`, https://github.com/expressjs/serve-favicon)
- Library: serve-favicon 2.5.1, git master @ `1d9a8e7261557ec9a40463fd54e99b601016598c`, runtime dependencies installed (`--ignore-scripts --omit=dev`): etag@1.8.1, fresh@0.5.2, ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: identity/descriptor/prototype snapshots across require + middleware exercise — zero diffs; `require('safe-buffer') === require('buffer')` confirmed true)
- Scope: production/runtime code (`index.js`) plus all five runtime dependencies, each read in full. Tests/docs excluded. No install scripts, no nested deps.
- Coverage: source complete; runtime reproduction done (both passes)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, matching 12-entry ledgers, zero disagreements**; key sites re-verified directly during reconciliation.

## Patching verdict

serve-favicon and its dependency tree do not patch or monkeypatch Node.js core. All candidate writes resolve to library-owned state or documented instance API:

- parseurl caches parse results as `req._parsedUrl` / `req._parsedOriginalUrl` (`parseurl/index.js:54,84`) — library-owned instance metadata; the keys appear nowhere in core HTTP sources (`$NODEJS_SOURCE/lib/internal/http/incoming.js` and the `_http_incoming.js` shim).
- parseurl's fast path builds a fresh `new Url()` and assigns `path`/`href`/`pathname`/`query`/`search` on **that local instance** (`parseurl/index.js:128-141`); `Url.prototype` and the url module are untouched.
- safe-buffer's modern branch is `module.exports = buffer` — a pure re-export of the core module (runtime-verified identical); the legacy branch (dead on Node ≥ 4.5) copies Buffer statics **from** core **to** its own `SafeBuffer`, and `SafeBuffer.prototype = Object.create(Buffer.prototype)` delegates without mutating `Buffer.prototype`.
- `res.statusCode = …` (`index.js:73,216,222`) — documented per-instance shadowing of the prototype default (`lib/internal/http/server.js:285`); `setHeader`/`end` are calls (`outgoing.js:813`).
- etag/fresh/ms are pure functions (fresh and ms import no core modules at all; etag holds a read-only `Object.prototype.toString` reference).

0 confirmed patches; 0 unresolved candidates; loader-interception, internals, and patch-vocabulary sweeps all zero-hit across all six runtime files.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md`, `pass-b/candidates.md` (12 entries each, same substance, all rejected, 0 unresolved).

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `parseurl/index.js:54,84` `req._parsedUrl`/`req._parsedOriginalUrl` | rejected | library-owned cache keys; absent from core |
| R-02 | `parseurl/index.js:128-141` Url field writes | rejected | fresh local `new Url()` instance; prototype/module untouched |
| R-03 | `safe-buffer/index.js:13` modern branch | rejected | pure re-export of core buffer module |
| R-04 | `safe-buffer` legacy branch (:16-27) | rejected | copies core→own exports; dead on Node ≥ 4.5 |
| R-05 | `index.js:73,216,222` `res.statusCode =` | rejected | documented instance assignment |
| R-06 | `index.js` setHeader/end | rejected | calls only |
| R-07 | `etag/index.js:29` `Object.prototype.toString` ref | rejected | read-only alias |
| R-08 | `etag/index.js:138-145` EISDIR-shaped error | rejected | library-owned Error object |
| R-09 | fresh / ms | rejected | no core imports at all |
| R-10 | loader/internals/patch-vocab sweeps | negative | zero hits |

## Supporting context

- parseurl's fast path is a **standalone copy** of the unmerged joyent/node PR #7878 parsing logic — copied core-adjacent code that does not replace core (the url module is never modified).
- parseurl's `_parsedUrl` key is a de-facto ecosystem convention (express also reads it); it is not a Node.js core property, so a core change introducing `_parsedUrl` on IncomingMessage would collide — extremely unlikely but the only conceivable interaction.

Reconciliation note: passes A and B fully blind; identical verdict and matching ledgers; zero disagreements. Orchestrator re-read `parseurl/index.js:50-141`, `safe-buffer/index.js:10-30`, and the three `statusCode` sites — all claims match.

Limitations: reproduction on Node v24.19.0 only; safe-buffer's pre-4.5 legacy branch verified statically (writes only to local objects regardless); Node baseline is main (public `_http_*.js` files are re-export shims; `lib/internal/http/*` used as baseline).
