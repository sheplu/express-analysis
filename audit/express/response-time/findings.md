# response-time — findings detail (files, lines, issues)

Library: response-time 2.3.4 (master @ `3bd2651ea7fcf409ea780954e3113b3aaa0feb84`)
Verdict: **confirmed patching — 2 transitive findings**. Own code clean.

## Finding F-001 — `res.writeHead` instance wrapper (on-headers@1.1.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 55 | `onHeaders(res, function onHeaders() {…})` — installs the wrapper on every response handled by the middleware (no guards) |
| `node_modules/on-headers/index.js` | 71 | `res.writeHead = createWriteHead(res.writeHead, listener)` — own-property shadow of `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`) |

Effect: timing listener runs once just before headers go out (also on the implicit `res.end()` path — core `_implicitHeader` dispatches via `this.writeHead`, `server.js:419`); header args converted to `setHeader`/`appendHeader`; statusCode set before core validation; custom reason phrase can be dropped if statusCode is changed by the listener. Prototype never touched.

Upstream: CVE-2025-7339 / GHSA-76c9-3jph-rj3q (header-corruption bug in this wrapper, pre-1.1.0); fixed in the bundled 1.1.0 — the reason response-time 2.3.4 was released.

## Finding F-002 — transient `Error.prepareStackTrace`/`stackTraceLimit` swap (depd@2.0.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 16 | `var deprecate = require('depd')('response-time')` — fires depd's `getStack()` **at require time, unconditionally** |
| `node_modules/depd/index.js` | 386–387 | writes `Error.prepareStackTrace = prepareObjectStackTrace; Error.stackTraceLimit = Math.max(10, limit)` |
| `node_modules/depd/index.js` | 395–396 | synchronous restore of both saved values (no try/finally) |

Core contract: `$NODEJS_SOURCE/lib/internal/errors.js:136-163` honors userland `Error.prepareStackTrace`. Also re-fires on the deprecated number-argument middleware call path (`index.js:43`).

## response-time's own core interactions (clean)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 51 | `process.hrtime()` | read-only call |
| `index.js` | ~70 | `res.setHeader(header, time)` | documented API call |

## Rejected candidates

| Site | Why rejected |
|---|---|
| depd `wrapfunction`/`wrapproperty` (genuine mutation helpers) | never invoked by response-time |
| depd `defineProperty` on DeprecationError | library-owned Error object |
| on-headers `appendHeader` feature detection | read-only |
| depd browser entry | not loaded in Node |
| loader interception / `process.binding` / prototype sweeps | zero hits |

## Node.js-change risk

1. **`this.writeHead` dispatch** (same as compression): core calling the prototype method directly or caching it would silently disable the timing header.
2. **Deferred `prepareStackTrace` reads** in V8/Node would expose depd's transient swap.
3. **depd restore not exception-safe** — an exception inside `Error.captureStackTrace` leaves the global hook replaced.
