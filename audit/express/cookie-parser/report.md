# Node.js patch audit: cookie-parser

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#11 (`cookie-parser`, https://github.com/expressjs/cookie-parser)
- Library: cookie-parser 1.4.7, git master @ `1f2a3a2037c4efe01605e064e7cc326008be7287`, runtime dependencies installed (`--ignore-scripts --omit=dev`): cookie@0.7.2, cookie-signature@1.0.6
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: core-state checkpoints before/after require + middleware run on a real `http.IncomingMessage` — all identical)
- Scope: production/runtime code (`index.js`, 182 lines) plus both runtime dependencies read in full (570 lines total — the entire runtime surface; no other entrypoints, no lifecycle scripts). Tests/docs excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream issue search negative
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, consistent ledgers (9 vs 11 entries, same substance), zero disagreements**; key sites re-verified directly during reconciliation.

## Patching verdict

cookie-parser and its two dependencies do not patch or monkeypatch Node.js core in any form. The only writes to a core-backed object are additive library-owned metadata on the live request:

- `req.secret` / `req.cookies` / `req.signedCookies` (`index.js:51-53,60,64-65,69`) — none of these names exist on core `IncomingMessage` (`$NODEJS_SOURCE/lib/internal/http/incoming.js`, re-exported via the DEP0199 `_http_incoming.js` shim), so nothing core is shadowed; the cookie containers are created with `Object.create(null)`.
- `req.headers.cookie` (`index.js:49`) — read-only use of the public headers object; no header writes anywhere.
- cookie@0.7.2 is pure string/regex parse/serialize — imports **no core module**; load-time work is regex compilation plus read-only captures of `Object.prototype.toString`/`hasOwnProperty` (`cookie/index.js:23-24`).
- cookie-signature@1.0.6 makes plain `crypto.createHmac`/`createHash` calls (`cookie-signature/index.js:5,16-24`); no member reassignment; `timingSafeEqual` is absent in 1.0.6 entirely (unsign compares sha1 digests) — upstream 1.1.0+/1.2.x call `crypto.timingSafeEqual` directly (not a polyfill), not in this tree.

0 confirmed patches; 0 unresolved candidates; loader-interception, bindings, patch-vocabulary, and global/prototype sweeps all zero-hit.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (9 entries), `pass-b/candidates.md` (11 entries) — same substance, all rejected, 0 unresolved.

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:51-53,60,64-65,69` `req.secret`/`req.cookies`/`req.signedCookies` | rejected | additive library metadata; no core member of these names |
| R-02 | `index.js:49` `req.headers.cookie` | rejected | read-only |
| R-03 | `index.js:177` `delete` on parse output | rejected | library-owned object |
| R-04 | `cookie/index.js:23-24` prototype method captures | rejected | defensive read-only aliases |
| R-05 | `cookie-signature/index.js` crypto usage | rejected | call-only; function identities verified unchanged |
| R-06 | `Object.create(null)` containers / own exports writes | rejected | library-internal |
| R-07 | loader interception / bindings / patch vocab / global sweeps | negative | zero hits across all three files |

## Supporting context

- cookie-signature 1.0.6's unsign uses a sha1-digest comparison rather than `crypto.timingSafeEqual`; newer majors (not in this tree) call the real core API directly. Either way: usage, not patching.
- Null-prototype cookie containers close the prototype-pollution path for `__proto__`-named cookies.

Reconciliation note: passes A and B fully blind; identical verdict; consistent ledgers; zero disagreements. Orchestrator re-read `index.js:47-70`, `cookie/index.js:20-26`, and `cookie-signature/index.js:1-30` — all claims match.

Limitations: reproduction ran on Node v24.19.0 rather than a build of the baseline commit (static member inventory taken from pinned baseline source); verdict pins cookie@0.7.2 / cookie-signature@1.0.6 (different resolved versions would need re-audit).
