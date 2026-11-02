# Pass B: Candidate Ledger

**Library:** http-assert v1.5.0
**Date:** 2026-11-01

## C-001: depd/lib/compat/index.js — Error.prepareStackTrace transient swap (lazy getter)

**Source:** `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:30,39`
**Code:**
```js
Error.prepareStackTrace = prepareObjectStackTrace  // line 30
// ... Error.captureStackTrace(obj) ...
Error.prepareStackTrace = prep                     // line 39
```

**Trace:** The `callSiteToString` lazy property getter fires on first property access. This happens at `depd/index.js:11` (`var callSiteToString = require('./lib/compat').callSiteToString`), which runs when depd is first loaded. depd is loaded by `http-errors/index.js:15` (`require('depd')('http-errors')`), which runs when http-errors is loaded. http-errors is loaded by `http-assert/index.js:1` (`require('http-errors')`).

**Execution chain:**
`require('http-assert')` -> `require('http-errors')` -> `require('depd')` -> depd/index.js:11 accesses `.callSiteToString` -> lazy getter fires -> Error.prepareStackTrace swapped -> Error.captureStackTrace called -> Error.prepareStackTrace restored

**Mutation:** Writes `Error.prepareStackTrace` (a V8-specific global property on the Error constructor). The original value is saved in `prep` and restored synchronously after `Error.captureStackTrace(obj)`.

**Verdict: CONFIRMED** — Transient swap of a shared core global (`Error.prepareStackTrace`). Even though restored synchronously, this is a write to a V8/Node.js core symbol that is globally shared. In prior audits, this pattern is classified as a confirmed transient core patch.

---

## C-002: depd/lib/compat/index.js — Error.stackTraceLimit transient swap (lazy getter)

**Source:** `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:31,40`
**Code:**
```js
Error.stackTraceLimit = 2                          // line 31
// ... Error.captureStackTrace(obj) ...
Error.stackTraceLimit = limit                      // line 40
```

**Trace:** Same execution chain as C-001. Runs in the same function.

**Mutation:** Writes `Error.stackTraceLimit` (a V8-specific global property). Saved and restored synchronously.

**Verdict: CONFIRMED** — Transient swap of a shared core global (`Error.stackTraceLimit`).

---

## C-003: depd/index.js getStack() — Error.prepareStackTrace transient swap

**Source:** `$PACKAGE_ROOT/node_modules/depd/index.js:370,379`
**Code:**
```js
Error.prepareStackTrace = prepareObjectStackTrace  // line 370
// ... Error.captureStackTrace(obj) ...
Error.prepareStackTrace = prep                     // line 379
```

**Trace:** `getStack()` is called from:
1. **At require time:** `depd()` function (line 110) calls `getStack()`. This runs when `require('depd')('http-errors')` is called at http-errors/index.js:15.
2. **At require time:** `wrapfunction()` (line 404) calls `getStack()`. This runs when `deprecate.function(exports.ImATeapot, ...)` is called at http-errors/index.js:286-287 during `populateConstructorExports()` at line 31.
3. **At runtime:** `log()` (line 183) calls `getStack()` whenever a deprecation warning is triggered.
4. **At runtime:** `wrapfunction()` and `wrapproperty()` call `getStack()` if invoked by downstream code.

**Execution chain (require-time, invocation 1):**
`require('http-assert')` -> `require('http-errors')` -> `require('depd')('http-errors')` -> `depd()` -> `getStack()` -> Error.prepareStackTrace swapped -> restored

**Execution chain (require-time, invocation 2):**
`require('http-assert')` -> `require('http-errors')` -> `populateConstructorExports()` -> `deprecate.function(exports.ImATeapot, ...)` -> `wrapfunction()` -> `getStack()` -> Error.prepareStackTrace swapped -> restored

**Mutation:** Same as C-001 but in `getStack()` within depd/index.js. Saves and restores synchronously.

**Verdict: CONFIRMED** — Transient swap of `Error.prepareStackTrace`. Occurs at least twice at require time and potentially at runtime.

---

## C-004: depd/index.js getStack() — Error.stackTraceLimit transient swap

**Source:** `$PACKAGE_ROOT/node_modules/depd/index.js:371,380`
**Code:**
```js
Error.stackTraceLimit = Math.max(10, limit)        // line 371
// ... Error.captureStackTrace(obj) ...
Error.stackTraceLimit = limit                      // line 380
```

**Trace:** Same execution chain as C-003.

**Mutation:** Writes `Error.stackTraceLimit`. Saved and restored synchronously.

**Verdict: CONFIRMED** — Transient swap of `Error.stackTraceLimit`.

---

## C-005: http-errors — setPrototypeOf on Error instances

**Source:** `$PACKAGE_ROOT/node_modules/http-errors/index.js:145,214`
**Code:**
```js
setPrototypeOf(err, ClientError.prototype)   // line 145
setPrototypeOf(err, ServerError.prototype)   // line 214
```

**Trace:** Called inside `ClientError()` and `ServerError()` constructors. These set the prototype of a freshly-created `new Error(msg)` instance to the library-owned `ClientError.prototype` / `ServerError.prototype`. The `err` object was just created on the preceding line; it is not a core object.

**Verdict: REJECTED** — setPrototypeOf on library-owned Error instances (not Error.prototype or any core prototype). Per audit rules, this is not core patching.

---

## C-006: http-errors — Object.defineProperty on Error instances

**Source:** `$PACKAGE_ROOT/node_modules/http-errors/index.js:148,156,217,225,255`

**Trace:** All `Object.defineProperty` calls target either:
- A freshly-created `new Error(msg)` instance owned by the library (message/name properties)
- A library-owned function's `name` property (line 255, `nameFunc`)

**Verdict: REJECTED** — defineProperty on library-owned objects. Not core patching.

---

## C-007: http-errors — inherits(HttpError/ClientError/ServerError, ...)

**Source:** `$PACKAGE_ROOT/node_modules/http-errors/index.js:123,166,235`

**Trace:** Sets up prototype chains: HttpError extends Error, ClientError extends HttpError, ServerError extends HttpError. These create new prototype objects for library-owned constructors. They do NOT modify `Error.prototype` itself.

**Verdict: REJECTED** — Standard prototype chain setup on library-owned constructors. Does not mutate Error.prototype.

---

## C-008: deep-equal — Array.prototype.slice reference

**Source:** `$PACKAGE_ROOT/node_modules/deep-equal/index.js:1`
**Code:** `var pSlice = Array.prototype.slice;`

**Trace:** Reads `Array.prototype.slice` into a local variable. Does not modify it. Used as `pSlice.call(a)` for converting arguments objects to arrays.

**Verdict: REJECTED** — Read-only access to a core prototype method.

---

## C-009: deep-equal — Object.prototype method calls

**Source:** `$PACKAGE_ROOT/node_modules/deep-equal/lib/is_arguments.js:2,9,17,18`

**Trace:** Calls `Object.prototype.toString.call(...)`, `Object.prototype.hasOwnProperty.call(...)`, `Object.prototype.propertyIsEnumerable.call(...)`. All are read-only invocations of existing methods.

**Verdict: REJECTED** — Read-only use of core prototype methods.

---

## C-010: deep-equal/lib/keys.js — shim for Object.keys

**Source:** `$PACKAGE_ROOT/node_modules/deep-equal/lib/keys.js:1-5`
**Code:**
```js
exports = module.exports = typeof Object.keys === 'function'
  ? Object.keys : shim;
```

**Trace:** Checks if `Object.keys` exists and exports either `Object.keys` or a local `shim` function. Does NOT replace `Object.keys` on the Object constructor. The shim is a standalone function exported from the module.

**Verdict: REJECTED** — Does not modify `Object.keys` or any core object. Local polyfill export only.

---

## C-011: setprototypeof — __proto__ usage

**Source:** `$PACKAGE_ROOT/node_modules/setprototypeof/index.js:3,6`

**Trace:** Exports `Object.setPrototypeOf` if available, otherwise a fallback using `__proto__`. This utility is called by http-errors on library-owned Error instances only (C-005). The module itself does not call setPrototypeOf on any core object.

**Verdict: REJECTED** — Utility module; does not itself patch any core objects.

---

## C-012: depd — process.emit('deprecation', err)

**Source:** `$PACKAGE_ROOT/node_modules/depd/index.js:235`

**Trace:** Emits a `'deprecation'` event on the `process` object. This uses the standard EventEmitter API to emit a custom event. It does not add/remove listeners, does not replace any process method, and does not modify the process object's properties.

**Verdict: REJECTED** — Using the EventEmitter API on process is not patching. Emitting a custom event is standard usage.

---

## C-013: depd — wrapproperty Object.defineProperty

**Source:** `$PACKAGE_ROOT/node_modules/depd/index.js:469`

**Trace:** `wrapproperty(obj, prop, message)` uses `Object.defineProperty` to wrap a property on an arbitrary object in a deprecation getter/setter. In the http-assert dependency tree, this function is exposed as `deprecate.property` but is NOT called at require time or within any production code path of http-assert. The only call site is if downstream code explicitly calls `deprecate.property()`. Within http-errors, only `deprecate.function()` is used (line 286-287), not `deprecate.property()`.

**Verdict: REJECTED** — Not invoked in the http-assert dep tree. The function exists but is never called at require time or runtime within this library's scope.

---

## Summary

| ID | Target | Location | Verdict |
|----|--------|----------|---------|
| C-001 | Error.prepareStackTrace | depd/lib/compat/index.js:30,39 | **CONFIRMED** (transient) |
| C-002 | Error.stackTraceLimit | depd/lib/compat/index.js:31,40 | **CONFIRMED** (transient) |
| C-003 | Error.prepareStackTrace | depd/index.js:370,379 | **CONFIRMED** (transient) |
| C-004 | Error.stackTraceLimit | depd/index.js:371,380 | **CONFIRMED** (transient) |
| C-005 | Error instances | http-errors/index.js:145,214 | REJECTED |
| C-006 | Error instances | http-errors/index.js:148,156,217,225,255 | REJECTED |
| C-007 | HttpError/ClientError/ServerError | http-errors/index.js:123,166,235 | REJECTED |
| C-008 | Array.prototype.slice | deep-equal/index.js:1 | REJECTED |
| C-009 | Object.prototype methods | deep-equal/lib/is_arguments.js | REJECTED |
| C-010 | Object.keys shim | deep-equal/lib/keys.js:1-5 | REJECTED |
| C-011 | __proto__ | setprototypeof/index.js:3,6 | REJECTED |
| C-012 | process.emit | depd/index.js:235 | REJECTED |
| C-013 | Object.defineProperty | depd/index.js:469 | REJECTED |

**4 confirmed, 9 rejected.** All confirmed findings are transient swaps of Error.prepareStackTrace and Error.stackTraceLimit in depd, originating from two code sites (depd/lib/compat/index.js lazy getter and depd/index.js getStack function).
