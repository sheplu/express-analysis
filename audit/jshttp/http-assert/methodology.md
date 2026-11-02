# Reconciliation and Methodology

## Library
- **Package:** http-assert v1.5.0
- **Commit:** 3ae22e131825155672ddc19dac5c1485cc0f9996
- **Audit date:** 2026-11-01

## Double-Blind Protocol

Two independent audit passes (Pass A and Pass B) were conducted in parallel, each running the same 6 regex search groups across all production files and tracing every hit to determine whether it constitutes a core patch.

## Pass Comparison

### Pass A
- Evaluated **10 candidates** (C-001 through C-010)
- Confirmed **2** (grouped by code site: depd/index.js getStack, depd/lib/compat/index.js lazy getter)
- Rejected **8** (library-owned operations, read-only access, standard API usage)

### Pass B
- Evaluated **13 candidates** (C-001 through C-013)
- Confirmed **4** (grouped by core symbol: Error.prepareStackTrace x2 sites, Error.stackTraceLimit x2 sites)
- Rejected **9** (library-owned operations, read-only access, standard API usage, unused utilities)

### Reconciliation

The confirmed findings from both passes are **identical in substance**. The difference is purely organizational:

| Dimension | Pass A | Pass B |
|-----------|--------|--------|
| Grouping | By code site (2 findings) | By core symbol (4 findings) |
| Code sites identified | depd/index.js:365-383, depd/lib/compat/index.js:21-43 | Same |
| Core symbols identified | Error.prepareStackTrace, Error.stackTraceLimit | Same |
| Category | Transient shared-core mutation | Same |
| Origin | depd (via http-errors) | Same |
| Execution chain | Traced through require-time paths | Same, with additional detail on 3rd invocation |

Pass B provided additional granularity by documenting three distinct require-time invocations:
1. compat/index.js lazy getter fires when depd/index.js accesses `.callSiteToString`
2. `getStack()` called from `depd()` at depd/index.js:110
3. `getStack()` called from `wrapfunction()` via `deprecate.function()` at http-errors/index.js:286-287

Pass A mentioned path 3 in its C-001 description but did not call it out as a separate invocation.

**No disagreements to adjudicate.**

### Rejected Candidates (both passes agree)

All rejected candidates fall into these categories:
- **Library-owned Error subclasses**: setPrototypeOf, defineProperty, inherits on http-errors' own constructors and instances
- **Read-only access**: deep-equal reading Array.prototype.slice, Object.prototype methods
- **Local exports only**: deep-equal/lib/keys.js shim, setprototypeof module
- **Standard API usage**: process.emit('deprecation'), process.cwd(), process.env reads
- **Unused utilities**: depd's wrapproperty is not called on core objects in this dep tree

### Final Finding Structure

For the reconciled report, findings are organized per core symbol with both code sites documented, yielding **2 findings** (F-001, F-002).

## Search Methodology

Six regex search groups were run across all production files (excluding tests, benchmarks, dotfiles, and nested node_modules):

1. **Imports/requires**: `require\s*\(`, `from\s*`, `import\s*\(`, `node:` — to map the dependency graph
2. **Globals/builtins**: `Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits\s*\(` — to find global access
3. **Prototype/property mutation**: `.prototype`, `__proto__`, `setPrototypeOf`, `defineProperty`, `Reflect.*`, `Object.assign` — to find potential core mutations
4. **Patch vocabulary**: `monkey.?patch`, `patch`, `wrap`, `shim`, `polyfill`, `override` — to find self-described patches
5. **Module system hooks**: `require.cache`, `require.extensions`, `Module._*`, `syncBuiltinESMExports`, `registerHooks` — to find module system tampering
6. **Internal bindings**: `process.binding`, `process._linkedBinding`, `internalBinding`, `_http_`, `internal/` — to find internal Node.js access

All hits were traced from regex match to actual write/mutation to confirm or reject.
