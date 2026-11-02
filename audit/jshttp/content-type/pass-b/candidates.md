# Candidate ledger -- content-type Pass B

## Candidates

### C-001: `.prototype` / `__proto__` on line 51

- **Source:** `$PACKAGE_ROOT/src/index.ts`, line 51
- **Hit text:** `* Null object perf optimization. Faster than \`Object.create(null)\` and \`{ __proto__: null }\`.`
- **Analysis:** This is a JSDoc comment inside a block comment (lines 50-52). The string `__proto__` appears only as illustrative text explaining an alternative pattern. It is not executable code.
- **Status:** REJECTED -- comment text, not executable code

### C-002: `C.prototype = Object.create(null)` on line 55

- **Source:** `$PACKAGE_ROOT/src/index.ts`, line 55
- **Hit text:** `C.prototype = Object.create(null);`
- **Analysis:** This line appears inside a pure IIFE (lines 53-57) that creates a local `NullObject` constructor:
  ```typescript
  const NullObject = /* @__PURE__ */ (() => {
    const C = function () {};
    C.prototype = Object.create(null);
    return C;
  })() as unknown as { new (): any };
  ```
  `C` is a locally-scoped function created within the IIFE. Setting `C.prototype` to `Object.create(null)` makes instances of `C` have a null prototype chain (no inherited `toString`, `hasOwnProperty`, etc.). This is a well-known performance optimization for creating dictionary-like objects. The constructor is only used internally on lines 237 and 252 to create parameter objects returned by `parse()`.

  **Key facts ruling out monkeypatching:**
  - `C` is a brand-new, locally-created function -- not a Node.js built-in or any shared constructor
  - The mutation targets only `C.prototype`, a freshly created object -- not `Object.prototype`, `Array.prototype`, `IncomingMessage.prototype`, or any shared prototype
  - No external or global object is modified
  - The IIFE is marked `@__PURE__` (side-effect-free)
- **Status:** REJECTED -- local constructor setup, not a modification of any shared or Node.js prototype

## Summary

| ID    | Site                              | Core target     | Status   | Evidence/reason                                       |
|-------|-----------------------------------|-----------------|----------|-------------------------------------------------------|
| C-001 | Line 51, `__proto__` in comment   | None            | REJECTED | JSDoc comment text, not executable code               |
| C-002 | Line 55, `C.prototype = ...`      | None            | REJECTED | Local constructor IIFE, no shared/Node.js prototype   |

**No confirmed patches. No unresolved candidates.**
