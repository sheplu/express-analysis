# serve-static — findings detail (files, lines, issues)

Library: serve-static 2.2.1 (master @ `6e3606f2892df213e8fa738b51a36ba711e86ce8`)
Verdict: **confirmed patching — 1 transitive transient finding** (depd). Own code and send both clean of method wrapping.

## Finding F-001 — transient `Error.prepareStackTrace`/`stackTraceLimit` swap (send → http-errors → depd@2.0.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 20 | `var send = require('send')` — chain start, fires at `require('serve-static')` |
| `node_modules/send/index.js` | 15 | `require('http-errors')` |
| `node_modules/http-errors/index.js` | 15 | `require('depd')('http-errors')` — factory triggers `getStack()` |
| `node_modules/depd/index.js` | 386–396 | global writes + synchronous restores (no try/finally) |

Core contract: `$NODEJS_SOURCE/lib/internal/errors.js:149-150`. Per-request re-fire count: **0** (depd deprecations only trigger on out-of-range status codes this tree never produces). Upstream: dougwilson/nodejs-depd#32, #36.

## Why this tree is otherwise clean (verified, both passes)

- **No res or ReadStream method is ever reassigned or wrapped.** send uses only documented response APIs: `setHeader`/`getHeader`/`removeHeader`/`getHeaderNames`/`end`/`statusCode`/`headersSent`.
- **No `writeHead` usage anywhere in the tree** (no on-headers dependency) — unlike compression/response-time/morgan/express-session/cookie-session/connect-timeout.
- **No private core member access**: zero hits for `res._header`, `_implicitHeader`, stream `_readableState` writes.
- `SendStream.prototype.pipe` (`send/index.js:403`) is a method on send's **own** legacy-Stream subclass prototype — library-owned extension, not a core shadow.

## Dormant pattern (4th occurrence in series — unreachable)

| File | Line(s) | Pattern | Dormancy proof |
|---|---|---|---|
| `node_modules/on-finished/index.js` | 128–131, 189–199 | instance wrap of `res.assignSocket` (Node 0.8 legacy) | `msg.socket === undefined` never true — core sets `kSocket = null` (`outgoing.js:187`, accessor `:304`); send attaches mid-request; **runtime-confirmed unreached during a live request** |

## Library metadata writes (not patches)

| Key | Where | Classification |
|---|---|---|
| `req._parsedUrl` | parseurl | library cache convention (series-consistent) |
| `msg.__onFinished` | on-finished | library listener bookkeeping |
| cached URL mutation | serve-static redirect path | library-owned objects |

## Rejected candidates

| Site | Why rejected |
|---|---|
| setprototypeof | native re-export on Node ≥ 18; library targets |
| http-errors/depd `defineProperty` | library-created objects |
| debug `process.env.DEBUG` (`src/node.js:205,209`) | idempotent env round-trip |
| mime-types@3 + mime-db@1.54.0 load-time maps | own exports (legacy `mime` package absent) |
| encodeurl, escape-html, fresh, etag, range-parser, ms, ee-first, inherits, statuses, toidentifier | pure — zero core interaction |
| loader hooks / bindings / install scripts | zero hits tree-wide |

## Node.js-change risk

1. **depd transient swap** — require-time only in this tree; restore not exception-safe (no throwing path exists here).
2. **`OutgoingMessage` socket init `null` → `undefined`** — would awaken the dormant on-finished wrap (series-wide watch item).
3. Otherwise none: documented-API-only usage makes serve-static/send the most core-robust large tree in this audit series.
