# Monkeypatch Audit: serve-static@2.2.1

## Package Overview
- **Name**: serve-static
- **Version**: 2.2.1
- **Role in Express**: Static file serving middleware, exported as `express.static()`. Internally creates a `send` stream and pipes it to the response
- **Source files audited**: `index.js` (209 lines)
- **Risk tier**: LOW

## Findings

**No monkeypatching findings.**

### Detailed Analysis

`serve-static` is a thin middleware wrapper around the `send` package. It:

1. Parses the request URL using `parseUrl(req)` and `parseUrl.original(req)` (lines 86-87) — these cache results on `req` (documented in `04-parseurl.md`)
2. Creates a `send` stream: `send(req, path, opts)` (line 95)
3. Pipes the stream to `res`: `stream.pipe(res)` (line 124)

All direct interaction with `req` and `res` uses standard APIs:
- **Reads**: `req.method` (line 72) — standard property
- **Writes**: `res.statusCode` (line 78), `res.setHeader()` (lines 79-81), `res.end()` (line 81) — standard APIs, only in the 405 error path

No properties are injected onto `req` or `res`. The `Object.create(options || null)` at line 47 creates a fresh options object — not modifying any foreign prototype.

### Triple-Check

1. **Automated scan**: grep found no `Object.setPrototypeOf`, `Object.defineProperty`, `__defineGetter__`, or prototype modifications
2. **Manual review**: full source read confirms no property injection on req/res — only standard API calls
3. **Call-chain**: `serveStatic(root)(req, res, next)` → `send(req, path).pipe(res)` — standard middleware pattern

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| encodeurl | 2.0.0 | None |
| escape-html | 1.0.3 | None |
| parseurl | 1.3.3 | See `04-parseurl.md` |
| send | 1.2.1 | None (see `07-send.md`) |

## Summary
- **Total findings**: 0
- **Recommendations for v6**: No changes needed — serve-static is a clean wrapper. Its indirect use of `parseurl` (which caches on `req`) is the only source of req mutation, documented separately.
