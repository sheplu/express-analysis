# Monkeypatch Audit: Pure Utility Packages (Combined)

This report covers all Express dependencies classified as NONE-risk — packages that are pure utility functions with no side effects on Node.js objects.

## Methodology

Each package was:
1. Scanned with grep for `Object.setPrototypeOf`, `Object.defineProperty`, `__defineGetter__`, `__defineSetter__`, `__proto__`, `.prototype.` modifications, `Object.create` with foreign prototypes
2. All source files manually reviewed for property injection patterns on `req`/`res`/`msg` parameters
3. Any grep hits were individually verified as false positives (operating on own objects or using standard patterns)

---

## accepts@2.0.0
- **Files audited**: `index.js`
- **Role**: Content negotiation — wraps incoming request to provide `accepts()`, `acceptsEncodings()`, etc.
- **Grep hits**: `Accepts.prototype.type`, `Accepts.prototype.types`, etc.
- **Verification**: All `.prototype.` hits are on `Accepts` — the package's OWN constructor function. The `Accepts` constructor creates a new instance per call (`new Accepts(req)`) and only READS `req.headers` — never writes to `req`.
- **Result**: ✅ **CLEAN** — no monkeypatching

## content-disposition@2.0.1
- **Files audited**: `dist/index.js`
- **Role**: Creates and parses `Content-Disposition` HTTP headers
- **Grep hits**: `Object.defineProperty(exports, "__esModule", ...)`, `C.prototype = Object.create(null)` for NullObject perf optimization
- **Verification**: `Object.defineProperty` is on `exports` (its own module). `Object.create(null)` creates a null-prototype constructor for internal use as a fast empty-object factory — does not modify any foreign prototype.
- **Result**: ✅ **CLEAN** — no monkeypatching

## content-type@2.1.0
- **Files audited**: `dist/index.js`
- **Role**: Parses and formats `Content-Type` headers
- **Grep hits**: `Object.defineProperty(exports, "__esModule", ...)`, `C.prototype = Object.create(null)` for NullObject perf optimization
- **Verification**: Same pattern as content-disposition — own module exports and internal perf optimization. No foreign object modification.
- **Result**: ✅ **CLEAN** — no monkeypatching

## cookie@0.7.2
- **Files audited**: `index.js`
- **Role**: Cookie serialization and parsing
- **Grep hits**: `var __toString = Object.prototype.toString`, `var __hasOwnProperty = Object.prototype.hasOwnProperty`
- **Verification**: These are read-only references to built-in methods, cached as local variables for performance. No modification to `Object.prototype`.
- **Result**: ✅ **CLEAN** — no monkeypatching

## cookie-signature@1.2.2
- **Files audited**: `index.js`
- **Role**: Signs and unsigns cookie values using HMAC
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

## debug@4.4.3 — ⚠️ RECLASSIFIED: LOW RISK (2 findings)
- **Files audited**: `src/index.js`, `src/node.js`, `src/common.js`, `src/browser.js`
- **Role**: Conditional debug logging with namespaces
- **Grep hits**: `Object.defineProperty(debug, 'enabled', { ... })` in `common.js:122` — own object, not a monkeypatch
- **Result**: ⚠️ **2 FINDINGS** — `process.env` mutation

### Finding 1: process.env.DEBUG write
- **Category**: C (Instance Property Injection on global)
- **File**: `node_modules/debug/src/node.js`
- **Line(s)**: 205
- **Code**: `process.env.DEBUG = namespaces;`
- **What it does**: The `save()` function writes to `process.env.DEBUG`, mutating the global process environment. Called when `debug.enable(namespaces)` is invoked.
- **Object affected**: `process.env` (global)
- **Severity**: Medium — mutates a global shared object that affects all modules reading `DEBUG`

### Finding 2: process.env.DEBUG deletion
- **Category**: C (Instance Property Injection on global)
- **File**: `node_modules/debug/src/node.js`
- **Line(s)**: 209
- **Code**: `delete process.env.DEBUG;`
- **What it does**: When `save()` is called with a falsy namespaces value, it deletes the `DEBUG` environment variable from `process.env`.
- **Object affected**: `process.env` (global)
- **Severity**: Medium — removes a global environment variable that other modules may depend on

## encodeurl@2.0.0
- **Files audited**: `index.js`
- **Role**: Encodes URLs by escaping disallowed characters
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

## escape-html@1.0.3
- **Files audited**: `index.js`
- **Role**: Escapes HTML special characters
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

## etag@1.8.1
- **Files audited**: `index.js`
- **Role**: Generates ETag HTTP headers from content
- **Grep hits**: `var toString = Object.prototype.toString`
- **Verification**: Read-only reference cached for performance. No modification to `Object.prototype`.
- **Result**: ✅ **CLEAN** — no monkeypatching

## fresh@2.0.0
- **Files audited**: `index.js`
- **Role**: HTTP response freshness testing (ETag/Last-Modified comparison)
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

## mime-types@3.0.2
- **Files audited**: `index.js`, `mimeScore.js`
- **Role**: MIME type lookup and content-type mapping
- **Grep hits**: `exports.extensions = Object.create(null)`, `exports.types = Object.create(null)`
- **Verification**: Creates null-prototype objects for its own lookup tables. No foreign object modification.
- **Result**: ✅ **CLEAN** — no monkeypatching

## proxy-addr@2.0.8
- **Files audited**: `index.js`
- **Role**: Determines client IP address accounting for trusted proxies
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

## qs@6.16.0
- **Files audited**: `lib/parse.js`, `lib/stringify.js`, `lib/utils.js`, `lib/formats.js`, `lib/index.js`
- **Role**: Extended query string parser
- **Grep hits**: `{ __proto__: null }` in `parse.js` (lines 73, 197, 393, 397), `decodedRoot !== '__proto__'` guard (line 216)
- **Verification**: All `__proto__: null` uses are creating null-prototype plain objects — this is a **protection against prototype pollution**, not prototype pollution itself. The `'__proto__'` check at line 216 explicitly guards against `__proto__` keys in query strings. No foreign object modification.
- **Result**: ✅ **CLEAN** — no monkeypatching. The `__proto__` references are defensive, not offensive.

## range-parser@1.3.0
- **Files audited**: `index.js`
- **Role**: Parses HTTP `Range` headers for byte-range requests
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

## statuses@2.0.2
- **Files audited**: `index.js`
- **Role**: HTTP status code to message mapping
- **Grep hits**: `Object.prototype.hasOwnProperty.call(status.code, msg)` (line 96), `Object.prototype.hasOwnProperty.call(status.message, code)` (line 109)
- **Verification**: Read-only calls to `Object.prototype.hasOwnProperty` — standard pattern for safe property existence checks. No modification to any prototype.
- **Result**: ✅ **CLEAN** — no monkeypatching

## type-is@2.1.0
- **Files audited**: `index.js`
- **Role**: Checks request Content-Type against given types
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

## vary@1.1.2
- **Files audited**: `index.js`
- **Role**: Manipulates the `Vary` response header
- **Grep hits**: None
- **Result**: ✅ **CLEAN** — no monkeypatching

---

## Summary

| Package | Version | Files | Result |
|---|---|---|---|
| accepts | 2.0.0 | 1 | ✅ Clean |
| content-disposition | 2.0.1 | 1 | ✅ Clean |
| content-type | 2.1.0 | 1 | ✅ Clean |
| cookie | 0.7.2 | 1 | ✅ Clean |
| cookie-signature | 1.2.2 | 1 | ✅ Clean |
| debug | 4.4.3 | 4 | ⚠️ **2 findings** — `process.env` mutation |
| encodeurl | 2.0.0 | 1 | ✅ Clean |
| escape-html | 1.0.3 | 1 | ✅ Clean |
| etag | 1.8.1 | 1 | ✅ Clean |
| fresh | 2.0.0 | 1 | ✅ Clean |
| mime-types | 3.0.2 | 2 | ✅ Clean |
| proxy-addr | 2.0.8 | 1 | ✅ Clean |
| qs | 6.16.0 | 5 | ✅ Clean |
| range-parser | 1.3.0 | 1 | ✅ Clean |
| statuses | 2.0.2 | 1 | ✅ Clean |
| type-is | 2.1.0 | 1 | ✅ Clean |
| vary | 1.1.2 | 1 | ✅ Clean |

**Total packages scanned**: 17
**Total source files audited**: 25
**Total findings**: 2 (both in `debug`)
**Clean packages**: 16 of 17

16 packages are fully clean — all grep hits verified as false positives (operating on own objects, caching read-only references, or using defensive `__proto__: null` patterns). The `debug` package was reclassified from NONE to LOW risk after discovering `process.env` mutations in its `save()` function.
