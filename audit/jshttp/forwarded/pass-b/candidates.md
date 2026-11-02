# Monkeypatch Audit -- Candidate Ledger (Pass B)

**Library:** forwarded v0.2.0
**Commit:** b3097d832aea409b1a1934fd60ecba8129116edc
**Date:** 2026-11-01

---

## Summary

| ID    | Location                          | Pattern                   | Status   |
|-------|-----------------------------------|---------------------------|----------|
| C-001 | `$PACKAGE_ROOT/scripts/version-history.js:3-4` | `require('fs')`, `require('path')` | REJECTED |
| C-002 | `$PACKAGE_ROOT/scripts/version-history.js:8,15,20,28` | `process.env`, `process.exit` | REJECTED |

**Total candidates:** 2
**Confirmed monkeypatches:** 0
**Rejected:** 2
**Unresolved:** 0

---

## C-001: require('fs') and require('path') in version-history script

**File:** `$PACKAGE_ROOT/scripts/version-history.js`, lines 3-4
**Search group:** 1 (require/import/from)
**Status:** REJECTED

**Evidence:**
```javascript
var fs = require('fs')
var path = require('path')
```

**Reasoning:**
- This file is a dev-only build script that runs during `npm version` to update HISTORY.md.
- It is NOT shipped in the published package. The `package.json` `files` field limits the distribution to: `["LICENSE", "HISTORY.md", "README.md", "index.js"]`.
- The `require` calls load Node.js built-in modules for standard file I/O and path resolution. No modification, wrapping, or patching of these modules occurs.
- Even if this file were shipped, it performs only read-then-write on a local markdown file -- zero interaction with Node.js internals.

**Verdict:** Not a monkeypatch. Normal dev-time usage of Node.js built-ins.

---

## C-002: process.env and process.exit in version-history script

**File:** `$PACKAGE_ROOT/scripts/version-history.js`, lines 8, 15, 20, 28
**Search group:** 2 (Buffer/process/global)
**Status:** REJECTED

**Evidence:**
```javascript
var VERSION = process.env.npm_package_version   // line 8
  process.exit(1)                                // lines 15, 20, 28
```

**Reasoning:**
- Same dev-only script as C-001 (not shipped in the published package).
- `process.env` is read-only access to an environment variable -- it does not mutate `process` or any global.
- `process.exit(1)` terminates the script on validation failure -- it does not modify `process` behavior for other code.
- Neither pattern constitutes monkeypatching.

**Verdict:** Not a monkeypatch. Standard `process` usage in a dev script.

---

## Notes

All remaining search hits (Groups 3, 4, 5, 6) were exclusively in `package-lock.json`, which is an auto-generated dependency manifest containing no executable code. These are package name strings (e.g., `array.prototype.flat`, `es-shim-unscopables`, `wrap-ansi`) that happen to match the regex patterns but are metadata for dev dependencies (eslint, nyc), not part of the production library.

The sole production file `$PACKAGE_ROOT/index.js` (91 lines) produced zero hits across all six search groups. It contains no `require` calls, no global access, no prototype manipulation, no module loader hooks, and no internal binding access.
