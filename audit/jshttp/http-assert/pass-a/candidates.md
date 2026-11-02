# Pass A — Candidate Ledger

## C-001: depd getStack() swaps Error.prepareStackTrace and Error.stackTraceLimit

- **File**: `$PACKAGE_ROOT/node_modules/depd/index.js:366-383`
- **What**: `getStack()` function saves `Error.prepareStackTrace` and `Error.stackTraceLimit`, replaces them with custom values, calls `Error.captureStackTrace()`, then restores both original values synchronously.
- **Target**: `Error.prepareStackTrace` (V8 global), `Error.stackTraceLimit` (V8 global)
- **Operation**: Write to shared global properties of the `Error` constructor
- **Transient**: Yes — original values are saved before, restored immediately after `captureStackTrace`
- **When called**: Called from `depd()` function (line 110) via `getStack()`. `depd()` is invoked at require time by `http-errors/index.js` line 15: `require('depd')('http-errors')`. Also called from `wrapfunction()` (line 404) and `log()` (line 183) at deprecation-emit time.
- **Execution chain**: `require('http-assert')` → `require('http-errors')` → `require('depd')('http-errors')` → `depd()` → `getStack()` → writes Error.prepareStackTrace + Error.stackTraceLimit → restores
- **Verdict**: **CONFIRMED** — transient shared-core mutation of Error.prepareStackTrace and Error.stackTraceLimit

## C-002: depd compat/index.js lazy callSiteToString getter swaps Error.prepareStackTrace and Error.stackTraceLimit

- **File**: `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js:21-43`
- **What**: `lazyProperty` getter for `callSiteToString` saves `Error.prepareStackTrace` and `Error.stackTraceLimit`, swaps them, captures a stack, restores both.
- **Target**: `Error.prepareStackTrace` (V8 global), `Error.stackTraceLimit` (V8 global)
- **Operation**: Write to shared global properties of the `Error` constructor
- **Transient**: Yes — save-swap-restore pattern
- **When called**: Triggered when `depd/index.js` line 11 does `require('./lib/compat').callSiteToString`, which accesses the lazy property getter. This fires at `require('depd')` time, i.e., at require time of http-errors.
- **Execution chain**: `require('http-assert')` → `require('http-errors')` → `require('depd')` → top-level `var callSiteToString = require('./lib/compat').callSiteToString` → lazy getter fires → writes Error.prepareStackTrace + Error.stackTraceLimit → restores
- **Verdict**: **CONFIRMED** — transient shared-core mutation of Error.prepareStackTrace and Error.stackTraceLimit

## C-003: http-errors uses setPrototypeOf on Error instances

- **File**: `$PACKAGE_ROOT/node_modules/http-errors/index.js:145,214`
- **What**: `setPrototypeOf(err, ClientError.prototype)` and `setPrototypeOf(err, ServerError.prototype)` set the prototype of freshly created Error instances to library-defined subclass prototypes.
- **Target**: Library-owned Error instances (newly created within constructors)
- **Verdict**: **REJECTED** — operates on library-owned Error instances, not on core prototypes or shared globals. The `Error` constructor and `Error.prototype` are untouched.

## C-004: http-errors uses Object.defineProperty on Error instances

- **File**: `$PACKAGE_ROOT/node_modules/http-errors/index.js:148,156,217,225,255`
- **What**: Redefines `message`, `name` properties on freshly created library-owned Error objects. Also redefines `func.name` on library-owned constructors.
- **Target**: Library-owned objects only
- **Verdict**: **REJECTED** — instance-level property manipulation on library-owned objects. Does not touch Error.prototype or any shared core object.

## C-005: http-errors inherits() calls

- **File**: `$PACKAGE_ROOT/node_modules/http-errors/index.js:123,166,235`
- **What**: `inherits(HttpError, Error)`, `inherits(ClientError, HttpError)`, `inherits(ServerError, HttpError)` — sets up prototype chains for library-defined constructors.
- **Target**: Library-owned constructors and their prototypes
- **Verdict**: **REJECTED** — creates new prototype objects for library-owned constructors; does not modify `Error.prototype` or any core prototype.

## C-006: deep-equal reads Array.prototype.slice

- **File**: `$PACKAGE_ROOT/node_modules/deep-equal/index.js:1`
- **What**: `var pSlice = Array.prototype.slice` — saves a reference to `Array.prototype.slice`.
- **Target**: None — this is a READ operation, no write.
- **Verdict**: **REJECTED** — read-only access, no mutation.

## C-007: deep-equal keys.js shim

- **File**: `$PACKAGE_ROOT/node_modules/deep-equal/lib/keys.js:1-8`
- **What**: `exports = module.exports = typeof Object.keys === 'function' ? Object.keys : shim` — provides a fallback for Object.keys but only exports it.
- **Target**: None — does not replace Object.keys.
- **Verdict**: **REJECTED** — local export only, does not modify any global.

## C-008: setprototypeof module

- **File**: `$PACKAGE_ROOT/node_modules/setprototypeof/index.js:3`
- **What**: `module.exports = Object.setPrototypeOf || ...` — exports the built-in or a polyfill fallback.
- **Target**: None — does not modify Object itself.
- **Verdict**: **REJECTED** — exports a function reference, does not patch Object or any global.

## C-009: depd wrapproperty() uses Object.defineProperty on user-provided objects

- **File**: `$PACKAGE_ROOT/node_modules/depd/index.js:423-469`
- **What**: Wraps getter/setter on a property of a user-provided object to log deprecation warnings.
- **Called from**: `http-errors/index.js` does not call `wrapproperty()` on any core objects. It is only exposed as `deprecate.property` and in this dep tree, never invoked on core objects.
- **Verdict**: **REJECTED** — the function exists as a utility but is not used on any core objects in this dep tree.

## C-010: depd process.emit('deprecation', err)

- **File**: `$PACKAGE_ROOT/node_modules/depd/index.js:235`
- **What**: Emits a 'deprecation' event on the global `process` object.
- **Target**: `process` event emitter
- **Verdict**: **REJECTED** — emitting events is a standard use of the process EventEmitter API. It does not modify or patch process; it sends an event.

## Summary

| ID    | Target                         | Verdict    |
|-------|-------------------------------|------------|
| C-001 | Error.prepareStackTrace/stackTraceLimit (depd getStack) | CONFIRMED |
| C-002 | Error.prepareStackTrace/stackTraceLimit (depd compat)   | CONFIRMED |
| C-003 | Library Error instances (setPrototypeOf)                 | REJECTED  |
| C-004 | Library Error instances (defineProperty)                 | REJECTED  |
| C-005 | Library constructors (inherits)                          | REJECTED  |
| C-006 | Array.prototype.slice (read-only)                        | REJECTED  |
| C-007 | Object.keys shim (export-only)                           | REJECTED  |
| C-008 | setprototypeof module (export-only)                      | REJECTED  |
| C-009 | depd wrapproperty (not used on core)                     | REJECTED  |
| C-010 | process.emit (standard API use)                          | REJECTED  |

**Confirmed patches: 2 (C-001, C-002) — both transient swaps of Error.prepareStackTrace and Error.stackTraceLimit via depd**
