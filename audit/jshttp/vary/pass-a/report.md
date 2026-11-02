# vary v1.1.2 — Pass A Audit Report

**Verdict: CLEAN**

**Package:** vary v1.1.2 (commit 1220b9c)
**Production file:** `$PACKAGE_ROOT/index.js` (150 lines)
**Runtime dependencies:** 0
**Date:** 2026-11-01
**Auditor:** Pass A (automated regex sweep + manual trace)

---

## Executive Summary

The `vary` library does **not** patch, monkeypatch, or modify Node.js core in any way. It is a pure utility library that manipulates HTTP `Vary` header strings and calls standard `res.getHeader()` / `res.setHeader()` on caller-provided response objects.

---

## Methodology

Six regex search groups were executed against all production files (sole file: `$PACKAGE_ROOT/index.js`), scanning for:

1. **Module imports** — `require()`, `import`, `from`, `node:` prefixes
2. **Global object access** — `Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits()`
3. **Prototype manipulation** — `.prototype`, `__proto__`, `setPrototypeOf`, `defineProperty`, `Reflect`, `Object.assign`
4. **Patching keywords** — monkeypatch, patch, wrap, shim, polyfill, override
5. **Module loader hooks** — `require.cache`, `require.extensions`, `Module._*`, `syncBuiltinESMExports`, `registerHooks`
6. **Internal bindings** — `process.binding`, `internalBinding`, `_http_*`, `internal/*`

Non-production files (README.md, package-lock.json, test/, benchmark/, dotfiles, node_modules/) were excluded per audit scope.

---

## Results

All six search groups returned **zero matches** against `$PACKAGE_ROOT/index.js`.

**Candidates generated:** 0
**Candidates confirmed as patching:** 0

---

## Architecture Analysis

The library exports two functions:

- **`vary(res, field)`** — Reads the current `Vary` header from `res` via `res.getHeader('Vary')`, computes the new value using `append()`, and writes it back via `res.setHeader('Vary', val)`. Both calls are standard HTTP response API usage on a caller-provided instance -- not monkeypatching.

- **`append(header, field)`** — Pure string manipulation. Takes a header string and field name(s), returns the merged header string. No side effects, no I/O, no global access.

- **`parse(header)`** — Internal helper. Pure string parser that splits a comma-separated header value into an array. No side effects.

The module:
- Has no `require()` calls (zero dependencies, does not import any Node.js core module)
- Does not access any Node.js globals (`process`, `Buffer`, `global`, `globalThis`)
- Does not modify any prototype or use `Object.defineProperty`
- Does not hook into the module loader
- Does not access internal bindings

---

## Verdict

**CLEAN** — `vary` v1.1.2 does not patch or monkeypatch Node.js core. It is a self-contained string utility with no runtime dependencies and no side effects beyond calling standard methods on caller-provided objects.
