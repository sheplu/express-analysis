# Node.js IncomingMessage — Prototype Map

Source: `node/lib/_http_incoming.js`
Inherits: `Readable` (from `stream`)

## Constructor Properties (lines 61–113)

Set on `this` during `new IncomingMessage(socket)`:

| Property | Line | Type | Description |
|----------|------|------|-------------|
| `socket` | 77 | Socket | The underlying network socket |
| `httpVersionMajor` | 79 | null→Number | HTTP major version |
| `httpVersionMinor` | 80 | null→Number | HTTP minor version |
| `httpVersion` | 81 | null→String | Full HTTP version string |
| `complete` | 82 | Boolean | Whether message has been fully received |
| `rawHeaders` | 85 | Array | Raw header name-value pairs |
| `rawTrailers` | 88 | Array | Raw trailer name-value pairs |
| `joinDuplicateHeaders` | 89 | Boolean | Whether to join duplicate headers |
| `aborted` | 90 | Boolean | Whether request was aborted |
| `upgrade` | 92 | null→Boolean | Whether upgrade request |
| `url` | 95 | String | Request URL (server only) |
| `method` | 96 | null→String | HTTP method (server only) |
| `statusCode` | 99 | null→Number | Status code (client only) |
| `statusMessage` | 100 | null→String | Status message (client only) |
| `client` | 101 | Socket | Alias for socket |
| `_consuming` | 103 | Boolean | Internal flag |
| `_dumped` | 106 | Boolean | Internal flag |

## Prototype Getters via ObjectDefineProperty (lines 115–220)

| Property | Lines | Description |
|----------|-------|-------------|
| `connection` | 115–123 | Alias for `socket` (get/set) |
| `headers` | 125–143 | Lazily computed from `rawHeaders` |
| `headersDistinct` | 145–163 | Headers as distinct arrays |
| `trailers` | 165–183 | Lazily computed from `rawTrailers` |
| `trailersDistinct` | 185–203 | Trailers as distinct arrays |
| `signal` | 205–220 | AbortSignal (configurable, get-only) |

## Prototype Methods (lines 222+)

| Method | Line | Description |
|--------|------|-------------|
| `[kAttachAbortSignal]()` | 222 | Internal: attach abort signal listener |
| `[kDetachAbortSignal]()` | 246 | Internal: detach abort signal listener |
| `setTimeout(msecs, cb)` | 257 | Set timeout on underlying socket |
| `_read()` | 264 | Internal: resume socket reading |
| `_destroy(err, cb)` | 280 | Internal: destroy and abort |
| `_addHeaderLines(headers, n)` | 320 | Internal: bulk add headers |
| `_addHeaderLine(field, value, dest)` | 509 | Internal: add single header |
| `_addHeaderLineDistinct(field, value, dest)` | 549 | Internal: add distinct header |
| `_dumpAndCloseReadable()` | 559 | Internal: dump readable state |
| `_dump()` | 571 | Internal: resume to drain |

## Properties Express Adds (NOT in Node.js)

These properties are added by Express to the IncomingMessage prototype chain or to individual instances:

| Property | Express Source | Type | How Added |
|----------|---------------|------|-----------|
| `req.get()` / `req.header()` | request.js:63 | Method | Cat B — prototype extension |
| `req.accepts()` | request.js:127 | Method | Cat B |
| `req.acceptsEncodings()` | request.js:140 | Method | Cat B |
| `req.acceptsCharsets()` | request.js:171 | Method | Cat B |
| `req.acceptsLanguages()` | request.js:185 | Method | Cat B |
| `req.range()` | request.js:214 | Method | Cat B |
| `req.is()` | request.js:269 | Method | Cat B |
| `req.query` | request.js:230 | Getter | Cat B — via defineGetter |
| `req.protocol` | request.js:297 | Getter | Cat B |
| `req.secure` | request.js:326 | Getter | Cat B |
| `req.ip` | request.js:340 | Getter | Cat B |
| `req.ips` | request.js:357 | Getter | Cat B |
| `req.subdomains` | request.js:383 | Getter | Cat B |
| `req.path` | request.js:403 | Getter | Cat B |
| `req.host` | request.js:418 | Getter | Cat B |
| `req.hostname` | request.js:444 | Getter | Cat B |
| `req.fresh` | request.js:469 | Getter | Cat B |
| `req.stale` | request.js:497 | Getter | Cat B |
| `req.xhr` | request.js:508 | Getter | Cat B |
| `req.app` | express.js:46 | Data prop | Cat B — via Object.create descriptor |
| `req.res` | application.js:165 | Data prop | Cat C — instance injection |
| `req.params` | router | Data prop | Cat C — instance injection |
| `req.route` | router | Data prop | Cat C — instance injection |
| `req.baseUrl` | router | Data prop | Cat C — instance injection |
| `req.next` | router | Data prop | Cat C — instance injection |
| `req.originalUrl` | router | Data prop | Cat C — instance injection |
| `req.body` | body-parser | Data prop | Cat C — instance injection |
| `req._body` | body-parser | Data prop | Cat C — instance injection |
| `req._parsedUrl` | parseurl | Data prop | Cat C — instance injection |
| `req._parsedOriginalUrl` | parseurl | Data prop | Cat C — instance injection |
