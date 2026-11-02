# Pass B — Search Results

**Library:** range-parser v1.2.1  
**Commit:** f4bf1736f28a3e574430408c18779cf7fbaf3770  
**Production files searched:** `$PACKAGE_ROOT/index.js`  
**Date:** 2026-11-01  

## Search Group 1: require/import/from

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

**Hits in production code:** None

Non-production hits (excluded from analysis):
- `$PACKAGE_ROOT/package-lock.json` — "resolve-from" references (dev dependency metadata)
- `$PACKAGE_ROOT/README.md:26` — documentation example `var parseRange = require('range-parser')`

## Search Group 2: Buffer/process/global/extends/inherits

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

**Hits in production code:** None

## Search Group 3: prototype/defineProperty/Object.assign

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

**Hits in production code:** None

Non-production hits (excluded from analysis):
- `$PACKAGE_ROOT/package-lock.json` — references to dev dependency package names containing "prototype" (array.prototype.flatmap, string.prototype.trim, etc.)

## Search Group 4: patch/wrap/shim/polyfill/override

Pattern: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

**Hits in production code:** None

Non-production hits (excluded from analysis):
- `$PACKAGE_ROOT/package-lock.json` — dev dependency names (es-shim-unscopables, spawn-wrap, wrap-ansi, word-wrap)

## Search Group 5: require.cache/Module hooks

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks`

**Hits in production code:** None

## Search Group 6: process.binding/internalBinding

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

**Hits in production code:** None

## Summary

All 6 search groups returned **zero hits** against the production source file `$PACKAGE_ROOT/index.js`. Every match came from `package-lock.json` (dev dependency metadata, not shipped) or `README.md` (documentation).
