# Detailed Findings: compressible v2.0.18

## Search Results Summary

### Search Group 1: Imports / requires
**Pattern:** `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

Two hits found, both standard module loading:
- `$PACKAGE_ROOT/index.js:16` — `var db = require('mime-db')`
- `$PACKAGE_ROOT/node_modules/mime-db/index.js:12` — `module.exports = require('./db.json')`

Neither loads a Node.js core module. Neither manipulates the require system.

### Search Group 2: Globals / built-ins
**Pattern:** `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

Hits found only in `db.json`, matching IANA MIME type name strings containing
the substring "global" (e.g. `"message/global"`, `"message/global-delivery-status"`).
These are inert JSON string values, not JavaScript code.

No hits in any `.js` production file.

### Search Group 3: Prototype / property manipulation
**Pattern:** `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

**Zero hits** across all production files.

### Search Group 4: Patching keywords
**Pattern:** `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

Hits found only in `db.json`, matching MIME type names containing the
substring "patch" (e.g. `"application/json-patch+json"`,
`"application/merge-patch+json"`). These are RFC-defined MIME type names,
not patching code.

No hits in any `.js` production file.

### Search Group 5: Module system hooks
**Pattern:** `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

**Zero hits** across all production files.

### Search Group 6: Internal bindings
**Pattern:** `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

**Zero hits** across all production files.

## Transitive Dependency Analysis: mime-db@1.54.0

mime-db has zero runtime dependencies. Its sole production file (`index.js`)
contains one line of executable code: `module.exports = require('./db.json')`.
The `db.json` file is a static data file generated from IANA, Apache, and
Nginx MIME type registries. No executable code, no prototype manipulation,
no global access.

## Code Walkthrough: compressible/index.js

```javascript
'use strict'
var db = require('mime-db')                           // loads static JSON
var COMPRESSIBLE_TYPE_REGEXP = /^text\/|\+(?:json|text|xml)$/i  // local regexp
var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/             // local regexp
module.exports = compressible                         // standard export

function compressible (type) {
  if (typeof type !== 'string') return false           // type check
  var match = EXTRACT_TYPE_REGEXP.exec(type)           // local regexp use
  if (!match) return undefined
  var mime = match[1].toLowerCase()                    // string operation
  var data = db[mime]                                  // read-only lookup
  return typeof data !== 'undefined' && typeof data.compressible !== 'undefined'
    ? data.compressible                                // read-only access
    : COMPRESSIBLE_TYPE_REGEXP.test(mime) || undefined  // regexp test
}
```

Every operation is a local computation or a read-only property access on the
imported JSON object. No writes to any external object.
