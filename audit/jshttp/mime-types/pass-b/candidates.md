# Pass B -- Candidate Ledger

Package: mime-types v3.0.2 (commit 3a1187ee)

## C-001: require('path').extname

- **File:** `$PACKAGE_ROOT/index.js:16`
- **Match:** `var extname = require('path').extname`
- **Analysis:** READs the `extname` function from Node.js core `path` module and
  binds it to a local variable. Does not write to or modify the `path` module.
- **Verdict:** DISMISSED -- read-only import.

## C-002: Object.create(null) for extensions map

- **File:** `$PACKAGE_ROOT/index.js:36`
- **Match:** `exports.extensions = Object.create(null)`
- **Analysis:** Calls `Object.create` to construct a new null-prototype object
  assigned to the module's own exports. Does not modify `Object` or `Object.create`.
- **Verdict:** DISMISSED -- standard object creation.

## C-003: Object.create(null) for types map

- **File:** `$PACKAGE_ROOT/index.js:38`
- **Match:** `exports.types = Object.create(null)`
- **Analysis:** Identical pattern to C-002, for `exports.types`.
- **Verdict:** DISMISSED -- standard object creation.

## C-004: db.json "global" substring matches

- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` (multiple lines)
- **Match:** MIME types containing "global" (e.g., `"message/global"`)
- **Analysis:** JSON data strings. Not executable code. No reference to JavaScript globals.
- **Verdict:** DISMISSED -- inert JSON data, false positive on substring.

## C-005: db.json "patch" substring matches

- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` (multiple lines)
- **Match:** MIME types containing "patch" (e.g., `"application/json-patch+json"`)
- **Analysis:** JSON data strings. Not executable code. No patching behavior.
- **Verdict:** DISMISSED -- inert JSON data, false positive on substring.

## Summary

All 5 candidates DISMISSED. Zero CONFIRMED. Zero NEEDS FURTHER INVESTIGATION.
