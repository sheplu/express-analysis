# connect-timeout — findings detail (files, lines, issues)

Library: connect-timeout 1.9.1 (master @ `7377defb5b7b5a9c3d50fabd42c4dd46ad175d13`)
Verdict: **confirmed patching — 2 active transitive findings + 1 legacy-gated dormant**. Own code writes new keys only.

## Finding F-001 — `res.writeHead` instance wrapper (on-headers@1.1.0, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 66 | `onHeaders(res, function(){…})` — clears the request timeout just before headers are written |
| `node_modules/on-headers/index.js` | 71 | `res.writeHead = createWriteHead(res.writeHead, listener)` — shadow of `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`) |

## Finding F-002 — transient `Error.prepareStackTrace`/`stackTraceLimit` swap (http-errors@1.6.3 → depd@1.1.2, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `node_modules/depd/index.js` | 370–371 / 379–380 | global writes / synchronous restores in `getStack()` |
| `node_modules/depd/lib/compat/index.js` | 30–31 / 39–40 | depd 1.x **compat layer** — additional write/restore pairs |
| (activation) | — | unconditional at `require('connect-timeout')`; **3 cycles = 6 global writes observed** |

depd 1.x also runs `eval` at require time (compat wrapper construction — no core mutation). More require-time global churn than the depd@2 packages in this series.

## Finding F-003 — dormant `res.assignSocket` wrap (on-finished@2.3.0, legacy-gated)

| File | Line(s) | What happens |
|---|---|---|
| `index.js` | 62 | `onFinished(res, …)` — called with the **response**, making reachability a real question |
| `node_modules/on-finished/index.js` | 126 | gate: `if (msg.socket === undefined) patchAssignSocket(msg, onSocket)` |
| `node_modules/on-finished/index.js` | 186–196 (write :192) | `res.assignSocket = function _assignSocket(socket){…}` — labeled "node.js 0.8 patch"; wraps core `assignSocket` (`server.js:312`) |

**Dormant because:** `OutgoingMessage` initializes the socket slot to `null`, never `undefined` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`), and connect-timeout attaches mid-request with the socket already assigned. **A core change initializing socket to `undefined` would awaken this wrap on every timed-out-capable response.** Upstream intent confirmed by jshttp commits `e5f64aa8d7`/`87eff30f33`.

## connect-timeout's own writes (not patches)

| File | Line(s) | Write | Classification |
|---|---|---|---|
| `index.js` | 48, 60 | `req.timedout = true/false` | new library-owned key (no core member) |
| `index.js` | 56 | `req.clearTimeout = function(){…}` | new library-owned method on the instance |

## Historical patches (removed — tracked for completeness)

| What | Removed by |
|---|---|
| direct `res.writeHead` wrap in this package | commit `cb5c2ee` |
| `socket.destroy` wrap | commit `300ea5d` |

## Supporting context / rejected

| Site | Classification |
|---|---|
| `index.js:50` `req.emit('timeout')` | event-name collision with core's own `'timeout'` (`server.js:929-934`) — behavioral overlap, not a patch; worth tracking |
| http-errors / setprototypeof / inherits | mutate library-created Error objects only |
| statuses / ms / ee-first | pure |
| loader hooks / bindings / prototypes / globals | zero hits (16 runtime files) |

## Node.js-change risk

1. **Socket init `null` → `undefined`** would awaken F-003 (same dormant pattern as compression/morgan trees, but with on-finished 2.3.0).
2. **`this.writeHead` instance dispatch** — series-wide dependency.
3. **depd 1.x transient swap** — 6 global writes per require, restore not exception-safe.
4. **`'timeout'` event-name collision** — a core change emitting `'timeout'` on IncomingMessage would tangle with this package's listener semantics.
