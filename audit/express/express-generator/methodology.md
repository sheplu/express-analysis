# express-generator — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #3 (https://github.com/expressjs/generator); cloned default branch `master` @ `a1f384101a59cbade670e09b4d6f267c0759e9f1` (v4.16.1) into the package worktree (`generator/upstream/express-generator`); installed runtime deps with `npm install --ignore-scripts --omit=dev` (ejs@2.6.2, minimatch, minimist@1.2.5, mkdirp, sorted-object + transitives incl. brace-expansion@1.1.21).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; directly re-read `bin/express-cli.js:1-6` and `ejs/lib/ejs.js:910-930`; confirmed resolved ejs version 2.6.2; merged into final report.

## Scope decisions

- Runtime surface = `bin/express-cli.js` (the CLI is the entire shipped runtime) + all resolved runtime dependencies' entry/init paths.
- `templates/` = data copied into generated projects, never executed by this package → swept (negative) and classified out of execution scope; the generated app's deps (express, morgan, cookie-parser, …) are audited under their own issues.
- Dead code noted and scanned anyway: ejs browser bundles, mkdirp's bundled CLI, nested minimist@0.0.8 — all clean.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups over bin/ + each dependency. The loader-interception sweep (`require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`) produced the single confirmed hit (`ejs/lib/ejs.js:918`) plus the related `module._compile` usage inside the handler; all other groups negative or rejected.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379` (`require.extensions` → live `Module._extensions` alias)
- `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js:399` (registry), `:630-641` (unknown-extension `.js` fallback), `Module._findPath` (extensionless resolution)

## Runtime reproduction

- Node v24.19.0. Scripts: `pass-a/repro-require-extensions.js`, `pass-b/repro/check-extensions.js`.
- Method: snapshot `Object.keys(require.extensions)` before/after `require('ejs')` → gains `'.ejs'`; pass B additionally demonstrated the behavior change by requiring a sample `.ejs` file (compiled template function returned) and extensionless resolution.

## Upstream corroboration

- ejs deprecation of the hook: mde/ejs commit `cce319f40f` (2.7.0); removed in ejs v3 (verified absent at v3.1.10).
- express-generator pins `ejs: 2.6.2` in package.json → patch remains active in the shipped CLI.
- `require.extensions` deprecated since Node v0.10.6 but still functional at the audited baseline.

## Reconciliation outcome

- Verdicts identical: confirmed patching, 1 transitive finding (same file/lines, same category: core module interception / shared registry mutation).
- Both passes independently recorded the same calibration nuance: additive registration through a deprecated-but-documented mechanism (no built-in handler replaced) — kept as confirmed because the live shared registry is mutated process-wide.
- Ledgers: pass A 17 entries, pass B 23 (same substance; B itemized dead-code paths separately). 0 unresolved in both.
- Disagreements: **none**. Orchestrator spot-check matched all claims.

## Limitations

- Reproduction on Node v24.19.0 only; mechanism is stable across CJS-era Node versions.
- Node baseline is main, not a release tag; `require.extensions` aliasing verified at that commit and corroborated at runtime.
- ejs upstream main has restructured sources (no `lib/ejs.js`); immaterial — audit pinned to resolved 2.6.2.
