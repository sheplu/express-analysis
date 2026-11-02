# Pass A -- Candidate Ledger

Package: mime-types v3.0.2 (commit 3a1187ee)

## C-001: require('path').extname

- **File:** `$PACKAGE_ROOT/index.js:16`
- **Match:** `var extname = require('path').extname`
- **Analysis:** Reads the `extname` function from Node.js core `path` module into
  a local variable. The `path` module is never assigned to, mutated, or modified.
  `extname` is called at line 138 purely as a function call.
- **Verdict:** DISMISSED -- pure read of a core module export; no mutation.

## C-002: require('mime-db')

- **File:** `$PACKAGE_ROOT/index.js:15`
- **Match:** `var db = require('mime-db')`
- **Analysis:** Loads the mime-db dependency. The resolved module returns parsed JSON.
  The `db` variable is used as a read-only lookup table. No properties are written to `db`.
- **Verdict:** DISMISSED -- data import; read-only usage; no mutation.

## C-003: db.json "global" substring matches

- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` (lines 5763, 5815, 8174, 8178, 8182, 8186)
- **Match:** MIME type names containing "global" (e.g., `"message/global"`)
- **Analysis:** Static JSON data file with no executable code. The word "global"
  appears only as part of registered MIME type names.
- **Verdict:** DISMISSED -- false positive; non-executable data file.

## C-004: db.json "patch" substring matches

- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` (lines 439, 889, 1082, 1311, 6977, 7028, 7032)
- **Match:** MIME type names containing "patch" (e.g., `"application/json-patch+json"`)
- **Analysis:** Pure JSON data. The word "patch" is part of standardized MIME type names.
- **Verdict:** DISMISSED -- false positive; non-executable data file.

## Summary

All 4 candidates DISMISSED. Zero CONFIRMED. Zero NEEDS FURTHER INVESTIGATION.
