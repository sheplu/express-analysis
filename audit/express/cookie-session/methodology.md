# cookie-session — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #13; cloned `master` @ `75f53bb8f9118067955b344fb4ba550ed0e39318` (v2.1.1) into `cookie-session/upstream/cookie-session`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (cookies@0.9.1, debug, depd@2.0.0, keygrip, ms, on-headers@1.1.0, safe-buffer, tsscmp).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; resolved the one count discrepancy by direct source inspection (`grep` for depd/deprecate across the tree); merged into final report.

## Scope

- In scope: `index.js` (290 lines) + all 8 runtime dependencies' entry/init paths (cookies read in full — it is the header machinery).
- Out of scope: tests, docs; `supports-color` (optional debug dep, not installed); browser-only branches.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over index.js + deps. Assignment sweeps surfaced the on-headers wrap and the req.session accessor; loader/bindings sweeps zero-hit.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/server.js:423` (`writeHead` baseline + `_implicitHeader` dispatch)
- `$NODEJS_SOURCE/lib/internal/errors.js:136-166` (userland `Error.prepareStackTrace` contract)
- Core IncomingMessage member inventory (no `session`/`sessionOptions`)

## Runtime reproduction

- Node v24.19.0; scripts: `pass-a/repro-writehead-override.js`, `pass-a/repro-depd-preparestacktrace.js`, `pass-b/repro-writehead-override.js`, `pass-b/repro-globals-after-require.js`.
- Observed: writeHead override as instance own-property, prototype untouched; depd write sequence `['function','undefined','function','undefined']` (two write/restore pairs) at require, fully restored.

## Reconciliation outcome

- Verdicts identical: confirmed patching — 2 transitive findings, same sites.
- **Discrepancy (1), resolved:** pass A reported depd firing *twice* at require; pass B attributed one activation (`cookies/index.js:10`) and separately noted depd's own module load performs no writes. Orchestrator grep found the second activation: `cookies/index.js:232` module-level `deprecate.property(Cookie.prototype, …)`. Pass A's runtime count correct; pass B's static statement also correct; no substantive conflict.
- Both passes independently recorded the same judgment note on F-002's transience; counted confirmed for series consistency.
- Ledgers: A 16 / B 20+ entries, same substance; 0 unresolved.
- Cross-series consistency: on-headers = compression/response-time/morgan/express-session; depd = express/body-parser/response-time/morgan/express-session.

## Limitations

- Node baseline is main; commit-pinned line numbers.
- Reproduction on Node v24.19.0, default middleware path; other branches static.
- Legacy/browser branches excluded as unreachable under Node.
