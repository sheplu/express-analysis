# Findings: content-type v3.1.1

No confirmed patches of Node.js core were found.

## Candidate summary

Two regex hits were identified during the audit. Both were conclusively rejected as normal, non-patching API usage.

| ID | File | Line(s) | Pattern matched | Status | Explanation |
|----|------|---------|-----------------|--------|-------------|
| C-001 | `$PACKAGE_ROOT/src/index.ts` | 51 | `__proto__` | REJECTED | Appears in a code comment: `Faster than Object.create(null) and { __proto__: null }`. Not executable code. |
| C-002 | `$PACKAGE_ROOT/src/index.ts` | 53-57 | `.prototype`, `Object.create` | REJECTED | `C.prototype = Object.create(null)` inside a locally-scoped IIFE. Creates a private `NullObject` constructor for dictionary objects. Only the local function's prototype is set; no Node.js built-in or shared prototype is modified. |

## Detailed analysis of rejected candidates

### C-001: Comment mentioning `__proto__`

```typescript
// Line 51:
/**
 * Null object perf optimization. Faster than `Object.create(null)` and `{ __proto__: null }`.
 */
```

This is a documentation comment explaining the performance rationale for the `NullObject` pattern. The string `__proto__` appears only as text in the comment. No code is executed.

### C-002: NullObject constructor pattern

```typescript
// Lines 53-57:
const NullObject = /* @__PURE__ */ (() => {
  const C = function () {};
  C.prototype = Object.create(null);
  return C;
})() as unknown as { new (): any };
```

This IIFE:
1. Creates a fresh local function `C` (not exported, not shared)
2. Sets `C.prototype` to a null-prototype object
3. Returns `C` as the `NullObject` constructor

Objects created with `new NullObject()` have no `Object.prototype` in their chain. This is used internally for the `parameters` property of parsed content types. The pattern is a well-known performance optimization that avoids:
- Prototype pollution risks
- Unnecessary prototype chain lookups
- The overhead of `Object.create(null)` on every call

**Why this is NOT monkeypatching:** The assignment targets a freshly created local function's `.prototype` property. No existing Node.js built-in constructor, global object, or shared prototype is read, modified, or replaced.
