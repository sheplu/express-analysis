# Detailed Findings: `cookie` v2.0.1

## Confirmed Findings

None. No patches or monkeypatches of Node.js core were found.

---

## Dismissed Candidates

### C-001 — Line 91: `global` keyword in JSDoc comment

**Source (line 91):**
```
* The default function is the global `decodeURIComponent`, wrapped in a `try..catch`. If an error
```

**Analysis:** This is a JSDoc comment inside the `ParseOptions` interface describing the default decode function. The word "global" appears only in documentation prose. No executable code is involved. The library does call `decodeURIComponent` (line 520) and `encodeURIComponent` (line 531), but only as standard read-only usage — it never reassigns or wraps these globals.

**Verdict:** DISMISSED — documentation comment; no runtime effect.

---

### C-002 — Line 78: `C.prototype = Object.create(null)`

**Source (lines 76-80):**
```typescript
const NullObject = /* @__PURE__ */ (() => {
  const C = function () {};
  C.prototype = Object.create(null);
  return C;
})() as unknown as { new (): any };
```

**Analysis:** This is an IIFE that:
1. Creates a new local constructor function `C`
2. Replaces `C`'s prototype with a null-prototype object (no inherited properties)
3. Returns `C` as the `NullObject` constructor

Used at line 113: `const obj: Cookies = new NullObject();` to create dictionary objects immune to prototype pollution.

Key points:
- `C` is a brand-new, module-scoped function, not a Node.js built-in
- `Object.create(null)` creates a fresh object; it does not modify `Object.prototype`
- The `/* @__PURE__ */` annotation marks it as side-effect-free for tree-shaking
- This is a well-known defensive security pattern, not a patch

**Verdict:** DISMISSED — creates a new isolated constructor; no built-in prototype is touched.

---

## Negative Findings (Searches With No Hits)

The following search categories returned zero results, confirming the library does not engage in these patterns:

1. **Imports/Requires** — No `require()`, `import`, `from`, or `node:` protocol usage
2. **Patching keywords** — No occurrences of "monkeypatch", "patch", "wrap", "shim", "polyfill", or "override"
3. **Module system hooks** — No `require.cache`, `require.extensions`, `Module._load`, `Module._resolveFilename`, `syncBuiltinESMExports`, or `registerHooks`
4. **Node.js internals** — No `process.binding`, `_linkedBinding`, `internalBinding`, `_http_`, or `internal/` references
5. **Buffer/process/globalThis** — No usage of `Buffer`, `process`, or `globalThis` in code (only "global" appeared in a comment)
6. **Advanced property manipulation** — No `__proto__`, `setPrototypeOf`, `defineProperty`, `defineProperties`, `Reflect.set`, `Reflect.defineProperty`, `Reflect.setPrototypeOf`, or `Object.assign` on any target
