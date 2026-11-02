# Methodology: negotiator Audit Reconciliation

## Audit Structure

This audit followed a double-blind protocol with two independent passes
(Pass A and Pass B) followed by reconciliation.

### Step 1: Scope Establishment

Before either pass, scope was established centrally:
- `package.json` read for version (1.1.0), entrypoints (`index.js`),
  shipped files (`lib/`, `index.js`), and dependencies (`content-type ^2.1.0`)
- All 7 production files listed and read in full
- Git commit recorded: `14b0a7b88e7e7bb1cae38681195951bff29ca2fd`
- Runtime dependency tree verified: `content-type` v2.1.0 in `node_modules/`,
  with zero transitive dependencies
- `content-type` production file (`dist/index.js`, 176 lines) read in full

### Step 2: Pass A (Independent)

Pass A ran all 6 regex search groups on all production files, identified
5 candidates (C-001 through C-005), traced each to actual write targets,
and concluded CLEAN.

Output files:
- `$PACKAGE_ROOT/../audit/jshttp/negotiator/pass-a/searches.md`
- `$PACKAGE_ROOT/../audit/jshttp/negotiator/pass-a/candidates.md`

### Step 3: Pass B (Independent)

Pass B ran the same 6 regex search groups independently, identified the
same 5 candidates with matching IDs and identical analysis, and concluded
CLEAN.

Output files:
- `$PACKAGE_ROOT/../audit/jshttp/negotiator/pass-b/searches.md`
- `$PACKAGE_ROOT/../audit/jshttp/negotiator/pass-b/candidates.md`

### Step 4: Reconciliation

#### Agreement Analysis

| Aspect                  | Pass A        | Pass B        | Agreement |
|-------------------------|---------------|---------------|-----------|
| Verdict                 | CLEAN         | CLEAN         | Full      |
| Candidate count         | 5             | 5             | Full      |
| C-001 (prototype)       | NOT PATCH     | NOT PATCH     | Full      |
| C-002 (defineProperty)  | NOT PATCH     | NOT PATCH     | Full      |
| C-003 (NullObject)      | NOT PATCH     | NOT PATCH     | Full      |
| C-004 (content-type)    | NOT PATCH     | NOT PATCH     | Full      |
| C-005 (local requires)  | NOT PATCH     | NOT PATCH     | Full      |

#### Disagreements

**None.** Both passes independently arrived at identical conclusions with
the same candidate IDs, the same line references, and the same reasoning.

#### Reconciliation Decision

The unanimous CLEAN verdict is accepted as the final determination.

## Search Coverage

All 6 regex groups were designed to detect:

1. **Group 1** (imports): Core module requires, dynamic imports, `node:` prefixed imports
2. **Group 2** (globals): Usage of Buffer, process, globalThis, global, inheritance patterns
3. **Group 3** (mutation): Prototype writes, `__proto__`, defineProperty, Object.assign, Reflect ops
4. **Group 4** (keywords): Explicit patching terminology (monkeypatch, patch, wrap, shim, polyfill, override)
5. **Group 5** (module hooks): require.cache manipulation, Module._ hooks, ESM sync hooks
6. **Group 6** (internals): process.binding, internalBinding, internal/ module access

Groups 2, 4, 5, and 6 returned zero hits in production files. Groups 1 and 3
returned hits that were all traced to benign, library-internal operations.

## Confidence Level

**High.** The library is small (806 lines across 7 files), pure-functional,
requires no Node.js core modules, and all prototype/property writes target
library-owned objects. Both independent passes reached identical conclusions
with no ambiguity in any candidate.
