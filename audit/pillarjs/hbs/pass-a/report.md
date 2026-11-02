# Node.js patch audit: hbs

- Verdict: **confirmed patching**
- Status: complete
- Input: issue sheplu/express-analysis#20 — `hbs` (Express view engine wrapper for Handlebars), https://github.com/pillarjs/hbs
- Library: hbs 4.4.0, default branch `master` @ `c07c01ed7333d10a139c96a63bead7733c3df30f`, git clone with runtime deps installed via `npm install --ignore-scripts --omit=dev` (handlebars@4.7.10, walk@2.3.15, foreachasync@3.0.0, neo-async@2.6.2, source-map@0.6.1, uglify-js@3.19.3, minimist@1.2.8, wordwrap@1.0.0); no local modifications
- Node.js baseline: main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (read-only, targeted files only)
- Reproduction runtime: Node v24.19.0 (`node verify-require-extensions.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only — hbs entrypoint `lib/hbs.js` (package.json `main`) and everything reachable from it; each resolved runtime dependency's entrypoint/initialization including handlebars' conditional `handlebars/runtime` entry; CLI-only transitives (neo-async, uglify-js, minimist, wordwrap, handlebars precompiler) checked at entry level and labeled. Tests, examples, docs, devDependencies excluded.
- Coverage: source complete for the runtime-loaded set (verified against the actual `require.cache` after `require('hbs')`); upstream corroboration via handlebars-lang/handlebars.js issues; runtime reproduction executed. No unresolved candidates.

## Patching verdict

Patching was demonstrated: **1 confirmed patch**, a shared core mutation in the
module-interception category, of **transitive** origin
(hbs → handlebars@4.7.10). Loading `hbs` unconditionally registers two new
handlers on the process-wide CommonJS extension-handler table
(`require.extensions`, which Node aliases to the shared `Module._extensions`
object), changing how every module in the process loads and resolves
`.handlebars`/`.hbs` files. The registration is additive — it installs handlers
for previously unregistered extensions through a documented-but-deprecated core
API, and does not replace the built-in `.js`/`.json`/`.node` handlers — but it
is a permanent, process-wide mutation of shared core loader state that
redirects core loading behavior for matching files and widens extensionless
resolution.

Zero instance/application overrides of Node core were found. (hbs's opt-in
`localsAsTemplateData` wraps `app.render`, but that is an Express object, not
Node core — see supporting context.) 13 candidates were rejected; none remain
unresolved. The only activation-gated near-miss is handlebars' legacy
`globalThis` polyfill, which is a dead branch on any Node providing
`globalThis` (v12+), including the audited baseline.

## Confirmed Node.js patches

### F-001: `Module._extensions` — registration of `'.handlebars'` and `'.hbs'` loader handlers via `require.extensions`

- Category: core module interception (shared core mutation of CJS loader state; additive handler registration, no built-in handler replaced)
- Library site(s): `node_modules/handlebars/lib/index.js:17-25` (installed artifact; handler function defined at :17-21, writes at :24-25) — upstream source: https://github.com/handlebars-lang/handlebars.js/blob/v4.7.10/lib/index.js
- Origin: transitive — hbs 4.4.0 → handlebars@4.7.10 (declared pinned dependency, https://github.com/pillarjs/hbs/blob/c07c01ed7333d10a139c96a63bead7733c3df30f/package.json)
- Core baseline: `$NODEJS_SOURCE` @ `d44625a4b80c672215b469906ce583ce7eeeebaf`:
  - `lib/internal/modules/helpers.js:379` — `require.extensions = Module._extensions;` (every CJS `require` exposes the one shared table)
  - `lib/internal/modules/cjs/loader.js:399` — `Module._extensions = { __proto__: null };` with default handlers `.js` (:2064), `.json` (:2116), `.node` (:2133)
  - `lib/internal/modules/cjs/loader.js:630-640` — `findLongestRegisteredExtension`: unregistered extensions fall back to the `'.js'` handler
  - `lib/internal/modules/cjs/loader.js:868,877` — `Module._findPath` tries `ObjectKeys(Module._extensions)` for extensionless specifiers
  - `lib/internal/modules/cjs/loader.js:1687-1690` — `Module.prototype.load` dispatches through `Module._extensions[extension]`
  - `doc/api/modules.md` § `require.extensions` (~:930) — API documented and deprecated
- Exact mutation: adds two own properties to the shared null-prototype `Module._extensions` object: key `'.handlebars'` and key `'.hbs'`, both set to handlebars' `extension(module, filename)` function, which reads the file with `fs.readFileSync` and sets `module.exports = handlebars.compile(templateString)`. Guard: `typeof require !== 'undefined' && require.extensions` (always true under Node CJS). No existing key is overwritten or deleted.
- Execution chain: `require('hbs')` → `$PACKAGE_ROOT/lib/hbs.js:374` `module.exports = new Instance()` → `lib/hbs.js:16` `require('handlebars')` (argument is undefined for the default export) → `node_modules/handlebars/lib/index.js:23-25` writes. Runs during module initialization, before any hbs API is called.
- Activation: unconditional at import time on hbs's default path; production code; no environment or option gate. It cannot be avoided through hbs: even `hbs.create(userHandlebars)` runs after the top-level `new Instance()` has already loaded the full handlebars entry. (handlebars' own `handlebars/runtime` entry omits the registration, but hbs does not use it.)
- Scope and restoration: process-wide (shared by every CJS `require` in the process) and permanent — handlebars never removes the keys. If multiple handlebars copies load, the last registration wins for both keys.
- Resulting behavior: before — `require('./tpl.hbs')` resolves the file but loads it through the `'.js'` fallback (template source parsed as JavaScript, typically SyntaxError), and `require('./tpl')` never considers `tpl.hbs`/`tpl.handlebars`; after — any module in the process can `require` a `.hbs`/`.handlebars` file and receives a compiled template function, and extensionless resolution additionally probes `.handlebars` and `.hbs` candidates in `Module._findPath`. This changes module loading and resolution semantics for the whole application, not just hbs consumers.
- Evidence: static (sites and core baseline above) plus reproduction `node verify-require-extensions.js "$PACKAGE_ROOT"` on Node v24.19.0: after `require('hbs')`, `Module._extensions` gained exactly `['.handlebars', '.hbs']`; `require.extensions === Module._extensions` is true; both keys hold the same handlebars `extension` function; default `.js`/`.json` handlers and `Module._load` / `Module._resolveFilename` / `Module.prototype._compile` / `fs.readFile(Sync)` identities unchanged; no builtin-prototype or global changes.
- Upstream: longstanding, intentional handlebars behavior; acknowledged in closed issues handlebars-lang/handlebars.js#953, #1174, and #2046 (webpack's "require.extensions is not supported" warnings triggered by these exact lines). Node documents `require.extensions` as deprecated (`$NODEJS_SOURCE doc/api/modules.md` § `require.extensions`).

No other confirmed patches: hbs's own code, walk, foreachasync, and source-map
perform no core writes; neo-async, uglify-js, minimist, and wordwrap are not on
the runtime path and their entrypoints are clean.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | handlebars `lib/index.js:23-25`, `require.extensions`/`Module._extensions` | confirmed → F-001 | reproduction + core baseline |
| C-002 | handlebars `dist/cjs/handlebars/no-conflict.js:10-15`, `Object.prototype` + global `globalThis` polyfill | rejected as patch | dead branch on Node >= 12 (`typeof globalThis === 'object'` guard); legacy-env-only |
| C-003 | handlebars `no-conflict.js:18-26`, `globalThis.Handlebars` | rejected | user-invoked restore of a browser global; CJS build never sets it |
| C-004 | hbs `lib/hbs.js:349-368`, `app.render` wrapper | rejected as Node patch | target is an Express app object, not Node core; opt-in, per-instance |
| C-005 | walk `lib/walk.js:76,79` + `lib/node-type-emitter.js:35,53`, fs.Stats expandos | rejected | instance metadata; no core member shadowed (Stats baseline checked) |
| C-006 | walk `lib/walk.js:69`, `util.inherits(Walker, EventEmitter)` | rejected | ordinary inheritance |
| C-007 | walk `lib/walk-async-only.js:5`, `futures` Array.prototype pollution | rejected | unreachable alternative entry; `futures` not installed |
| C-008 | foreachasync `forEachAsync.js:35`, global fallback | rejected | CJS `exports` branch always taken in Node |
| C-009 | neo-async `async.js:1-11`, UMD global attach | rejected | CJS branch taken; CLI-only reachability; no builtin writes |
| C-010 | handlebars `exception.js:26,45-54,64`, Error subclass | rejected | own prototype/instances only; `Error.prototype` untouched |
| C-011 | uglify-js `tools/node.js:18-24`, `new Function` self-eval | rejected | loads only its own files; no loader/core interaction; CLI-only |
| C-012 | handlebars `logger.js:25-41`, console | rejected | read/invoke only |
| C-013 | minimist `index.js:20`, `__proto__` | rejected | defensive read; CLI-only |
| C-014 | source-map `lib/source-map-consumer.js:65,78,444,936`, defineProperty | rejected | own class prototypes only |

0 unresolved candidates.

## Supporting context

- **Express application monkeypatch (not Node core), C-004:** opt-in
  `hbs.localsAsTemplateData(app)` (`lib/hbs.js:349-368`) replaces the passed
  Express app's `render` method with a wrapper that merges `app.locals` into
  `options._locals` before delegating to the original. It mutates a third-party
  (Express) object per application instance; no Node.js API is involved. Worth
  knowing for consumers, but outside the Node-patch verdict by the skill's
  loader/third-party rule.
- **Legacy `globalThis` polyfill, C-002:** handlebars' `no-conflict.js` runs at
  load and, only when `globalThis` is absent (Node < 12 / old browsers), would
  temporarily define an `Object.prototype.__magic__` getter (deleted
  immediately) and permanently create the `globalThis` global. hbs 4.4.0
  declares `engines.node >= 0.8`, so on ancient runtimes this branch would
  execute; on the audited baseline and any Node >= 12 it is provably inert
  (reproduction showed zero prototype/global changes).
- **Instance metadata on fs.Stats, C-005:** walk annotates lstat results with
  `name`/`error`/`type`/`flag` expandos for its event API — additive,
  per-instance, shadowing no core Stats member.
- **CLI-only surface:** handlebars' precompiler (`dist/cjs/precompiler.js`) and
  its deps neo-async, uglify-js (optional), minimist, wordwrap are reachable
  only through the `handlebars` CLI binary, never from hbs's runtime path
  (confirmed by the loaded-module census). Their entrypoints were still checked
  and are clean.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/lib`, dep runtime files | six skill pattern groups via `rg -n` (full log in `searches.md`) | G5 hit → F-001; all other hits rejected (ledger) |
| Runtime module census | `node -e "require('$PACKAGE_ROOT'); ...Object.keys(require.cache)..."` | loaded set = hbs lib (2), handlebars lib/index.js + dist/cjs (34), source-map (11), walk (2), foreachasync (1); none of neo-async/uglify-js/minimist/wordwrap/precompiler |
| Before/after core-state reproduction | `node verify-require-extensions.js "$PACKAGE_ROOT"` (Node v24.19.0) | confirms F-001 mutation and absence of any other core/global/prototype change |
| `$NODEJS_SOURCE lib/internal/modules/helpers.js:379` | targeted read | `require.extensions` aliases shared `Module._extensions` |
| `$NODEJS_SOURCE lib/internal/modules/cjs/loader.js:399,630-640,868,877,1687-1690,2064,2116,2133` | targeted read | shared table, `.js` fallback, resolution and dispatch effects of registration |
| `$NODEJS_SOURCE lib/internal/fs/utils.js:479-517,800` | targeted read | fs.Stats has no `name`/`error`/`type`/`flag`; walk expandos shadow nothing |
| `$NODEJS_SOURCE doc/api/modules.md` § `require.extensions` | targeted read | API deprecated; registration pattern documented |
| handlebars upstream | https://github.com/handlebars-lang/handlebars.js/issues/953, /issues/1174, /issues/2046 (all closed) | maintainers acknowledge the `require.extensions` registration in the Node entry (surfaces as webpack warnings); behavior intentional and long-standing |
| hbs upstream | https://github.com/pillarjs/hbs/blob/c07c01ed7333d10a139c96a63bead7733c3df30f/lib/hbs.js | audited entrypoint at the pinned commit |
| handlebars 4.7.10 source | https://github.com/handlebars-lang/handlebars.js/blob/v4.7.10/lib/index.js | published-tag source of F-001 site |

## Coverage and limitations

- Entrypoints: hbs `lib/hbs.js` (`main`; no `exports` map) and `lib/async.js` —
  fully read. Dependency entries resolved and inspected: handlebars
  `lib/index.js` (main) and conditional `runtime.js` → `dist/cjs/handlebars.runtime.js`
  (no extension registration there); walk `lib/walk.js`; foreachasync
  `forEachAsync.js`; source-map `source-map.js` + all 10 `lib/` files;
  CLI-only: neo-async `async.js`, uglify-js `tools/node.js`, minimist
  `index.js`, wordwrap `index.js` (entry-level checks, labeled out of runtime
  path).
- The runtime scan set was cross-checked against the actual modules loaded by
  `require('hbs')`; the two sets match, so no runtime-reachable file went
  unscanned.
- Not exhaustively content-read: uglify-js `lib/*` bodies and the full 8k-line
  neo-async implementation beyond targeted builtin-mutation/global/loader
  searches — justified by their CLI-only reachability from hbs and clean
  entry/targeted scans. A patch hidden in those bodies could only affect the
  `handlebars` CLI, not hbs runtime consumers.
- walk's `walk-async-only.js` excluded as unreachable (and unloadable: missing
  `futures` dependency); if an application required it directly it would throw
  before any patch could apply.
- Reproduction ran on Node v24.19.0; the legacy branch in C-002 (Node < 12
  globalThis polyfill) was analyzed statically only, as no legacy runtime was
  available — on such runtimes handlebars would additionally create the
  `globalThis` global. This does not affect the verdict on current Node.
- Node baseline is `main` (`d44625a4b80`), not a release tag; the
  `require.extensions` alias and `Module._extensions` dispatch semantics are
  stable across supported release lines (same mechanism documented in
  `doc/api/modules.md`).
- What would change the verdict: nothing found pending; removing the
  registration upstream (or hbs switching to `handlebars/runtime` +
  precompiled templates) would flip the verdict to no confirmed patching.

## Changes since the previous audit

First audit (Pass A of the two-pass blind protocol); no previous report.
