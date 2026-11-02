# Pass A — Candidate Ledger

## Package
- **Name:** mime-db
- **Version:** 1.54.0
- **Commit:** ba120a7f71bc8ab7d5299e88c0049063239029a7

## Candidate Analysis

### C-001: `require('./db.json')` in index.js
- **File:** `$PACKAGE_ROOT/index.js:12`
- **Code:** `module.exports = require('./db.json')`
- **Search group:** 1 (require/import)
- **Analysis:** This is a standard CommonJS require loading the library's own static JSON data file. It does not require any Node.js core module. The loaded JSON object is directly exported — no mutation occurs.
- **Verdict:** FALSE POSITIVE — standard self-referential data loading, no core interaction

### C-002: "global" in MIME type names in db.json
- **File:** `$PACKAGE_ROOT/db.json` (lines 5973, 6025, 8429, 8433, 8437, 8441)
- **Code:** JSON key names like `"message/global"`, `"application/vnd.stardivision.writer-global"`
- **Search group:** 2 (global/globalThis)
- **Analysis:** The word "global" appears as part of IANA-registered MIME type names stored as JSON object keys. This is pure static data — no JavaScript `global` object reference, no code execution.
- **Verdict:** FALSE POSITIVE — string data in JSON, not code

### C-003: "patch" in MIME type names in db.json
- **File:** `$PACKAGE_ROOT/db.json` (lines 478, 937, 941, 1149, 1378, 7220, 7272, 7276)
- **Code:** JSON key names like `"application/json-patch+json"`, `"application/merge-patch+json"`
- **Search group:** 4 (patch/wrap/shim)
- **Analysis:** The word "patch" appears as part of IANA-registered MIME type names stored as JSON object keys. This is pure static data — no patching, wrapping, or shimming behavior.
- **Verdict:** FALSE POSITIVE — string data in JSON, not code

## Summary

| ID    | File      | Pattern     | Verdict        |
|-------|-----------|-------------|----------------|
| C-001 | index.js  | require()   | FALSE POSITIVE |
| C-002 | db.json   | global      | FALSE POSITIVE |
| C-003 | db.json   | patch       | FALSE POSITIVE |

**Total candidates:** 3
**Confirmed patches:** 0
**False positives:** 3
