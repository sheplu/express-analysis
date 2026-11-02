# mime-db Audit — Methodology and Reconciliation Notes

## Audit Protocol

This audit followed a double-blind protocol with two independent passes (Pass A and Pass B) followed by reconciliation.

## Scope Determination

1. Read `$PACKAGE_ROOT/package.json` to determine version (1.54.0), entrypoints, and the `"files"` field
2. The `"files"` field explicitly lists only `db.json` and `index.js` as shipped production files
3. Confirmed git commit: `ba120a7f71bc8ab7d5299e88c0049063239029a7`
4. Verified zero runtime dependencies (no `"dependencies"` field in `package.json`)
5. Confirmed no `node_modules` directory present (or only dev tooling if installed)
6. Read all production source files completely (index.js: 12 lines; db.json: 9,613 lines sampled)

## Search Methodology

Both passes executed the same 6 regex search groups using `rg` against production files, excluding test, benchmark, dotfile, node_modules, scripts, and src directories:

| Group | Pattern Purpose                    | Target Behavior                        |
|-------|-------------------------------------|----------------------------------------|
| 1     | require/import/from/node:          | Module loading, core module imports     |
| 2     | Buffer/process/global/extends      | Global access, inheritance              |
| 3     | prototype/defineProperty/assign    | Prototype manipulation                  |
| 4     | patch/wrap/shim/polyfill/override  | Patching keywords                       |
| 5     | require.cache/Module hooks         | Module system hooking                   |
| 6     | process.binding/internalBinding    | Internal Node.js bindings               |

## Pass A Summary

- **Executor:** Independent subagent
- **Verdict:** CLEAN
- **Candidates:** 3 (C-001 through C-003)
  - C-001: `require('./db.json')` in index.js — FALSE POSITIVE
  - C-002: "global" in MIME type names in db.json (6 hits) — FALSE POSITIVE
  - C-003: "patch" in MIME type names in db.json (8 hits) — FALSE POSITIVE
- **Confirmed patches:** 0

## Pass B Summary

- **Executor:** Independent subagent (no access to Pass A results)
- **Verdict:** CLEAN
- **Candidates:** 1 (C-001)
  - C-001: `require('./db.json')` in index.js — FALSE POSITIVE
- **Confirmed patches:** 0

## Reconciliation

### Agreement

Both passes agreed on:
- Final verdict: CLEAN
- Zero confirmed patches
- Identical raw search results across all 6 groups
- Classification of `require('./db.json')` as a benign local data load
- Classification of db.json keyword matches as static MIME type name strings

### Differences

| Aspect                 | Pass A                           | Pass B                            |
|------------------------|----------------------------------|-----------------------------------|
| Candidate count        | 3                                | 1                                 |
| db.json keyword hits   | Logged as formal candidates      | Noted as "Data value only"        |

**Resolution:** The difference is purely in cataloging approach, not in analysis. Pass A was more granular in formally assigning candidate IDs to db.json keyword matches; Pass B identified the same matches but correctly noted them as data values without formalizing them as candidates. The reconciled ledger adopts Pass A's more detailed approach (3 candidates, all FALSE POSITIVE) for completeness.

### Confidence

**High.** Both passes were unanimous. The library is structurally a pure data package with no executable logic beyond a single require statement loading a local JSON file. There is no plausible attack surface for core patching.

## Limitations

- Build-time scripts (`$PACKAGE_ROOT/scripts/`) were excluded from scope as non-production code (not listed in `"files"`)
- db.json was sampled (head/tail) rather than read in its entirety line-by-line; however, it is a JSON data file and cannot contain executable code
- The audit covers the current upstream HEAD; future versions could theoretically change
