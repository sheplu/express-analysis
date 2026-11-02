# morgan — findings detail (files, lines, issues)

Library: morgan 1.12.1 (master @ `b1272e70812dbc504321eeb5a43d14b0822c150d`)
Verdict: **confirmed patching — 2 transitive findings**. Own code clean.

## Finding F-001 — `res.writeHead` instance wrapper (on-headers@1.1.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 171 | `onHeaders(res, recordStartTime)` — installs the wrapper for every response in default mode (skipped in `immediate` mode) |
| `node_modules/on-headers/index.js` | 71 (body 30–52) | `res.writeHead = createWriteHead(res.writeHead, listener)` — own-property shadow of `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`); also intercepts core's `_implicitHeader` path (`:419-421`) |

Upstream: CVE-2025-7339 / GHSA-76c9-3jph-rj3q — bug in this exact wrapper, fixed in audited 1.1.0.

## Finding F-002 — transient `Error.prepareStackTrace`/`stackTraceLimit` swap (depd@2.0.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 29 | `require('depd')('morgan')` — first `getStack()` fire at require |
| `index.js` | 198 | `deprecate.property(morgan, 'default', …)` — second fire at require |
| `node_modules/depd/index.js` | 386–387 / 395–396 | global write / synchronous restore (no try/finally) |

Core: Node installs a default `Error.prepareStackTrace` (`$NODEJS_SOURCE/lib/internal/errors.js:168`, `bootstrap/realm.js:509`) and honors userland overrides — the swap genuinely redirects core stack preparation during the window. Two write/restore pairs reproduced at `require('morgan')`.

## morgan's own writes (not patches)

| File | Line(s) | Write | Classification |
|---|---|---|---|
| `index.js` | 134–136 | `req._startAt`/`req._startTime`/`req._remoteAddress` | library-owned metadata; no core collision (negative grep across core http sources) |
| `index.js` | 139–140 | `res._startAt`/`res._startTime` | same |
| `index.js` | 268–275 | reads of the above | — |

## Dormant patch worth tracking (unreachable today)

| File | Line(s) | Pattern | Activation condition |
|---|---|---|---|
| `node_modules/on-finished/index.js` | 189–199 | instance override of `res.assignSocket`/`removeSocket` | requires `msg.socket === undefined`; core sets `kSocket = null` (`outgoing.js:187`) behind a prototype accessor, and morgan attaches after `assignSocket` (`server.js:312-321,:1410`). **If Node ever initialized socket to `undefined`, this would become an active per-response wrap.** Repro confirmed not applied today. |

## Rejected candidates

| Site | Why rejected |
|---|---|
| debug@2.6.9 `process.env.DEBUG` require-time write | value-preserving round-trip; repro confirmed identical |
| debug `console._stdout` swap (inspector-log.js) | dead file, never required in 2.6.9 |
| safe-buffer@5.1.2 | re-exports core buffer unmutated |
| basic-auth / ms / ee-first | pure helpers |
| morgan stream usage | reads `process.stdout`; public `stream.write` only |
| loader interception / bindings sweeps | zero hits |

## Node.js-change risk

1. **`this.writeHead` instance dispatch** — as in compression/response-time.
2. **`OutgoingMessage` socket init** — changing `null` → `undefined` would awaken on-finished's dormant `assignSocket` wrap for every morgan-logged response.
3. **Deferred `prepareStackTrace`** — would expose depd's transient swap; restore is not exception-safe.
