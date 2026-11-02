# Node.js patch audit: express-generator

- Verdict: confirmed patching
- Status: complete
- Input: npm package `express-generator` (Express application scaffolding CLI), local clone at `$PACKAGE_ROOT`
- Library: express-generator 4.16.1, git commit a1f384101a59cbade670e09b4d6f267c0759e9f1 (https://github.com/expressjs/generator, branch master), source checkout with runtime dependencies installed at `$PACKAGE_ROOT/node_modules` (`--ignore-scripts --omit=dev`); no relevant local changes observed
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (`$NODEJS_SOURCE`), unmodified
- Reproduction runtime: Node.js v24.19.0
- Scope: runtime CLI surface — `bin/express-cli.js` (the only shipped entrypoint, `bin.express`) plus resolved runtime dependencies: ejs@2.6.2, minimatch@3.0.4 (-> brace-expansion@1.1.21 -> balanced-match@1.0.2, concat-map@0.0.1), minimist@1.2.5, mkdirp@0.5.1, sorted-object@2.0.1. `templates/` is data copied into generated projects, never executed by the generator — supporting context only. Tests, CI, docs out of scope.
- Coverage: source — complete for the runtime scope above (all files read or pattern-swept); upstream — ejs v2.6.2 tag verified against installed artifact, deprecation/removal history corroborated; runtime — one reproduction executed, static proof primary. mkdirp's own CLI (`bin/cmd.js`) and its nested minimist@0.0.8 are never loaded by this package but were scanned anyway (clean). ejs's browser bundles (`ejs.js`, `ejs.min.js` at the package root) are not loaded via `require('ejs')` (main is `./lib/ejs.js`); they contain the same registration code in bundled form.

## Patching verdict

**Confirmed patching — one (1) shared core mutation, transitive.** express-generator's own code (`bin/express-cli.js`) performs no patching: it uses `fs`, `path`, `readline`, `util`, `process` streams and `process.exit()` strictly through their public APIs. However, its runtime dependency **ejs@2.6.2 mutates the CommonJS loader's shared extension registry at module-initialization time**: `require.extensions['.ejs'] = function (...) {...}` (`$PACKAGE_ROOT/node_modules/ejs/lib/ejs.js:917-928`). `require.extensions` is the same object as `Module._extensions` (`$NODEJS_SOURCE/lib/internal/modules/helpers.js:379`), the core registry that drives both module compilation dispatch and extension resolution for every `require()` in the process. The mutation runs unconditionally on `require('ejs')`, which `bin/express-cli.js:3` executes on every CLI invocation (including `--help`/`--version`), and is never restored.

Counts: shared core mutations: 1 (F-001, transitive via ejs@2.6.2). Instance/application overrides: 0. Core source rewrites: 0. Module interception beyond F-001: 0. No unresolved candidates; see the ledger for the rejected candidates. The only coverage caveat is dead code intentionally excluded (ejs browser bundles, mkdirp's own CLI, nested minimist@0.0.8), none of which is reachable from this package's entrypoint.

## Confirmed Node.js patches

### F-001: CJS loader extension registry — `require.extensions['.ejs']` (= `Module._extensions['.ejs']`) added by ejs at require time

- Category: core module interception (shared mutation of the CJS loader's `Module._extensions` registry)
- Library site(s): `$PACKAGE_ROOT/node_modules/ejs/lib/ejs.js:916-928`; pinned upstream: https://github.com/mde/ejs/blob/v2.6.2/lib/ejs.js#L917-L928 (verified byte-identical to the installed file at these lines); loaded by `$PACKAGE_ROOT/bin/express-cli.js:3`
- Origin: transitive — express-generator@4.16.1 -> ejs@2.6.2 (direct runtime dependency, pinned `"ejs": "2.6.2"`)
- Core baseline: `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379` (`require.extensions = Module._extensions;` — the alias is the live core object, not a copy); `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:399` (`Module._extensions = { __proto__: null };`), `:2064/:2116/:2133` (built-in `.js`/`.json`/`.node` handlers), `:630-643` (`findLongestRegisteredExtension` — unregistered extensions fall back to the `.js` handler), `:868/:877` (`Module._findPath` tries `ObjectKeys(Module._extensions)` when resolving extensionless requests), `:1690` (`Module._extensions[extension](this, filename)` dispatch). Commit d44625a4b80. Original behavior: registry holds exactly `.js`, `.json`, `.node`; a required `.ejs` file is compiled as JavaScript via the `.js` fallback; extensionless resolution never matches `*.ejs` files.
- Exact mutation: adds own property `'.ejs'` on the shared `Module._extensions` object — `require.extensions['.ejs'] = function (module, flnm) { ... module._compile('module.exports = ' + fn.toString() + ';', filename); }`. Additive registration; the built-in `.js`/`.json`/`.node` handlers are not replaced or wrapped.
- Execution chain: `bin/express-cli.js:3 require('ejs')` -> CJS loader evaluates `node_modules/ejs/lib/ejs.js` -> top-level statement at lines 916-928 (`if (require.extensions) { require.extensions['.ejs'] = ... }`) -> write onto `Module._extensions`.
- Activation: unconditional at module load (guard `if (require.extensions)` is only a presence check, always true in Node CJS); production code path; fires on every express-generator invocation before `main()` runs.
- Scope and restoration: process-wide — affects every CJS `require()` in the process, by any module, for the process lifetime; never removed, no restoration API. For the express-generator CLI the practical blast radius is small (short-lived process that never requires a `.ejs` file), but the mutation itself is global.
- Resulting behavior: before — `require('./x.ejs')` compiles the file as JavaScript (`.js` fallback, typically a SyntaxError for real templates), and `require('./x')` cannot resolve `x.ejs`; after — `require('./x.ejs')` returns a compiled EJS client-mode render function (file read via `exports.fileLoader`, default `fs.readFileSync`, compiled and injected through the core-private `module._compile`), and extensionless `require('./x')` can now resolve to `x.ejs` via `Module._findPath`. Node's own docs mark `require.extensions` deprecated since v0.10.6 (`$NODEJS_SOURCE/doc/api/modules.md:930-956`: "Avoid using `require.extensions`. Use could cause subtle bugs and resolving the extensions gets slower with each registered extension.").
- Evidence: static — sites and baselines above; reproduction — `node repro/check-extensions.js "$PACKAGE_ROOT"` (script beside this report), Node v24.19.0: `require.extensions === Module._extensions -> true`; registry before `['.js','.json','.node']`, `.ejs` absent; after requiring the ejs resolved in `$PACKAGE_ROOT` the registry gains `'.ejs'` (function); `require()` of a fixture `demo.ejs` returns a render function producing `"Hello audit!"`; `require.resolve` of the extensionless fixture path resolves to `demo.ejs`.
- Upstream: present through ejs 2.x; deprecated upstream by https://github.com/mde/ejs/commit/cce319f40f5dbbd78a99bedcc418b81a26f9ffa2 ("Minor version bump to deprecate use of require.extensions") and absent from ejs v3.1.10 `lib/ejs.js` (verified: zero matches at that tag). Related: https://github.com/mde/ejs/issues/412 (closed; `require.extensions` not supported by bundlers). express-generator 4.16.1 pins ejs 2.6.2, so the patched behavior is what ships.

No other confirmed patches. express-generator's direct code and the remaining dependencies (minimatch, brace-expansion, balanced-match, concat-map, minimist, mkdirp, sorted-object) contain no core mutation.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `node_modules/ejs/lib/ejs.js:917-928`, `require.extensions['.ejs']` -> `Module._extensions` | confirmed -> F-001 | Shared core loader registry mutated at require time; reproduced |
| C-002 | `node_modules/ejs/lib/ejs.js:951-952`, `window.ejs = exports` | rejected as patch | Browser-only (`typeof window != 'undefined'`); `window` undefined in Node — unreachable; and targets a browser global, not Node core |
| C-003 | `node_modules/ejs/lib/ejs.js:926`, `module._compile(...)` | rejected as patch (supporting context) | Call into core-private `Module.prototype._compile` (`$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:1919`) inside the F-001 handler — private API usage, no mutation |
| C-004 | `node_modules/ejs/lib/ejs.js:84`, `exports.fileLoader = fs.readFileSync` | rejected as patch | Stores a reference to a core function on a library export; `fs` unmodified |
| C-005 | `node_modules/ejs/lib/ejs.js:106,619`, `new Function('return this')().Promise` / async-fn constructor | rejected as patch | Reads globals; no write |
| C-006 | `node_modules/ejs/lib/utils.js:100-102`, `exports.escapeXML.toString = ...` | rejected as patch | Own property on a library-owned function; `Function.prototype.toString` untouched |
| C-007–C-020 | bin/express-cli.js and all other deps (see `candidates.md`) | rejected as patch | API usage, library-owned prototypes, pollution *guards*, or code not loaded at runtime |

Unresolved: none.

## Supporting context

- `bin/express-cli.js` exclusively *uses* core APIs: `fs.readFileSync/readdir/writeFileSync` (lines 65, 73, 337, 559), `readline.createInterface` on `process.stdin/stdout` (49-52), `process.stdin.destroy()` (480 — a method call on a core-backed stream, not an override), a graceful-exit helper that submits empty writes to `process.stdout/stderr` then calls `process.exit(code)` (361-381, with `exit.exited = true` set on its own function object), and `process.platform`/`process.env` reads (388-389).
- ejs's F-001 handler internally calls the undocumented core method `module._compile` (C-003) and ejs's `renderFile` path keeps a reference to `fs.readFileSync` as its default `fileLoader` (C-004) — private/ordinary API use, no mutation.
- minimist@1.2.5 contains `__proto__`/`Object.prototype` checks (index.js:73-85) that are prototype-pollution *defenses* writing only to its own result object.
- minimatch assigns methods on its own `Minimatch.prototype` and reads `console.error` into an instance field when `options.debug` is set — library-owned objects only.
- `templates/` (copied verbatim into generated apps, never executed by the generator): swept with the same patterns, no patch-shaped code; `templates/js/www.ejs` is ordinary `http.createServer`/`server.listen` usage in the *generated* project. Not patches by this package.
- mkdirp reads `process.umask()` (index.js:20,64) and honors an injected `opts.fs` — dependency injection, not mutation of core `fs`.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/bin/express-cli.js` + 11 runtime dep files | 6 skill candidate patterns + 4 supplementary `rg -n --no-ignore` sweeps (full log in `searches.md`) | Single module-interception hit (C-001/F-001); no core property assignment, no prototype/global mutation, no bindings/internal access |
| `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379` | targeted read | `require.extensions = Module._extensions;` — alias is the live core registry |
| `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:399,630-643,868-885,1687-1690,1919,2064-2133` | targeted reads | Registry definition, `.js` fallback for unregistered extensions, `_findPath` extension enumeration, dispatch, `_compile`, built-in handlers |
| `$NODEJS_SOURCE/doc/api/modules.md:930-956` | targeted read | `require.extensions` deprecated since v0.10.6; "Avoid using `require.extensions`" |
| ejs v2.6.2 upstream | `gh api "repos/mde/ejs/contents/lib/ejs.js?ref=v2.6.2"` | Lines 917-918 identical to installed file — installed artifact matches the published tag |
| ejs upstream history | `gh search commits --repo mde/ejs "require.extensions"`; https://github.com/mde/ejs/commit/cce319f40f5dbbd78a99bedcc418b81a26f9ffa2 | Upstream later deprecated the hook; absent in v3.1.10 `lib/ejs.js` (fetched at tag, 0 matches) |
| ejs upstream issues | `gh search issues --repo mde/ejs "require.extensions"` | https://github.com/mde/ejs/issues/412 (closed) — ecosystem friction with the hook |
| Reproduction | `node repro/check-extensions.js "$PACKAGE_ROOT"` (Node v24.19.0) | Registry before/after diff, identity check, `.ejs` require and extensionless resolution demos — all consistent with F-001 |
| `$PACKAGE_ROOT/templates/` | `rg -n --no-ignore "<patch patterns>" templates/` | Negative — no patch-shaped code in copied templates |

Provenance hashes (SHA-256, `$PACKAGE_ROOT`-relative) are recorded in `candidates.md`.

## Coverage and limitations

- Entry point: `bin/express-cli.js` (sole `bin` and `main`) — read in full. No install scripts in the runtime dependency set (installed `--ignore-scripts`; none of the six packages declares runtime-affecting install hooks).
- Resolved runtime dependencies, all entrypoints read in full or swept with the complete pattern set: ejs@2.6.2 (`lib/ejs.js`, `lib/utils.js`), minimatch@3.0.4 (`minimatch.js`), brace-expansion@1.1.21 (`index.js`), balanced-match@1.0.2, concat-map@0.0.1, minimist@1.2.5, mkdirp@0.5.1 (`index.js`), sorted-object@2.0.1.
- Dead code excluded with reason: `node_modules/ejs/ejs.js` and `ejs.min.js` (browser bundles, not reachable via `require('ejs')`; they embed the same registration code in bundled form), `node_modules/mkdirp/bin/cmd.js` and its nested minimist@0.0.8 (mkdirp's own CLI, never required by this package; scanned anyway — clean).
- Node.js baseline is the main branch at d44625a4b80, not a release tag; the `require.extensions` alias and `Module._extensions` mechanics are long-stable, and the v24.19.0 reproduction confirms current-release behavior. A materially different verdict would require a Node release where `require.extensions` no longer aliases `Module._extensions` (none known).
- brace-expansion resolved to 1.1.21 (a hardened release referencing CVE-2026-14257), which satisfies the `minimatch` range; its code is pure string processing with no core interaction.
- What would change the verdict: an express-generator release moving to ejs >= 3.0.1 (hook deprecated/removed upstream) would remove F-001 and flip the verdict to "no confirmed patching".

## Changes since the previous audit

First audit (independent pass; no prior report read or updated per double-blind protocol).
