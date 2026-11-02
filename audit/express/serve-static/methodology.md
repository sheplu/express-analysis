# serve-static — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #19; cloned `master` @ `6e3606f2892df213e8fa738b51a36ba711e86ce8` (v2.2.1 + a few post-tag commits; runtime file identical to release) into `serve-static/upstream/serve-static`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (19 packages; send@1.2.1 central).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. send's lib was read in full by both.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-verified the import chain (`index.js:20` → `send/index.js:15` → `http-errors/index.js:15`), dep versions, and `SendStream.prototype.pipe` (`send/index.js:403`); merged into final report.

## Scope

- In scope: `index.js` (208 lines) + all 19 runtime dependencies' entry/init paths; send read in full.
- Out of scope: tests, docs.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate groups over the tree; assignment sweeps for res/stream method reassignment (zero hits — notable vs siblings); `_header`/`_implicitHeader`/`writeHead` sweeps (zero hits tree-wide); loader/bindings sweeps negative.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/errors.js:149-150` (prepareStackTrace consultation)
- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187` (kSocket = null init), `:304` (socket accessor) — on-finished dormancy
- http outgoing/server method baselines for send's documented-API verification

## Runtime reproduction

- Node v24.19.0; `pass-a/repro-prepare-stack-trace.js`, `pass-b/repro-check.js`.
- Observed: depd write/restore pair(s) at require with full restoration; zero residual core changes across http/fs/stream identities; **live-request run confirming `patchAssignSocket` unreached**; per-request depd re-fire count 0.

## Reconciliation outcome

- Verdicts identical: confirmed patching — 1 transitive transient finding (same chain and sites).
- Complementary detail merged: A characterized `SendStream.prototype.pipe` as an own-subclass method; B established no res/ReadStream method is ever reassigned and no `writeHead`/`_implicitHeader`/`_header` exists in the tree. No conflicts.
- Ledgers: A 17 / B 21 entries, same substance; 0 unresolved. Disagreements: **none**.
- Cross-series consistency: depd = 9th occurrence; dormant on-finished assignSocket = 4th occurrence (first with live-request runtime confirmation of non-application).

## Limitations

- Reproduction on Node v24.19.0; baseline claims static and commit-pinned.
- Working tree a few commits past the v2.2.1 tag (runtime file verified identical to the release).
- mime 1.x/2.x question moot — send 1.x depends on mime-types@3 (pure data).
