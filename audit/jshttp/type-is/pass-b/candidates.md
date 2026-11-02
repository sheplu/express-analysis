# Pass B — Candidate Ledger

| ID    | File                                                      | Line | Pattern Hit                                    | Status    | Reason                                                                                                    |
|-------|-----------------------------------------------------------|------|------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------|
| C-001 | `$PACKAGE_ROOT/src/index.ts`                              | 8    | `from "content-type"`                          | DISMISSED | Standard ESM import of declared dependency. No Node.js built-in module.                                   |
| C-002 | `$PACKAGE_ROOT/src/index.ts`                              | 137  | `extends NormalizeOptions`                     | DISMISSED | TypeScript `extends` keyword for interface inheritance. Compiled away at build time; no runtime effect.    |
| C-003 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js`   | 45   | `__proto__` in comment text                    | DISMISSED | Appears in a JSDoc comment only. Not executable code.                                                     |
| C-004 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js`   | 49   | `C.prototype = Object.create(null)`            | DISMISSED | Local private constructor's prototype set inside an IIFE. Creates a null-prototype object factory. Does not modify any Node.js core or built-in prototype. |

**Total candidates: 4**
**Confirmed patches: 0**
**All dismissed.**
