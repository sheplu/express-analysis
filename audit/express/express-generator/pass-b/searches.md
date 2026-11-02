# Search log: express-generator@4.16.1 (pass-b)

All commands run from `$PACKAGE_ROOT` unless noted. `FILES` is the runtime
scope list: `bin/express-cli.js` plus the resolved entrypoint files of
ejs@2.6.2 (`lib/ejs.js`, `lib/utils.js`), minimatch@3.0.4 (`minimatch.js`),
brace-expansion@1.1.21, balanced-match@1.0.2, concat-map@0.0.1,
minimist@1.2.5, mkdirp@0.5.1 (`index.js` + its unreached `bin/cmd.js` and
nested minimist@0.0.8 for completeness), sorted-object@2.0.1
(`lib/sorted-object.js`). `--no-ignore` used because node_modules is
git-ignored.

## Scope establishment

| Command | Result |
| --- | --- |
| `cat package.json`; `git log -1` | version 4.16.1, commit a1f3841...; deps: ejs 2.6.2, minimatch 3.0.4, minimist 1.2.5, mkdirp 0.5.1, sorted-object 2.0.1; `bin.express = ./bin/express-cli.js`; `main = bin/express-cli.js`; files: LICENSE, bin/, templates/ |
| `ls node_modules/`; per-package `node -e "require('./<pkg>/package.json')"` | balanced-match@1.0.2, brace-expansion@1.1.21, concat-map@0.0.1, ejs@2.6.2 (main ./lib/ejs.js), minimatch@3.0.4, minimist@1.2.5, mkdirp@0.5.1, sorted-object@2.0.1; nested: mkdirp/node_modules/minimist@0.0.8 |
| `wc -l` over scope files | 3,658 lines total runtime scope (all small enough to read) |

## Skill candidate patterns (P1–P6) over FILES

| # | Pattern | Hits / disposition |
| --- | --- | --- |
| P1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | Core imports only: bin (ejs, fs, minimatch, mkdirp, minimist, path, readline, sorted-object, util), ejs (fs, path, ./utils), minimatch (path in try/catch, brace-expansion), brace-expansion (concat-map, balanced-match), mkdirp (path, fs), mkdirp/bin/cmd.js (minimist, fs). No `node:` or ESM/dynamic imports. No patching dep (shimmer/require-in-the-middle etc.) present |
| P2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | process usage only (argv/stdin/stdout/stderr/exit/platform/env/umask) in bin, mkdirp, mkdirp/bin/cmd.js; comments in ejs/brace-expansion. No Buffer, no global/globalThis writes, no extends/inherits -> C-016, C-017, C-018 (all rejected) |
| P3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | minimatch Minimatch.prototype methods (C-011), ejs Template.prototype (C-07), ejs Array.prototype.slice.call read (C-008), utils Function.prototype.toString.call read (C-006), concat-map Object.prototype.toString read (C-015), minimist __proto__/prototype *guards* (C-014). No defineProperty/setPrototypeOf/Reflect/Object.assign anywhere. All rejected |
| P4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | 1 hit: ejs/lib/ejs.js:475 comment ("values will override" — options precedence doc). Negative otherwise |
| P5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | **2 hits: ejs/lib/ejs.js:917 (`if (require.extensions)`) and :918 (`require.extensions['.ejs'] = ...`) -> C-001 -> confirmed F-001.** No require.cache writes, no Module._load/_resolveFilename interception, no ESM hooks |
| P6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | Negative (exit 1) — no native binding or core-internal access |

## Supplementary sweeps (S7–S10) over FILES

| # | Pattern | Hits / disposition |
| --- | --- | --- |
| S7 | `\b(fs\|path\|os\|util\|http\|https\|net\|tls\|crypto\|stream\|readline\|events\|child_process\|process)\.[A-Za-z_$]+\s*=[^=]` | Negative (exit 1) — no assignment onto any core module/global object |
| S8 | `\bdelete\b` | 2 hits: ejs utils.js:162 (`delete this._data[key]`, own cache), ejs.js:389 (`delete opts.scope`, local options) -> C-009 rejected |
| S9 | `(Promise\|console\|JSON\|Math\|Date\|RegExp\|Error\|Function\|Object\|Array\|String\|Number)\.[A-Za-z_$]+\s*=[^=]\|=\s*(Promise\|console)\b` | 1 hit: minimatch.js:165 `this.debug = console.error` (instance field, read of console.error) -> C-012 rejected |
| S10 | `\beval\s*\(\|new\s+Function\|require\s*\(\s*['\"]vm['\"]` | 2 hits: ejs.js:106 and :619 (`new Function` to read globalThis/async ctor) -> C-005 rejected. No eval, no vm |

## Full-file reads

- `bin/express-cli.js` — read in full (561 lines): API usage only.
- `node_modules/ejs/lib/ejs.js` — module-init section (40-130), extensions
  block (895-953), fileLoader trace (`rg -n "fileLoader"`: lines 81, 84, 204,
  213, 265, 272-273, 310, 924); `node_modules/ejs/lib/utils.js` — read in full.
- `node_modules/mkdirp/index.js`, `minimatch.js` head (1-140),
  `brace-expansion/index.js` (1-80 + P-sweeps), `balanced-match/index.js`,
  `concat-map/index.js`, `sorted-object/lib/sorted-object.js`,
  `minimist/index.js` (proto-guard section 55-100 + sweeps) — read; clean.
- `rg -n "prototype|__proto__|global|process\.|require\(" node_modules/mkdirp/node_modules/minimist/index.js` — negative (exit 1).

## templates/ (supporting context only)

- `find templates -type f` — 32 files (css, js templates, views).
- `rg -n --no-ignore "\.prototype\b|__proto__|definePropert|require\.extensions|Module\._|process\.(binding|_linked)|globalThis" templates/` — **negative** (exit 1).

## Node.js baseline (targeted reads only; $NODEJS_SOURCE at d44625a4b80)

| Command | Result |
| --- | --- |
| `rg -n "extensions" lib/internal/modules/helpers.js` | line 379: `require.extensions = Module._extensions;` (comment: "Enable support to add extra extension types.") |
| `rg -n "_extensions\|findLongestRegisteredExtension" lib/internal/modules/cjs/loader.js` | 399 (registry def), 630-643 (fallback to '.js'), 868/877 (_findPath extension enumeration), 1687-1690 (dispatch), 2064/2116/2133 (built-in handlers) |
| `sed -n` reads of helpers.js:360-385, loader.js:624-648, 858-885, 1678-1695 | Confirmed semantics quoted in report F-001 |
| `rg -n "Module\.prototype\._compile" lib/internal/modules/cjs/loader.js` | line 1919 (for C-003 supporting context) |
| `rg -n -A 12 "## .require.extensions" doc/api/modules.md`; `sed -n '941,985p'` | Deprecated since v0.10.6; "Avoid using require.extensions..." |

## Upstream corroboration (read-only)

| Command | Result |
| --- | --- |
| `gh api "repos/mde/ejs/contents/lib/ejs.js?ref=v2.6.2"` + grep | Lines 917/918 match installed file exactly |
| `gh search issues --repo mde/ejs "require.extensions"` | #412 (closed, bundler incompatibility), #447 (closed, fileLoader) |
| `gh search commits --repo mde/ejs "require.extensions"` | cce319f40f5dbbd78a99bedcc418b81a26f9ffa2 "Minor version bump to deprecate use of require.extensions" |
| `gh api "repos/mde/ejs/contents/lib/ejs.js?ref=v3.1.10"` + grep | 952 lines fetched; 0 matches for "extensions" — hook removed by 3.1.10 |
| `gh api repos/mde/ejs --jq .default_branch`; contents of lib/ on main | main branch restructured (lib/esm only); lib/ejs.js absent on main — not material to audited 2.6.2 |
| `npm view brace-expansion@1.1.21 version dist.integrity` | 1.1.21 is a published registry version (hardened release); local install consistent |
| `grep -c "require.extensions" node_modules/ejs/ejs.js node_modules/ejs/ejs.min.js` | 2 / 1 textual hits in unloaded browser bundles -> C-020 |

## Reproduction

- `repro/check-extensions.js` (beside this log), run as
  `node repro/check-extensions.js "$PACKAGE_ROOT"` on Node v24.19.0:
  - `require.extensions === Module._extensions -> true`
  - registry before: `.js .json .node`; `.ejs` key before: false
  - registry after `require(<ejs in $PACKAGE_ROOT>)`: `.ejs .js .json .node`; handler type function
  - `require(fixtures/demo.ejs)` -> function; renders `"Hello audit!"`
  - `require.resolve(fixtures/demo)` (extensionless) -> resolves to `demo.ejs`
