# Pass B -- Audit Report

Package: **methods v1.1.2**
Production file: `$PACKAGE_ROOT/index.js` (70 lines)
Runtime dependencies: none
Date: 2026-11-01

---

## Overall finding

**No monkeypatching detected.**

The `methods` library does not modify, replace, extend, or override any Node.js core module, global object, built-in prototype, or module-loader mechanism.

---

## What the library does

The library exports an array of lowercase HTTP method name strings. It has exactly one code path with a fallback:

1. **Primary path (line 30):** Reads `http.METHODS` (available since Node.js 0.12) and returns a new array with each method lowercased via `.map()`. The original `http.METHODS` array is never mutated.

2. **Fallback path (lines 40-68):** If `http.METHODS` is falsy (Node.js < 0.12), returns a hardcoded array of 24 HTTP method strings. This is a static snapshot, not a modification of any core API.

The entire module is a pure data accessor with no side effects on Node.js internals.

---

## Search coverage

| Group | Pattern target | Production hits | Confirmed patches |
|-------|---------------|-----------------|-------------------|
| 1 | require / import / node: | 1 (C-001) | 0 |
| 2 | Buffer / process / globalThis / global / extends / inherits | 0 | 0 |
| 3 | .prototype / defineProperty / Object.assign | 0 | 0 |
| 4 | monkeypatch / patch / wrap / shim / polyfill / override | 1 (C-002) | 0 |
| 5 | require.cache / Module loader hooks | 0 | 0 |
| 6 | process.binding / internalBinding / _http_ / internal/ | 0 | 0 |
| **Total** | | **2** | **0** |

---

## Candidate ledger summary

| ID | Line | Match | Verdict |
|----|------|-------|---------|
| C-001 | 15 | `var http = require('http')` | Not monkeypatching -- read-only import of built-in module |
| C-002 | 65 | `'patch',` | Not monkeypatching -- HTTP method name string literal |

---

## Conclusion

All six search groups were executed. Two leads were found in the production file, both traced and dismissed as normal API usage. The library performs no writes to any core module, prototype, global, or loader mechanism. It is safe from a monkeypatching perspective.
