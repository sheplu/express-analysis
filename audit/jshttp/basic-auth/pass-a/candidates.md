# basic-auth v3.0.0 — Pass A — Candidate Ledger

Package: `basic-auth` v3.0.0
Commit: `301fe415bd5cf342f2c87ac37906c199a8f5800a`
Date: 2026-11-01

---

## Candidate Summary

| ID    | File                            | Line(s) | Pattern        | Disposition   |
|-------|---------------------------------|---------|----------------|---------------|
| C-001 | `$PACKAGE_ROOT/src/index.ts`    | 9       | local import   | **Dismissed** |
| C-002 | `$PACKAGE_ROOT/src/base64.ts`   | 2       | `Buffer` check | **Dismissed** |
| C-003 | `$PACKAGE_ROOT/src/base64.ts`   | 4       | `Buffer.from`  | **Dismissed** |
| C-004 | `$PACKAGE_ROOT/src/base64.ts`   | 5       | `Buffer.from`  | **Dismissed** |

**Confirmed monkeypatches: 0**

---

## Detailed Analysis

### C-001 — Local ESM import

- **File:** `$PACKAGE_ROOT/src/index.ts:9`
- **Code:** `import { base64 } from './base64.js';`
- **Search group:** 1 (imports)
- **Disposition:** **Dismissed** — relative import of a sibling module within the package. No Node.js core module is imported. No `node:` specifier. Pure intra-package wiring.

---

### C-002 — Buffer existence check

- **File:** `$PACKAGE_ROOT/src/base64.ts:2`
- **Code:** `if (typeof Buffer !== 'undefined') {`
- **Search group:** 2 (globals)
- **Disposition:** **Dismissed** — read-only `typeof` check against the global `Buffer`. This is a feature-detection guard, not a write or mutation. It does not modify `Buffer`, `globalThis`, or any prototype. The branch selects between a Buffer-based path (Node.js) and a `Uint8Array.fromBase64` / `TextEncoder` path (non-Node environments).

---

### C-003 — Buffer.from (encode)

- **File:** `$PACKAGE_ROOT/src/base64.ts:4`
- **Code:** `Buffer.from(str, 'utf-8').toString('base64')`
- **Search group:** 2 (globals)
- **Disposition:** **Dismissed** — standard read-only usage of the Node.js `Buffer` API. `Buffer.from()` creates a new Buffer instance from a string; `.toString('base64')` serializes it. No mutation of `Buffer`, `Buffer.prototype`, or any global. This is normal API consumption.

---

### C-004 — Buffer.from (decode)

- **File:** `$PACKAGE_ROOT/src/base64.ts:5`
- **Code:** `Buffer.from(str, 'base64').toString('utf-8')`
- **Search group:** 2 (globals)
- **Disposition:** **Dismissed** — same analysis as C-003. Standard read-only `Buffer.from()` call to decode a base64 string. No mutation of any Node.js core object.

---

## Notes

- Search groups 3 through 6 returned zero hits in production source files. No prototype manipulation, no `defineProperty`, no `Object.assign`, no monkeypatch/shim/polyfill keywords, no module-loader hooks, and no internal/private Node.js API usage were found.
- The `base64.ts` module uses an IIFE that branches at load time: if `Buffer` is available (Node.js), it uses `Buffer.from()`; otherwise it falls back to `TextEncoder`/`TextDecoder` with `Uint8Array.fromBase64()`. This is a clean runtime-detection pattern, not a polyfill or shim -- it does not inject anything into the environment.
- The package has zero runtime dependencies, confirming the audit scope is limited to these two source files.
