# express — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/expressjs/express (default branch `master`, HEAD `1c6f1b0fe4000977b9a7b4f34097e4d527dd9824`, version 5.3.0) into the package worktree (`express/upstream/express`); installed runtime deps with `npm install --ignore-scripts --omit=dev` (63 packages).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end against the same pinned source, with `$NODEJS_SOURCE = Node.js main @ d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts, findings, and ledgers; re-read every claimed finding site directly in the cloned source; merged into the final `report.md` / `findings.md`.

## Scope

- In scope: `index.js`, `lib/**` (all 6 lib files read in full by both passes), every resolved runtime dependency's entrypoint/initialization (all 63; ~19 non-trivial ones read in detail).
- Out of scope: tests, examples, benchmarks, docs, devDependencies, user-supplied template engines/middleware.

## Searches run (union of both passes; full logs in `pass-a/searches.md`, `pass-b/searches.md`)

- Core import inventory: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`
- Global/core object use: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`
- Mutation primitives: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`
- Patch vocabulary: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`
- Loader interception: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` → **no hits anywhere**
- Internals/bindings: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

## Node.js core files consulted (targeted, per skill table)

- `$NODEJS_SOURCE/lib/http.js`, `lib/internal/http/common.js` (:94–97), `lib/internal/http/server.js` (:1375), `lib/internal/http/incoming.js`, `lib/internal/http/outgoing.js` (:187 — `socket = null` init, kills the on-finished legacy branch)

## Runtime reproduction

- Node v24.19.0, scripts kept beside the pass reports (`pass-a/repro-proto-check.js`, `pass-b/repro-core-mutation-check.js`).
- Method: snapshot all own property descriptors of core HTTP prototypes + relevant globals before `require('express')` and after a full request/response cycle; compare. Result: **byte-identical core state**; instance `[[Prototype]]` swap observed on live req/res; depd global swap verified restored.

## Reconciliation outcome

- Verdicts: identical (confirmed patching — instance/application overrides only).
- Findings: identical set (F-001 setPrototypeOf per request; F-002 depd transient Error global swap), same files/lines.
- Ledger differences: none material — pass A logged 45 candidate IDs, pass B 40, covering the same sites with slightly different granularity; all rejections agree in substance.
- Disagreements requiring adjudication: **none**.
- Orchestrator spot-check: `lib/application.js` (handle + mounted_app), `lib/request.js:30`, `lib/response.js:43`, `depd/index.js:380-400` re-read directly — all match the reports.

## Limitations

- Node.js baseline is `main` (d44625a4b80), not a release line; the relevant HTTP contracts are stable across express's supported range (>= 18).
- Reproduction on a single Node version (v24.19.0).
- Ancient-engine compatibility branches assessed statically only (cannot activate on supported Node versions).
