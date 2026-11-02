# Audit Report: statuses

**Library:** statuses v2.0.2
**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5
**Date:** 2026-11-01
**Method:** Double-blind audit (Pass A + Pass B), reconciled

## Verdict

**NO MONKEYPATCHING DETECTED**

The `statuses` library does not patch, monkeypatch, or modify any Node.js core
module, prototype, global, or internal binding. It is a pure data-lookup utility.

## Scope

| Property             | Value                                    |
|----------------------|------------------------------------------|
| Production files     | 2 (`index.js`, `codes.json`)             |
| Total production LOC | 212 (147 JS + 65 JSON)                   |
| Runtime dependencies | 0                                        |
| Node.js core imports | 0                                        |
| Entrypoint           | `module.exports = status`                |

## Confirmed Patches (F-series)

None.

## Candidate Ledger

3 regex hits were found across all 6 search groups. All were traced to benign,
non-mutating patterns and dismissed by both independent passes:

| ID    | File          | Line | Pattern                                   | Disposition          |
|-------|---------------|------|-------------------------------------------|----------------------|
| C-001 | `$PACKAGE_ROOT/index.js` | 15   | `require('./codes.json')`                 | Local data file load |
| C-002 | `$PACKAGE_ROOT/index.js` | 96   | `Object.prototype.hasOwnProperty.call()`  | Read-only method call |
| C-003 | `$PACKAGE_ROOT/index.js` | 109  | `Object.prototype.hasOwnProperty.call()`  | Read-only method call |

## Functional Summary

The library:
1. Loads a static JSON map of HTTP status codes to messages from `codes.json`
2. Creates a reverse map (message-to-code) from the same data
3. Creates an array of all status codes
4. Exports hardcoded boolean lookup tables for redirect, empty-body, and retry codes
5. Provides a `status()` function that resolves codes by number or message string

The library does NOT:
- Import any Node.js core module (http, https, net, etc.)
- Access `process`, `Buffer`, `global`, or `globalThis`
- Modify any prototype (`Object.prototype`, etc.)
- Use `defineProperty`, `setPrototypeOf`, `Object.assign`, or `Reflect` APIs
- Use `require.cache`, `require.extensions`, or `Module._*` hooks
- Access `process.binding`, `internalBinding`, or internal Node.js modules
- Contain any polyfill, shim, wrap, or override logic

## Sources and Verification

- `$PACKAGE_ROOT/package.json`: version 2.0.2, zero `dependencies`, `files` field confirms shipped set
- `$PACKAGE_ROOT/index.js`: 147-line sole runtime JS module, read in full
- `$PACKAGE_ROOT/codes.json`: 65-line pure JSON data file, read in full
- No `node_modules` directory present (zero transitive dependency risk)

## Coverage and Limitations

- 100% of production source code read and analyzed
- All 6 regex search groups executed against production files
- Both independent passes produced identical candidate lists and verdicts
- `codes.json` is inert JSON data with no executable content
- Non-production files (scripts/, src/, tests, benchmarks) excluded per protocol
