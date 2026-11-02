# express-session — findings detail (files, lines, issues)

Library: express-session 1.19.0 (master @ `8947e169ae838b22cc1af198e50e370e6fc09f96`)
Verdict: **confirmed patching — 3 findings** (1 direct instance override, 1 transitive instance override, 1 transitive transient global).

## Finding F-001 — direct `res.end` replacement (every handled response)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 266–267 | `var _end = res.end; var _write = res.write;` — originals saved (`_write` captured but **never reassigned**) |
| `index.js` | 269 | `res.end = function end(chunk, encoding) {…}` — own-property shadow of `OutgoingMessage.prototype.end` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289`) |
| `index.js` | 271–300+ | wrapper logic: idempotency (`if (ended) return false`), deferred final flush until store save/destroy/touch completes, split `writetop`/`writeend`, forced `res._implicitHeader()` when headers unsent |

Contract deltas vs core `end()`: duplicate calls swallowed (returns `false`), return value altered on the deferred path, `end(chunk, encoding, callback)` callback not forwarded on wrapped paths.

## Finding F-002 — `res.writeHead` instance wrapper (on-headers@1.1.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 235 | `onHeaders(res, function(){…})` — installs the Set-Cookie emission hook per response |
| `node_modules/on-headers/index.js` | 71 | `res.writeHead = createWriteHead(res.writeHead, listener)` — shadow of `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423-424`); also intercepts core `_implicitHeader` dispatch |

Upstream: CVE-2025-7339 / GHSA-76c9-3jph-rj3q (fixed in shipped 1.1.0).

## Finding F-003 — transient `Error.prepareStackTrace`/`stackTraceLimit` swap (depd@2.0.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 20 | `require('depd')('express-session')` — first activation at require |
| `session/cookie.js` | 15 | `require('depd')('express-session')` — second activation at require |
| `node_modules/depd/index.js` | 386–387 / 395–396 | global write / synchronous restore (no try/finally) — **4 writes captured at require** |

## Library metadata writes (not patches)

| File | Line(s) | Write | Classification |
|---|---|---|---|
| `index.js` | various | `req.session`, `req.sessionID`, `req.sessionStore` | new own instance props; no core members of these names (`lib/_http_incoming.js` verified) |
| parseurl | — | `req._parsedUrl` | library cache key (same as serve-favicon audit) |

## Private core API usage inside F-001 (supporting context — strongest in series)

| API | Where | Risk |
|---|---|---|
| `res._header` (read) | wrapper `writetop` | core-private header-sent flag; **renamed/removed ⇒ session commit breaks** |
| `res._implicitHeader()` (call) | wrapper `writetop` | core-private; same exposure. Note: express-session calls it directly, not only via on-headers |

## Rejected candidates

| Site | Why rejected |
|---|---|
| `util.inherits(Store, EventEmitter)` (session/store.js) | documented inheritance |
| safe-buffer | modern branch re-exports core buffer unmodified |
| debug@2.6.9 env round-trip, `process.binding('tty_wrap')` | env-gated reads, never activated in server |
| depd `wrapfunction`/`wrapproperty` | never called |
| uid-safe / random-bytes | crypto call-only |
| memory.js store internals | library-owned session objects |
| loader/bindings sweeps | zero hits tree-wide |

## Node.js-change risk

1. **`res._implicitHeader` / `res._header`** — core-private members directly used by express-session's own wrapper; a core rename breaks session commit (not just degraded behavior).
2. **`end()` contract drift** — any core change relying on `end()` return semantics, duplicate-call tolerance, or callback forwarding surfaces differences on wrapped responses.
3. **`this.writeHead` instance dispatch** — as in compression/response-time/morgan.
4. **depd transient swap** — as before; restore not exception-safe.
