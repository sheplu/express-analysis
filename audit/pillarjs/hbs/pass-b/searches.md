# Search log — hbs@4.4.0 pass B (blind)

Tooling: `rg -n --no-ignore` run from `$PACKAGE_ROOT` (hbs upstream clone, master @ c07c01ed7333d10a139c96a63bead7733c3df30f) and from `$PACKAGE_ROOT/node_modules/<dep>`. All scopes are runtime-shipped files only (tests/examples/docs excluded).

Scopes:
- S1 = `$PACKAGE_ROOT/lib` (hbs shipped code: lib/hbs.js, lib/async.js; package.json main = lib/hbs.js)
- S2 = `node_modules/handlebars` runtime-resolved files: `lib/index.js`, `runtime.js`, `dist/cjs/**` (main = lib/index.js -> dist/cjs/handlebars.js; conditional entry `handlebars/runtime` -> runtime.js -> dist/cjs/handlebars.runtime.js). `lib/*.js` other than index.js are untranspiled ESM source never resolved by Node CJS require; `dist/handlebars*.js` UMD bundles resolve only via the `browser` field (out of Node runtime scope).
- S3 = `node_modules/walk/lib` (main = ./lib/walk.js)
- S4 = `node_modules/foreachasync/forEachAsync.js` (main)
- S5 = `node_modules/source-map/source-map.js` + `lib/` (eagerly required at handlebars load by dist/cjs/handlebars/compiler/code-gen.js:63-71, inside try/catch)
- S6 = CLI-only dep entrypoints (entry check before exclusion): `neo-async/async.js`, `uglify-js/tools/node.js`, `minimist/index.js`, `wordwrap/index.js`, `handlebars/bin/handlebars`, `handlebars/dist/cjs/precompiler.js`

## Group 1 — imports / dynamic loading
Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

- S1: hits — lib/hbs.js:1 (fs), :2 (path), :3 (walk), :5 (./async), :16 (handlebars, lazy in `Instance()` when no instance passed; fires on plain `require('hbs')` because module.exports = new Instance()). No dynamic/computed loading.
- S2 (non-relative only): lib/index.js:18 (fs, inside registered extension handler); dist/cjs/precompiler.js:13 (neo-async), :17 (fs), :27 (path), :29 (source-map), :358 (uglify-js, lazy); dist/cjs/handlebars/compiler/code-gen.js:68 (source-map, top-level try/catch — eager at require('handlebars') time).
- S3: hits — walk/lib/walk.js:7-12 (fs, foreachasync, events, ./node-type-emitter, util, path); walk/lib/walk-async-only.js:5 `require('futures/forEachAsync')` (file not referenced by main entry; `futures` not installed — unreachable, would throw).
- S4: no require calls.
- S5: only relative requires of its own lib files.
- S6: bin/handlebars:106 (../dist/cjs/precompiler), :138 (minimist), :144 (wordwrap) — CLI process only.

## Group 2 — Buffer / process / global(This) / extends / inherits
Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

- S1: 1 hit, lib/hbs.js:162 — comment only ("check global layout state"). Zero code hits.
- S2: dist/cjs/handlebars/no-conflict.js:1,10-23 — globalThis polyfill + noConflict (see C-002/C-003); dist/cjs/precompiler.js:63-68 process.stdin (CLI only); comments in runtime.js:240, code-gen.js:1, javascript-compiler.js:639. No Buffer use.
- S3: walk/lib/walk.js:69 `util.inherits(Walker, EventEmitter)` (C-009); :217, :277 comments.
- S4: `new Function('return this')()` export fallback at forEachAsync.js:35 (C-011).
- S5: zero hits (scoped write-pattern variant: `\bglobalThis\b|\bglobal\b\s*[.\[=]|\binherits\s*\(` — ZERO).
- S6: neo-async env detection (`typeof self/global`) for export target only; uglify tools/node.js uses process.env (CLI); minimist/wordwrap ZERO.

## Group 3 — prototype writes / __proto__ / defineProperty / Object.assign
Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` (plus assignment-only variant `\.prototype(\.[A-Za-z_$]+)?\s*=`)

- S1: hits — lib/async.js:21,27,45 (Waiter.prototype, library-owned); lib/hbs.js:254,269,273,277,342,349 (Instance.prototype, library-owned); lib/hbs.js:46,282 `Array.prototype.slice.call(arguments)` (read-only use, C-015). No core prototype writes. No Object.assign.
- S2: all `.prototype =` writes target library-owned constructors: parser.js:733 (Parser), visitor.js:40, printer.js:23-182 (PrintVisitor), code-gen.js:83 (local fallback SourceNode — only defined when source-map failed to load; C-005), code-gen.js:125 (CodeGen), compiler.js:34, javascript-compiler.js:26, whitespace-control.js:17-138, safe-string.js:9, base.js:55 (HandlebarsEnvironment), exception.js:64 `Exception.prototype = new Error()` (C-006). defineProperty: exception.js:46,50 on `this` (own instance, C-007). `__proto__`: internal/proto-access.js:25 key write on `Object.create(null)` dictionary (C-008); visitor.js:26 comment. No Object.assign; no setPrototypeOf; no Reflect mutations.
- S3: walk.js:71-290 Walker.prototype (library-owned); walk-async-only.js:4 comment referencing `Array.prototype.forEachAsync` (historical patch vector; file unreachable — C-010).
- S4: zero mutation hits (package.json description mentions Array.prototype only as prose).
- S5: all prototype assignments on own types (SourceMapConsumer/Generator/SourceNode/ArraySet/MappingList); shared-proto write-pattern scan ZERO.
- S6: neo-async/minimist/wordwrap ZERO on shared-proto write patterns; uglify tools/node.js builds own exports via Function eval (C-013).

## Group 4 — monkeypatch / patch / wrap / shim / polyfill / override words
Pattern: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride` (case-insensitive)

- S1: lib/hbs.js:24 comment ("override hbs's defaults") — documentation of options precedence, not code.
- S2: runtime.js:64 and javascript-compiler.js:27 comments describing user-overridable library APIs. No patching helpers (no shimmer/require-in-the-middle style code).
- S3: ZERO. S4: ZERO. S5: ZERO (monkeypatch/shim/polyfill variant).

## Group 5 — module system interception
Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

- S1: ZERO.
- S2: **lib/index.js:23-25 — `require.extensions['.handlebars'] = extension; require.extensions['.hbs'] = extension;`** guarded only by `typeof require !== 'undefined' && require.extensions`. CONFIRMED patch site (C-001 -> F-001).
- S3: ZERO. S4: ZERO. S5: ZERO. S6: ZERO.

## Group 6 — bindings / core internals
Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

- S1: ZERO. S2: ZERO. S3: ZERO. S4: ZERO. S5: ZERO. S6: ZERO.

## Node.js core baseline lookups ($NODEJS_SOURCE, main @ d44625a4b80, read-only)
- `rg -n "_extensions" lib/internal/modules/cjs/loader.js` — Module._extensions defined at loader.js:399 (`{ __proto__: null }`); built-in handlers `.js` :2064, `.json` :2116, `.node` :2133; consulted by findLongestRegisteredExtension loader.js:630-641 and by Module._findPath extension guessing loader.js:868/877; dispatch at loader.js:1690.
- `rg -n "extensions" lib/internal/modules/helpers.js` — helpers.js:379 `require.extensions = Module._extensions` (every CJS require shares the same object handlebars mutates).
- `rg -n "require.extensions" doc/api/modules.md` — doc/api/modules.md:930-954: added v0.3.0, **deprecated v0.10.6, Stability 0**; "Avoid using require.extensions".

## Upstream corroboration
- `gh search issues --repo handlebars-lang/handlebars.js "require.extensions"` — hits confirming the registration ships and is observed by bundlers: #953, #2046, #1174 (webpack warns "require.extensions is not supported"), all closed. 
- `gh search issues --repo pillarjs/hbs "require.extensions"` — zero results (hbs itself has no issue on it).
- `gh search prs --repo handlebars-lang/handlebars.js "globalThis"` — PR #1894 "Fix for when `global` and `window` object both not found." (merged 2022-10-16; sole file lib/handlebars/no-conflict.js) — origin of the F-002 globalThis polyfill, first in v4.7.8, present in v4.7.10.
