# Pass A — Candidate Ledger

Package: `methods` v1.1.2
Production file: `$PACKAGE_ROOT/index.js` (70 lines)
Date: 2026-11-01

---

## C-001 — `require('http')`

| Field          | Value                                                  |
|----------------|--------------------------------------------------------|
| **File**       | `$PACKAGE_ROOT/index.js`                               |
| **Line**       | 15                                                     |
| **Search Group** | 1 (require / import / node:)                         |
| **Code**       | `var http = require('http')`                           |
| **Category**   | Module import                                          |
| **Analysis**   | Standard `require()` call to load the built-in `http` module. The returned module object is stored in a local variable `http`. No mutation of `require`, `require.cache`, or the module system occurs. The variable is used read-only on line 30 to access `http.METHODS`. |
| **Verdict**    | **Not monkeypatching.** Normal read-only import of a core module. |

---

## C-002 — `'patch'` string literal in method list

| Field          | Value                                                  |
|----------------|--------------------------------------------------------|
| **File**       | `$PACKAGE_ROOT/index.js`                               |
| **Line**       | 65                                                     |
| **Search Group** | 4 (patch / wrap / shim / polyfill / override)        |
| **Code**       | `'patch',`                                             |
| **Category**   | False positive — data value                            |
| **Analysis**   | The string `'patch'` appears inside the `getBasicNodeMethods()` function as one entry in a hardcoded array of HTTP method names (the HTTP PATCH method). It is not code that patches, wraps, or overrides anything. The regex matched the word "patch" in a string literal. |
| **Verdict**    | **Not monkeypatching.** False positive; this is the HTTP PATCH method name as static data. |

---

## Additional trace: `http.METHODS` read (line 30)

Although not flagged by any search group, line 30 is the only interaction with a
core module object and warrants explicit documentation:

```js
return http.METHODS && http.METHODS.map(function lowerCaseMethod (method) {
  return method.toLowerCase()
})
```

| Field          | Value                                                  |
|----------------|--------------------------------------------------------|
| **File**       | `$PACKAGE_ROOT/index.js`                               |
| **Line**       | 30                                                     |
| **Analysis**   | Reads the `http.METHODS` array (a standard public property listing supported HTTP methods). Calls `.map()` which returns a **new** array — the original `http.METHODS` array is never modified. The result is exported as the module's value via `module.exports`. No property is written on `http`, no prototype is touched, no global is mutated. |
| **Verdict**    | **Not monkeypatching.** Pure read of a public API, producing a new derived array. |

---

## Ledger Summary

| ID    | Line | Pattern Matched   | Verdict              |
|-------|------|-------------------|----------------------|
| C-001 | 15   | `require('http')` | Not monkeypatching   |
| C-002 | 65   | `'patch'`         | Not monkeypatching (false positive) |

**Total candidates: 2**
**Confirmed monkeypatching: 0**
