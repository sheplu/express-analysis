# Pass A -- Regex Search Results

Package: mime-types v3.0.2 (commit 3a1187ee)

## Group 1: Imports/requires

| File | Line | Match |
|------|------|-------|
| `$PACKAGE_ROOT/index.js` | 15 | `var db = require('mime-db')` |
| `$PACKAGE_ROOT/index.js` | 16 | `var extname = require('path').extname` |
| `$PACKAGE_ROOT/index.js` | 17 | `var mimeScore = require('./mimeScore')` |
| `$PACKAGE_ROOT/node_modules/mime-db/index.js` | 12 | `module.exports = require('./db.json')` |

## Group 2: Globals/builtins

All hits in `$PACKAGE_ROOT/node_modules/mime-db/db.json` -- MIME type name strings
containing the substring "global" (e.g., `"message/global"`,
`"application/vnd.stardivision.writer-global"`). Zero hits in any `.js` file.

## Group 3: Prototype/property manipulation

Zero hits in any production file.

## Group 4: Patching keywords

All hits in `$PACKAGE_ROOT/node_modules/mime-db/db.json` -- MIME type name strings
containing "patch" (e.g., `"application/json-patch+json"`,
`"application/dash-patch+xml"`). Zero hits in any `.js` file.

## Group 5: Module system hooks

Zero hits.

## Group 6: Internal bindings

Zero hits.
