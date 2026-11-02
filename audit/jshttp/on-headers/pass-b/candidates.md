# Pass B -- Candidate Ledger

**Library**: on-headers v1.1.0
**Commit**: 691b687710ece2eef62e6a6d1bdcf3a3fcab932a

## C-001: `res.writeHead` instance override

- **Source**: `$PACKAGE_ROOT/index.js:71`
- **Code**: `res.writeHead = createWriteHead(res.writeHead, listener)`
- **Type**: Direct property assignment on a response instance object
- **Verdict**: CONFIRMED PATCH

### Detailed Analysis

**What happens**: The `onHeaders(res, listener)` function (line 62) receives a response object (`res`) and replaces its `writeHead` property with a new function created by `createWriteHead()` (line 30). The original `writeHead` (whether from the prototype or a prior wrapper) is captured via closure as `prevWriteHead`.

**Mutation mechanics**:
1. `res.writeHead` is read (resolves up the prototype chain to `ServerResponse.prototype.writeHead` for a fresh response, or to a prior wrapper if `onHeaders` was called before)
2. `createWriteHead(prevWriteHead, listener)` creates a closure that:
   - Calls `setWriteHeadHeaders()` to extract and apply headers from arguments (lines 36, 119-146)
   - Fires the `listener` once (guarded by `fired` boolean, lines 38-47)
   - If the listener changed `this.statusCode`, updates args to reflect the new status (lines 44-47)
   - Delegates to `prevWriteHead.apply(this, args)` (line 50) -- the original writeHead
3. The new function is assigned directly to `res.writeHead` (line 71), creating an own-property that shadows the prototype method

**Scope**: Per-instance. The assignment `res.writeHead = ...` creates an own-property on the individual `res` object. `ServerResponse.prototype.writeHead` is never modified. Other response objects are unaffected.

**Restoration**: Not directly restorable by the library (no cleanup API). Could be restored by `delete res.writeHead` to re-expose the prototype method, but only if `onHeaders` was called exactly once. Multiple calls create a chain of wrappers.

**Stackability**: Multiple calls to `onHeaders(res, listener)` on the same `res` create a chain: each wrapper captures the previous `res.writeHead` (which may itself be a wrapper). The `fired` guard is per-wrapper, so each listener fires exactly once, in reverse registration order (last-registered fires first).

---

## C-002: `require('http')` at module load

- **Source**: `$PACKAGE_ROOT/index.js:16`
- **Code**: `var http = require('http')`
- **Type**: Standard module import
- **Verdict**: NOT A PATCH

Analysis: Standard `require('http')` loads the core http module. The returned module object is stored locally but never mutated. The module is only used for the read-only prototype check at line 19.

---

## C-003: `http.ServerResponse.prototype.appendHeader` feature detection read

- **Source**: `$PACKAGE_ROOT/index.js:19`
- **Code**: `var isAppendHeaderSupported = typeof http.ServerResponse.prototype.appendHeader === 'function'`
- **Type**: Read-only prototype access for feature detection
- **Verdict**: NOT A PATCH

Analysis: Pure `typeof` read of `http.ServerResponse.prototype.appendHeader`. No mutation of the prototype. The result determines which internal helper (`set1dArrayWithAppend` vs `set1dArrayWithSet`) is used for header array processing. `appendHeader` is defined on `OutgoingMessage.prototype` (inherited by `ServerResponse`) in Node.js >= 18.3.0.

---

## Summary

| ID    | Target                              | Operation         | Verdict         |
|-------|--------------------------------------|-------------------|-----------------|
| C-001 | `res.writeHead`                      | Instance override | CONFIRMED PATCH |
| C-002 | `require('http')`                    | Module import     | Not a patch     |
| C-003 | `ServerResponse.prototype.appendHeader` | typeof read    | Not a patch     |
