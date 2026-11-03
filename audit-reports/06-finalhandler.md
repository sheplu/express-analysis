# Monkeypatch Audit: finalhandler@2.1.1

## Package Overview
- **Name**: finalhandler
- **Version**: 2.1.1
- **Role in Express**: Terminal handler at the end of the middleware stack — handles uncaught errors, sends 404 when no route matches, produces error pages
- **Source files audited**: `index.js` (294 lines)
- **Risk tier**: LOW

## Findings

**No monkeypatching findings.**

### Detailed Analysis

`finalhandler` receives `req` and `res` as parameters and interacts with them exclusively through standard Node.js APIs:

- **Reads**: `res.headersSent`, `req.method`, `req.socket`, `req.httpVersionMajor`, `res.statusCode` — all standard Node.js properties
- **Writes**: `res.statusCode`, `res.statusMessage` — standard Node.js writable properties
- **API calls**: `res.setHeader()`, `res.removeHeader()`, `res.end()`, `req.unpipe()`, `req.resume()`, `req.socket.destroy()` — all standard Node.js APIs
- **Delegates to**: `parseUrl.original(req)` (which caches on `req`, documented in `04-parseurl.md`), `onFinished(req, write)` (which injects `msg.__onFinished`, documented in `05-on-finished.md`)

The `res.statusCode` and `res.statusMessage` writes (lines 250, 253) are standard API usage — these are writable data properties on `ServerResponse.prototype` defined in `_http_server.js:285-286`.

### Triple-Check

1. **Automated scan**: grep found no `Object.setPrototypeOf`, `Object.defineProperty`, `__defineGetter__`, `__proto__`, or prototype modifications
2. **Manual review**: full source read confirms all req/res interaction uses standard APIs
3. **Call-chain**: finalhandler is called as `done` callback from `app.handle()` — it only sends error responses, never modifies object shapes

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| debug | 4.4.3 | None (see `12-pure-utilities.md`) |
| encodeurl | 2.0.0 | None |
| escape-html | 1.0.3 | None |
| on-finished | 2.4.1 | See `05-on-finished.md` |
| parseurl | 1.3.3 | See `04-parseurl.md` |
| statuses | 2.0.2 | None |

## Summary
- **Total findings**: 0
- **Recommendations for v6**: No changes needed — finalhandler uses only standard APIs. Its transitive dependencies `parseurl` and `on-finished` have their own findings documented separately.
