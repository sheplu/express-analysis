# Node.js patch audit: hbs

- Verdict: **confirmed patching**
- Status: complete
- Input: issue sheplu/express-analysis#20 (`hbs`, https://github.com/pillarjs/hbs)
- Library: hbs 4.4.0, git master @ `c07c01ed7333d10a139c96a63bead7733c3df30f`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): handlebars@4.7.10, walk@2.3.15 (+ foreachasync@3.0.0, neo-async, source-map, uglify-js, minimist, wordwrap)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (pass A `verify-require-extensions.js`; pass B full before/after snapshot `pass-b/repro/`)
- Scope: production/runtime code — hbs `lib/` (hbs.js, async.js) plus every resolved runtime dependency's entrypoint; runtime-reachable set established empirically via `require.cache` census (hbs, handlebars lib/index.js + dist/cjs runtime, source-map, walk, foreachasync). CLI-only deps (neo-async, uglify-js, minimist, wordwrap, handlebars precompiler) entry-checked, labeled out of runtime scope. Tests, examples, docs excluded.
- Coverage: source complete for runtime-reachable set; runtime reproduction done (both passes); upstream corroboration found (handlebars-lang/handlebars.js #953, #1174, #2046, PR #1894)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 1 classification divergence adjudicated (F-002); all claimed sites re-verified directly during reconciliation.

## Patching verdict

hbs **patches Node.js core transitively** through its hard dependency handlebars@4.7.10. hbs's own code patches nothing in Node core. Two confirmed patches, both shared core mutations of transitive origin, both fired by a plain `require('hbs')` with no opt-in:

1. **F-001 (active on all Node versions):** handlebars registers compile-on-require handlers into Node's shared CJS loader extension table via `require.extensions['.handlebars']` / `require.extensions['.hbs']` — a permanent, process-wide mutation of `Module._extensions`.
2. **F-002 (version-gated, inert on Node ≥ 12):** handlebars' no-conflict setup embeds the mathiasbynens `globalThis` polyfill — a transient `Object.prototype` getter installation plus creation of a permanent `globalThis` global — guarded by `if (typeof globalThis === 'object') return;`. Dead on the audited baseline and every currently supported Node release; reachable on legacy runtimes that hbs's own `engines: node >= 0.8` still admits.

0 instance/application overrides of Node core objects; 0 direct (hbs-authored) patches; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: `require.extensions['.handlebars'/'.hbs']` — shared CJS loader extension-table writes

- Category: shared core mutation / core module-loading interception
- Library site(s): `node_modules/handlebars/lib/index.js:23-25` (handler defined at :17-21) — https://github.com/handlebars-lang/handlebars.js/blob/v4.7.10/lib/index.js
- Origin: transitive — hbs -> handlebars@4.7.10
- Core baseline: `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379` (`require.extensions = Module._extensions;` — same object, deprecated alias) ; table defined at `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:399` (`Module._extensions = { __proto__: null };`). Original behavior: table holds only `.js`, `.json`, `.node` handlers; unknown extensions fall back to `.js` handling; `Module._findPath` probes `ObjectKeys(Module._extensions)` when guessing extensions (`loader.js:868,877`).
- Exact mutation: two new keys assigned on the shared `Module._extensions` table: `require.extensions['.handlebars'] = extension` and `require.extensions['.hbs'] = extension`, where `extension(module, filename)` reads the file and sets `module.exports = handlebars.compile(templateString)`.
- Execution chain: `require('hbs')` -> `lib/hbs.js:371` (top-level `module.exports = new Instance()`) -> `lib/hbs.js:16` (`require('handlebars').create()`) -> `handlebars/lib/index.js` module body :23-25.
- Activation: unconditional at import time (guarded only by `typeof require !== 'undefined' && require.extensions`, always true in CJS Node). Production path; no opt-in or opt-out. Note: the alternative `handlebars/runtime` entry does **not** register extensions, but hbs uses the full entry.
- Scope and restoration: process-wide (table shared by every CJS `require` in the process); permanent — never removed.
- Resulting behavior: any `require('./file.hbs')` / `require('./file.handlebars')` anywhere in the process now returns a compiled Handlebars template function instead of throwing/falling back to `.js` parsing; extensionless `require('./x')` resolution additionally probes `x.handlebars` and `x.hbs`.
- Evidence: static (sites and core baseline above); reproduction on Node v24.19.0 by both passes — `require.extensions`/`Module._extensions` gains exactly `['.handlebars', '.hbs']` immediately after `require('hbs')`; behavioral check: `require()` of a `.hbs` fixture returns a working compiled template; all other snapshot surfaces unchanged (`pass-a/verify-require-extensions.js`, `pass-b/repro/result.txt`).
- Upstream: handlebars-lang/handlebars.js #953, #1174, #2046 (bundler warnings caused by these exact lines; maintainers kept the hook). `require.extensions` is documented deprecated (Stability 0) in `$NODEJS_SOURCE/doc/api/modules.md:930-954`.

### F-002: `globalThis` polyfill — transient `Object.prototype` getter + permanent global creation (legacy Node < 12 only)

- Category: shared core mutation (global object + `Object.prototype`), version-gated legacy branch
- Library site(s): `node_modules/handlebars/dist/cjs/handlebars/no-conflict.js:9-16` — https://github.com/handlebars-lang/handlebars.js/blob/v4.7.10/lib/handlebars/no-conflict.js
- Origin: transitive — hbs -> handlebars@4.7.10
- Core baseline: `globalThis` global (V8/bootstrap-provided on Node ≥ 12); `Object.prototype` (intrinsic).
- Exact mutation (when active): `Object.prototype.__defineGetter__('__magic__', function () { return this; })`; `__magic__.globalThis = __magic__;` (creates the `globalThis` global as a side effect of the sloppy-mode getter); `delete Object.prototype.__magic__;` (prototype restored synchronously; the created `globalThis` global persists).
- Execution chain: `require('hbs')` -> `lib/hbs.js:371/:16` -> `handlebars/lib/index.js:8` -> `dist/cjs/handlebars.js` module body (`var inst = create(); ... _handlebarsNoConflict2['default'](inst);`) -> no-conflict.js:9 IIFE.
- Activation: runs at import time on every `require('hbs')`, but the first statement `if (typeof globalThis === 'object') return;` makes it a **no-op on Node ≥ 12**. Only reachable on legacy Node < 12 — a range hbs's own `engines: node >= 0.8` (package.json:31) still admits.
- Scope and restoration: `Object.prototype` mutation is transient (deleted in the same tick); the `globalThis` binding, once created, is permanent and process-wide.
- Resulting behavior (legacy runtimes only): a `globalThis` global appears where core did not define one; momentary observable `__magic__` property on every object in the process during the same synchronous sequence.
- Evidence: static (unambiguous guard + mutation); pass B repro on Node v24.19.0 confirms no-op on modern runtimes (no `Object.prototype` or global diff). Active branch untested — no Node < 12 runtime available (limitation, static proof sufficient).
- Upstream: introduced by handlebars-lang/handlebars.js PR #1894 (merged 2022-10-16, first in v4.7.8), replacing an unsafe `new Function('return this')` CSP-violating detection.
- Adjudication note: pass A rejected this site as dead code on supported runtimes; pass B confirmed it as a version-gated patch. Reconciled as **confirmed but version-gated**: the write sites are real, run on every import, and sit inside the package's declared support range; inertness on Node ≥ 12 is recorded as the activation constraint.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (14 entries), `pass-b/candidates.md` (16 entries) — same sites at slightly different granularity; 0 unresolved in both. Key entries:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-01 | `handlebars/lib/index.js:23-25` -> `Module._extensions` | confirmed -> F-001 | shared loader-table write at import time |
| C-02 | `handlebars/dist/cjs/handlebars/no-conflict.js:9-16` -> `Object.prototype`/global | confirmed -> F-002 | version-gated (Node < 12); adjudicated, see F-002 |
| C-03 | `lib/hbs.js:349-369` `localsAsTemplateData` reassigns `app.render` | rejected as Node patch | wraps an Express application object (third-party, not core); opt-in; see supporting context |
| C-04 | walk `lib/node-type-emitter.js` writes `name`/`error`/`type`/`flag` on `fs.Stats` instances | rejected | expando instance metadata; shadows no core `Stats` member (`$NODEJS_SOURCE/lib/internal/fs/utils.js`) |
| C-05 | `walk/lib/walk-async-only.js` requires `futures/forEachAsync` (historical `Array.prototype` patch vector) | rejected | dependency not installed; file unreachable from `walk` main entry |
| C-06 | foreachasync/neo-async UMD `this`/global export branches | rejected | CJS branch always taken under Node require |
| C-07 | handlebars `Exception.prototype = new Error()` | rejected | ordinary prototype inheritance from Error; mutates no core object |
| C-08 | handlebars fallback `SourceNode.prototype` definitions (`code-gen.js`) | rejected | writes to a locally defined constructor only (when source-map absent) |
| C-09 | `uglify-js/tools/node.js` `new Function` self-eval of own lib files | rejected | reads/evals its own shipped files only; CLI-only reachability |
| C-10 | source-map / minimist / wordwrap entrypoints | rejected | own-object writes only; minimist/wordwrap CLI-only |

## Supporting context

- `lib/hbs.js:349-369` (`localsAsTemplateData(app)`): monkeypatches **Express's** `app.render` (saves original, wraps to merge `app.locals` into `options._locals`). Third-party application object, opt-in API — not a Node.js core patch, but it is the one true monkeypatch in hbs's own code and worth tracking for Express compatibility.
- F-001 relies on `require.extensions`, deprecated (Stability 0) since Node 0.10. Removal or freezing of the alias/table by Node.js would break `.hbs`/`.handlebars` require()-ability and is the primary Node.js-change exposure of this package (details in `findings.md`).
- handlebars dist UMD browser bundles set a `Handlebars` browser global; never resolved by Node's require of the `handlebars` entry (bundler-only artifact).

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree | skill's six candidate pattern groups via scoped `rg -n` (logs: `pass-a/searches.md`, `pass-b/searches.md`) | all hits ledgered; loader-interception sweep surfaced F-001; internals/bindings sweeps zero-hit |
| Runtime-reachable set | `require.cache` census after `require('hbs')` (pass A + pass B repro) | hbs, handlebars lib+dist/cjs, source-map, walk, foreachasync load; neo-async/uglify-js/minimist/wordwrap do not |
| `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379`, `cjs/loader.js:399,630-640,868-877` | direct read at `d44625a4b80` | `require.extensions` aliases shared `Module._extensions`; extension probing confirms process-wide effect |
| Reproduction | `node pass-b/repro/check.js "$PACKAGE_ROOT"` (Node v24.19.0) | only diff across all snapshot surfaces: `Module._extensions` +`.handlebars`,+`.hbs` |
| Upstream handlebars.js | #953, #1174, #2046; PR #1894 | corroborate F-001 lines and F-002 origin (merged, shipped in 4.7.8+) |

## Coverage and limitations

- Entry points: `hbs` main (`lib/hbs.js`), `hbs/utils` not declared but `lib/async.js` followed; handlebars full entry (`lib/index.js` -> `dist/cjs/*`) and conditional `handlebars/runtime` entry both inspected (runtime entry registers no extensions).
- CLI-only dependency internals (uglify-js, neo-async bodies) targeted-searched, not exhaustively read — excluded by demonstrated non-reachability from `require('hbs')`, not cleared as packages.
- F-002 active branch (Node < 12) statically proven, not executed.
- Node.js baseline is main (`d44625a4b80`), not a release tag; both mechanisms (`Module._extensions` alias, `globalThis` bootstrap) are stable across supported release lines.
- Verdict pinned to resolved dep versions (handlebars@4.7.10, walk@2.3.15); hbs declares exact `handlebars: 4.7.10`, so drift risk is nil until hbs bumps it.

## Changes since the previous audit

First audit of hbs in this workspace.
