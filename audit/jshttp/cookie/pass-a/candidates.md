# Pass A — Candidate Ledger

## C-001 — Line 91 (Group 2 hit: `global`)

- **Exact text:** `* The default function is the global \`decodeURIComponent\`, wrapped in a \`try..catch\`. If an error`
- **Classification:** JSDoc comment inside the `ParseOptions` interface. Documentation prose only; not executable code.
- **Verdict:** **DISMISSED** — documentation comment; no code execution, no runtime effect.

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
- **Classification:** Creates a brand-new, library-private constructor function `C` and assigns a null-prototype object as its `.prototype`. Does NOT touch `Object.prototype`, `Function.prototype`, or any other built-in prototype. Used solely at line 113 to produce dictionary objects free of inherited properties. Standard pattern for safe key-value maps.
- **Verdict:** **DISMISSED** — creates a new isolated constructor; does not read, write, or mutate any Node.js core or built-in prototype.
