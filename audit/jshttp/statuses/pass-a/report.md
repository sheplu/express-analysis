# Pass A — Audit Report

**Library:** statuses v2.0.2
**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5
**Auditor:** Pass A (independent)
**Date:** 2026-11-01

## Verdict

**NO MONKEYPATCHING DETECTED**

The `statuses` library does not patch, monkeypatch, or modify any Node.js core module, prototype, global, or internal binding.

## Scope

- **Production files:** 2 files
  - `$PACKAGE_ROOT/index.js` (147 lines) — sole runtime JS module
  - `$PACKAGE_ROOT/codes.json` (65 lines) — pure data, no executable code
- **Runtime dependencies:** Zero (confirmed: no `node_modules` directory, no `dependencies` field in `package.json`)
- **Entrypoint:** `module.exports = status` (the `status` function)

## Analysis

### What the library does

`statuses` is a pure data-lookup utility. It:

1. Loads a static JSON map of HTTP status codes to messages (`codes.json`)
2. Creates a reverse map (message-to-code) from the same data
3. Creates an array of all status codes
4. Exports hardcoded lookup tables for redirect, empty-body, and retry status codes
5. Provides a `status()` function that looks up codes by number or message string

### What the library does NOT do

- Does not `require()` any Node.js core module (http, https, net, etc.)
- Does not access `process`, `Buffer`, `global`, or `globalThis`
- Does not modify any prototype (uses `Object.prototype.hasOwnProperty.call()` read-only)
- Does not use `defineProperty`, `setPrototypeOf`, `Object.assign`, or `Reflect` APIs
- Does not use `require.cache`, `require.extensions`, or `Module._*` hooks
- Does not access `process.binding`, `internalBinding`, or internal Node.js modules
- Does not contain any polyfill, shim, wrap, or override logic
- Has zero runtime dependencies (no transitive patch risk)

### Candidate Summary

3 regex hits were found in production code, all traced to benign patterns:

| ID    | Location       | Pattern                              | Verdict     |
|-------|---------------|--------------------------------------|-------------|
| C-001 | index.js:15   | `require('./codes.json')`            | Local data load |
| C-002 | index.js:96   | `Object.prototype.hasOwnProperty.call()` | Read-only check |
| C-003 | index.js:109  | `Object.prototype.hasOwnProperty.call()` | Read-only check |

## Confirmed Patches

None.

## Coverage and Limitations

- All production files read in full (100% coverage)
- All 6 search groups executed against production files
- Zero runtime dependencies eliminates transitive patch risk
- `codes.json` is pure data (JSON) with no executable content
- `package-lock.json` and other non-production files excluded per protocol
