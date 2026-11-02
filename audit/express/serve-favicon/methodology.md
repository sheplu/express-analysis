# serve-favicon — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #8; cloned `master` @ `1d9a8e7261557ec9a40463fd54e99b601016598c` (v2.5.1) into `serve-favicon/upstream/serve-favicon`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (etag, fresh, ms, parseurl, safe-buffer — no nested deps).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `parseurl/index.js:50-141`, `safe-buffer/index.js:10-30`, and serve-favicon's `statusCode` sites directly; merged into final report.

## Scope

- In scope: `index.js` + all five runtime dependencies, each read in full (six runtime files total).
- Out of scope: tests, docs.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate pattern groups over all six files. P4 (patch vocabulary), P5 (loader interception), P6 (bindings/internals): zero hits. Instance-write sweep surfaced the parseurl cache keys and statusCode writes — all classified in-contract.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/incoming.js` (+ `_http_incoming.js` shim) — `_parsedUrl` absent from core
- `$NODEJS_SOURCE/lib/internal/http/server.js:285` (`statusCode` default), `lib/internal/http/outgoing.js:813` (`setHeader`)
- url module exports (legacy `Url` class is public API)

## Runtime reproduction (both passes)

- Node v24.19.0; `pass-a/repro-no-mutation.js`, `pass-b/repro-core-snapshot.js`.
- Identity/descriptor snapshots of Buffer/buffer, url/Url.prototype, http prototypes, fs, module loader, Date.parse, Object.prototype before/after require + middleware exercise: zero diffs. `require('safe-buffer') === require('buffer')` confirmed true.

## Reconciliation outcome

- Verdicts identical: no confirmed patching in the inspected scope.
- Ledgers: 12 entries each, same substance, all rejected, 0 unresolved.
- Disagreements: **none**. Orchestrator spot-check matched all claims.
- Shared nuance both passes recorded: parseurl's fast path is a standalone copy of unmerged joyent/node PR #7878 — copied code, not a core replacement.

## Limitations

- Reproduction on one Node version (v24.19.0).
- safe-buffer's pre-Node-4.5 legacy branch verified statically only (writes only to local objects in any case).
- Node baseline is main (newer than the package's supported range); no rejection depends on baseline-specific behavior.
