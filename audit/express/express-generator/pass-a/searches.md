# Search log — express-generator@4.16.1 pass A

All commands run from `$PACKAGE_ROOT` unless noted. `$NODEJS_SOURCE` = Node.js main checkout at commit d44625a4b80c672215b469906ce583ce7eeeebaf. Globs exclude docs (`*.md`, `*.markdown`) and the ejs browser bundles (`ejs.js`, `ejs.min.js` — see candidate C-012; they are not loaded in Node) where stated.

## Scope inventory

| # | Command | Result |
| --- | --- | --- |
| S-01 | `ls $PACKAGE_ROOT; cat package.json; git log -1` | Confirmed express-generator 4.16.1 at commit a1f384101a59cbade670e09b4d6f267c0759e9f1. Runtime surface: `bin/express-cli.js` (sole `main`/`bin` entrypoint). Deps: ejs 2.6.2, minimatch 3.0.4, minimist 1.2.5, mkdirp 0.5.1, sorted-object 2.0.1. `templates/` are copied data, not executed. |
| S-02 | `ls node_modules; node -e "...package.json version/main"` per dep | Installed: balanced-match@1.0.2, brace-expansion@1.1.21, concat-map@0.0.1, ejs@2.6.2 (main `./lib/ejs.js`), minimatch@3.0.4, minimist@1.2.5, mkdirp@0.5.1, sorted-object@2.0.1; nested mkdirp/node_modules/minimist@0.0.8. |
| S-03 | Full read of `bin/express-cli.js` (561 lines) | No prototype/core mutations. Candidates C-002 (graceful `exit()`), C-003 (`process.stdin.destroy()`) logged. |

## Skill candidate pattern set (over `bin/` and `node_modules/`, `--no-ignore`)

| # | Pattern | Result |
| --- | --- | --- |
| S-04 | `rg -n "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:"` | Imports inventoried: bin loads ejs, fs, minimatch, mkdirp, minimist, path, readline, sorted-object, util. Deps load only fs/path (mkdirp, ejs), brace-expansion→concat-map+balanced-match, minimatch→path+brace-expansion. No dynamic import, no `node:` specifiers. mkdirp/bin/cmd.js and examples are out of the runtime chain. |
| S-05 | `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\("` (excl. bundles/docs/examples/test) | Hits only: bin/express-cli.js process.argv/stdin/stdout/stderr/exit/platform/env reads (C-002, C-003); mkdirp/index.js `process.umask()` reads (C-013); comments. ejs/ejs.js browser bundle `process` shim hits logged as C-012 (not loaded). No `global`/`globalThis` writes anywhere in runtime scope. No `inherits`/`extends` of core classes. |
| S-06 | `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign"` | Hits: minimist/index.js:73-85 `__proto__`/`Object.prototype` pollution GUARDS (reads, C-008); minimatch Minimatch.prototype own-prototype methods (C-009); ejs/lib/ejs.js:436 `Array.prototype.slice.call` (read), :550 `Template.prototype = {...}` (own prototype); ejs/lib/utils.js:101 `exports.escapeXML.toString` override on own function (C-007); concat-map `Object.prototype.toString.call` read (C-011). No `Object.defineProperty`, `setPrototypeOf`, `Reflect.*`, or `Object.assign` in runtime scope at all. |
| S-07 | `rg -n -i "monkey.?patch|\bpatch\b|\bshim\b|\bpolyfill\b|\boverride\b"` and `rg -n "\bwrap\b"` | Only comments: ejs "values will override" (option precedence), browser-bundle "shim for using process in browser"/"wrap it in a try catch" (C-012). No patching helpers (no shimmer, require-in-the-middle, etc.). |
| S-08 | `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|_compile|syncBuiltinESMExports|registerHooks"` | **ejs/lib/ejs.js:917-928** — `require.extensions['.ejs'] = function (module, flnm) {... module._compile(...)}` → C-001 → confirmed F-001. Same code duplicated in unloaded browser bundle ejs/ejs.js:918-927 (C-012). No `require.cache` writes, no `Module._load`/`_resolveFilename` tampering, no ESM hook registration. |
| S-09 | `rg -n "process\.(binding\|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"` | Only ejs/ejs.js:1531 browser-shim stub `process.binding = function(){throw}` on the bundle-local process object (C-012, not loaded). Negative otherwise. |
| S-10 | `rg -n "(^|[^.\w])(fs|path|process|console|util|readline|global|globalThis|Buffer|Object|Array|String|Function|JSON|Math|require)\s*\.\s*[\w$]+\s*=[^=]"` (excl. bundles/docs) | **Zero hits** — no assignment to any property of a core module, core global, or built-in constructor anywhere in bin/ or runtime deps. |

## Dependency full reads / targeted checks

| # | Command | Result |
| --- | --- | --- |
| S-11 | `cat` sorted-object/lib/sorted-object.js, balanced-match/index.js, concat-map/index.js, mkdirp/index.js | Fully read; pure functions over own data; mkdirp calls fs.mkdir/stat and `process.umask()` (reads only). No core writes. |
| S-12 | `cat` ejs/lib/utils.js (167 lines), ejs/lib/ejs.js lines 40-110 and 900-953 | Require-time initialization of ejs inventoried: `exports.fileLoader = fs.readFileSync` (C-004), `exports.promiseImpl = (new Function('return this;'))().Promise` (C-005), `require.extensions['.ejs']` registration (C-001), `window.ejs` browser guard (C-006). utils.js mutates only its own exports (C-007). |
| S-13 | minimist/index.js full scan (245 lines, assignment-focused grep on 120-245) | All writes target local `argv`/`flags`/`aliases` objects; `setKey` explicitly refuses `__proto__` and prototype targets. No core writes. |
| S-14 | minimatch/minimatch.js structure scan + S-06 hits | Own `Minimatch.prototype` methods; `var path = { sep: '/' }` local fallback then `require('path')` into the local var (C-010). No core writes. |
| S-15 | brace-expansion/index.js `rg "module.exports|global|prototype|process"` + S-04..S-10 coverage | Only comments about memory-exhaustion hardening (1.1.21 patched version). No core access at all (requires only concat-map, balanced-match). |
| S-16 | install-script check: `scripts.preinstall/install/postinstall` across all dep package.json | **None present** in any runtime dependency (and tree installed with `--ignore-scripts`). |
| S-17 | `rg -n "process\.|prototype|require\(" templates/js/www.ejs templates/js/app.js.ejs` | Templates (data copied into generated apps, never executed by the CLI) contain ordinary `process.env.PORT`/`process.exit` usage for the generated app. Supporting context only. |

## Node.js baseline (targeted reads only)

| # | Command | Result |
| --- | --- | --- |
| S-18 | `grep -n "_extensions" $NODEJS_SOURCE/lib/internal/modules/cjs/loader.js` | loader.js:399 `Module._extensions = { __proto__: null }`; default handlers at :2064 (`.js`), :2116 (`.json`), :2133 (`.node`); dispatch at :1690 `Module._extensions[extension](this, filename)`. |
| S-19 | `grep -n "extensions" $NODEJS_SOURCE/lib/internal/modules/helpers.js` + read :370-385 | helpers.js:379 `require.extensions = Module._extensions;` — proves `require.extensions` writes mutate the shared core registry. |
| S-20 | read loader.js:620-650, 1675-1695; `grep -n "Module.prototype._compile"` | `findLongestRegisteredExtension` (loader.js:630-641) falls back to `'.js'` for unregistered extensions; `Module.prototype._compile` at loader.js:1919 (private API used by the ejs handler). |

## Upstream corroboration (read-only)

| # | Command | Result |
| --- | --- | --- |
| S-21 | `gh api 'repos/mde/ejs/contents/lib/ejs.js?ref=v2.6.2' \| base64 -d \| grep -n "require.extensions\|_compile"` | Upstream v2.6.2 lines 917/918/926 match the installed file exactly. |
| S-22 | same for `ref=v3.1.10` | 0 occurrences — hook removed in EJS v3. (`v3.0.0` tag does not exist upstream; 404.) |
| S-23 | `gh search issues --repo mde/ejs "require.extensions"`; `gh search commits --repo mde/ejs "require.extensions"`; `gh api repos/mde/ejs/commits/cce319f...` | Issue mde/ejs#412 (closed) "require.extensions is not supported by webpack". Commit cce319f40f5dbbd78a99bedcc418b81a26f9ffa2 (2019-09-02) "Minor version bump to deprecate use of require.extensions" (ejs 2.7.0 deprecation; removal followed in v3). |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| S-24 | `node repro-require-extensions.js "$PACKAGE_ROOT"` (script beside this report; Node v24.19.0) | `sharedRegistry: true` (require.extensions === Module._extensions); before: keys `.js,.json,.node`, no `.ejs`; after `require('ejs')`: `.ejs` handler (function) present. Confirms F-001. |
