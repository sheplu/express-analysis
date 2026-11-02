# errorhandler — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #14; cloned `master` @ `1922d04b78ed575ace5499b3d6f5591f2325f70b` (v1.5.2) into `errorhandler/upstream/errorhandler`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (accepts, escape-html, mime-db, mime-types, negotiator).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:86-112` (statusCode/_header/socket.destroy) and `:140-145` (error copy); merged into final report.

## Scope

- In scope: `index.js` (198 lines) + all five runtime dependencies' entry/init paths.
- Out of scope: tests, docs; `public/` template assets treated as runtime data (read-only loads).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over index.js + deps; both passes additionally swept `delete`, `Object.assign`, and `inherits/extends` patterns. All loader/bindings/mutation sweeps negative.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/server.js:285` (`statusCode` prototype default)
- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:188` (`_header` state init), `:1011` (`headersSent` public getter), `:636`

## Runtime reproduction (both passes)

- Node v24.19.0; `pass-a/repro-check.js`, `pass-b/repro-check.js` (exit 0).
- Core identity/descriptor and prototype key-set snapshots unchanged after require + middleware exercise across html/json/text negotiated branches; error object verified unmutated.

## Reconciliation outcome

- Verdicts identical: no confirmed patching in the inspected scope.
- Ledgers: A 18 / B 20 entries, same substance; all rejected; 0 unresolved.
- Both passes independently flagged the same single supporting-context item (`res._header` read, 2014 origin commit).
- Disagreements: **none**. Orchestrator spot-check matched all claims.

## Limitations

- Reproduction on one Node version (static sweep found no version-guarded branches).
- Node baseline is main; `lib/internal/http/*` cited (legacy `_http_*.js` are shims).
- Upstream gh search found no patch-related discussion (expected for a no-patch verdict).
