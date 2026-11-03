# Monkeypatch Audit: body-parser@2.3.0

## Package Overview
- **Name**: body-parser
- **Version**: 2.3.0
- **Role in Express**: Parses incoming request bodies. Express re-exports `bodyParser.json`, `bodyParser.raw`, `bodyParser.text`, and `bodyParser.urlencoded` as `express.json()`, `express.raw()`, `express.text()`, and `express.urlencoded()`.
- **Source files audited**: `index.js`, `lib/read.js`, `lib/utils.js`, `lib/types/json.js`, `lib/types/raw.js`, `lib/types/text.js`, `lib/types/urlencoded.js`
- **Risk tier**: MEDIUM

## Findings

### Finding 1: `req.body` — initialized to `undefined`

- **Category**: C — Instance Property Injection
- **File**: `lib/read.js`
- **Line**: 47
- **Code**:
  ```js
  if (!('body' in req)) {
    req.body = undefined
  }
  ```
- **What it does**: Initializes `req.body` to `undefined` if it doesn't already exist. This ensures the property is present on the request object even before parsing.
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — `IncomingMessage` has no `.body` property
  - Conflict risk: None currently. However, the Web Fetch API's `Request` object has a `.body` property (ReadableStream), which is a conceptual collision.
- **Severity**: Medium
- **v6 recommendation**: Move to a request-scoped context or Symbol-keyed property.

### Finding 2: `req.body` — set to parsed value

- **Category**: C — Instance Property Injection
- **File**: `lib/read.js`
- **Line**: 162
- **Code**:
  ```js
  req.body = parse(str, encoding)
  ```
- **What it does**: Sets `req.body` to the parsed request body (JSON object, URL-encoded params, raw Buffer, or text string depending on the parser type). This is the primary output of body-parser — the parsed body is injected directly onto the request object.
- **Object affected**: `http.IncomingMessage` instance
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — no `.body` property
  - Conflict risk: Same as Finding 1
- **Severity**: Medium
- **v6 recommendation**: Return parsed body through a separate channel (response to a context object, Symbol-keyed property, or middleware-local storage via `AsyncLocalStorage`).

### Finding 3: `req.length` — set during content stream extraction

- **Category**: C — Instance Property Injection
- **File**: `lib/read.js`
- **Line**: 198
- **Code**:
  ```js
  req.length = length
  ```
- **What it does**: Sets `req.length` to the `Content-Length` header value (a string). This happens inside the `contentstream()` helper when the request encoding is `identity` (no compression). The value is used by `raw-body` to enforce size limits.
- **Object affected**: `http.IncomingMessage` instance — which inherits from `Readable` → `Stream` → `EventEmitter`
- **Node.js cross-reference**:
  - `lib/_http_incoming.js` — no `.length` property on `IncomingMessage`
  - `Readable.prototype` — no `.length` property
  - However, arrays and strings have `.length`, so this could shadow if `req` were ever treated as array-like
  - Conflict risk: Low — no native `.length` exists on `IncomingMessage`, but adding `.length` to a stream object is semantically confusing
- **Severity**: Medium
- **v6 recommendation**: Pass length as an option to `raw-body` directly instead of injecting onto `req`. The `stream.length` is immediately set to `undefined` after extraction (line 92: `stream.length = undefined`), confirming the injection is temporary but still occurs on the live `req` object when not compressed.

### Verification (Triple-Check)

1. **Automated pattern match**: ✅ `req.body =` flagged at lines 47 and 162. `req.length =` flagged at line 198.
2. **Manual code reading**: ✅ All three injections are in `lib/read.js`, called by every parser type (json, raw, text, urlencoded). The `req` parameter is the Node.js `IncomingMessage` instance passed through from Express middleware. All code paths are reachable in production.
3. **Call-chain tracing**: ✅ `express.json()` → `jsonParser(req, res, next)` → `read(req, res, next, parse, debug, opts)` → `req.body = undefined` (line 47), then `getBody(stream, opts, callback)` → `req.body = parse(str, encoding)` (line 162). For identity encoding: `contentstream(req)` → `req.length = length` (line 198).

## Transitive Dependencies

| Dependency | Version | Findings |
|---|---|---|
| raw-body | 3.0.2 | 0 — reads from stream using standard APIs (`.on('data')`, `.on('end')`), no property injection. Reads `stream.length` (set by body-parser) and `stream.encoding` but does not write to foreign objects. |
| iconv-lite | 0.7.3 | 0 — pure encoding/decoding library, no foreign object mutation |
| bytes | 3.1.2 | 0 — pure byte string parser (`'1kb'` → `1024`), no mutations |
| unpipe | 1.0.0 | 0 — calls `stream.unpipe()` (standard API) or invokes existing cleanup listeners by name. Does not add properties. Reads `stream.listeners('data')` and `stream.listeners('close')` which are standard EventEmitter APIs. |
| http-errors | 2.0.1 | See [10-http-errors.md](./10-http-errors.md) |
| on-finished | 2.4.1 | See [05-on-finished.md](./05-on-finished.md) |
| content-type | 2.1.0 | 0 — pure parser |
| type-is | 2.1.0 | 0 — pure type checker |
| debug | 4.4.3 | 0 — logging utility |
| qs | 6.16.0 | 0 — pure query string parser (note: called with `allowPrototypes: true` which has security implications but is not a monkeypatch) |

## Summary
- **Total findings**: 3
- Critical: 0, High: 0, Medium: 3, Low: 0, Informational: 0
- **v6 recommendations**:
  1. Move `req.body` to a Symbol-keyed property, `WeakMap`, or `AsyncLocalStorage` context — this is the most impactful change since `req.body` is the most widely-used Express convention
  2. Stop injecting `req.length` — pass content length as an option to `raw-body` instead of setting it on the stream
  3. Consider whether `req.body` initialization (line 47) is needed at all, or if consumers should check for the property explicitly
