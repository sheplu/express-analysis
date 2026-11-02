# Pass A — Candidate Ledger

**Package:** etag v1.8.1
**Commit:** 5df2cfdd46d310ccf51638d5b702375cbd99da44

## Candidates

### C-001: `require('crypto')` (line 21)

- **Source:** `$PACKAGE_ROOT/index.js:21`
- **Code:** `var crypto = require('crypto')`
- **Category:** Import
- **Classification:** READ — standard `require()` of built-in `crypto` module. No mutation.
- **Verdict:** NOT a patch.

### C-002: `require('fs').Stats` (line 22)

- **Source:** `$PACKAGE_ROOT/index.js:22`
- **Code:** `var Stats = require('fs').Stats`
- **Category:** Import / Property read
- **Classification:** READ — reads the `Stats` constructor from the `fs` module to use with `instanceof` later. Does not modify `fs` or `Stats`.
- **Verdict:** NOT a patch.

### C-003: `Buffer.byteLength` (line 54)

- **Source:** `$PACKAGE_ROOT/index.js:54`
- **Code:** `Buffer.byteLength(entity, 'utf8')`
- **Category:** Global usage
- **Classification:** READ — calls a static method on the `Buffer` global. No mutation.
- **Verdict:** NOT a patch.

### C-004: `Buffer.isBuffer` (line 82)

- **Source:** `$PACKAGE_ROOT/index.js:82`
- **Code:** `!Buffer.isBuffer(entity)`
- **Category:** Global usage
- **Classification:** READ — calls a static method on the `Buffer` global. No mutation.
- **Verdict:** NOT a patch.

### C-005: `Object.prototype.toString` (line 29)

- **Source:** `$PACKAGE_ROOT/index.js:29`
- **Code:** `var toString = Object.prototype.toString`
- **Category:** Prototype access
- **Classification:** READ — reads (copies a reference to) `Object.prototype.toString` into a local variable for duck-typing checks. Does not reassign, redefine, or modify `Object.prototype.toString` or any property on `Object.prototype`.
- **Verdict:** NOT a patch.

## Summary

| ID    | Location | Pattern                     | Direction | Patch? |
|-------|----------|-----------------------------|-----------|--------|
| C-001 | L21      | `require('crypto')`         | READ      | No     |
| C-002 | L22      | `require('fs').Stats`       | READ      | No     |
| C-003 | L54      | `Buffer.byteLength()`       | READ      | No     |
| C-004 | L82      | `Buffer.isBuffer()`         | READ      | No     |
| C-005 | L29      | `Object.prototype.toString` | READ      | No     |

**Total candidates: 5**
**Confirmed patches: 0**
