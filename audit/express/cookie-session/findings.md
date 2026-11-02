# cookie-session — findings detail (files, lines, issues)

Library: cookie-session 2.1.1 (master @ `75f53bb8f9118067955b344fb4ba550ed0e39318`)
Verdict: **confirmed patching — 2 transitive findings**. Own code clean (library-owned req keys only).

## Finding F-001 — `res.writeHead` instance wrapper (on-headers@1.1.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 114 | `onHeaders(res, function setHeaders(){…})` — installs the session-save hook on every handled response |
| `node_modules/on-headers/index.js` | 71 | `res.writeHead = createWriteHead(res.writeHead, listener)` — own-property shadow of `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`); also intercepts core `_implicitHeader` dispatch |

Upstream: CVE-2025-7339 / GHSA-76c9-3jph-rj3q (fixed in installed 1.1.0). cookie-session's own 2014 changelog: "Use on-headers instead of writeHead patching".

## Finding F-002 — transient `Error.prepareStackTrace`/`stackTraceLimit` swap (cookies → depd@2.0.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `node_modules/cookies/index.js` | 10 | `require('depd')('cookies')` — first `getStack()` fire at `require('cookie-session')` |
| `node_modules/cookies/index.js` | 232 | module-level `deprecate.property(Cookie.prototype, 'maxage', …)` — second fire at require (wraps cookies' **own** prototype, not core) |
| `node_modules/depd/index.js` | 386–387 / 395–396 | global write / synchronous restore (no try/finally) |

Reproduced: write sequence `['function','undefined','function','undefined']` (two pairs) at require; full restoration. Core contract: `$NODEJS_SOURCE/lib/internal/errors.js:136-166`.

## cookie-session's own writes (not patches)

| File | Line(s) | Write | Classification |
|---|---|---|---|
| `index.js` | ~60s | `Object.defineProperty(req, 'session', { get/set accessor })` | library-owned key on the live instance; `session` absent from core IncomingMessage |
| `index.js` | ~50s | `req.sessionOptions = …` | same |

## Notable dependency behavior (reads, not patches)

| File | Line(s) | Behavior | Why it matters |
|---|---|---|---|
| `node_modules/cookies/index.js` | 147–148 | `http.OutgoingMessage.prototype.setHeader.call(res, …)` | deliberately bypasses instance wrappers (e.g. Express `res.set`) to reach pristine core — a **call** on the prototype, never a write; hard-depends on that prototype method's identity/signature |
| `node_modules/cookies/index.js` | secure detection | reads `req.protocol`, `socket.encrypted` | read-only |

## Rejected candidates

| Site | Why rejected |
|---|---|
| debug `process.env.DEBUG` load-time write | documented env round-trip |
| safe-buffer | pure re-export of core buffer (identity-checked) |
| keygrip / tsscmp | crypto call-only |
| ms | pure |
| loader interception / bindings / install hooks / native code | zero hits |

## Node.js-change risk

1. **`this.writeHead` instance dispatch** — as in compression/response-time/morgan/express-session.
2. **`OutgoingMessage.prototype.setHeader` identity** — `cookies` calls it directly on the prototype; a rename or move breaks cookie emission outright.
3. **depd transient swap** — fires twice at every `require('cookie-session')`; restore not exception-safe.
