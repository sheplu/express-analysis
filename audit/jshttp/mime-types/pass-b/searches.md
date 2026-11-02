# Pass B -- Regex Search Results

Package: mime-types v3.0.2 (commit 3a1187ee)

## Group 1: Imports/requires

| File | Line | Match |
|------|------|-------|
| `$PACKAGE_ROOT/index.js` | 15 | `var db = require('mime-db')` |
| `$PACKAGE_ROOT/index.js` | 16 | `var extname = require('path').extname` |
| `$PACKAGE_ROOT/index.js` | 17 | `var mimeScore = require('./mimeScore')` |
| `$PACKAGE_ROOT/node_modules/mime-db/index.js` | 12 | `module.exports = require('./db.json')` |

## Group 2: Globals/builtins

All hits in `$PACKAGE_ROOT/node_modules/mime-db/db.json` -- MIME type name strings:
- Line 5763: `"application/vnd.stardivision.writer-global"`
- Line 5815: `"application/vnd.sun.xml.writer.global"`
- Line 8174: `"message/global"`
- Line 8178: `"message/global-delivery-status"`
- Line 8182: `"message/global-disposition-notification"`
- Line 8186: `"message/global-headers"`

Zero hits in any `.js` production file.

## Group 3: Prototype/property manipulation

Zero hits in any production file.

## Group 4: Patching keywords

All hits in `$PACKAGE_ROOT/node_modules/mime-db/db.json`:
- Line 439: `"application/dash-patch+xml"`
- Line 889: `"application/json-patch+json"`
- Line 1082: `"application/merge-patch+json"`
- Line 1311: `"application/patch-ops-error+xml"`
- Line 6977: `"application/xml-patch+xml"`
- Line 7028: `"application/yang-patch+json"`
- Line 7032: `"application/yang-patch+xml"`

Zero hits in any `.js` production file.

## Group 5: Module system hooks

Zero hits.

## Group 6: Internal bindings

Zero hits.

## Supplementary searches (Pass B additional coverage)

- **Dynamic code execution** (eval, new Function, vm, child_process, spawn): Zero hits in production JS files.
- **Object static methods** in production JS: `Object.create(null)` at lines 36, 38; `Object.keys(db)` at line 155. All read-only usage.
- **Advanced JS features** (Symbol, Proxy, WeakMap, WeakRef, FinalizationRegistry): Zero hits.
