# hbs — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/hbs (default branch `master`, HEAD `c07c01ed7333d10a139c96a63bead7733c3df30f`, version 4.4.0) into the package worktree (`hbs/upstream/hbs`); installed runtime deps with `npm install --ignore-scripts --omit=dev` (handlebars@4.7.10, walk@2.3.15, foreachasync@3.0.0, neo-async, source-map, uglify-js, minimist, wordwrap).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `handlebars/lib/index.js` (extension registration), `lib/hbs.js` (:16 require, :349-369 app.render wrap, :371 export), `dist/cjs/handlebars/no-conflict.js`, `dist/cjs/handlebars.runtime.js` (no-conflict call site), hbs `package.json` engines, and the Node core baselines directly; adjudicated 1 divergence; merged into final report.

## Scope

- In scope: hbs `lib/hbs.js` + `lib/async.js`; every resolved runtime dependency's entrypoint; full read of the runtime-reachable set (handlebars lib/index.js + dist/cjs runtime tree, walk, foreachasync, source-map entry).
- Reachability established empirically: `require.cache` census after `require('hbs')` (both passes). CLI-only deps (neo-async, uglify-js, minimist, wordwrap) entry-checked and labeled out of runtime scope.
- Out of scope: tests, examples, docs, devDependencies, handlebars browser/UMD bundles (never resolved by Node require).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups (core imports; globals/Buffer/process; prototype & descriptor mutation; patch vocabulary; loader interception; internals/bindings) across each scope (hbs own code, handlebars, walk, remaining dep entrypoints), plus supplementary assignment sweeps. Internals/bindings sweeps returned zero hits; loader-interception sweep surfaced F-001.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379` — `require.extensions = Module._extensions` (deprecated alias, same object)
- `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:399` (`Module._extensions` definition), `:630-640` (unknown-extension `.js` fallback), `:868,877` (`_findPath` extension probing)
- `$NODEJS_SOURCE/lib/internal/fs/utils.js` (fs.Stats members vs walk's expandos)
- `$NODEJS_SOURCE/doc/api/modules.md:930-954` (`require.extensions` deprecation)

## Runtime reproduction

- Node v24.19.0. Pass A: `pass-a/verify-require-extensions.js`. Pass B: `pass-b/repro/check.js` + fixtures, results in `pass-b/repro/result.txt`.
- Before/after `require('hbs')` + registerHelper/registerPartials + two `__express` renders (layout + partial, fresh + cached): snapshots of fs/http/stream/events method identities and descriptors, Object/Array/String/Function prototype keys, `Object.assign`, `Module._load/_resolveFilename/_compile`, `require.extensions` keys, `require.cache`, `process.binding`, global keys.
- **Only diff:** `Module._extensions`/`require.extensions` gains `.handlebars` and `.hbs` (immediately at require time, before any render). Behavioral check: `require()` of a `.hbs` fixture returns a working compiled template. No other surface changed; F-002 confirmed no-op on modern Node.

## Reconciliation outcome

- Verdicts identical: **confirmed patching** (transitive via handlebars@4.7.10; hbs own code clean of Node patches).
- F-001 found independently by both passes with matching site, chain, scope, and core baseline.
- Disagreements: **1 classification divergence** — `no-conflict.js` globalThis polyfill: pass A rejected (dead branch on Node ≥ 12), pass B confirmed (version-gated shared mutation). Adjudicated **confirmed, version-gated (F-002)**: the writes are real, execute on every import on legacy runtimes, and fall inside hbs's declared `engines: node >= 0.8`; inertness on Node ≥ 12 recorded as activation constraint. Consistent treatment with pass A's reachability analysis preserved in the finding.
- Ledgers consistent: pass A 14 entries / pass B 16 entries, same sites at different granularity, 0 unresolved.
- Orchestrator spot-check matched all claims (all F-001/F-002 sites, call chains, engines field, core baselines re-read directly).

## Limitations

- F-002 active branch (Node < 12) proven statically only; no legacy runtime executed.
- uglify-js/neo-async internals targeted-searched, not fully read — excluded by demonstrated CLI-only reachability, not cleared as standalone packages.
- Node baseline is main (`d44625a4b80`); both implicated mechanisms are stable across current release lines.
- Verdict pinned to handlebars@4.7.10/walk@2.3.15 as resolved; hbs pins handlebars exactly, so no semver drift until hbs itself updates.
