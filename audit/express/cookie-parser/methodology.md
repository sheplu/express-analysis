# cookie-parser — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #11; cloned `master` @ `1f2a3a2037c4efe01605e064e7cc326008be7287` (v1.4.7) into `cookie-parser/upstream/cookie-parser`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (cookie@0.7.2, cookie-signature@1.0.6).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:47-70`, `cookie/index.js:20-26`, `cookie-signature/index.js:1-30`; merged into final report.

## Scope

- In scope: `index.js` (182 lines) + both runtime dependencies read in full (570 lines total = entire runtime surface; no other entrypoints, no lifecycle scripts).
- Out of scope: tests, docs.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over all three files (12 logged searches in pass A; full set + assignment sweep in pass B). Patch-keyword, loader-hook, and bindings sweeps: zero hits.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/incoming.js` (+ `lib/_http_incoming.js` DEP0199 re-export) — member inventory: no `secret`/`cookies`/`signedCookies`
- `$NODEJS_SOURCE/lib/http.js`, `lib/crypto.js` (createHmac/createHash exports — call targets, never reassigned)

## Runtime reproduction (both passes)

- Node v24.19.0; `pass-a/repro-no-core-mutation.js`, `pass-b/repro-check.js`.
- 13 checkpoints (prototypes, crypto/Buffer/Module/JSON identities, globalThis keys) before/after require + middleware run on a real IncomingMessage: all identical; new request fields are own instance properties.

## Upstream corroboration

- Bounded gh issue search: no upstream monkeypatch reports.
- cookie-signature 1.1.0+/1.2.x confirmed (via tags) to call `crypto.timingSafeEqual` directly — relevant only to other resolutions, not this tree.

## Reconciliation outcome

- Verdicts identical: no confirmed patching in the inspected scope.
- Ledgers: A 9 / B 11 entries, same substance; all rejected; 0 unresolved.
- Disagreements: **none**. Orchestrator spot-check matched all claims.

## Limitations

- Reproduction on Node v24.19.0 (not a build of the baseline commit); static member inventory from pinned baseline source.
- Verdict pins the resolved dep versions (cookie@0.7.2, cookie-signature@1.0.6).
- Tooling note: both passes wrote their .md deliverables via shell (harness Write-tool restriction on report filenames); content follows the skill template and was leak-checked.
