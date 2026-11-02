# Pass A — Audit Report

Package: `methods` v1.1.2
Production file: `$PACKAGE_ROOT/index.js` (70 lines)
Runtime dependencies: none
Date: 2026-11-01
Auditor: Pass A (automated regex sweep + manual trace)

---

## Overall Finding

**No monkeypatching detected.**

The `methods` module does not modify, override, or extend any Node.js core
object, prototype, global, or module-loading mechanism.

---

## What the module does

The module exports a plain `Array<string>` of HTTP method names in lowercase.

1. It imports the built-in `http` module via `require('http')` (line 15).
2. It reads `http.METHODS` (a standard public property) and maps each entry to
   lowercase, returning a **new** array (lines 29-33).
3. If `http.METHODS` is unavailable (Node.js < 0.12), it falls back to a
   hardcoded array of 25 method names (lines 40-68).
4. The result is exported via `module.exports` (line 22).

No property is ever written on `http`, no prototype is modified, no global is
touched, and no module-loader hook is installed.

---

## Search coverage

Six regex groups were executed against all non-test, non-benchmark production
files. Only 2 hits were found in the single production file (`index.js`), both
confirmed as benign:

| ID    | Line | Match             | Disposition                          |
|-------|------|-------------------|--------------------------------------|
| C-001 | 15   | `require('http')` | Normal core module import (read-only)|
| C-002 | 65   | `'patch'`         | HTTP PATCH method name (false positive from Group 4 keyword search) |

Groups 2, 3, 5, and 6 returned zero production-file hits.

---

## Risk assessment

| Dimension                        | Risk  |
|----------------------------------|-------|
| Core prototype mutation          | None  |
| Global object mutation           | None  |
| Module loader hooks              | None  |
| Internal/private API access      | None  |
| Core module property overwrite   | None  |
| **Overall monkeypatch risk**     | **None** |

---

## Conclusion

`methods` v1.1.2 is a pure data module. It reads one public property
(`http.METHODS`) from the Node.js `http` module, produces a derived lowercase
copy, and exports it. It performs no writes to any core object and poses no
monkeypatching risk.
