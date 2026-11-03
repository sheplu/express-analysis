# Monkeypatch Audit: parseurl@1.3.3

## Package Overview
- **Name**: parseurl
- **Version**: 1.3.3
- **Role in Express**: Parses the URL of an incoming request with memoization. Used by `req.path` and `req.query` getters in Express's `request.js`, and by the `router` package for pathname extraction. Also exports `originalurl()` for parsing `req.originalUrl`.
- **Source files audited**: `index.js` (single file, ~150 lines)
- **Risk tier**: MEDIUM

## Findings

### Finding 1: `req._parsedUrl` — memoized parse result cached on req

- **Category**: C — Instance Property Injection
- **File**: `index.js`
- **Line**: 57
- **Code**:
  ```js
  return (req._parsedUrl = parsed)
  ```
- **What it does**: After parsing `req.url`, stores the parsed URL object directly on the `req` (IncomingMessage) instance as `req._parsedUrl`. On subsequent calls, if the URL hasn't changed, the cached result is returned (lines 47–51: `var parsed = req._parsedUrl; if (fresh(url, parsed)) { return parsed }`).
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — `IncomingMessage` has no `._parsedUrl` property
  - Conflict risk: Low — underscore prefix indicates private, but any other module could collide with this property name. Node.js itself does not use `_parsedUrl`.
- **Severity**: Medium
- **v6 recommendation**: Use a `WeakMap` keyed on the request object for caching, or use a `Symbol`-keyed property to avoid name collisions.

### Finding 2: `req._parsedOriginalUrl` — memoized original URL parse

- **Category**: C — Instance Property Injection
- **File**: `index.js`
- **Line**: 82
- **Code**:
  ```js
  return (req._parsedOriginalUrl = parsed)
  ```
- **What it does**: Same pattern as Finding 1, but for `req.originalUrl` (the URL before any router prefix stripping). Cached as `req._parsedOriginalUrl`. Read back at line 72: `var parsed = req._parsedOriginalUrl`.
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — no `._parsedOriginalUrl` property
  - Conflict risk: Low — same as Finding 1
- **Severity**: Medium
- **v6 recommendation**: Same as Finding 1 — `WeakMap` or `Symbol`-keyed property.

### Finding 3: `parsed._raw` — internal marker on parsed URL object

- **Category**: C — Instance Property Injection (on own-ish object)
- **File**: `index.js`
- **Lines**: 55, 80
- **Code**:
  ```js
  parsed._raw = url
  ```
- **What it does**: Adds a `_raw` property to the parsed URL object (either a `new Url()` instance or a plain object created by `fastparse()`). This is used by the `fresh()` check to determine if the cached parse is still valid for the current URL string.
- **Object affected**: `url.Url` instance (from Node.js `url` module) or a plain object created by this module
- **Node.js cross-reference**:
  - `lib/url.js` — `Url` prototype has no `._raw` property
  - Conflict risk: Very low — `Url` is largely deprecated in favor of `URL`, and `_raw` is unlikely to collide
- **Severity**: Low
- **v6 recommendation**: If moving to `WeakMap` caching (Findings 1–2), this internal marker becomes unnecessary.

### Verification (Triple-Check)

1. **Automated pattern match**: ✅ `req._parsedUrl =` and `req._parsedOriginalUrl =` flagged. `parsed._raw =` flagged.
2. **Manual code reading**: ✅ `parseurl(req)` is called with the Node.js `IncomingMessage` instance. The function stores parsed results directly on this foreign object. The `originalurl(req)` function does the same for `req.originalUrl`. Both functions are exported and called on every request (via router and Express getters). The `_raw` property is set on the parse result object, which is created by `fastparse()` — technically a new object this module creates, but when `url.parse(str)` is used as fallback, it's a `Url` instance from Node.js.
3. **Call-chain tracing**: ✅ 
   - `router.handle()` → `getPathname(req)` → `parseUrl(req)` → `req._parsedUrl = parsed`
   - `req.path` getter (Express request.js) → `parse(this).pathname` → `req._parsedUrl = parsed`
   - `req.query` getter (Express request.js) → `parse(this).query` → `req._parsedUrl = parsed`

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| *(none — uses Node.js built-in `url` module)* | — | — |

## Summary
- **Total findings**: 3 (2 confirmed foreign-object monkeypatches + 1 low-severity internal marker)
- Critical: 0, High: 0, Medium: 2, Low: 1, Informational: 0
- **v6 recommendations**:
  1. Replace memoization-by-property-injection with a `WeakMap<IncomingMessage, ParsedUrl>` cache — this completely eliminates all three findings
  2. Switch from deprecated `url.parse()` / `url.Url` to the WHATWG `URL` class
  3. Consider whether memoization is still necessary given modern V8 performance — profiling should determine if the cache provides meaningful benefit
