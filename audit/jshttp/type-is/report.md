# type-is v3.0.0 — Audit Report

## Verdict: CLEAN

**type-is does not patch or monkeypatch Node.js core.**

## Package Information

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Package        | type-is                                    |
| Version        | 3.0.0                                      |
| Commit         | `74fc347aab35175c5cca0bb8142e95e033e506cd`  |
| Module system  | ESM (`"type": "module"`)                   |
| Entrypoint     | `$PACKAGE_ROOT/dist/index.js` (built from `src/index.ts`) |
| Dependencies   | `content-type` ^3.1.1 (resolved 3.1.1)    |
| Engine         | Node.js >= 22                              |

## Production Files Audited

| File | Lines | Description |
|------|-------|-------------|
| `$PACKAGE_ROOT/src/index.ts` | 223 | Main library source (TypeScript) |
| `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` | 291 | Runtime dependency |

## Confirmed Patches

None.

## Candidate Ledger Summary

| ID    | File | Line | Pattern | Verdict |
|-------|------|------|---------|---------|
| C-001 | `$PACKAGE_ROOT/src/index.ts` | 8 | ESM import from `"content-type"` | DISMISSED — userland dep |
| C-002 | `$PACKAGE_ROOT/src/index.ts` | 137 | `extends` keyword | DISMISSED — TS interface syntax |
| C-003 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` | 45 | `__proto__` in comment | DISMISSED — comment text only |
| C-004 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` | 49 | `.prototype` assignment | DISMISSED — local constructor |

All 4 candidates dismissed. Zero confirmed patches.

## Key Observations

- **No Node.js core imports**: The library does not import any Node.js built-in module (`fs`, `http`, `stream`, `node:*`, etc.)
- **No global mutation**: No access to `process`, `Buffer`, `globalThis`, or `global`
- **No prototype pollution**: The only `.prototype` usage (C-004) is a local null-object factory inside content-type's IIFE — it creates `Object.create(null)` instances for fast parameter maps; no built-in prototype is touched
- **No module loader hooks**: No `require.cache`, `Module._*`, or ESM loader manipulation
- **No internal bindings**: No `process.binding`, `internalBinding`, or access to `_http_*` / `internal/*` modules
- **Pure computation library**: type-is only exports pure functions and a class for matching HTTP content-type strings against patterns

## Dependency Verification

`content-type` v3.1.1 was independently verified within this audit and previously audited as CLEAN. It has zero runtime dependencies of its own.
