# http-errors v2.0.1 -- Detailed Findings

Package: http-errors v2.0.1
Commit: 814207e1f69eab337d82794c8f4e552805d02047

---

### F-001: Transient swap of Error.prepareStackTrace and Error.stackTraceLimit

- **Category:** transient swap
- **Library site(s):** `$PACKAGE_ROOT/node_modules/depd/index.js:386-387` (write), `$PACKAGE_ROOT/node_modules/depd/index.js:395-396` (restore)
- **Origin:** transitive dependency -- http-errors -> depd@2.0.0
- **Core baseline:** `Error.prepareStackTrace` is a V8-specific hook (not in ECMA-262) that V8 calls when formatting stack traces. When set, V8 passes the error object and an array of CallSite objects. `Error.stackTraceLimit` controls how many stack frames V8 captures. Both are properties on the global `Error` constructor, shared across the entire process.
- **Exact mutation:**
  - Object: `Error` (global constructor)
  - Key 1: `prepareStackTrace`
    - Operation: direct property assignment
    - Replacement: `prepareObjectStackTrace` -- a function at depd/index.js:405-407 that returns the raw CallSite array (`return stack`)
  - Key 2: `stackTraceLimit`
    - Operation: direct property assignment
    - Replacement: `Math.max(10, limit)` -- ensures at least 10 frames
- **Execution chain:**
  1. `require('http-errors')` evaluates `$PACKAGE_ROOT/index.js`
  2. Line 15: `var deprecate = require('depd')('http-errors')` -- calls the `depd` factory
  3. `depd/index.js:103-127`: `depd(namespace)` function body
  4. `depd/index.js:108`: `var stack = getStack()` -- calls getStack
  5. `depd/index.js:381-398`: `getStack()`:
     - Line 382: `var limit = Error.stackTraceLimit` (save original)
     - Line 384: `var prep = Error.prepareStackTrace` (save original)
     - Line 386: `Error.prepareStackTrace = prepareObjectStackTrace` (MUTATE)
     - Line 387: `Error.stackTraceLimit = Math.max(10, limit)` (MUTATE)
     - Line 390: `Error.captureStackTrace(obj)` (capture with custom formatter)
     - Line 393: `var stack = obj.stack.slice(1)` (read CallSite array)
     - Line 395: `Error.prepareStackTrace = prep` (RESTORE)
     - Line 396: `Error.stackTraceLimit = limit` (RESTORE)
- **Activation:**
  - **Require-time (guaranteed):** Once when `require('http-errors')` is first evaluated. The `depd('http-errors')` factory invocation at index.js:15 calls `getStack()` to determine the caller's file location for deprecation tracking.
  - **Deprecation-time (conditional):** When `deprecate('non-error status code; ...')` is called at index.js:73 (triggered by `createError()` with a non-4xx/5xx status code), the `log()` function at depd/index.js:199 calls `getStack()` again. This path is conditional on the application using non-error status codes.
- **Scope and restoration:** Transient. Both properties are saved to local variables before mutation and restored synchronously after `Error.captureStackTrace()` completes. In single-threaded Node.js, no user code can interleave between the write (line 386-387) and restore (line 395-396). However, if another library has installed a getter/setter on `Error.prepareStackTrace`, the save/restore pattern could interact unexpectedly with that hook.
- **Node.js source reference:** `Error.prepareStackTrace` is documented in the V8 stack trace API and used by Node.js internally in `$NODEJS_SOURCE/lib/internal/errors.js`.

---

## Rejected Candidates Summary

| ID | Description | Reason for Rejection |
|----|-------------|---------------------|
| C-002 | setPrototypeOf on Error instances | Library-owned instances, not core prototypes |
| C-003 | Object.defineProperty on Error instances | Library-owned instances and functions |
| C-004 | inherits(HttpError, Error) | Standard subclassing; Error.prototype untouched |
| C-005 | process.emit('deprecation') | Standard EventEmitter API; custom event type |
| C-006 | depd wrapfunction/wrapproperty | Never invoked by http-errors |
| C-007 | Error.captureStackTrace usage | Standard V8 API; no mutation |
| C-008 | depd convertDataDescriptorToAccessor | Only reachable via wrapproperty (never called) |
| C-009 | setprototypeof module | Utility wrapper; no global polyfill installation |
