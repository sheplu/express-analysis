# on-headers -- Detailed Findings

**Library:** on-headers v1.1.0  
**Commit:** `691b687710ece2eef62e6a6d1bdcf3a3fcab932a`  

## Confirmed Findings

### F-001: `res.writeHead` replaced with listener-invoking wrapper via `createWriteHead()`

- **Category:** Per-instance method override (own-property shadow of prototype method)
- **Library site(s):** `$PACKAGE_ROOT/index.js:71` (assignment), `$PACKAGE_ROOT/index.js:30-52` (wrapper factory)
- **Core baseline:** `$NODEJS_SOURCE/lib/internal/http/server.js:423-523` -- `ServerResponse.prototype.writeHead = writeHead` where `writeHead(statusCode, reason, obj)` validates status code (100-999), sets statusMessage, processes header arguments (array or object), and calls `this._storeHeader(statusLine, headers)`. Returns `this`.
- **Exact mutation:** Object: individual `res` (ServerResponse instance); Key: `writeHead`; Operation: direct property assignment (`res.writeHead = ...`); Replacement: closure from `createWriteHead(res.writeHead, listener)` that returns a function named `writeHead`
- **Execution chain:**
  1. Consumer calls `onHeaders(res, listener)` (`index.js:62`)
  2. `onHeaders` reads `res.writeHead` (resolves to prototype or prior wrapper)
  3. Calls `createWriteHead(prevWriteHead, listener)` (`index.js:71` -> `index.js:30`)
  4. `createWriteHead` returns a new `function writeHead(statusCode)` closure
  5. Closure assigned to `res.writeHead` as own-property (`index.js:71`)
  6. When `res.writeHead(...)` is later called:
     - `setWriteHeadHeaders.apply(this, arguments)` extracts and applies headers, sets `this.statusCode` (line 36 -> lines 119-146)
     - If not yet fired, calls `listener.call(this)` once (line 41, guarded by `fired` boolean at line 31)
     - If listener changed `this.statusCode`, updates args and truncates to length 1 (lines 44-47)
     - Delegates to `prevWriteHead.apply(this, args)` with headers stripped from args (line 50)
- **Activation:** Patch is installed immediately when `onHeaders(res, listener)` is called. The wrapper fires on the first call to `res.writeHead()` for that response. The `fired` boolean guard ensures single listener execution per wrapper.
- **Scope and restoration:** **Per-instance** -- creates an own-property on the `res` object, shadowing `ServerResponse.prototype.writeHead`. The prototype is never touched. Other response objects are unaffected. **Not restorable** by the library (no cleanup/unpatch API). Manually restorable via `delete res.writeHead` only if no other wrappers were stacked on top. The original `writeHead` is retained in the `prevWriteHead` closure variable. The response object is short-lived (single request/response cycle), so the patch is effectively temporary.
- **Resulting behavior:**
  - **Before:** `res.writeHead(statusCode, headers)` directly validates the status code, processes headers, builds the status line, and calls `_storeHeader()` to commit headers to the wire.
  - **After:** The wrapper intercepts to (1) pre-process headers from arguments using `setWriteHeadHeaders()` and apply them via `res.setHeader()`/`res.appendHeader()`, (2) fire the registered listener with `this` bound to the response, (3) allow the listener to inspect/modify headers and status code before they are committed, (4) delegate to the original `writeHead` with headers stripped from args (since already applied).
  - **Key behavior change:** Headers passed as `writeHead()` arguments are applied to the response before the listener fires, so the listener can read and modify them. The wrapper strips header arguments from the forwarded call so they are not double-applied by core.
- **Evidence:**
  - Line 71: `res.writeHead = createWriteHead(res.writeHead, listener)` -- direct own-property assignment
  - Line 34: returned function is named `writeHead` (preserves function name for stack traces)
  - Line 36: `setWriteHeadHeaders.apply(this, arguments)` pre-processes headers
  - Lines 39-47: fire-once guard, listener invocation, statusCode synchronization
  - Line 50: `return prevWriteHead.apply(this, args)` -- delegation to original
  - Lines 140-145: `args` array construction truncates to just statusCode (and optional reason), stripping header arguments

## Dismissed Candidates

### C-D01: `require('http')` (line 16)
Standard core module import. The `http` module object is never mutated; only its `ServerResponse.prototype.appendHeader` is read (typeof check). Not a patch.

### C-D02: `http.ServerResponse.prototype.appendHeader` typeof check (line 19)
Read-only feature detection: `typeof http.ServerResponse.prototype.appendHeader === 'function'`. Used to select between `set1dArrayWithAppend` and `set1dArrayWithSet` helper strategies. The prototype is never written to. Not a patch.
