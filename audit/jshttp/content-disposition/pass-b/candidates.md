# Pass B - Candidate Ledger

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
- **Category:** Prototype manipulation
- **Analysis:** `C` is a locally-scoped anonymous constructor function created inside an IIFE. Its `.prototype` is set to `Object.create(null)` -- a null-prototype object. This is a standard pattern for creating dictionary-like objects without inherited `Object.prototype` methods. The assignment is to the library's own private constructor, not to any Node.js built-in prototype (`Object.prototype`, `Buffer.prototype`, `http.IncomingMessage.prototype`, etc.).
- **Verdict:** NOT a monkeypatch. Local constructor setup only.

---

## Non-production observations (not candidates)

The demo/server.js file uses `Buffer`, `process`, `http`, and `fs` in standard read-only ways (reading env vars, computing byte lengths, creating buffers, starting HTTP server). This file is not shipped (not in `"files"` field) and performs no patching.

---

## Summary

| ID    | Location              | Pattern             | Monkeypatch? |
|-------|-----------------------|---------------------|--------------|
| C-001 | src/index.ts:23       | .prototype assign   | NO           |

**Total candidates:** 1
**Confirmed monkeypatches:** 0
