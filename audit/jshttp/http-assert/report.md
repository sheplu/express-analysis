# Audit Report: http-assert v1.5.0

## Summary

| Field | Value |
|-------|-------|
| Package | http-assert |
| Version | 1.5.0 |
| Commit | 3ae22e131825155672ddc19dac5c1485cc0f9996 |
| Entrypoint | `index.js` (41 lines) |
| Runtime deps | deep-equal@~1.0.1, http-errors@~1.8.0 |
| Transitive deps | depd, inherits, setprototypeof, statuses, toidentifier |
| Audit date | 2026-11-01 |
| Audit method | Double-blind (Pass A + Pass B), reconciled |
| Production files audited | 14 |

## Verdict

**http-assert does not directly patch or monkeypatch Node.js core.** Its own source (`index.js`, 41 lines) is a thin assertion wrapper that calls `http-errors` to create errors and `deep-equal` for deep comparison. It contains zero writes to any global, prototype, or core module.

However, http-assert **transitively inherits 2 confirmed transient core patches** through its dependency chain: `http-assert` -> `http-errors` -> `depd`. The `depd` library temporarily swaps `Error.prepareStackTrace` and `Error.stackTraceLimit` (V8 globals on the Error constructor) using a save-modify-restore pattern. These swaps occur:

1. **3 times at require time** (during module loading of http-errors)
2. **At runtime** whenever a deprecation warning is triggered

All swaps are synchronous and restore the original values immediately. In single-threaded Node.js, no user code can observe the modified values during the swap window.

## Confirmed Findings

| ID | Core Symbol | Category | Origin | Code Sites |
|----|-------------|----------|--------|------------|
| F-001 | `Error.prepareStackTrace` | Transient swap | depd (via http-errors) | depd/index.js:370,379; depd/lib/compat/index.js:30,39 |
| F-002 | `Error.stackTraceLimit` | Transient swap | depd (via http-errors) | depd/index.js:371,380; depd/lib/compat/index.js:31,40 |

See `findings.md` for complete F-001 and F-002 details.

## Require-Time Execution Chain

```
require('http-assert')                                    [index.js:1]
  -> require('http-errors')                               [http-errors/index.js]
    -> require('depd')                                    [depd/index.js]
      -> require('./lib/compat').callSiteToString          [depd/index.js:11]
        -> lazy getter fires                              [depd/lib/compat/index.js:21]
          -> SWAP #1: Error.prepareStackTrace + Error.stackTraceLimit (transient, restored)
    -> require('depd')('http-errors')                     [http-errors/index.js:15]
      -> depd() -> getStack()                             [depd/index.js:110]
        -> SWAP #2: Error.prepareStackTrace + Error.stackTraceLimit (transient, restored)
    -> populateConstructorExports()                       [http-errors/index.js:31]
      -> deprecate.function(exports.ImATeapot, ...)       [http-errors/index.js:286]
        -> wrapfunction() -> getStack()                   [depd/index.js:404]
          -> SWAP #3: Error.prepareStackTrace + Error.stackTraceLimit (transient, restored)
    -> require('setprototypeof')                          (no patches)
    -> require('statuses')                                (no patches)
    -> require('inherits')                                (no patches)
    -> require('toidentifier')                            (no patches)
  -> require('deep-equal')                                (no patches)
```

## Rejected Candidates (both passes agree)

| Category | Examples | Reason |
|----------|----------|--------|
| Library-owned Error subclasses | http-errors setPrototypeOf, defineProperty, inherits on HttpError/ClientError/ServerError | Operates on library-created constructors and instances, not Error.prototype or any core prototype |
| Read-only core access | deep-equal's `Array.prototype.slice` reference, `Object.prototype.toString.call()` | Reads but does not modify core prototypes |
| Local polyfill exports | deep-equal/lib/keys.js shim, setprototypeof module | Exports alternative implementations but does not replace core APIs (e.g., does not overwrite Object.keys) |
| Standard API usage | depd's `process.emit('deprecation')`, `process.cwd()`, `process.env` reads | Using EventEmitter and process APIs as intended, not patching them |
| Unused utilities | depd's `wrapproperty()` | Available but never called on core objects in this dependency tree |

## Dependency Analysis

| Dependency | Version | Core Patches? |
|------------|---------|---------------|
| http-errors | ~1.8.0 | No (own code), but loads depd which patches |
| depd | ~1.1.2 | **Yes** — transient swaps of Error.prepareStackTrace and Error.stackTraceLimit |
| deep-equal | ~1.0.1 | No |
| inherits | 2.0.4 | No (re-exports util.inherits) |
| setprototypeof | 1.2.0 | No (exports utility, does not modify Object) |
| statuses | 1.5.0 | No |
| toidentifier | 1.0.1 | No |

## Audit Methodology

- Double-blind protocol: two independent passes using identical regex search groups
- 6 regex search groups covering: imports, globals, prototype/property mutation, patch vocabulary, module system hooks, internal bindings
- All hits traced from regex match to actual write/mutation
- Both passes produced identical confirmed findings (organizational difference only: Pass A grouped by code site, Pass B by core symbol)
- No disagreements to adjudicate
- See `methodology.md` for full reconciliation details
