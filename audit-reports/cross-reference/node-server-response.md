# Node.js ServerResponse + OutgoingMessage — Prototype Map

## ServerResponse

Source: `node/lib/_http_server.js`
Inherits: `OutgoingMessage` (from `_http_outgoing.js`)

### Constructor Properties (lines 215–257)

Set on `this` during `new ServerResponse(req, options)`:

| Property | Line | Type | Description |
|----------|------|------|-------------|
| `req` | 224 | IncomingMessage | **Reference to the request** — Express also sets this at application.js:166 |
| `sendDate` | 225 | Boolean | Whether to auto-send Date header |
| `_sent100` | 226 | Boolean | Whether 100 Continue was sent |
| `_expect_continue` | 227 | Boolean | Whether Expect: 100-continue was received |

### Prototype Properties

| Property | Line | Description |
|----------|------|-------------|
| `statusCode` | 285 | Default 200 |
| `statusMessage` | 286 | Default undefined |

### Prototype Methods

| Method | Line | Description |
|--------|------|-------------|
| `_finish()` | 262 | Internal: finish response |
| `assignSocket(socket)` | 312 | Assign underlying socket |
| `detachSocket(socket)` | 323 | Detach socket |
| `writeInformation(statusCode, headers, cb)` | 330 | Send 1xx informational response |
| `writeContinue(cb)` | 381 | Send 100 Continue |
| `writeProcessing(cb)` | 386 | Send 102 Processing |
| `writeEarlyHints(hints, cb)` | 390 | Send 103 Early Hints |
| `_implicitHeader()` | 419 | Internal: call writeHead |
| `writeHead(statusCode, reason, obj)` | 423 | Write status line and headers |

---

## OutgoingMessage (parent of ServerResponse)

Source: `node/lib/_http_outgoing.js`
Inherits: `Stream` (from `stream`)

### Key Prototype Methods

| Method | Line | Description |
|--------|------|-------------|
| `_renderHeaders()` | 319 | Internal: render headers for sending |
| `cork()` | 339 | Cork the underlying socket |
| `uncork()` | 346 | Uncork the underlying socket |
| `setTimeout(msecs, cb)` | 395 | Set response timeout |
| `destroy(error)` | 415 | Destroy the response |
| `_send(data, encoding, cb, byteLength)` | 445 | Internal: send data |
| `_writeRaw(data, encoding, cb)` | 470 | Internal: raw write |
| `_storeHeader(firstLine, headers)` | 500 | Internal: store headers |
| `setHeader(name, value)` | 814 | Set a response header |
| `setHeaders(headers)` | 835 | Set multiple headers |
| `appendHeader(name, value)` | 878 | Append to a header |
| `getHeader(name)` | 915 | Get a header value |
| `getHeaderNames()` | 928 | Get all header names |
| `getRawHeaderNames()` | 934 | Get raw header names |
| `getHeaders()` | 951 | Get all headers as object |
| `hasHeader(name)` | 968 | Check if header exists |
| `removeHeader(name)` | 975 | Remove a header |
| `_implicitHeader()` | 1005 | Abstract: must be overridden |
| `write(chunk, encoding, cb)` | 1029 | Write response body chunk |
| `addTrailers(headers)` | 1196 | Add trailer headers |
| `end(chunk, encoding, cb)` | 1291 | End the response |
| `_finish()` | 1393 | Internal: finish writing |
| `_flush()` | 1418 | Internal: flush output |
| `_flushOutput(socket)` | 1437 | Internal: flush to socket |
| `flushHeaders()` | 1463 | Flush headers immediately |
| `pipe()` | 1472 | Override: throws error (not writable) |

---

## Properties Express Adds (NOT in Node.js)

| Property | Express Source | Type | How Added |
|----------|---------------|------|-----------|
| `res.status()` | response.js:65 | Method | Cat B — prototype extension |
| `res.links()` | response.js:98 | Method | Cat B |
| `res.send()` | response.js:126 | Method | Cat B |
| `res.json()` | response.js:236 | Method | Cat B |
| `res.jsonp()` | response.js:264 | Method | Cat B |
| `res.sendStatus()` | response.js:325 | Method | Cat B |
| `res.sendFile()` | response.js:375 | Method | Cat B |
| `res.download()` | response.js:437 | Method | Cat B |
| `res.contentType()` / `res.type()` | response.js:507 | Method | Cat B |
| `res.format()` | response.js:573 | Method | Cat B |
| `res.attachment()` | response.js:608 | Method | Cat B |
| `res.append()` | response.js:634 | Method | Cat B |
| `res.set()` / `res.header()` | response.js:669 | Method | Cat B |
| `res.get()` | response.js:701 | Method | Cat B |
| `res.clearCookie()` | response.js:714 | Method | Cat B |
| `res.cookie()` | response.js:747 | Method | Cat B |
| `res.location()` | response.js:796 | Method | Cat B |
| `res.redirect()` | response.js:814 | Method | Cat B |
| `res.vary()` | response.js:877 | Method | Cat B |
| `res.render()` | response.js:896 | Method | Cat B |
| `res.app` | express.js:51 | Data prop | Cat B — via Object.create descriptor |
| `res.req` | application.js:166 | Data prop | Cat C — instance injection (**ALSO** set by Node.js constructor at _http_server.js:224) |
| `res.locals` | application.js:174 | Data prop | Cat C — instance injection |

### Notable Overlap: `res.req`

Node.js `ServerResponse` constructor sets `this.req = req` at `_http_server.js:224`.
Express also sets `res.req = req` at `application.js:166`.

In practice, both reference the same `IncomingMessage` instance, so this is redundant rather than conflicting. However, it means Express overwrites a property that Node.js already provides, making it a documented monkeypatch even though the value is the same.
