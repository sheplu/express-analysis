# Monkeypatch Audit Report (Pass B)

**Library:** forwarded v0.2.0
**Commit:** b3097d832aea409b1a1934fd60ecba8129116edc
**Node.js baseline:** d44625a4b80c672215b469906ce583ce7eeeebaf
**Audit date:** 2026-11-01
**Auditor:** Pass B (independent)

---

## Verdict

**NO MONKEYPATCHING DETECTED.**

The `forwarded` library does not modify, extend, wrap, or otherwise patch any Node.js core module, built-in prototype, global object, or module loader mechanism. It is a pure computational utility with zero side effects on the Node.js runtime.

---

## Scope

### Production surface

The library ships a single production file:

- `$PACKAGE_ROOT/index.js` (91 lines)

This is confirmed by `package.json` `files`: `["LICENSE", "HISTORY.md", "README.md", "index.js"]`. No other JavaScript executes at install time or runtime.

### Non-production files examined

- `$PACKAGE_ROOT/scripts/version-history.js` -- dev-only build helper, not shipped
- `$PACKAGE_ROOT/package-lock.json` -- auto-generated lockfile, not executable

### Runtime dependencies

Zero. The library has no `dependencies` in `package.json` and makes no `require` or `import` calls in its production code.

---

## Analysis of index.js

The production file exports a single function `forwarded(req)` and contains two private helpers:

### `forwarded(req)` (exported)
- Validates that `req` is truthy (throws `TypeError` if not)
- Reads `req.headers['x-forwarded-for']` (read-only property access)
- Calls internal `parse()` on the header value
- Calls internal `getSocketAddr()` to get the socket address
- Returns a new array: `[socketAddr, ...proxyAddrs]`
- **No side effects.** Does not modify `req`, any prototype, or any global.

### `getSocketAddr(req)` (private)
- Reads `req.socket.remoteAddress` or falls back to `req.connection.remoteAddress`
- Pure read-only property access. Does not modify the request object.

### `parse(header)` (private)
- Manual character-by-character CSV parser for the X-Forwarded-For header
- Operates exclusively on the input string using `charCodeAt` and `substring`
- Returns a new array of trimmed address strings
- Pure function with no side effects.

### Key observations
- No `require` calls -- the module is entirely self-contained
- No access to `global`, `globalThis`, `process`, or `Buffer`
- No prototype access or manipulation
- No `Object.defineProperty`, `Object.assign`, `Reflect`, or `Proxy`
- No module loader hooks (`require.cache`, `Module._load`, etc.)
- No Node.js internal bindings (`process.binding`, `internalBinding`)
- The code uses only: object property reads, string methods, array operations, and a `switch` statement

---

## Search Evidence Summary

Six regex search groups were executed against the full source tree (excluding test, benchmark, dotfiles, and nested node_modules). Results:

| Group | Pattern category                        | Hits in production code | Hits elsewhere |
|-------|-----------------------------------------|------------------------|----------------|
| 1     | require / import / from                 | 0                      | 9 (scripts, README, lockfile) |
| 2     | Buffer / process / global / extends     | 0                      | 8 (scripts, lockfile) |
| 3     | prototype / defineProperty / Reflect    | 0                      | 24 (lockfile only) |
| 4     | monkeypatch / patch / wrap / shim       | 0                      | 18 (lockfile only) |
| 5     | require.cache / Module loader hooks     | 0                      | 0 |
| 6     | process.binding / internalBinding       | 0                      | 0 |

Zero hits in the production file `index.js` across all search groups.

Two candidates were identified from the dev-only script `scripts/version-history.js`; both were rejected as normal Node.js built-in usage in a non-shipped file. Full analysis is in `candidates.md`.

---

## Candidate Summary

| ID    | File | Pattern | Status | Reason |
|-------|------|---------|--------|--------|
| C-001 | `$PACKAGE_ROOT/scripts/version-history.js` | `require('fs')`, `require('path')` | REJECTED | Dev-only script, not shipped; normal built-in usage |
| C-002 | `$PACKAGE_ROOT/scripts/version-history.js` | `process.env`, `process.exit` | REJECTED | Dev-only script, not shipped; read-only process access |

---

## Risk Assessment

**Runtime risk: NONE**

- The library performs no modifications to Node.js internals at any level.
- It has no runtime dependencies that could introduce indirect patching.
- The production code is a pure function that reads properties from its input and returns a new array.
- There is no install script (`preinstall`, `postinstall`) that could execute side effects.

**Confidence: HIGH**

The entire production surface is a single 91-line file with no imports, no global access, and no side effects beyond returning a value. The analysis is exhaustive.
