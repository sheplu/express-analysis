# Node.js patch audit: express-generator

- Verdict: confirmed patching
- Status: complete
- Input: npm package `express-generator` (Express application scaffolding CLI), local source at `$PACKAGE_ROOT`
- Library: express-generator 4.16.1, git clone of https://github.com/expressjs/generator (branch master, commit a1f384101a59cbade670e09b4d6f267c0759e9f1), unmodified; runtime dependencies installed at `$PACKAGE_ROOT/node_modules` with `--ignore-scripts --omit=dev` (ejs@2.6.2, minimatch@3.0.4, minimist@1.2.5, mkdirp@0.5.1, sorted-object@2.0.1; transitive balanced-match@1.0.2, brace-expansion@1.1.21, concat-map@0.0.1, nested mkdirp/node_modules/minimist@0.0.8)
- Node.js baseline: `$NODEJS_SOURCE` main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf, unmodified
- Reproduction runtime: Node v24.19.0 (`node repro-require-extensions.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code — the `bin/express-cli.js` CLI entrypoint and every resolved runtime dependency's entrypoint/initialization and transitive imports. `templates/` is data copied into generated projects (never executed by the generator) — supporting context only. Tests, CI, docs out of scope.
- Coverage: source complete (entrypoint read in full; all 9 installed dependency entrypoints read or pattern-scanned; full skill search-pattern set run — see searches.md); upstream corroborated for the single confirmed finding (ejs v2.6.2/v3.1.10 sources, commit cce319f, issue mde/ejs#412); runtime reproduction executed for the confirmed finding. No limitations material to the verdict.

## Patching verdict

Patching is demonstrated: **1 confirmed patch**, of category core module interception, with **transitive** origin (express-generator -> ejs@2.6.2). There are **0 shared core API/global/prototype mutations** beyond it, **0 instance/application overrides**, and **0 core source rewrites**. express-generator's own code (`bin/express-cli.js`) performs no patching.

The confirmed patch: requiring ejs (done unconditionally at CLI startup, `bin/express-cli.js:3`) writes a `.ejs` handler into `require.extensions`, which is the same object as the Node.js CJS loader's shared registry `Module._extensions`. This permanently redirects, process-wide, how the core loader compiles any `require()`d `.ejs` file (core default: fall back to the `.js` handler). Nuance for calibration: the write is *additive* — it registers a new extension key through the deprecated-but-documented `require.extensions` escape hatch rather than replacing an existing core handler (`.js`/`.json`/`.node`); auditors applying a stricter "replacement-only" bar may downgrade it, but under this skill's definition (mutation of a core-owned shared object that redirects core module-loading behavior) it is a confirmed patch. The ejs maintainers themselves deprecated (v2.7.0) and removed (v3.x) this hook.

Unresolved candidates: none. All 16 other candidates were rejected with reasons (see candidates.md); 3 of them are in files not loaded at runtime (ejs browser bundles, mkdirp's own CLI and its nested minimist).

## Confirmed Node.js patches

### F-001: `require.extensions['.ejs']` — new handler written into the shared CJS extension registry (`Module._extensions`)

- Category: core module interception (shared core-owned object mutation; additive registration, no existing handler replaced)
- Library site(s): `$PACKAGE_ROOT/node_modules/ejs/lib/ejs.js:917-928` (registration at :918, `module._compile` call at :926) — https://github.com/mde/ejs/blob/v2.6.2/lib/ejs.js#L917-L928 (upstream v2.6.2 verified byte-identical at these lines). Activation site in the audited package: `$PACKAGE_ROOT/bin/express-cli.js:3` (`var ejs = require('ejs')`).
- Origin: transitive — express-generator@4.16.1 -> ejs@2.6.2 (direct runtime dependency, pinned in package.json)
- Core baseline: `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379` (`require.extensions = Module._extensions;` — the alias proving the write hits the core registry); `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:399` (`Module._extensions = { __proto__: null }`), :2064/:2116/:2133 (core `.js`/`.json`/`.node` handlers), :630-641 (`findLongestRegisteredExtension` — unregistered extensions fall back to `'.js'`), :1690 (dispatch `Module._extensions[extension](this, filename)`), :1919 (`Module.prototype._compile`, the private API the injected handler calls). Original behavior: `require('./x.ejs')` is compiled as JavaScript by the core `.js` handler (typically a SyntaxError for a real template).
- Exact mutation: on the shared registry object `Module._extensions` (reached via its `require.extensions` alias), property-create key `'.ejs'` = ejs's loader function `(module, flnm) => { ...; module._compile('module.exports = ' + fn.toString() + ';', filename) }`.
- Execution chain: `bin/express-cli.js:3 require('ejs')` -> module top-level of `node_modules/ejs/lib/ejs.js` -> `if (require.extensions)` (:917, always truthy under CJS) -> write at :918.
- Activation: unconditional at import/require time on every run of the `express` CLI; no environment guard, no opt-in. Production runtime code.
- Scope and restoration: process-wide (every CJS `require` in the process shares `Module._extensions`); permanent for the process lifetime — ejs never removes the handler. In practice the CLI process is short-lived and never itself `require()`s a `.ejs` file (templates are read with `fs.readFileSync` and rendered via `ejs.render`, `bin/express-cli.js:396-404`), so the hook is installed but dormant in this consumer.
- Resulting behavior: before — `require('./view.ejs')` resolves through the `'.js'` fallback and is parsed as JavaScript; after — the core loader dispatches to ejs's handler, which reads the file via `exports.fileLoader` (`fs.readFileSync`), compiles it to a client-mode template function, and loads `module.exports = <template fn>` via the private `module._compile`. Any other code in the same process observing or relying on `require.extensions`' contents also sees the added key.
- Evidence: static — sites and core baseline above; dynamic — `repro-require-extensions.js` (beside this report), Node v24.19.0: `require.extensions === Module._extensions` is `true`; registry keys before loading ejs = `['.js','.json','.node']`, `'.ejs'` absent; after `require('ejs')` resolved from `$PACKAGE_ROOT/node_modules`, `'.ejs'` present with a function handler.
- Upstream: ejs deprecated this hook in 2.7.0 — commit https://github.com/mde/ejs/commit/cce319f40f5dbbd78a99bedcc418b81a26f9ffa2 ("Minor version bump to deprecate use of require.extensions", 2019-09-02) — and removed it in v3 (v3.1.10 `lib/ejs.js` contains no `require.extensions`); related issue https://github.com/mde/ejs/issues/412 (closed). The audited pinned version 2.6.2 predates both, so the patch is present in express-generator 4.16.1 as shipped. `require.extensions` itself is documented by Node.js as deprecated.

No other confirmed patches.

## Candidate ledger and unresolved questions

Full ledger with details in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | node_modules/ejs/lib/ejs.js:917-928 — `require.extensions['.ejs']` / `Module._extensions` | confirmed -> F-001 | Shared core registry mutation; reproduction S-24 |
| C-002 | bin/express-cli.js:361-381 — graceful `exit()` over process.stdout/stderr | rejected as patch | Calls `stream.write`/`process.exit`; sets `exit.exited` on its own function; nothing core replaced |
| C-003 | bin/express-cli.js:480 — `process.stdin.destroy()` | rejected as patch | Documented method call on a core-backed instance, not an override |
| C-004 | node_modules/ejs/lib/ejs.js:85 — `exports.fileLoader = fs.readFileSync` | rejected as patch | Stores a reference on ejs's own exports; `fs` unmodified |
| C-005 | node_modules/ejs/lib/ejs.js:107 — global `Promise` lookup | rejected as patch | Read-only |
| C-006 | node_modules/ejs/lib/ejs.js:951-953 — `window.ejs` | rejected as patch | Browser-only guard; dead in Node |
| C-007 | node_modules/ejs/lib/utils.js:100-102 — `escapeXML.toString` override | rejected as patch | Override on ejs's own exported function; `Function.prototype` untouched |
| C-008 | node_modules/minimist/index.js:73-85 — `__proto__`/prototype checks | rejected as patch | Prototype-pollution guards (reads/local reassignments), not mutations |
| C-009 | node_modules/minimatch/minimatch.js:139-760 — `Minimatch.prototype.*` | rejected as patch | Library-owned prototype |
| C-010 | node_modules/minimatch/minimatch.js:4-7 — local `path` fallback | rejected as patch | Local variable shim; core `path` untouched |
| C-011 | node_modules/concat-map/index.js:11-13 — `isArray` feature detect | rejected as patch | Read-only; local assignment |
| C-012 | node_modules/ejs/ejs.js, ejs.min.js — browser bundles (process/path shims, bundled require.extensions copy) | rejected as patch | Not loaded in Node (package main is lib/ejs.js); shims mutate bundle-local objects |
| C-013 | node_modules/mkdirp/index.js:20,64 — `process.umask()` | rejected as patch | Read-only call |
| C-014 | node_modules/mkdirp/bin/cmd.js — mkdirp CLI | rejected as patch | Out of runtime chain; plain API usage |
| C-015 | node_modules/mkdirp/node_modules/minimist@0.0.8 | rejected as patch | Out of runtime chain; pattern scans negative |
| C-016 | node_modules/ejs/lib/ejs.js top-level `exports.*` writes | rejected as patch | Library-owned export surface |
| C-017 | templates/js/www.ejs:15,69,73; templates/js/app.js.ejs — generated-app code | rejected as patch | Template data, never executed by the generator; plain API usage even in generated apps |

Unresolved: none.

## Supporting context

- Graceful-exit idiom (C-002): `bin/express-cli.js:361-381` flushes stdout/stderr by submitting empty writes with callbacks before `process.exit`, working around historical Windows pipe truncation (references in code: nodejs/node-v0.x-archive#6247, mochajs/mocha#333). Unlike some "exit" packages, it does **not** wrap or replace `process.exit`, `process.emit`, or `stream.write` — pure API usage.
- ejs configurable seams (C-004/C-016): `exports.fileLoader`, `exports.promiseImpl`, `exports.cache` are ejs-owned override points for *consumers of ejs*; express-generator uses the defaults and only calls `ejs.render` with a custom `escape: util.inspect` option (`bin/express-cli.js:400-403`).
- minimist@1.2.5 (C-008) contains the prototype-pollution *fix* (guards against `__proto__`/`constructor.prototype` keys); the historical ejs `Object.prototype` pollution discussions concern template-option handling in other versions/configurations — the shipped 2.6.2 code performs no prototype writes at require time or in the generator's render path (`shallowCopy` targets fresh option objects).
- `templates/` (C-017) ships code for *generated* projects (e.g. `www.ejs` uses `process.env.PORT`, `process.exit(1)` in error handlers). It is copied with `fs.readFileSync`/`fs.writeFileSync` and never executed by the generator; nothing in the templates patches Node either.
- Private API usage inside F-001's handler: `module._compile` (`Module.prototype._compile`, $NODEJS_SOURCE lib/internal/modules/cjs/loader.js:1919) — the conventional mechanism for `require.extensions` handlers; recorded as part of F-001, not a separate patch.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT/bin/express-cli.js | full read (561 lines); skill pattern set S-04..S-10 | No core mutations; candidates C-002/C-003 rejected |
| $PACKAGE_ROOT/node_modules (9 packages) | skill pattern set with `--no-ignore` (searches.md S-04..S-10); full reads of sorted-object, balanced-match, concat-map, mkdirp, ejs/lib/utils.js; targeted reads of ejs/lib/ejs.js; assignment sweep S-10 | Only C-001 confirmed; zero assignments to core modules/globals/built-ins in runtime scope |
| Dependency install scripts | per-package `scripts` check (S-16) | None present (tree also installed with `--ignore-scripts`) |
| $NODEJS_SOURCE lib/internal/modules/helpers.js | `grep -n "extensions"`; read :370-385 | :379 `require.extensions = Module._extensions` — alias proof |
| $NODEJS_SOURCE lib/internal/modules/cjs/loader.js | `grep -n "_extensions"`, reads :620-650, :1675-1695, `grep "Module.prototype._compile"` | Registry init :399, default handlers :2064/:2116/:2133, `.js` fallback :630-641, dispatch :1690, `_compile` :1919 |
| ejs upstream v2.6.2 | https://github.com/mde/ejs/blob/v2.6.2/lib/ejs.js#L917-L928 via `gh api` | Byte-identical to installed file at the finding lines |
| ejs upstream v3.1.10 | `gh api 'repos/mde/ejs/contents/lib/ejs.js?ref=v3.1.10'` | 0 occurrences of `require.extensions` — hook removed in v3 (v3.0.0 tag absent upstream, 404) |
| ejs deprecation commit | https://github.com/mde/ejs/commit/cce319f40f5dbbd78a99bedcc418b81a26f9ffa2 | "Minor version bump to deprecate use of require.extensions" (2019-09-02, ejs 2.7.0) |
| ejs issue | https://github.com/mde/ejs/issues/412 (closed) | require.extensions incompatibility report; context for deprecation |
| Reproduction | `node repro-require-extensions.js "$PACKAGE_ROOT"` (Node v24.19.0) | sharedRegistry true; `.ejs` key absent before / function present after `require('ejs')` |

File hashes (SHA-256, provenance):
- `$PACKAGE_ROOT/bin/express-cli.js` 1468f38646095b264b6af1330b4a74274503b72068b18843f4ebcce2c7bc7a45
- `$PACKAGE_ROOT/node_modules/ejs/lib/ejs.js` 11fdb3be9c48bd563ea293ab69775e6284f3706e3da795fb28ea73c79b0a2e5c
- `$PACKAGE_ROOT/node_modules/ejs/lib/utils.js` 76934bc941340a3ffd1776d1ca97f4c00dab9b4c641616311e56cf055c4e5bea

## Coverage and limitations

- Entry points: `bin/express-cli.js` is the only `main`/`bin` entrypoint (package.json `files`: LICENSE, bin/, templates/); read in full. No conditional/optional entrypoints, no install scripts.
- Dependencies: all 8 top-level installed packages plus nested minimist@0.0.8 covered by the full pattern set; every file in the actual runtime require chain read directly (ejs lib/ejs.js initialization and hook region, ejs lib/utils.js, minimist index.js, minimatch minimatch.js structure plus all pattern hits, mkdirp index.js, sorted-object, balanced-match, concat-map, brace-expansion pattern-scanned). Out-of-chain files (ejs browser bundles, mkdirp CLI + nested minimist, examples) scanned and excluded with reasons (C-012/C-014/C-015).
- Node.js files: only the CJS-loader files named in the skill table for module interception (lib/internal/modules/cjs/loader.js, lib/internal/modules/helpers.js) at commit d44625a4b80c672215b469906ce583ce7eeeebaf; no recursive Node-tree scans.
- Branches tested/excluded: reproduction run on Node v24.19.0 only; the `if (require.extensions)` guard is truthy on all CJS-supporting Node versions, so the finding is version-independent in practice. ESM consumers of ejs would still trigger the write when the CJS entry is loaded via interop; not separately tested (would not change the verdict). Behavior of `require('./x.ejs')` before/after was established statically from loader source, not executed.
- `templates/` classified as data per the requested scope; its contents were scanned only for context.
- What would change the verdict: nothing found pending; the verdict could only strengthen (more patches) if a future dependency bump introduced patching code, or weaken if express-generator moved to ejs >= 3 (hook removed upstream), as later express-generator/ejs lines did.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report.
