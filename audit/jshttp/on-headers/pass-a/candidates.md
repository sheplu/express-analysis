# Pass A - Candidate Ledger

**Library:** on-headers v1.1.0
**Commit:** 691b687710ece2eef62e6a6d1bdcf3a3fcab932a

## Candidates

### C-001: `res.writeHead` instance property override

- **Source:** `$PACKAGE_ROOT/index.js:71`
- **Code:** `res.writeHead = createWriteHead(res.writeHead, listener)`
- **Mutation type:** Direct property assignment on a response instance object
- **Target:** The `writeHead` method on a specific `http.ServerResponse` instance
- **Mechanism:** Replaces the instance's `writeHead` with a wrapper closure that:
  1. Parses header arguments via `setWriteHeadHeaders` (lines 119-146)
  2. Fires the user-supplied listener exactly once (fire-once guard at line 39)
  3. Allows the listener to modify `this.statusCode` before forwarding
  4. Delegates to the original `prevWriteHead` via `.apply(this, args)` (line 50)
- **Scope:** Per-instance. Does NOT modify `ServerResponse.prototype`.
- **Restoration:** Not directly restorable by consumer (no API to undo). However, only the specific `res` instance is affected; other response objects are unaffected. The wrapper holds a closure reference to the original `prevWriteHead`.
- **Stackability:** Multiple calls to `onHeaders(res, listener)` will chain -- each call wraps the current `res.writeHead` (which may already be a wrapper from a previous call). The `fired` flag is per-wrapper, so each listener fires independently.
- **Verdict:** CONFIRMED PATCH -- instance-level monkeypatch of `res.writeHead`

### C-002: `http.ServerResponse.prototype.appendHeader` read access

- **Source:** `$PACKAGE_ROOT/index.js:19`
- **Code:** `typeof http.ServerResponse.prototype.appendHeader === 'function'`
- **Mutation type:** NONE -- read-only `typeof` check for feature detection
- **Target:** `http.ServerResponse.prototype.appendHeader`
- **Mechanism:** Tests whether `appendHeader` exists on the prototype to select between two internal helper functions
- **Scope:** Module-level, evaluated once at require time
- **Verdict:** NOT A PATCH -- pure read-only feature detection. No mutation occurs.

## Summary

| ID    | Target                    | Type                | Verdict       |
|-------|---------------------------|---------------------|---------------|
| C-001 | `res.writeHead`           | Instance override   | **CONFIRMED** |
| C-002 | `ServerResponse.prototype`| Read-only access    | Dismissed     |
