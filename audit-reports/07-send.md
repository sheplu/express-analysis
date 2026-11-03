# Monkeypatch Audit: send@1.2.1

## Package Overview
- **Name**: send
- **Version**: 1.2.1
- **Role in Express**: Streaming static file server used by `res.sendFile()`. Creates a `SendStream` that reads files from disk and pipes them to the response, handling content-type detection, range requests, conditional GET, and caching headers
- **Source files audited**: `index.js` (998 lines)
- **Risk tier**: LOW

## Findings

**No monkeypatching findings.**

### Detailed Analysis

`send` creates its own `SendStream` class (inheriting from `Stream` via `util.inherits`) and stores a reference to `req` as `this.req` and `res` as `this.res` (line 408). These are properties on `SendStream`'s own instances, not injections onto the `req`/`res` objects themselves.

All interaction with the response object (`res`) uses standard Node.js APIs:
- **Reads**: `res.headersSent`, `res.getHeader()`, `res.getHeaderNames()` — standard APIs
- **Writes**: `res.statusCode` — standard writable property
- **API calls**: `res.setHeader()`, `res.removeHeader()`, `res.end()` — standard APIs
- **Piping**: `stream.pipe(res)` — standard Stream API

All interaction with the request object (`req`) is read-only:
- **Reads**: `req.headers['if-match']`, `req.headers['if-none-match']`, `req.headers['if-modified-since']`, `req.headers['if-unmodified-since']`, `req.headers['if-range']`, `req.headers.range`, `req.method` — all standard Node.js properties

The `util.inherits(SendStream, Stream)` call at line 155 sets up the prototype chain for `SendStream` (send's own class), not for a Node.js built-in — this is normal OOP, not monkeypatching.

### Triple-Check

1. **Automated scan**: grep found no property assignments to `req` or `res` parameters (only `this.req = req` and `this.res = res` on SendStream's own instances)
2. **Manual review**: full source read confirms all req/res interaction is through standard APIs — no `Object.defineProperty`, no `Object.setPrototypeOf`, no prototype modifications on foreign objects
3. **Call-chain**: `send(req, path)` → `new SendStream(req, path)` → `.pipe(res)` — the pipe receives `res` and uses it via standard stream/HTTP APIs only

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| http-errors | 2.0.1 | See `10-http-errors.md` |
| debug | 4.4.3 | None |
| encodeurl | 2.0.0 | None |
| escape-html | 1.0.3 | None |
| etag | 1.8.1 | None |
| fresh | 2.0.0 | None |
| mime-types | 3.0.2 | None |
| ms | 2.1.3 | None |
| on-finished | 2.4.1 | See `05-on-finished.md` |
| range-parser | 1.3.0 | None |
| statuses | 2.0.2 | None |

## Summary
- **Total findings**: 0
- **Recommendations for v6**: No changes needed — send uses only standard APIs on req/res objects. It delegates to `on-finished` for cleanup, which has its own findings.
