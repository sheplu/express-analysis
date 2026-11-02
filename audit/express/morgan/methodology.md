# morgan — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #10; cloned `master` @ `b1272e70812dbc504321eeb5a43d14b0822c150d` (v1.12.1) into `morgan/upstream/morgan`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (basic-auth, debug@2.6.9, depd@2.0.0, ee-first, ms, on-finished, on-headers@1.1.0, safe-buffer@5.1.2).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-verified `index.js:29` (depd factory), `:171` (onHeaders), `:198` (deprecate.property), and the `_startAt`/`_startTime`/`_remoteAddress` metadata writes; merged into final report.

## Scope

- In scope: `index.js` (596 lines) + all 8 runtime dependencies' runtime files read in full.
- Out of scope: tests, docs; debug browser/Electron entries and `DEBUG_FD` branches (not loaded in a Node server process).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups (P1–P6) over morgan + each dependency. P5 (loader interception) and P6 (bindings/internals): zero hits tree-wide. Core-collision grep for `_startAt`/`_startTime`/`_remoteAddress`/`__onFinished` across core http sources: negative.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/server.js:419-423` (writeHead + `_implicitHeader` dispatch), `:312-321`, `:1410` (assignSocket timing)
- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187` (`kSocket = null` initialization — kills patchAssignSocket reachability)
- `$NODEJS_SOURCE/lib/internal/errors.js:168` and `lib/internal/bootstrap/realm.js:509` (Node's own default `Error.prepareStackTrace` + userland override contract)

## Runtime reproduction

- Node v24.19.0; scripts `pass-a/repro.js`, `pass-b/repro-writehead.js`.
- Observed: writeHead override exists as instance own-property with prototype untouched; two depd write/restore pairs at require; patchAssignSocket **not** applied to a live response; debug's env round-trip value-identical.

## Reconciliation outcome

- Verdicts identical: confirmed patching — 2 transitive findings, same sites/lines.
- Both passes independently proved on-finished's `patchAssignSocket` dormant **despite morgan passing res** (the reachability question flagged going in): `kSocket = null` + attach-after-assignSocket ordering.
- Ledgers: A 24 / B 29 entries, same substance; 0 unresolved. Disagreements: **none**.
- Cross-series consistency: on-headers mechanism matches compression/response-time reports; depd matches express/body-parser/response-time.

## Limitations

- `immediate`/`buffer`/deprecation-log paths resolved statically.
- Reproduction on a single Node version (v24.19.0); baseline is main (release lines carry the same logic in `lib/_http_*.js`).
