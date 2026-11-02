# Pass A — search log (hbs@4.4.0)

All searches run with `rg -n` (plus `--no-ignore` inside `node_modules`). Scopes
are relative to `$PACKAGE_ROOT` (= hbs upstream clone at
`c07c01ed7333d10a139c96a63bead7733c3df30f`, deps installed with
`npm install --ignore-scripts --omit=dev`). Node core checks relative to
`$NODEJS_SOURCE` (main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`).

## Scopes

| Scope ID | Files | Runtime reachability |
| --- | --- | --- |
| S1 | `$PACKAGE_ROOT/lib/` (hbs.js, async.js) | direct, loaded at `require('hbs')` |
| S2 | `node_modules/handlebars/lib/index.js` + `node_modules/handlebars/dist/cjs/**` | transitive, `lib/index.js` + all of `dist/cjs/handlebars*` loaded at `require('hbs')`; `dist/cjs/precompiler.js` CLI-only |
| S3 | `node_modules/walk/lib/` + `node_modules/foreachasync/forEachAsync.js` | transitive, `walk.js`/`node-type-emitter.js`/`forEachAsync.js` loaded at `require('hbs')`; `walk-async-only.js` unreachable alternative entry |
| S4 | `node_modules/source-map/source-map.js` + `lib/` | transitive, fully loaded at `require('hbs')` (top-level `require('source-map')` in handlebars code-gen) |
| S5 | `node_modules/neo-async/async.js`, `node_modules/uglify-js/tools/node.js`, `node_modules/minimist/index.js`, `node_modules/wordwrap/index.js` | CLI-only (handlebars precompiler / bin); entrypoint-level checks only |

Runtime reachability was confirmed dynamically by enumerating `require.cache`
after `require('hbs')` (see report, Sources). The loaded set matches S1–S4
exactly; nothing from S5 loads.

## Skill pattern group searches

### G1 `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

| Scope | Result |
| --- | --- |
| S1 | hits: `lib/hbs.js:1-5` (fs, path, walk, ./async), `lib/hbs.js:16` (`require('handlebars')` inside constructor — runs at hbs load via `module.exports = new Instance()`). All plain loads, no loader manipulation. |
| S2 | non-relative hits: `lib/index.js:18` (fs, inside extension handler), `dist/cjs/handlebars/compiler/code-gen.js:68` (`require('source-map')`, top-level in try/catch), `dist/cjs/precompiler.js:13,17,27,29,358` (neo-async, fs, path, source-map, uglify-js — CLI-only). 81 relative requires total, all within package. |
| S3 | hits: `walk/lib/walk.js:7-12` (fs, foreachasync, events, util, path), `walk/lib/walk-async-only.js:5` (`require('futures/forEachAsync')` — unreachable file, dep not installed), `walk-async-only.js:9-12`. |
| S4 | zero non-relative hits (only internal `./lib/*` requires in `source-map.js`). |
| S5 | `uglify-js/tools/node.js`: fs + `require.resolve` of own lib files + `new Function` concat-eval of own files (see G5 note). Others trivial. |

### G2 `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

| Scope | Result |
| --- | --- |
| S1 | 1 hit, comment only (`lib/hbs.js:162`). No Buffer/process/global use. |
| S2 | hits: `dist/cjs/precompiler.js:63-68` (`process.stdin` reads, CLI-only); `dist/cjs/handlebars/no-conflict.js:10-23` (globalThis polyfill + `globalThis.Handlebars` — candidates C-002/C-003); comments elsewhere. No Buffer use. |
| S3 | `walk/lib/walk.js:69` `util.inherits(Walker, EventEmitter)` (ordinary inheritance — C-006); comments only otherwise. |
| S4 | zero hits. |
| S5 | neo-async UMD header references `global` (`async.js:1-11`) — CJS branch taken in Node (C-009). |

### G3 `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

| Scope | Result |
| --- | --- |
| S1 | hits only on library-owned prototypes: `lib/async.js:21,27,45` (Waiter.prototype), `lib/hbs.js:254-349` (Instance.prototype), `Array.prototype.slice.call` reads (`lib/hbs.js:46,282`). No builtin mutation. |
| S2 | 54 hits total. Builtin-filtered re-search (`(Object|Array|String|...)\.prototype|__proto__|setPrototypeOf|definePropert|Reflect\.`): all reads (`Object.prototype.hasOwnProperty.call`, `Object.prototype.toString` capture in `utils.js:40`), own-class work (`safe-string.js:9`, `exception.js:26,45-50` defineProperty on own instances, `Exception.prototype = new Error()` at `exception.js:64`), security whitelist (`internal/proto-access.js:25`) — EXCEPT `no-conflict.js:11,15`: `Object.prototype.__defineGetter__('__magic__', ...)` + `delete Object.prototype.__magic__` inside the globalThis polyfill (C-002, dead branch on Node >= 12). |
| S3 | hits: `walk/lib/walk.js:71-290` Walker.prototype method definitions (own class); comment `walk-async-only.js:4` referencing `Array.prototype.forEachAsync` (C-007, unreachable). |
| S4 | `Object.defineProperty` at `source-map/lib/source-map-consumer.js:65,78,444,936` — all on its own class prototypes (C-014). |
| S5 | neo-async: zero builtin-prototype writes (targeted re-search `(Object|Array|String|Number|Function)\.prototype\s*[.\[][^.]*=|__proto__\s*=|setPrototypeOf` → no hits). minimist `index.js:20` `__proto__` key check (read, pollution guard — C-013). |

### G4 `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

| Scope | Result |
| --- | --- |
| S1 | 1 hit, comment about overriding hbs's own runtime-option defaults (`lib/hbs.js:24`). |
| S2 | hits: handlebars' own `CodeGen.wrap` method (`dist/cjs/handlebars/compiler/code-gen.js:110-168`, `javascript-compiler.js:47,262,878,1021`), comments about subclass override points (`javascript-compiler.js:27`, `runtime.js:64`). No patching helper libraries (no shimmer/require-in-the-middle). |
| S3 | zero hits. |
| S4 | zero hits. |
| S5 | not re-run beyond entry inspection (CLI-only scope); entry files contain no such identifiers. |

### G5 `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

| Scope | Result |
| --- | --- |
| S1 | zero hits. |
| S2 | **hits: `handlebars/lib/index.js:23-25` — `require.extensions['.handlebars'] = extension; require.extensions['.hbs'] = extension;` guarded only by `typeof require !== 'undefined' && require.extensions`. → C-001 / F-001 (confirmed).** |
| S3 | zero hits. |
| S4 | zero hits. |
| S5 | zero hits (uglify's `new Function` self-eval of its own files noted under C-011; it does not touch the module system). |

### G6 `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

| Scope | Result |
| --- | --- |
| S1 | zero hits. |
| S2 | zero hits. |
| S3 | zero hits. |
| S4 | zero hits. |
| S5 | zero hits. |

## Supplementary targeted searches

| Search | Scope | Result |
| --- | --- | --- |
| `minimist\|wordwrap` (where are they required) | handlebars package | only `bin/handlebars` (CLI) + package.json; not on runtime path |
| `no-conflict` requirers | handlebars dist/cjs | `handlebars.js:30,58` and `handlebars.runtime.js:35,60` — polyfill IIFE runs at module load, guarded |
| `stat\w*\.(type\|name\|flag\|error)\s*=` | walk | `walk/lib/walk.js:76,79` (`stat.name`, `stat.error`); plus `node-type-emitter.js` (`stat.type` at :35, `stats.flag` at :53) — expandos on fs.Stats instances (C-005) |
| `walk-async-only\|node-type-emitter` requirers | walk | `walk-async-only.js` required by nothing on the main-entry path; main `lib/walk.js` requires only `node-type-emitter` |
| neo-async UMD branch inspection | neo-async/async.js:1-11 | CJS branch (`factory(exports)`) taken in Node; global attach branches browser-only |
| `console` assignment check | handlebars logger.js | reads/invokes `console[method]` only; no assignment |

## Node core baseline lookups ($NODEJS_SOURCE, read-only, targeted files only)

| File | What was checked | Result |
| --- | --- | --- |
| `lib/internal/modules/helpers.js:379` | `require.extensions = Module._extensions;` | confirmed: `require.extensions` is an alias of the shared `Module._extensions` table |
| `lib/internal/modules/cjs/loader.js:399` | `Module._extensions = { __proto__: null };` | shared, null-prototype handler table |
| `lib/internal/modules/cjs/loader.js:630-640` | `findLongestRegisteredExtension` | unregistered extensions fall back to `'.js'`; registering `.hbs` redirects loading |
| `lib/internal/modules/cjs/loader.js:868,877` | `Module._findPath` / `tryExtensions` | extensionless resolution iterates `ObjectKeys(Module._extensions)` — registration changes resolution |
| `lib/internal/modules/cjs/loader.js:1687-1690` | `Module.prototype.load` dispatch | `Module._extensions[extension](this, filename)` |
| `lib/internal/modules/cjs/loader.js:2064,2116,2133` | default `.js`/`.json`/`.node` handlers | present; verified unchanged after `require('hbs')` (reproduction) |
| `doc/api/modules.md` (~line 930) | `require.extensions` docs | documented, deprecated API |
| `lib/internal/fs/utils.js:479-517` | `StatsBase`/Stats shape | fs.Stats defines no `name`/`error`/`type`/`flag` members; walk's expandos shadow nothing (`this.type` at :800 belongs to Dirent, not Stats) |

## Dynamic verification

`node verify-require-extensions.js "$PACKAGE_ROOT"` (script beside this file;
Node v24.19.0): before/after `require('hbs')` snapshot. Result: added
`Module._extensions` keys `['.handlebars', '.hbs']`; `require.extensions ===
Module._extensions` true; handler is handlebars' `extension` function
(identical for both keys); zero added own-properties on
Object/Array/Function prototypes; `globalThis.Handlebars` undefined before and
after; identities unchanged for `fs.readFile`, `fs.readFileSync`,
`Module._load`, `Module._resolveFilename`, `Module.prototype._compile`, and
default `.js`/`.json` handlers.
