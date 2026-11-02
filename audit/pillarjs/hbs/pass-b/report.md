# Node.js patch audit: hbs (pass B, blind)

- Verdict: **confirmed patching** (transitive, via handlebars@4.7.10)
- Status: complete
- Input: issue sheplu/express-analysis#20 — `hbs`, Express view engine wrapper for Handlebars (https://github.com/pillarjs/hbs)
- Library: hbs 4.4.0, default branch `master` @ c07c01ed7333d10a139c96a63bead7733c3df30f, git clone at `$PACKAGE_ROOT` with runtime deps installed via `npm install --ignore-scripts --omit=dev` (handlebars@4.7.10, walk@2.3.15, foreachasync@3.0.0, neo-async@2.6.2, source-map@0.6.1, uglify-js@3.19.3, minimist@1.2.8, wordwrap@1.0.0). No local modifications to audited sources.
- Node.js baseline: `$NODEJS_SOURCE`, main @ d44625a4b80c672215b469906ce583ce7eeeebaf (read-only)
- Reproduction runtime: Node v24.19.0 (`repro/check.js`, results in `repro/result.txt`)
- Scope: production/runtime only — hbs entrypoint `lib/hbs.js` (+ `lib/async.js`) and everything reachable from it; each resolved runtime dependency's entrypoint; handlebars' conditional runtime entry (`runtime.js` -> dist/cjs/handlebars.runtime.js). Tests, examples, docs, devDependencies excluded.
- Coverage: source complete for runtime-reachable files; upstream corroboration done; runtime reproduction done. CLI-only transitives (neo-async, uglify-js, minimist, wordwrap) entry-checked and excluded as unreachable from `require('hbs')`.

## Patching verdict

Patching is demonstrated. Two confirmed patch sites, both **transitive** (hbs -> handlebars@4.7.10), both **shared core mutations** (no instance/application override of a Node core object was found):

1. **F-001 (unconditional):** handlebars' main entry writes two new keys into the process-wide CJS loader extension table (`require.extensions` === `Module._extensions`) at require time. This fires on every plain `require('hbs')` and changes core module loading/resolution behavior for the whole process. Category: core module interception via shared loader-state mutation.
2. **F-002 (conditional, legacy runtimes only):** handlebars' no-conflict module ships a `globalThis` polyfill that, when `typeof globalThis !== 'object'` (Node < 12), temporarily installs a getter on `Object.prototype` and permanently defines a new `globalThis` global. On the repro runtime (Node v24) and any Node >= 12 it is a guarded no-op.

hbs's own code (`lib/hbs.js`, `lib/async.js`) contains no Node core patch. Its opt-in `localsAsTemplateData(app)` replaces `app.render` on an **Express** application object — an application-level override of a third-party object, not Node core (supporting context, C-004).

Unresolved candidates: none. 13 candidates rejected with reasons (see ledger).

## Confirmed Node.js patches

### F-001: `require.extensions` / `Module._extensions` — registration of `.handlebars` and `.hbs` loader handlers

- Category: core module interception (shared mutation of core CJS loader state)
- Library site(s): node_modules/handlebars/lib/index.js:17-25 (handler defined at :17-21, writes at :24-25) — https://github.com/handlebars-lang/handlebars.js/blob/v4.7.10/lib/index.js#L23-L25 (published artifact matches)
- Origin: transitive — hbs@4.4.0 -> handlebars@4.7.10. Triggered from hbs at lib/hbs.js:16 (`require('handlebars').create()`), executed because lib/hbs.js:371 (`module.exports = new Instance()`) constructs the default instance at module load.
- Core baseline: `$NODEJS_SOURCE` lib/internal/modules/cjs/loader.js:399 (`Module._extensions = { __proto__: null }`) with built-in handlers `.js` (:2064), `.json` (:2116), `.node` (:2133); aliased to every CJS `require` as `require.extensions` at lib/internal/modules/helpers.js:379; consulted by `findLongestRegisteredExtension` (loader.js:630-641), by `Module._findPath` extension guessing (loader.js:868, 877), and dispatched at loader.js:1690. `require.extensions` is documented as Stability 0 — Deprecated since v0.10.6 (doc/api/modules.md:930-954).
- Exact mutation: on the shared `Module._extensions` object, adds keys `'.handlebars'` and `'.hbs'`, each set to handlebars' `extension(module, filename)` function, which does `module.exports = handlebars.compile(fs.readFileSync(filename, 'utf8'))`. Guarded only by `typeof require !== 'undefined' && require.extensions` (always true in Node CJS). Existing core handlers are not replaced. Permanent for the process lifetime; no restoration code.
- Execution chain: `require('hbs')` -> $PACKAGE_ROOT/lib/hbs.js:371 `new Instance()` -> lib/hbs.js:16 `require('handlebars')` -> node_modules/handlebars/lib/index.js top-level -> writes at :24-25. Also fires if the application requires `handlebars` directly; does NOT fire via the runtime-only entry `require('handlebars/runtime')` (runtime.js -> dist/cjs/handlebars.runtime.js contains no registration).
- Activation: unconditional at import; production path; no version or environment guard effective in Node.
- Scope and restoration: process-global (the same object is shared by every CJS module's `require.extensions` and by the loader internals); never restored.
- Resulting behavior: before — `require('./x.hbs')` throws (unknown extension falls back to `.js` handling and fails to parse as JS); extensionless `require('./x')` tries only `.js/.json/.node`. After — any `require()` of a `.handlebars`/`.hbs` file anywhere in the process returns a compiled Handlebars template function (compiled by handlebars' default root environment), and `Module._findPath`'s extension guessing additionally probes `x.handlebars`/`x.hbs` for extensionless requires, altering resolution order/outcomes process-wide.
- Evidence: static (sites and baselines above) and runtime — `node repro/check.js "$PACKAGE_ROOT"` on Node v24.19.0: `require.extensions`/`Module._extensions` keys diff `+[.handlebars, .hbs]` immediately after `require('hbs')` and before any render; behavioral check `require("<views>/plain.hbs")` returns `typeof function` and renders. See repro/result.txt.
- Upstream: handlebars-lang/handlebars.js issues #953, #1174, #2046 (closed) — bundler warnings ("require.extensions is not supported by webpack") caused by exactly this registration; it remains in handlebars v4.7.10 as shipped. Node docs mark `require.extensions` deprecated (Stability 0) since v0.10.6. No pillarjs/hbs issue references it.

### F-002: `globalThis` polyfill — conditional `Object.prototype` getter + new global (legacy runtimes only)

- Category: shared core mutation (global object + transient `Object.prototype` descriptor), conditional
- Library site(s): node_modules/handlebars/dist/cjs/handlebars/no-conflict.js:9-16 (source lib/handlebars/no-conflict.js) — https://github.com/handlebars-lang/handlebars.js/blob/v4.7.10/lib/handlebars/no-conflict.js#L4-L12
- Origin: transitive — hbs@4.4.0 -> handlebars@4.7.10 (invoked by both dist/cjs/handlebars.js and dist/cjs/handlebars.runtime.js via `noConflict(inst)` at load).
- Core baseline: ECMAScript/V8 `globalThis` global (available since Node 12) and `Object.prototype`; no Node lib file is rewritten.
- Exact mutation (when active): `Object.prototype.__defineGetter__('__magic__', fn)` installs an accessor on `Object.prototype`; `__magic__.globalThis = __magic__` then defines a permanent `globalThis` property on the global object; `delete Object.prototype.__magic__` removes the accessor (standard mathiasbynens globalThis polyfill).
- Execution chain: `require('hbs')` -> `require('handlebars')` -> dist/cjs/handlebars.js -> `noConflict(inst)` -> IIFE at no-conflict.js:9-16.
- Activation: guard `if (typeof globalThis === 'object') return;` — a no-op on Node >= 12; active only on legacy runtimes (hbs's engines field still permits node >= 0.8).
- Scope and restoration: the `Object.prototype` getter is removed within the same IIFE (transient); the added `globalThis` global is permanent for the process.
- Resulting behavior: on Node < 12, a `globalThis` global appears where none existed; during installation, every object briefly exposes an inherited `__magic__` accessor.
- Evidence: static (shipped code above). Runtime: not exercisable on the repro runtime — Node v24.19.0 diff shows no `Object.prototype` key changes and no `globalThis` own-key changes, confirming the guard holds on modern Node. Legacy branch untested (no Node < 12 runtime available); classification rests on static proof.
- Upstream: introduced by handlebars-lang/handlebars.js PR #1894 ("Fix for when `global` and `window` object both not found.", merged 2022-10-16, sole changed file lib/handlebars/no-conflict.js, first released in v4.7.8) replacing the earlier global/window detection with the mathiasbynens globalThis polyfill; present in v4.7.10.

## Candidate ledger and unresolved questions

Full ledger in candidates.md (C-001 .. C-016). Summary:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| C-001 | handlebars/lib/index.js:23-25, require.extensions | confirmed -> F-001 | shared loader-state write at require time |
| C-002 | handlebars dist/cjs/handlebars/no-conflict.js:9-16, Object.prototype + globalThis | confirmed -> F-002 | guarded polyfill, active only Node < 12 |
| C-003 | no-conflict.js:18-26, globalThis.Handlebars | rejected | explicit-call-only, restore-only, library-owned global name; CJS build never sets it |
| C-004 | $PACKAGE_ROOT/lib/hbs.js:349-369, app.render | rejected as Node patch | mutates Express app object (third party), opt-in |
| C-005 | code-gen.js:75-103, SourceNode.prototype | rejected | local fallback constructor, not source-map's class |
| C-006 | exception.js:64, Error | rejected | subclassing; Error.prototype untouched |
| C-007 | exception.js:29-56, defineProperty | rejected | own-instance properties |
| C-008 | proto-access.js:23-34, '__proto__' key | rejected | key write on Object.create(null) dict |
| C-009 | walk/lib/walk.js:69, util.inherits(Walker, EventEmitter) | rejected | supported API; EventEmitter.prototype unchanged |
| C-010 | walk/lib/walk-async-only.js:4-5, futures/forEachAsync (historical Array.prototype patch) | rejected | unreachable dead file; `futures` not installed |
| C-011 | foreachasync/forEachAsync.js:35, global export fallback | rejected | browser-only branch; CJS exports present |
| C-012 | $PACKAGE_ROOT/lib/hbs.js:46,282, Array.prototype.slice | rejected | read-only use |
| C-013 | handlebars own-constructor prototype setups (9 files) | rejected | library-owned constructors only |
| C-014 | uglify-js/tools/node.js:18-24, Function eval | rejected | self-contained; CLI-only |
| C-015 | precompiler.js / bin/handlebars dep requires | rejected (scope) | CLI-only; never loaded from require('hbs') (repro-verified) |
| C-016 | handlebars/lib/index.js:17-21 handler body | folded into F-001 | the installed replacement behavior itself |

Unresolved: none.

## Supporting context

- **Express `app.render` wrap (C-004):** `hbs.localsAsTemplateData(app)` ($PACKAGE_ROOT/lib/hbs.js:349-369) replaces `app.render` with a wrapper that merges `app.locals` into `options._locals` before delegating to the original. Opt-in, affects only the passed Express application instance. Express is not Node core, so this is not a Node patch, but it is the only runtime behavior-override hbs itself performs.
- **Prototype-access defaults:** hbs renders with `allowProtoMethodsByDefault: true` / `allowProtoPropertiesByDefault: true` ($PACKAGE_ROOT/lib/hbs.js:87-90), relaxing handlebars >= 4.6 prototype-access protections for templates. A security posture note, not a core patch; overridable via `runtimeOptions`.
- **Eager `source-map` load:** dist/cjs/handlebars/compiler/code-gen.js:63-71 requires `source-map` at handlebars load time (try/catch). source-map@0.6.1 was therefore fully scanned: all prototype writes are on its own types; no core mutation.
- **`handlebars/runtime` entry:** the runtime-only entry (runtime.js -> dist/cjs/handlebars.runtime.js) performs no `require.extensions` registration — only F-002's guarded polyfill. hbs does not use this entry itself.
- **Deprecated-API note:** F-001 uses `require.extensions`, a documented-but-deprecated (Stability 0 since v0.10.6) core mechanism. The skill's taxonomy still counts it: it is a write to shared core loader state that redirects core loading behavior for new extensions and changes `_findPath` resolution process-wide (it does not replace the `.js`/`.json`/`.node` handlers).

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT/lib (hbs shipped code) | six candidate pattern groups, `rg -n --no-ignore` (searches.md S1) | no core writes; only library-owned prototypes, read-only Array.prototype.slice, Express app.render wrap |
| handlebars runtime files (lib/index.js, runtime.js, dist/cjs/**) | pattern groups (searches.md S2) | F-001 at lib/index.js:24-25; F-002 at no-conflict.js:9-16; all other hits rejected (C-003, C-005..C-008, C-013) |
| walk@2.3.15 lib/ | pattern groups (searches.md S3) | util.inherits only (C-009); dead walk-async-only.js references uninstalled `futures` (C-010) |
| foreachasync@3.0.0 | pattern groups (searches.md S4) | standalone function; no Array.prototype attach in v3 (C-011) |
| source-map@0.6.1 (eagerly loaded) | pattern groups (searches.md S5) | clean; own-type prototypes only |
| neo-async, uglify-js, minimist, wordwrap entrypoints | pattern groups (searches.md S6) | zero mutation hits; CLI-only, unreachable from require('hbs') (repro-verified package load list) |
| $NODEJS_SOURCE lib/internal/modules/cjs/loader.js, lib/internal/modules/helpers.js, doc/api/modules.md | targeted `rg -n` (searches.md) | Module._extensions definition/consumers; require.extensions alias; deprecation Stability 0 since v0.10.6 |
| handlebars upstream | https://github.com/handlebars-lang/handlebars.js/issues/953, /issues/1174, /issues/2046; PR #1894 | corroborate F-001 shipping and bundler impact; origin of F-002 polyfill |
| Runtime reproduction | `node repro/check.js "$PACKAGE_ROOT"` (Node v24.19.0) | only diff: `require.extensions`/`Module._extensions` `+[.handlebars, .hbs]`; identities/descriptors of fs/http/stream/events/Object/Array/String/Function surfaces, Module._load/_resolveFilename/_compile/require, Object.assign, process.binding, globalThis keys, require.cache builtin-like keys all unchanged; `.hbs` file became require()-able (repro/result.txt) |

## Coverage and limitations

- Entry points covered: hbs main `lib/hbs.js` (+ `lib/async.js`); handlebars main `lib/index.js` and conditional runtime entry `runtime.js`; walk main `lib/walk.js` (+ node-type-emitter.js); foreachasync main; source-map main + lib (eagerly loaded at require('hbs')); entry checks for CLI-only neo-async, uglify-js, minimist, wordwrap and for `bin/handlebars`/`dist/cjs/precompiler.js`.
- Runtime-reachable package set verified empirically: hbs, handlebars, walk, foreachasync, source-map. neo-async/uglify-js/minimist/wordwrap load only in the `handlebars` CLI process — their internals (notably uglify-js' and neo-async's bodies) were not exhaustively read; labeled out of runtime scope rather than cleared.
- handlebars `lib/*.js` other than index.js are untranspiled ESM source never resolved by Node's CJS require (dist/cjs is the executed build); `dist/handlebars*.js` UMD bundles resolve only via the `browser` field and are out of Node runtime scope (note: the UMD bundle, unlike the CJS build, assigns a `Handlebars` global in browsers).
- F-002's active branch (Node < 12) was not executed — no legacy runtime available; the static code and guard are unambiguous. A Node < 12 run would be needed to observe the mutation live.
- Reproduction exercised: require('hbs'), registerHelper, registerAsyncHelper (async waiter path), registerPartials (walk + fs path), two `__express` renders (compile + cached) with layout and partial, on Node v24.19.0. A tested branch cannot prove universal absence; untested branches include error paths and Express 2.x `Instance.prototype.compile`, all read-only per static review.
- Node.js baseline is `main` (d44625a4b80), newer than any release; the cited loader lines were verified at that ref. `require.extensions` semantics are stable across supported Node versions.
- No audited source was modified; nothing was posted externally.

## Changes since the previous audit

First audit (pass B, blind — no prior pass-b report existed; other audit artifacts intentionally not read).
