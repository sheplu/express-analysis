# Pass A — Search Results

**Library:** range-parser v1.2.1
**Commit:** f4bf1736f28a3e574430408c18779cf7fbaf3770
**Production files:** `$PACKAGE_ROOT/index.js` (sole production file)

---

## Search Group 1: require/import/node: patterns
**Pattern:** `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

**Results:**
- `./README.md:26` — `var parseRange = require('range-parser')` (documentation example, not production code)
- `./package-lock.json:2228` — `"resolve-from": "^4.0.0"` (dev dependency metadata)
- `./package-lock.json:3533` — `"resolve-from": "^4.0.0"` (dev dependency metadata)
- `./package-lock.json:4259` — `node_modules/resolve-from` (dev dependency metadata)

**Hits in production code:** NONE

---

## Search Group 2: Buffer/process/globalThis/global/extends/inherits
**Pattern:** `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

**Results:** No matches (exit code 1)

**Hits in production code:** NONE

---

## Search Group 3: prototype/defineProperty/Object.assign
**Pattern:** `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

**Results:**
- All matches in `./package-lock.json` only — references to dev dependency package names containing "prototype" (e.g., `array.prototype.flatmap`, `string.prototype.trim`, `regexp.prototype.flags`). These are package name strings in lock file metadata, not executable code.

**Hits in production code:** NONE

---

## Search Group 4: monkeypatch/patch/wrap/shim/polyfill/override
**Pattern:** `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

**Results:**
- All matches in `./package-lock.json` only — references to dev dependency package names containing "wrap" or "shim" (e.g., `wrap-ansi`, `spawn-wrap`, `es-shim-unscopables`, `word-wrap`). These are package name strings in lock file metadata, not executable code.

**Hits in production code:** NONE

---

## Search Group 5: require.cache/Module loader hooks
**Pattern:** `require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks`

**Results:** No matches (exit code 1)

**Hits in production code:** NONE

---

## Search Group 6: process.binding/internalBinding/internal modules
**Pattern:** `process\.(binding|_linkedBinding)|internalBinding|'_http_|'internal/`

**Results:** No matches (exit code 1)

**Hits in production code:** NONE
