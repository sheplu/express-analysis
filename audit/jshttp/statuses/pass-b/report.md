# Pass B — Audit Report

**Library:** statuses v2.0.2
**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5
**Auditor:** Pass B (independent)
**Date:** 2026-11-01

## Verdict

**NO MONKEYPATCHING DETECTED**

The statuses library does not patch, monkeypatch, or modify any Node.js core behavior.

## Scope

- **Production files:** 2 files
  - `$PACKAGE_ROOT/index.js` — 147 lines, sole runtime JavaScript module
  - `$PACKAGE_ROOT/codes.json` — 65 lines, pure JSON data (HTTP status code to message map)
- **Runtime dependencies:** Zero. No `dependencies` field in package.json. No `node_modules` directory present.
- **Export:** `module.exports = status` (a lookup function with attached static properties)

## Functional Analysis

The library is a pure data utility that:
1. Loads HTTP status code/message mappings from a local JSON file
2. Creates forward (code-to-message) and reverse (message-to-code) lookup maps
3. Maintains static boolean maps for redirect/empty/retry status categories
4. Exports a function that accepts a number or string and returns the corresponding status info

It does NOT:
- Import any Node.js core module
- Access any Node.js global (`process`, `Buffer`, `global`, `globalThis`)
- Modify any prototype or use `defineProperty`/`setPrototypeOf`
- Hook into the module system (`require.cache`, `Module._load`, etc.)
- Access Node.js internals (`process.binding`, `internalBinding`)
- Contain any shim, polyfill, wrap, or override logic

## Candidate Analysis

3 regex hits were investigated. All are benign:

| ID    | Hit                                       | Classification          |
|-------|------------------------------------------|------------------------|
| C-001 | `require('./codes.json')`                | Local data file load   |
| C-002 | `Object.prototype.hasOwnProperty.call()` | Read-only method call  |
| C-003 | `Object.prototype.hasOwnProperty.call()` | Read-only method call  |

## Confirmed Patches

None.

## Coverage

- 100% of production source read and analyzed
- All 6 regex search groups executed directly against production files
- Zero runtime dependencies verified — no transitive risk
- codes.json confirmed as inert JSON data
