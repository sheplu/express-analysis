# express-session — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #12 (expressjs/session); cloned `master` @ `8947e169ae838b22cc1af198e50e370e6fc09f96` (v1.19.0 + unreleased master changes) into `session/upstream/express-session`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (10 packages).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-verified exact line numbers via grep (`onHeaders` :235, saves :266-267, `res.end =` :269) and both depd activation sites (`index.js:20`, `session/cookie.js:15`); merged into final report.

## Scope

- In scope: `index.js` (741 lines), `session/{cookie,memory,session,store}.js`, every runtime dependency's entry/init path.
- Out of scope: tests, docs; debug's Electron/browser branches (unreachable in Node server).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over all runtime files + deps; assignment sweeps for `res\.\w+ *=` surfaced the end/writeHead wraps; loader-interception and bindings sweeps zero-hit.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289` (`end` baseline; `_implicitHeader`/`_header` private members)
- `$NODEJS_SOURCE/lib/internal/http/server.js:423-424` (`writeHead` baseline + `_implicitHeader` dispatch)
- `$NODEJS_SOURCE/lib/_http_incoming.js` (DEP0199 shim; member inventory — no session/sessionID/sessionStore)

## Runtime reproduction

- Node v24.19.0; `pass-a/repro.js`, `pass-b/repro/` (script + sanitized output).
- Observed: both wraps exist as instance own-properties with prototypes untouched; depd write/restore — **4 global writes captured at require** (two deprecate factories), full restoration after require and after a fired deprecation; wrapped `end` idempotency exercised.

## Reconciliation outcome

- Verdicts identical: confirmed patching — same 3 findings, same sites/lines.
- Complementary detail merged: pass A characterized end-contract deltas (return value, duplicate calls, dropped callback); pass B established `res.write` is captured but never reassigned. No conflicts.
- Ledgers: A 25 / B 29 entries, same substance; 0 unresolved. Disagreements: **none**.
- Line-number verification: orchestrator's initial sed offsets disagreed with agent-cited lines; resolved by grep — **agents' numbers were exactly right** (:235/:266-267/:269).
- Cross-series consistency: on-headers mechanism = compression/response-time/morgan; depd = express/body-parser/response-time/morgan; end-wrap contract drift = compression's F-002 class.

## Limitations

- Node baseline is main (DEP0199 shims; commit-pinned line numbers).
- Reproduction on a single Node version (v24.19.0).
- depd log-time re-entry and legacy branches (pre-Buffer.from safe-buffer, DEBUG_FD, browser builds) statically proven unable to add core patches.
- Both passes wrote their .md deliverables via shell heredocs (harness Write-tool restriction); content leak-checked.
