# Pass A - Candidate Ledger

## Library
- **Package:** content-disposition v3.0.0
- **Commit:** 1a542fe19e982569c5fb0162b3a1997ad02da1fe

---

## Candidates

### C-001: `.prototype` assignment on local constructor (line 23)

- **File:** `$PACKAGE_ROOT/src/index.ts`
- **Line:** 23
- **Code:**
  ```typescript
  const NullObject = /* @__PURE__ */ (() => {
    const C = function () {};
    C.prototype = Object.create(null);
    return C;
  })() as unknown as { new (): any };
  ```
- **Category:** Prototype manipulation (Search Group 3)
- **Trace:** `C` is a locally-scoped anonymous constructor created inside an IIFE. The `.prototype` is set to `Object.create(null)` to produce objects that lack `Object.prototype` in their chain. `C` is never exported or attached to any global. The resulting `NullObject` constructor is used only at line 88 to create clean parameter dictionaries.
- **Target of write:** Local variable `C.prototype` -- NOT any Node.js built-in prototype
- **Verdict:** NOT a monkeypatch

---

## Summary

| ID    | Location          | Pattern             | Monkeypatch? |
|-------|-------------------|---------------------|--------------|
| C-001 | src/index.ts:23   | .prototype assign   | NO           |

**Total candidates:** 1
**Confirmed monkeypatches:** 0
