# Pass B -- Candidate Ledger

Package: **methods v1.1.2**
Production file: `$PACKAGE_ROOT/index.js` (70 lines)
Date: 2026-11-01

---

## Candidate entries

Only hits in the production file (`index.js`) are promoted to candidates.
Six search groups were executed; two produced production-file hits.

---

### C-001

| Field | Value |
|-------|-------|
| **Source** | Group 1 (require / import / node:) |
| **File** | `$PACKAGE_ROOT/index.js` |
| **Line** | 15 |
| **Text** | `var http = require('http')` |
| **Category** | Core-module import |
| **Analysis** | Standard `require('http')` call that imports the Node.js built-in `http` module. The returned module object is stored in a local variable `http`. The variable is subsequently read at line 30 (`http.METHODS && http.METHODS.map(...)`) to obtain the list of supported HTTP methods. No property of the `http` module is ever written, replaced, deleted, or redefined anywhere in the file. This is a read-only import. |
| **Verdict** | **NOT monkeypatching** -- normal read-only API usage |

---

### C-002

| Field | Value |
|-------|-------|
| **Source** | Group 4 (monkeypatch / patch / wrap / shim / polyfill / override) |
| **File** | `$PACKAGE_ROOT/index.js` |
| **Line** | 65 |
| **Text** | `'patch',` |
| **Category** | String literal (HTTP method name) |
| **Analysis** | The word `patch` appears as a plain string literal inside the `getBasicNodeMethods()` fallback array (lines 40-68). It is the HTTP method name `PATCH` in lowercase. This array is a static data snapshot and is only returned as the module's export value when `http.METHODS` is unavailable (Node.js < 0.12). No patching, wrapping, or overriding behavior is associated with this string. |
| **Verdict** | **NOT monkeypatching** -- static data, false positive on keyword |

---

## Additional trace notes

Beyond the two candidate hits, the full production file was reviewed for implicit mutation paths:

1. **Line 22** (`module.exports = getCurrentNodeMethods() || getBasicNodeMethods()`) -- Sets the library's own `module.exports` to a new array. Does not modify any core module's exports.

2. **Line 30** (`http.METHODS && http.METHODS.map(...)`) -- Reads the `http.METHODS` array and calls `.map()` on it, which returns a **new** array (lowercase copy). The original `http.METHODS` array is never mutated.

3. **Lines 40-68** (`getBasicNodeMethods()`) -- Returns a new array literal. No external state is touched.

No candidate was confirmed as monkeypatching.

---

## Summary

| Candidate | Search Group | Line | Verdict |
|-----------|-------------|------|---------|
| C-001 | 1 (require/import) | 15 | Not monkeypatching |
| C-002 | 4 (patch keyword) | 65 | Not monkeypatching |
