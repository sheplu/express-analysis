# Confirmed Findings: http-assert v1.5.0

**Commit:** 3ae22e131825155672ddc19dac5c1485cc0f9996
**Audit date:** 2026-11-01
**Total confirmed findings:** 2 (both transitive, via depd)

---

### F-001: Error.prepareStackTrace — transient swap to custom `prepareObjectStackTrace`

- **Category:** transient swap of shared V8 global
- **Library site(s):**
  - `$PACKAGE_ROOT/node_modules/depd/index.js:370` (write) / `:379` (restore)
  - `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:30` (write) / `:39` (restore)
- **Origin:** transitive — http-assert -> http-errors@~1.8.0 -> depd@~1.1.2
- **Core baseline:** `$NODEJS_SOURCE/deps/v8/src/inspector/v8-stack-trace-impl.cc` — `Error.prepareStackTrace` is a V8-provided hook that, when set, is called by V8 instead of the default stack trace formatter. Its default value is `undefined`.
- **Exact mutation:**
  - Object: `Error` (the global Error constructor)
  - Key: `prepareStackTrace`
  - Operation: direct property assignment (`=`)
  - Replacement: `prepareObjectStackTrace` — a function that returns the raw CallSite array (`function (obj, stack) { return stack }`)
- **Execution chain (require time, 3 invocations):**
  1. `require('http-assert')` -> `require('http-errors')` -> `require('depd')` -> depd/index.js:11 accesses `require('./lib/compat').callSiteToString` -> lazy getter fires -> compat/index.js:30 writes `Error.prepareStackTrace = prepareObjectStackTrace` -> `:34` calls `Error.captureStackTrace(obj)` -> `:39` restores `Error.prepareStackTrace = prep`
  2. `require('depd')('http-errors')` -> `depd()` -> `getStack()` -> depd/index.js:370 writes `Error.prepareStackTrace = prepareObjectStackTrace` -> `:374` calls `Error.captureStackTrace(obj)` -> `:379` restores `Error.prepareStackTrace = prep`
  3. `populateConstructorExports()` -> `deprecate.function(exports.ImATeapot, ...)` -> `wrapfunction()` -> `getStack()` -> same swap as #2
- **Execution chain (runtime):**
  - Any deprecation warning trigger -> `log()` -> `getStack()` -> same swap
  - Any `deprecate.function()` call -> `wrapfunction()` -> `getStack()` -> same swap
- **Activation:** At require time (3 synchronous invocations during module loading) and at runtime whenever a deprecation is triggered. No guards prevent the swap.
- **Scope and restoration:** Globally visible on the `Error` constructor. Original value is saved in a local variable (`prep`) before the swap and restored synchronously after `Error.captureStackTrace()` returns. In single-threaded Node.js, no user code can observe the modified value during the swap window. However, the swap is NOT exception-safe: if `Error.captureStackTrace()` were to throw, the original value would not be restored (though `captureStackTrace` does not throw in practice).
- **Resulting behavior:**
  - Before: `Error.prepareStackTrace` is whatever the caller/environment had set (typically `undefined`)
  - During swap: V8's stack trace API returns raw CallSite objects instead of formatted strings
  - After: original value is restored; no permanent change

---

### F-002: Error.stackTraceLimit — transient swap to increased/fixed limit

- **Category:** transient swap of shared V8 global
- **Library site(s):**
  - `$PACKAGE_ROOT/node_modules/depd/index.js:371` (write) / `:380` (restore)
  - `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:31` (write) / `:40` (restore)
- **Origin:** transitive — http-assert -> http-errors@~1.8.0 -> depd@~1.1.2
- **Core baseline:** `$NODEJS_SOURCE/deps/v8/src/flags/flag-definitions.h` — `Error.stackTraceLimit` controls V8's stack trace depth. Node.js default is `10`.
- **Exact mutation:**
  - Object: `Error` (the global Error constructor)
  - Key: `stackTraceLimit`
  - Operation: direct property assignment (`=`)
  - Replacement:
    - In `getStack()` (depd/index.js:371): `Math.max(10, limit)` — ensures at least 10 frames
    - In compat/index.js:31: `2` — sets to exactly 2 (only needs to probe one call site)
- **Execution chain:** Identical to F-001 — the two properties are always swapped together in the same functions (`getStack()` and the compat lazy getter).
- **Activation:** Same as F-001 — at require time (3 invocations) and at runtime on deprecation triggers.
- **Scope and restoration:** Globally visible on the `Error` constructor. Original value saved in local variable (`limit`) and restored synchronously. Same exception-safety caveat as F-001.
- **Resulting behavior:**
  - Before: `Error.stackTraceLimit` is whatever the caller/environment had set (default: `10`)
  - During swap: temporarily changed to `Math.max(10, limit)` or `2`
  - After: original value is restored; no permanent change
