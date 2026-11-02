# basic-auth v3.0.0 — Pass B — Candidate Ledger

**Commit:** `301fe415bd5cf342f2c87ac37906c199a8f5800a`

Only production source files (`$PACKAGE_ROOT/src/index.ts`, `$PACKAGE_ROOT/src/base64.ts`) are evaluated. Test and benchmark files (`*.spec.ts`, `*.bench.ts`) are excluded.

---

## C-001 — Local ESM import

| Field       | Value |
|-------------|-------|
| **File**    | `$PACKAGE_ROOT/src/index.ts` |
| **Line**    | 9 |
| **Source**  | `import { base64 } from './base64.js';` |
| **Group**   | 1 (imports / requires) |
| **Category**| Local relative import |
| **Disposition** | **DISMISSED** — Normal local module import. No Node.js core module is imported. No `node:` protocol. No external dependency. This is a standard ESM import of the package's own `base64` helper. |

---

## C-002 — `typeof Buffer` existence check

| Field       | Value |
|-------------|-------|
| **File**    | `$PACKAGE_ROOT/src/base64.ts` |
| **Line**    | 2 |
| **Source**  | `if (typeof Buffer !== 'undefined') {` |
| **Group**   | 2 (Buffer / process / globalThis / global) |
| **Category**| Read-only global check |
| **Disposition** | **DISMISSED** — This is a read-only `typeof` check to detect the runtime environment. It does not write to, modify, or monkey-patch `Buffer` or any global. It is a standard feature-detection pattern used to choose between `Buffer`-based and `Uint8Array`-based base64 codecs. |

---

## C-003 — `Buffer.from()` for base64 encoding

| Field       | Value |
|-------------|-------|
| **File**    | `$PACKAGE_ROOT/src/base64.ts` |
| **Line**    | 4 |
| **Source**  | `encode: (str: string) => Buffer.from(str, 'utf-8').toString('base64'),` |
| **Group**   | 2 (Buffer / process / globalThis / global) |
| **Category**| Standard API usage (read-only) |
| **Disposition** | **DISMISSED** — Calls `Buffer.from()` to create a new Buffer instance from a string, then calls `.toString('base64')` on that instance. This is standard, read-only usage of the Node.js `Buffer` API. No prototype is modified. No global is mutated. The Buffer class itself is not altered in any way. |

---

## C-004 — `Buffer.from()` for base64 decoding

| Field       | Value |
|-------------|-------|
| **File**    | `$PACKAGE_ROOT/src/base64.ts` |
| **Line**    | 5 |
| **Source**  | `decode: (str: string) => Buffer.from(str, 'base64').toString('utf-8'),` |
| **Group**   | 2 (Buffer / process / globalThis / global) |
| **Category**| Standard API usage (read-only) |
| **Disposition** | **DISMISSED** — Same pattern as C-003 in reverse: creates a Buffer from a base64-encoded string and decodes it to UTF-8. Standard, read-only `Buffer` API usage. No mutation of any Node.js built-in. |

---

## Summary

| Candidate | File | Disposition | Reason |
|-----------|------|-------------|--------|
| C-001 | `src/index.ts:9` | DISMISSED | Local relative import |
| C-002 | `src/base64.ts:2` | DISMISSED | Read-only typeof feature detection |
| C-003 | `src/base64.ts:4` | DISMISSED | Standard Buffer.from() API usage |
| C-004 | `src/base64.ts:5` | DISMISSED | Standard Buffer.from() API usage |

**Confirmed monkeypatches: 0**
**Dismissed candidates: 4**
