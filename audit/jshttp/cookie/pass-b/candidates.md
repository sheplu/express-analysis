# Pass B — Candidate Ledger

## C-001 — Line 91 (Group 2 hit: `global`)

- **Exact text:** `* The default function is the global \`decodeURIComponent\`, wrapped in a \`try..catch\`. If an error`
- **Classification:** JSDoc comment describing that the library calls the global `decodeURIComponent`. The word "global" appears only in prose. No code writes to or modifies any global.
- **Verdict:** **DISMISSED** — documentation comment only; no runtime effect.

## C-002 — Line 78 (Group 3 hit: `.prototype`, `Object.create`)

- **Exact text:** `C.prototype = Object.create(null);`
- **Context (lines 76-80):**
  ```typescript
  const NullObject = /* @__PURE__ */ (() => {
    const C = function () {};
    C.prototype = Object.create(null);
    return C;
  })() as unknown as { new (): any };
  ```
- **Classification:** Inside the `NullObject` IIFE. Creates a brand-new, library-local constructor function `C`, then sets `C.prototype` to a fresh null-prototype object. Does NOT touch any Node.js built-in prototype. `C` is a new, anonymous, module-scoped function. The assignment replaces the prototype of this newly created local function, not of any existing built-in.
- **Verdict:** **DISMISSED** — modifies only a locally created constructor's prototype; no built-in is touched.
