# Node.js patch audit: express-generator

- Verdict: **confirmed patching — 1 transitive patch (core module-loading interception via ejs@2.6.2)**; express-generator's own code patches nothing
- Status: complete
- Input: issue sheplu/express-analysis#3 (`express-generator`, https://github.com/expressjs/generator)
- Library: express-generator 4.16.1, git master @ `a1f384101a59cbade670e09b4d6f267c0759e9f1`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: registry before/after diff; pass B also behavior demos)
- Scope: CLI runtime surface `bin/express-cli.js` plus all resolved runtime dependencies (ejs@2.6.2 pinned, minimatch, minimist, mkdirp, sorted-object + transitives). `templates/` is copy-data never executed by the generator — swept anyway (negative), classified as out of execution scope. Tests/CI/docs excluded.
- Coverage: source complete; runtime reproduction done; upstream corroborated (ejs deprecation commit `cce319f`, removal in ejs v3)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict and identical single finding**; sites re-verified directly during reconciliation.

## Patching verdict

Confirmed patching, transitive. One patch: requiring `ejs` (which `bin/express-cli.js:3` does unconditionally on every CLI invocation, including `--help`/`--version`) registers a handler on the shared CommonJS loader extension registry:

- 1 × **core module interception / shared registry mutation** (F-001) — process-wide, never restored.
- express-generator's own code (`bin/express-cli.js`) performs **no** patching: pure documented API usage (fs, process streams/exit, event listeners).
- 0 unresolved candidates in either pass.

Calibration note (recorded by both passes): the write is *additive* — it adds a `.ejs` handler through the documented-but-deprecated `require.extensions` mechanism and does not replace the built-in `.js`/`.json`/`.node` handlers. Under a strict "replacement-only" bar this could be downgraded; it is kept as a confirmed patch because it mutates the live shared `Module._extensions` registry and changes process-wide `require()` behavior.

## Confirmed Node.js patches

### F-001: `require.extensions['.ejs'] = …` — shared CJS loader registry mutation (via ejs)

- Category: core module interception (shared registry mutation)
- Library site(s): `node_modules/ejs/lib/ejs.js:917-928` (registration, guarded only by `if (require.extensions)`); activation at `$PACKAGE_ROOT/bin/express-cli.js:3` (`require('ejs')`)
- Origin: transitive — express-generator → ejs@2.6.2 (pinned dependency)
- Core baseline: `require.extensions` aliases the live `Module._extensions` object (`$NODEJS_SOURCE/lib/internal/modules/helpers.js:379`); registry defined at `lib/internal/modules/cjs/loader.js:399`; without the handler, `.ejs` files fall back to the `.js` handler (`cjs/loader.js:630-641`)
- Exact mutation: adds key `'.ejs'` to the shared extension registry with a handler that reads the file, compiles it as an EJS client template, and injects the result via the core-private `module._compile('module.exports = ' + fn.toString() + ';', filename)`
- Execution chain: CLI start → `require('ejs')` → module top-level code → registry write
- Activation: unconditional at import time, every CLI run; process-wide; never restored
- Scope and restoration: affects the whole process for its lifetime — any `require()` of a `.ejs` file anywhere switches from the core compile-as-JS fallback to the EJS compiler, and extensionless `require()` can newly resolve `*.ejs` via `Module._findPath`
- Resulting behavior: before — `require('./x.ejs')` parses the file as JS (usually a SyntaxError); after — returns a compiled EJS template function. Built-in handlers untouched.
- Evidence: static (byte-verified at ejs tag v2.6.2); reproduction on Node v24.19.0 (`pass-a/repro-require-extensions.js`, `pass-b/repro/check-extensions.js`): registry gains `'.ejs'` after `require('ejs')`, behavior demo confirms
- Upstream: `require.extensions` deprecated by Node since v0.10.6 but still live; ejs deprecated the hook in 2.7.0 (commit `cce319f40f`) and removed it in v3 (confirmed absent by v3.1.10). express-generator pins ejs 2.6.2, so the patch remains active in the shipped CLI.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (17 entries), `pass-b/candidates.md` (23 entries) — same substance, 1 confirmed, rest rejected, 0 unresolved. Key rejections (agreed):

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| C-ejs-1 | `ejs/lib/ejs.js:917-928` | confirmed → F-001 | shared `Module._extensions` write |
| R-01 | `bin/express-cli.js` graceful `exit()` (writes to stdout/stderr, `process.exit`) | rejected | API usage; no core method wrapped/replaced |
| R-02 | `bin/express-cli.js` `process.stdin.destroy()` | rejected | method call, not override |
| R-03 | `ejs` `exports.fileLoader = fs.readFileSync` | rejected | reference copy onto ejs's own exports; `fs` untouched |
| R-04 | `ejs` `module._compile(...)` inside the `.ejs` handler | rejected as separate patch | core-private API *usage* within F-001's handler, not an additional mutation |
| R-05 | `ejs` browser bundles (`window.ejs`, process shim) | rejected | bundle-local, never loaded in Node |
| R-06 | `minimist@1.2.5` `__proto__` guards | rejected | anti-prototype-pollution *defenses* (reads/skips), not mutations |
| R-07 | minimatch / ejs own-prototype methods | rejected | library-owned objects |
| R-08 | mkdirp `process.umask()` | rejected | read-only |
| R-09 | dead code: mkdirp's own CLI, nested minimist@0.0.8, templates/ | rejected / out of scope | never executed by the generator; scanned anyway, clean |

## Supporting context

- `templates/` contents are copied into generated projects and belong to the *generated app's* dependency set (express, morgan, etc.), audited separately under their own issues.
- `brace-expansion` resolved to 1.1.21 (hardened release); clean, no core interaction.
- No dependency has install scripts; no native code.

Reconciliation note: passes A and B fully blind; identical verdict, identical single finding with identical sites/lines and the same calibration nuance (additive registration via deprecated-but-documented mechanism). No disagreements. Orchestrator re-read `bin/express-cli.js:1-6` and `ejs/lib/ejs.js:910-930` and confirmed ejs resolves to 2.6.2.

Limitations: reproduction on Node v24.19.0 only (mechanism stable across all CJS-era Node); requiring an actual `.ejs` file end-to-end was demonstrated by pass B only; ejs main branch has restructured sources (immaterial — audit pinned to 2.6.2 as resolved).
