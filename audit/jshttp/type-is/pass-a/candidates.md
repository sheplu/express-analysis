# Pass A — Candidate Ledger

| ID    | File                                              | Line | Pattern Hit                                    | Status    | Reason                                                                                                    |
|-------|---------------------------------------------------|------|------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------------------|
| C-001 | `$PACKAGE_ROOT/src/index.ts`                      | 8    | `from "content-type"`                          | DISMISSED | Standard ESM import of own declared dependency. No Node.js built-in module referenced.                    |
| C-002 | `$PACKAGE_ROOT/src/index.ts`                      | 137  | `extends NormalizeOptions`                     | DISMISSED | TypeScript interface inheritance (`extends` keyword). Compiled away; no runtime effect. Not a class extending a Node.js core class. |
| C-003 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` | 45   | `__proto__` in comment                        | DISMISSED | Appears only in a JSDoc comment string. Not executable code.                                              |
| C-004 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` | 49   | `C.prototype = Object.create(null)`           | DISMISSED | Sets prototype on a locally-defined private constructor `C` inside an IIFE. Creates a fast null-prototype object factory for internal use. Does NOT modify any Node.js core prototype. |

**Total candidates: 4**
**Confirmed patches: 0**
**All dismissed.**
