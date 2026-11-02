# Candidate ledger: express-generator@4.16.1 (pass-b)

Every candidate site surfaced by the search pattern set (see `searches.md`),
traced to the object actually modified. Paths are `$PACKAGE_ROOT`-relative.
Status: confirmed (patch), rejected (not a patch, with reason), not-loaded
(code present but unreachable from the runtime entrypoint), unresolved (none).

| ID | Site (file:line) | What it writes/does | Status | Reason / disposition |
| --- | --- | --- | --- | --- |
| C-001 | node_modules/ejs/lib/ejs.js:916-928 | `require.extensions['.ejs'] = function (module, flnm) {...}` at module top level — adds a key to the shared core `Module._extensions` registry (`$NODEJS_SOURCE/lib/internal/modules/helpers.js:379` aliases them); handler compiles the file as an EJS client template and injects it via `module._compile` | confirmed -> F-001 | Shared mutation of core CJS loader state; changes `require()` compilation dispatch for `.ejs` files and extensionless resolution (`Module._findPath`) process-wide; unconditional at `require('ejs')` (bin/express-cli.js:3); reproduced on Node v24.19.0 |
| C-002 | node_modules/ejs/lib/ejs.js:950-953 | `if (typeof window != 'undefined') { window.ejs = exports; }` | rejected | Unreachable in Node (`window` undefined); would mutate a browser global, not Node core |
| C-003 | node_modules/ejs/lib/ejs.js:926 | Calls `module._compile('module.exports = ' + fn.toString() + ';', filename)` | rejected (supporting context) | Invocation of core-private `Module.prototype._compile` (`$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:1919`); private API *usage* inside the F-001 handler, no mutation of core |
| C-004 | node_modules/ejs/lib/ejs.js:84 | `exports.fileLoader = fs.readFileSync` | rejected | Copies a reference to a core function onto ejs's own export; `fs` object untouched |
| C-005 | node_modules/ejs/lib/ejs.js:106, 619 | `exports.promiseImpl = (new Function('return this;'))().Promise;` and `ctor = (new Function('return (async function(){}).constructor;'))()` | rejected | Reads the global object / intrinsic constructors; no global or intrinsic is written |
| C-006 | node_modules/ejs/lib/utils.js:100-102 | `exports.escapeXML.toString = function () { return Function.prototype.toString.call(this) + ... }` | rejected | Own `toString` property on a library-owned function object (shadowing); `Function.prototype` not modified, `Function.prototype.toString` only *called* |
| C-007 | node_modules/ejs/lib/ejs.js:550 | `Template.prototype = { ... }` | rejected | Prototype of ejs's own `Template` class; not core-backed |
| C-008 | node_modules/ejs/lib/ejs.js:436 | `Array.prototype.slice.call(arguments)` | rejected | Read-only borrow of an intrinsic method; no write |
| C-009 | node_modules/ejs/lib/ejs.js:389; node_modules/ejs/lib/utils.js:162 | `delete opts.scope` / `delete this._data[key]` | rejected | Deletes on library-owned option/cache objects |
| C-010 | node_modules/ejs/lib/utils.js:146-166 | `exports.cache = { _data: {}, set/get/remove/reset }`; wired as `exports.cache = utils.cache` (ejs.js:75) | rejected | ejs's in-process template cache is a plain library-owned object; no core caching/loading machinery involved |
| C-011 | node_modules/minimatch/minimatch.js:139-760 | `Minimatch.prototype.debug/make/parseNegate/braceExpand/parse/makeRe/match/matchOne = ...` | rejected | Methods on minimatch's own exported class; not core-backed |
| C-012 | node_modules/minimatch/minimatch.js:165 | `if (options.debug) this.debug = console.error` | rejected | Instance property set to a *reference* of `console.error`; `console` not mutated |
| C-013 | node_modules/minimatch/minimatch.js:4-7 | `var path = { sep: '/' }; try { path = require('path') } catch (er) {}` | rejected | Local variable fallback stub for browser use; core `path` module unmodified |
| C-014 | node_modules/minimist/index.js:73-85 | `__proto__` key skips; resets `o`/`o[key]` when they equal `Object/Number/String/Array.prototype` | rejected | Prototype-pollution *guards*; all writes target minimist's own `argv` result object |
| C-015 | node_modules/concat-map/index.js:11-13 | `var isArray = Array.isArray \|\| function (xs) { return Object.prototype.toString.call(xs) === '[object Array]'; }` | rejected | Local polyfill variable; nothing assigned to `Array` or any prototype |
| C-016 | node_modules/mkdirp/index.js:5, 20, 64 | `module.exports = mkdirP.mkdirp = mkdirP.mkdirP = mkdirP`; `mode = _0777 & (~process.umask())` | rejected | Self-aliases on its own function; `process.umask()` is a read-only call. `opts.fs \|\| fs` is dependency injection, core `fs` never written |
| C-017 | bin/express-cli.js:361-381 | `exit()` helper: `exit.exited = true`; `stream.write('', done)` on `process.stdout/stderr`; `process.exit(code)` | rejected | Own property on its own function; public stream/exit API usage; no core override (workaround for historical Windows pipe flush bug, nodejs/node-v0.x-archive#6247) |
| C-018 | bin/express-cli.js:49-52, 480 | `readline.createInterface({ input: process.stdin, output: process.stdout })`; `process.stdin.destroy()` | rejected | Documented API calls on core-backed instances; no method replacement or property override |
| C-019 | node_modules/mkdirp/bin/cmd.js (whole file) + node_modules/mkdirp/node_modules/minimist/index.js (minimist@0.0.8) | mkdirp's standalone CLI and its vendored minimist | not-loaded (scanned, clean) | Never required by express-generator (`require('mkdirp')` resolves to index.js only); scanned anyway: argv parsing + usage pipe to stdout, no prototype/global/process writes |
| C-020 | node_modules/ejs/ejs.js, node_modules/ejs/ejs.min.js | Browser bundles embedding the same `require.extensions` registration (2 / 1 textual hits) | not-loaded | Not reachable via `require('ejs')` (package main is `./lib/ejs.js`); same patch code as C-001 in bundled, unexecuted form |
| C-021 | node_modules/brace-expansion/index.js:1-45 | Module-level constants (`Math.random()` sentinels, `EXPANSION_MAX*` caps referencing CVE-2026-14257 hardening) | rejected | Pure string processing; no core object touched at init or call time |
| C-022 | node_modules/balanced-match/index.js, node_modules/sorted-object/lib/sorted-object.js | Pure functions over strings/objects | rejected | No core import beyond none at all; nothing written outside local scope |
| C-023 | templates/** (css, js, views) | Template files copied into generated projects (e.g. templates/js/www.ejs uses `http.createServer`) | rejected (out of execution scope) | Never executed by the generator; patch-pattern sweep over templates/ negative; notable only as generated-project content |

Unresolved candidates: none.

## Provenance hashes (SHA-256, $PACKAGE_ROOT-relative)

| File | SHA-256 |
| --- | --- |
| bin/express-cli.js | 1468f38646095b264b6af1330b4a74274503b72068b18843f4ebcce2c7bc7a45 |
| node_modules/ejs/lib/ejs.js | 11fdb3be9c48bd563ea293ab69775e6284f3706e3da795fb28ea73c79b0a2e5c |
| node_modules/ejs/lib/utils.js | 76934bc941340a3ffd1776d1ca97f4c00dab9b4c641616311e56cf055c4e5bea |
| node_modules/minimatch/minimatch.js | c0eb14d89faff03e69a2fb579efda26801bcd9f890b1f98cc2e772e448c9375c |
| node_modules/brace-expansion/index.js | c53b4fab560940391af6889ac8fafe67629ec645ca536dd7f10d266713e969bf |
| node_modules/balanced-match/index.js | 06e4d0037715251cb3be2b2db063662f555b3538d9e30a9c517a54374d941cbc |
| node_modules/concat-map/index.js | 091b65d778337599d0140b35d53c038603d1732d27c33bfe39e03871a96926b2 |
| node_modules/minimist/index.js | 0feebc85297a35829a4a3a6c5346ddcca582052e5ebf0d33bd024abe8cd5245b |
| node_modules/mkdirp/index.js | 6e4f5d6d26baf194cf4bbb4d82110046ed6215205b412c57a7b5097dc1623eac |
| node_modules/sorted-object/lib/sorted-object.js | 5c827e008fa8d16aa24fc4cb93346b475f4cbe324759a9ab78623b3f765b5fe2 |
