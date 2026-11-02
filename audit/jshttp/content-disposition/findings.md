# Detailed Findings

## Library
- **Package:** content-disposition
- **Version:** 3.0.0
- **Commit:** 1a542fe19e982569c5fb0162b3a1997ad02da1fe

## Candidate Ledger

### C-001: Local `.prototype` assignment

- **File:** `$PACKAGE_ROOT/src/index.ts`, line 23
- **Search group:** 3 (prototype/property manipulation)
- **Matched pattern:** `.prototype`
- **Code context:**
  ```typescript
  const NullObject = /* @__PURE__ */ (() => {
    const C = function () {};
    C.prototype = Object.create(null);
    return C;
  })() as unknown as { new (): any };
  ```
- **Usage:** Line 88: `const parameters: Record<string, string> = new NullObject();`
- **Analysis:**
  - `C` is created locally inside an IIFE
  - `C` is never exported, never attached to any global or existing object
  - `Object.create(null)` creates a fresh object with no prototype chain
  - The assignment `C.prototype = ...` sets up the library's own internal constructor
  - Instances created via `new NullObject()` are used as clean dictionaries for parsed parameters
  - This is a well-known performance optimization pattern, not a modification of any existing prototype
- **Classification:** Internal optimization
- **Monkeypatch:** NO

## Additional Observations

### No Imports
The production source contains zero import/require statements. The library is entirely self-contained, using only ECMAScript built-in functions:
- `String.prototype.charCodeAt()`, `String.prototype.indexOf()`, `String.prototype.slice()`, `String.prototype.replace()`, `String.prototype.toLowerCase()`
- `String.fromCharCode()`
- `Object.create()`, `Object.keys()`
- `encodeURIComponent()`, `decodeURIComponent()`
- `Number.parseInt()`
- RegExp literals

### No Node.js API Usage
The production code does not reference any Node.js-specific API. It could run in any JavaScript environment (browser, Deno, Bun, etc.).

### No Runtime Dependencies
`package.json` lists only `devDependencies`. No `node_modules` are needed at runtime. No transitive dependency analysis required.

### Non-Shipped Files
- `$PACKAGE_ROOT/demo/server.js` uses `node:fs`, `node:http`, `Buffer`, and `process` in standard read-only fashion, but is not shipped (excluded by `"files": ["dist/"]`).

## Confirmed Patches
None.
