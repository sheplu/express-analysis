# on-headers -- Reconciled Audit Report

**Library:** on-headers v1.1.0  
**Commit:** `691b687710ece2eef62e6a6d1bdcf3a3fcab932a`  
**Production files:** `$PACKAGE_ROOT/index.js` (181 lines, sole production file)  
**Runtime dependencies:** None  
**Audit date:** 2026-11-01  
**Methodology:** Double-blind (Pass A + Pass B), then reconciliation  

## Verdict

**CONFIRMED: 1 per-instance monkeypatch.** The library replaces `res.writeHead` on
individual `ServerResponse` instances with a wrapper that intercepts header-write to
fire a listener callback. No prototype mutations, no global modifications, no module
system hooks, no internal binding access, no transitive dependencies.

## Scope Summary

| Aspect | Detail |
|---|---|
| Production files | 1 (`index.js`) |
| Runtime dependencies | 0 |
| Core modules imported | `http` (read-only, never mutated) |
| Prototype reads | 1 -- `typeof http.ServerResponse.prototype.appendHeader` (feature detection, no mutation) |
| Prototype writes | 0 |
| Instance patches | 1 -- `res.writeHead` per-instance override |
| Global/process mutations | 0 |
| Module system hooks | 0 |
| Internal bindings | 0 |

## How It Works

1. Consumer calls `onHeaders(res, listener)`.
2. `onHeaders` reads the current `res.writeHead` (prototype method or prior wrapper).
3. Calls `createWriteHead(prevWriteHead, listener)` to build a closure.
4. Assigns the closure to `res.writeHead` as an own-property, shadowing the prototype.
5. When `res.writeHead(statusCode, ...)` is later called by the framework or user code:
   a. The wrapper pre-processes header arguments via `setWriteHeadHeaders()`, applying them
      to the response via `res.setHeader()` / `res.appendHeader()` / `res.removeHeader()`.
   b. Fires the listener once (`fired` guard, line 31).
   c. If the listener modified `this.statusCode`, updates the forwarded arguments.
   d. Delegates to the original `prevWriteHead.apply(this, args)` with headers stripped
      from arguments (since they were already applied).

## Cross-Reference with Node.js Core

The original `writeHead` lives at `$NODEJS_SOURCE/lib/internal/http/server.js:423-523`,
assigned to `ServerResponse.prototype.writeHead`. It validates the status code (100-999),
sets `statusMessage`, processes header arguments (array or object form), and calls
`this._storeHeader(statusLine, headers)` to commit headers to the wire. The on-headers
wrapper intercepts before `_storeHeader` is called, giving the listener a window to
inspect and modify headers and status code before they are committed.

## Risk Assessment

- **Isolation:** Per-instance only. Other response objects and the shared prototype are
  unaffected. The patch is scoped to the HTTP request/response lifecycle.
- **Stackability:** Multiple `onHeaders()` calls on the same `res` create a wrapper chain.
  Each has its own `fired` flag. Last-registered listener fires first (outermost wrapper).
- **Restorability:** No unpatch API. Manually restorable via `delete res.writeHead` only
  if no other wrappers are stacked. The original is retained in the `prevWriteHead` closure.
- **Header duplication:** The wrapper's `setWriteHeadHeaders()` replicates header processing
  that core `writeHead` also performs. Headers are applied before the listener fires, then
  stripped from forwarded args so core `writeHead` does not double-apply them.
