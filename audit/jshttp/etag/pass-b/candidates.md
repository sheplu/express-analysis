# Pass B — Candidate Ledger

**Package:** etag v1.8.1
**Commit:** 5df2cfdd46d310ccf51638d5b702375cbd99da44

## Candidate Summary

| ID    | Location                    | Pattern Hit                        | Category         | Verdict       |
|-------|-----------------------------|------------------------------------|------------------|---------------|
| C-001 | `$PACKAGE_ROOT/index.js:21` | `require('crypto')`               | Core import      | NOT a patch   |
| C-002 | `$PACKAGE_ROOT/index.js:22` | `require('fs').Stats`             | Core import      | NOT a patch   |
| C-003 | `$PACKAGE_ROOT/index.js:54` | `Buffer.byteLength(entity, ...)`  | Global read      | NOT a patch   |
| C-004 | `$PACKAGE_ROOT/index.js:82` | `Buffer.isBuffer(entity)`         | Global read      | NOT a patch   |
| C-005 | `$PACKAGE_ROOT/index.js:29` | `Object.prototype.toString`       | Prototype access | NOT a patch   |

## Detailed Analysis

### C-001: `require('crypto')` (line 21)

```js
var crypto = require('crypto')
```

**Classification: NOT a patch.** Standard import of the `crypto` core module. The reference is stored in a local variable and used only to call `crypto.createHash('sha1')` (line 46). No properties of the `crypto` module are modified.

### C-002: `require('fs').Stats` (line 22)

```js
var Stats = require('fs').Stats
```

**Classification: NOT a patch.** Reads the `Stats` constructor from the `fs` module for use in `instanceof` checks (line 106). The `fs` module and `Stats` class are not modified in any way.

### C-003: `Buffer.byteLength()` (line 54)

```js
Buffer.byteLength(entity, 'utf8')
```

**Classification: NOT a patch.** Standard read-only call to `Buffer.byteLength` to compute the byte length of a string. No mutation of the `Buffer` global.

### C-004: `Buffer.isBuffer()` (line 82)

```js
Buffer.isBuffer(entity)
```

**Classification: NOT a patch.** Standard read-only call to `Buffer.isBuffer` to type-check an argument. No mutation of the `Buffer` global.

### C-005: `Object.prototype.toString` (line 29)

```js
var toString = Object.prototype.toString
```

**Classification: NOT a patch.** This is a READ of `Object.prototype.toString` — saving a reference to the built-in method in a local variable. The method is then called via `toString.call(obj.ctime)` (lines 111, 112) for type checking. `Object.prototype.toString` is never reassigned, overwritten, or modified.

## Searches With Zero Hits

- **Search 4 (patch keywords):** No matches — no use of "monkeypatch", "patch", "wrap", "shim", "polyfill", or "override".
- **Search 5 (module system hooks):** No matches — no manipulation of `require.cache`, `require.extensions`, or `Module._*`.
- **Search 6 (internal bindings):** No matches — no use of `process.binding`, `internalBinding`, or references to internal Node.js modules.
