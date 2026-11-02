# Monkeypatch Audit -- Pass A Report

- **Package**: forwarded v0.2.0
- **Commit**: b3097d832aea409b1a1934fd60ecba8129116edc
- **Node.js baseline**: d44625a4b80c672215b469906ce583ce7eeeebaf
- **Source**: `$PACKAGE_ROOT/index.js` (91 lines, single production file)
- **Date**: 2026-11-01
- **Auditor**: Pass A (automated, double-blind)

---

## 1. Verdict

**NO MONKEYPATCHING DETECTED.**

The library `forwarded` v0.2.0 does not monkeypatch, shim, polyfill, wrap, or otherwise modify any Node.js core module, global, prototype, or internal binding.

---

## 2. Scope of Analysis

### Production surface

The library consists of a single file, `$PACKAGE_ROOT/index.js` (91 lines). It has zero runtime dependencies (no `require()` or `import` calls). The `package.json` lists no `dependencies` -- only `devDependencies`.

### What the library does

The library exports a single function `forwarded(req)` that:

1. Reads `req.headers['x-forwarded-for']` (a plain property access on the passed-in object)
2. Parses the header value by iterating character-by-character (using only `String.prototype.charCodeAt`, `String.prototype.substring`, and `Array.prototype.push` -- all standard, non-mutating calls)
3. Reads `req.socket.remoteAddress` or `req.connection.remoteAddress` (a plain property access)
4. Returns an array combining the socket address with parsed proxy addresses

The library is purely functional: it reads properties from its input, processes strings, and returns a new array. It does not write to any object it does not own.

### Files excluded from production analysis

- `$PACKAGE_ROOT/README.md` -- documentation
- `$PACKAGE_ROOT/scripts/version-history.js` -- dev build script
- `$PACKAGE_ROOT/package-lock.json` -- lockfile metadata
- `$PACKAGE_ROOT/test/` -- test suite (excluded by search globs)
- `$PACKAGE_ROOT/benchmark/` -- benchmarks (excluded by search globs)

---

## 3. Search Evidence Summary

Six regex search groups were executed against the full source directory (excluding test, benchmark, dotfiles, and nested node_modules). Full output is documented in `searches.md`.

| # | Search pattern | Hits in index.js | Hits elsewhere | Relevant? |
|---|---------------|-----------------|----------------|-----------|
| 1 | require/import/from | 0 | 9 (README, scripts, lockfile) | No |
| 2 | Buffer/process/global/extends/inherits | 0 | 8 (scripts, lockfile) | No |
| 3 | prototype/defineProperty/Reflect/Object.assign | 0 | 24 (lockfile only) | No |
| 4 | monkeypatch/patch/wrap/shim/polyfill/override | 0 | 16 (lockfile only) | No |
| 5 | require.cache/extensions/Module._ | 0 | 0 | N/A |
| 6 | process.binding/internalBinding/internal modules | 0 | 0 | N/A |

Zero hits occurred in the production file across all six search groups.

---

## 4. Candidate Ledger

No candidates were identified. The ledger is empty. See `candidates.md` for the formal empty ledger.

---

## 5. Node.js Core Interaction Analysis

The library interacts with Node.js only through the `req` object passed in by the caller:

- **`req.headers['x-forwarded-for']`** -- Read-only access to the request headers object. This is a standard property read on the `http.IncomingMessage` instance. No mutation.
- **`req.socket.remoteAddress`** -- Read-only access to the socket's remote address. Standard property read on `net.Socket`. No mutation.
- **`req.connection.remoteAddress`** -- Fallback read-only access (legacy path). Standard property read. No mutation.

The library does not:
- Import or require any Node.js core module
- Modify any prototype (`Object.prototype`, `Array.prototype`, `String.prototype`, etc.)
- Override or wrap any function on `http`, `net`, `stream`, or any other core module
- Access `process.binding()`, `internalBinding()`, or internal Node.js modules
- Manipulate the module loader (`require.cache`, `require.extensions`, `Module._*`)
- Define or redefine properties on any object it does not create
- Use `globalThis`, `global`, `Buffer`, or `process`

---

## 6. Risk Assessment

| Risk category | Level | Notes |
|--------------|-------|-------|
| Monkeypatching of Node.js core | None | No core module interaction |
| Prototype pollution | None | No prototype access |
| Global mutation | None | No global writes |
| Module system hooks | None | No loader manipulation |
| Internal binding access | None | No private API usage |
| Overall risk | None | Library is purely functional |

---

## 7. Conclusion

`forwarded` v0.2.0 is a minimal, self-contained string-parsing library with zero runtime dependencies and zero interaction with Node.js internals. It reads properties from a caller-supplied request object and returns a new array. It does not modify, extend, wrap, shim, polyfill, or monkeypatch any Node.js core functionality.

**Pass A determination: CLEAN -- no monkeypatching of any kind.**
