# Monkeypatch Audit: compressible v2.0.18

| Field            | Value                                      |
|------------------|--------------------------------------------|
| **Package**      | compressible                               |
| **Version**      | 2.0.18                                     |
| **Commit**       | 9a7ea07339ea98e81f5493a0e872c78d75a084f0   |
| **Audit date**   | 2026-11-01                                 |
| **Methodology**  | Double-blind two-pass regex + manual trace |
| **Verdict**      | **CLEAN**                                  |

## Summary

compressible does **not** patch, monkeypatch, or modify any Node.js core
objects, prototypes, globals, or module-loading mechanisms. This verdict was
reached independently by both Pass A and Pass B with no disagreements.

## Confirmed Patches

**None.**

## Scope

### Production files audited

| File | Lines | Description |
|------|-------|-------------|
| `$PACKAGE_ROOT/index.js` | 53 | Sole module; exports `compressible()` function |
| `$PACKAGE_ROOT/node_modules/mime-db/index.js` | 12 | Re-exports `db.json` |
| `$PACKAGE_ROOT/node_modules/mime-db/db.json` | ~9000 | Static MIME type database (JSON) |

### Runtime dependency chain

```
compressible@2.0.18
  └── mime-db@1.54.0 (zero dependencies)
```

Total auditable JavaScript surface: **65 lines** across 2 `.js` files, plus
one static JSON data file.

## Candidate ledger (all dismissed)

| ID    | File                              | Pattern     | Verdict    | Reason |
|-------|-----------------------------------|-------------|------------|--------|
| C-001 | `$PACKAGE_ROOT/index.js:16`       | `require()` | DISMISSED  | Standard import of `mime-db` |
| C-002 | `$PACKAGE_ROOT/node_modules/mime-db/index.js:12` | `require()` | DISMISSED | Standard re-export of `db.json` |
| C-003 | `$PACKAGE_ROOT/node_modules/mime-db/db.json` | `global` | DISMISSED | IANA MIME type name strings (e.g. `message/global`), not JS globals |
| C-004 | `$PACKAGE_ROOT/node_modules/mime-db/db.json` | `patch` | DISMISSED | RFC MIME type name strings (e.g. `application/json-patch+json`), not patching code |

## Architecture

The library is purely functional:
1. Loads a static JSON database of MIME types from mime-db
2. Defines two local regular expressions (not exported)
3. Exports a single function that performs a read-only lookup

No state is mutated. No Node.js built-ins are accessed beyond `require()` and
`module.exports`.

## Sources / Verification

- Prior intelligence from compression audit: confirmed CLEAN (consistent)
- Pass A: CLEAN (4 candidates, all dismissed)
- Pass B: CLEAN (4 candidates, all dismissed)
- Both passes independently identified the same candidate set

## Coverage / Limitations

- All 6 regex search groups executed across all production files
- The `db.json` file is large (~9000 lines) but is static JSON data with no executable content
- No native addons (`.node` files) present
- No dynamic code generation (`eval`, `new Function`, `vm`) detected
