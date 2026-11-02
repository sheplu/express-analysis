# basic-auth v3.0.0 — Pass B Audit Report

**Package:** basic-auth
**Version:** 3.0.0
**Commit:** `301fe415bd5cf342f2c87ac37906c199a8f5800a`
**Auditor pass:** B (independent)
**Date:** 2026-11-01

---

## Verdict

**CLEAN — No patching or monkeypatching of Node.js core detected.**

---

## Scope

The audit covers the two production source files that ship with the package:

- `$PACKAGE_ROOT/src/index.ts` — main module exporting `parse()` and `format()`
- `$PACKAGE_ROOT/src/base64.ts` — base64 encode/decode helper

The package has no runtime dependencies. Test and benchmark files (`*.spec.ts`, `*.bench.ts`) were excluded from the analysis.

Six regex search groups were executed, covering:

1. Imports, requires, and `node:` protocol usage
2. References to `Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits`
3. Prototype manipulation (`__proto__`, `setPrototypeOf`, `defineProperty`, `Reflect`, `Object.assign`)
4. Patching-related keywords (`monkeypatch`, `patch`, `wrap`, `shim`, `polyfill`, `override`)
5. Module loader hooks (`require.cache`, `require.extensions`, `Module._*`, `syncBuiltinESMExports`, `registerHooks`)
6. Internal Node.js bindings (`process.binding`, `internalBinding`, `_http_*`, `internal/`)

## Findings

Four candidates were identified; all four were dismissed as normal, non-mutating usage:

| ID | File | Pattern | Disposition |
|----|------|---------|-------------|
| C-001 | `src/index.ts:9` | `import { base64 } from './base64.js'` | Local relative ESM import |
| C-002 | `src/base64.ts:2` | `typeof Buffer !== 'undefined'` | Read-only feature detection |
| C-003 | `src/base64.ts:4` | `Buffer.from(str, 'utf-8').toString('base64')` | Standard Buffer API (read-only) |
| C-004 | `src/base64.ts:5` | `Buffer.from(str, 'base64').toString('utf-8')` | Standard Buffer API (read-only) |

Search groups 3 through 6 returned zero production-file hits, meaning there is no prototype manipulation, no patching keywords, no module loader hook usage, and no access to internal Node.js bindings.

## Analysis

The package's interaction with Node.js core is limited to:

1. **Feature detection** — A `typeof Buffer` check determines whether the runtime provides the `Buffer` global. This is a read-only check that does not modify any global or prototype.

2. **Standard API consumption** — `Buffer.from()` is called as a factory method to create new Buffer instances for base64 encoding and decoding. These are ordinary read-only API calls. No Buffer methods or prototypes are overridden, extended, or reassigned.

3. **Fallback path** — When `Buffer` is unavailable (e.g., in browser/edge runtimes), the code falls back to `TextEncoder`/`TextDecoder` and `Uint8Array.prototype.toBase64()` / `Uint8Array.fromBase64()`. These are also used in a standard, non-mutating manner.

The package does not:
- Import any Node.js core modules (no `node:*`, no `require('...')` of built-ins)
- Modify any prototype (`Buffer.prototype`, `String.prototype`, etc.)
- Use `Object.defineProperty`, `Reflect.set`, `Object.assign`, or `setPrototypeOf`
- Intercept or hook the module loader
- Access internal Node.js bindings
- Reassign or shadow any global

## Conclusion

**basic-auth v3.0.0 does not patch or monkeypatch Node.js core.** Its only interaction with Node.js built-ins is standard, read-only usage of `Buffer.from()` for base64 encoding and decoding.
