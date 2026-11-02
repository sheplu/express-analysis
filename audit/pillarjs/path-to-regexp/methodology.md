# path-to-regexp — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/path-to-regexp (default branch `master`, HEAD `32292b9d13239c7fa3ed23e89c59c10264f9fe20`, tag v9.0.0, clean tree). Because `main`/`exports` point to `dist/index.js` (a TS build output not committed to git), the published npm tarball for 9.0.0 was fetched and extracted beside the clone (`$NPM_ARTIFACT`), its sha1/sha512 verified against the npm registry, so both the source of truth (`src/index.ts`) and the exact consumer-loaded artifact (`dist/index.js`) were in scope. Zero runtime dependencies to install.
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-verified HEAD, re-ran the import sweep (zero hits in both files), re-read the key sites (`src/index.ts:128,417,452,481`; `dist/index.js:256`); merged into final report.

## Scope

- In scope: `src/index.ts` (git ref, 696 lines) and `$NPM_ARTIFACT/dist/index.js` (~431 lines) — both read in full by both passes; src↔dist correspondence verified.
- Out of scope: tests, benchmarks, docs, configs, devDependencies (build toolchain), `scripts.prepare` (build-only, nothing ships as an install hook).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups over both runtime files, plus supplementary sweeps (pass A: 7 extras incl. exhaustive dotted-member write scan — 3 hits, all library-owned; pass B: Symbol/well-known-symbol and expando-classification sweeps). Group 1 (imports) zero-hit in both files; groups 3, 4, 5, 6 zero-hit.

## Node.js core files consulted

None applicable — the package imports no Node module; its touchpoints are V8 JS intrinsics (`RegExp`, `TypeError`, URI functions), verified live in the repros. `$NODEJS_SOURCE` used read-only for provenance only.

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `pass-a/verify-no-mutation.mjs` (+ result file). Pass B: `pass-b/repro/snapshot-diff.cjs` -> `repro/result.txt`.
- Imported the exact published `dist/index.js` and exercised `pathToRegexp`/`match`/`compile`/`parse`/`stringify` across params, wildcards, optional groups, arrays, custom/quoted param names.
- Before/after snapshot (~200 properties): RegExp statics + prototype (method identities + Symbol.* descriptors), String/Object/Array/Function/TypeError prototypes, `Object.assign`, `Module._load/_resolveFilename/_compile`, `require.extensions`, `require.cache`, `process.binding`, global keys: **no changes**.
- Returned-RegExp expando classification against a pre-import intrinsic baseline: clean (`own keys == [lastIndex]`, prototype/constructor intact).

## Reconciliation outcome

- Verdicts identical: **no confirmed patching in the inspected scope**.
- Ledgers identical in substance: 8 candidates each, same sites, all rejected, 0 unresolved, 0 confirmed.
- src↔dist correspondence: both passes independently confirmed 1:1 type-stripped equivalence and registry integrity match.
- Provenance correction (both passes, independently): the orchestrator briefing's full hash was a mis-expansion of the `32292b9` short hash; true HEAD `32292b9d13239c7fa3ed23e89c59c10264f9fe20` verified from the clone and recorded everywhere.
- Disagreements: **none**.
- Orchestrator spot-check matched all claims (HEAD/tag, zero-import sweep re-run, key sites re-read).

## Limitations

- Dynamic coverage is representative-input-based; closed by full static read of all runtime lines in both files.
- Release notes for 7.x–9.x not fetched (History.md ends at 3.0.0) — immaterial given the full code read.
- No core-baseline comparison needed; nothing imported.
