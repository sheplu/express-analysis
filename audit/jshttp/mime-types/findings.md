# Detailed findings: mime-types v3.0.2

## Summary

**No confirmed patches found.** All 4 candidates were traced and rejected.

## Search group results

| Group | Description | Production Hits | Patch-Relevant |
|-------|-------------|-----------------|----------------|
| 1 | Imports/requires | 2 | 0 |
| 2 | Globals/builtins | 6 (db.json) | 0 |
| 3 | Prototype/property | 2 | 0 |
| 4 | Patching keywords | 7 (db.json) | 0 |
| 5 | Module system hooks | 0 | 0 |
| 6 | Internal bindings | 0 | 0 |

## Production file inventory

| # | File | Lines | Description |
|---|------|-------|-------------|
| 1 | `$PACKAGE_ROOT/index.js` | 147 | Main module — MIME type lookup functions |
| 2 | `$PACKAGE_ROOT/node_modules/mime-db/index.js` | 12 | Re-export of db.json |
| 3 | `$PACKAGE_ROOT/node_modules/mime-db/db.json` | 9613 | Static MIME type database |

## Candidate details

### RC-001: require('path').extname
- **Location:** `$PACKAGE_ROOT/index.js:16`
- **Verdict:** NOT A PATCH — read-only import bound to local variable

### RC-002: Object.create(null)
- **Location:** `$PACKAGE_ROOT/index.js:36,38`
- **Verdict:** NOT A PATCH — creates library-owned null-prototype objects

### RC-003: "global" in db.json
- **Location:** `$PACKAGE_ROOT/node_modules/mime-db/db.json`
- **Verdict:** NOT A PATCH — IANA MIME type name strings in inert JSON

### RC-004: "patch" in db.json
- **Location:** `$PACKAGE_ROOT/node_modules/mime-db/db.json`
- **Verdict:** NOT A PATCH — MIME type name strings in inert JSON
