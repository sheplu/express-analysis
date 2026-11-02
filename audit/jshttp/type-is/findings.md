# type-is v3.0.0 — Detailed Findings

## Candidate Analysis

### C-001: ESM import from "content-type" (DISMISSED)

**Location:** `$PACKAGE_ROOT/src/index.ts:8`
**Pattern:** `import { parse, isTypeValid, isTokenValid, ContentType } from "content-type"`
**Search group:** Imports / requires / node: builtins

**Analysis:** Standard ESM named import from a declared userland dependency. The `content-type` package is listed in `package.json` `dependencies`. No Node.js core module is imported anywhere in the codebase.

**Verdict:** DISMISSED — No core module interaction.

---

### C-002: TypeScript `extends` keyword (DISMISSED)

**Location:** `$PACKAGE_ROOT/src/index.ts:137`
**Pattern:** `export interface TypeIsOptions extends NormalizeOptions`

**Search group:** Globals (Buffer, process, globalThis, global, extends, inherits)

**Analysis:** This is TypeScript's interface inheritance syntax. It is erased entirely at compile time and produces no runtime JavaScript. The `extends` keyword here does not correspond to class inheritance or prototype chain manipulation.

**Verdict:** DISMISSED — Compile-time construct with no runtime effect.

---

### C-003: `__proto__` in comment text (DISMISSED)

**Location:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js:45`
**Pattern:** `* Null object perf optimization. Faster than \`Object.create(null)\` and \`{ __proto__: null }\`.`

**Search group:** Prototype / property manipulation

**Analysis:** The string `__proto__` appears only inside a JSDoc comment explaining the optimization rationale. It is not executable code.

**Verdict:** DISMISSED — Comment text only, no runtime effect.

---

### C-004: Local `.prototype` assignment in content-type (DISMISSED)

**Location:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js:49`
**Pattern:** `C.prototype = Object.create(null);`

**Search group:** Prototype / property manipulation

**Analysis:** This is inside a self-executing IIFE:

```js
const NullObject = /* @__PURE__ */ (() => {
    const C = function () { };
    C.prototype = Object.create(null);
    return C;
})();
```

A locally-defined constructor `C` has its prototype set to a null-prototype object. Instances created with `new NullObject()` are used as fast property maps for parsed Content-Type parameters. This pattern is a well-known performance optimization.

**Critical distinction:** The prototype being set belongs to a locally-scoped, library-private constructor. No Node.js built-in constructor prototype (`Object.prototype`, `Array.prototype`, `IncomingMessage.prototype`, etc.) is modified.

**Verdict:** DISMISSED — Local constructor; no core prototype touched.

---

## Search Coverage

| Search Group | Hits | Candidates |
|-------------|------|------------|
| 1. Imports/requires/node: | 1 | C-001 |
| 2. Globals (Buffer, process, etc.) | 1 | C-002 |
| 3. Prototype/property manipulation | 2 | C-003, C-004 |
| 4. Patch/wrap/shim/polyfill keywords | 0 | — |
| 5. Module loader hooks | 0 | — |
| 6. Internal bindings | 0 | — |
| **Total** | **4** | **4 (all dismissed)** |
