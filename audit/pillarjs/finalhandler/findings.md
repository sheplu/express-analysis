# finalhandler — findings detail (files, lines, issues)

Library: finalhandler 2.1.1 (master @ `1e0227c67128dfcd0a7725c81beb4af3405a3419`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches. Tree contains **no depd** (no Error-hook swaps anywhere; verified by require-time accessor traps).

## Why finalhandler is clean

finalhandler consumes documented req/res instance APIs only. Its deps are the "pure" end of the jshttp/pillarjs stack (debug, ee-first, encodeurl, escape-html, ms, on-finished, parseurl, statuses) — no http-errors, no depd, no prototype-rewiring helpers.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 118-123 | `if (res.headersSent) { ... req.socket && req.socket.destroy() }` | documented socket teardown on passed instance (`net.Socket.prototype.destroy` identity unchanged) |
| `index.js` | 250-294 | `res.statusCode`/`statusMessage` writes; `setHeader` (CSP, nosniff, `err.headers`); `res.end` | documented writable props / header API (core defaults `$NODEJS_SOURCE/lib/internal/http/server.js:285-286`) |
| `index.js` | 257-259 | `removeHeader('Content-Encoding'/'Content-Language'/'Content-Range')` | explicit 3-header clear — **no** `getHeaderNames()` sweep in v2.1.1 |
| `index.js` | 290-294 | `req.unpipe()`; `onFinished(req, write)`; `req.resume()` | documented stream/event API; note on-finished attaches to the **request** only |

## The dormant on-finished override (independently re-confirmed)

| Item | Detail |
|---|---|
| Site | `node_modules/on-finished/index.js:189-199` (`patchAssignSocket`), guard at `:128-130` |
| Would-be effect | own-property wrap of `res.assignSocket`, shadowing `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE/lib/internal/http/server.js:312`) |
| Triple containment | (1) finalhandler passes only `req` to onFinished (`index.js:293`); (2) `msg.socket === undefined` unsatisfiable on Node ≥ 18 (`incoming.js:77` ctor-assigned socket; `outgoing.js:187,303-315` kSocket=null + accessor; also checked at v18.0.0 `_http_outgoing.js:134`); (3) requests have no `assignSocket` function → immediate bail |
| Runtime | never fired across all repro scenarios; prototype identity preserved |
| Provenance | jshttp/on-finished@`2792e5da14` — Node 0.8 pipelining fix (jshttp/on-finished#10) |

## Instance expandos observed (library-owned metadata, not patches)

| Source | Property | Classification |
|---|---|---|
| parseurl | `req._parsedUrl`, `req._parsedOriginalUrl` (`parseurl/index.js:54,84`) | cache keys; zero name collisions in core `incoming.js` |
| on-finished | `msg.__onFinished` (`on-finished/index.js:147`) | listener queue; created/nulled by the library |

Repro matched static prediction exactly: 404 path → `req` gains `_parsedUrl` + `__onFinished`; 500 path → `__onFinished` only; post-headersSent path → none (socket destroyed, client sees ECONNRESET).

## Dependency analysis (all 8 resolved)

| Dependency | Key observation | Outcome |
|---|---|---|
| debug@4.4.3 | import-time `enable(load())` (`common.js:287` -> `node.js:203-211`) round-trips `process.env.DEBUG` (value-preserving, verified); `defineProperty` on own fn objects | env state only — clean |
| on-finished@2.4.2 | dormant patchAssignSocket (above); `__onFinished` expando | clean (dormant code tracked) |
| parseurl@1.3.3 | req cache expandos; legacy `url.parse` consumption | clean (see parseurl audit) |
| ee-first@1.1.1 | EventEmitter listener add/remove on passed emitters | clean |
| encodeurl/escape-html/ms/statuses | pure computation / self-populating exports | clean |

## Negative sweeps (both passes, zero hits in runtime scope)

- Module-loading interception (group 5): `require.cache/extensions`, `Module._*`, `registerHooks` — zero
- Internals/bindings (group 6): `process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'` — zero
- `Error.prepareStackTrace`/`stackTraceLimit`: **zero writes trapped during require** (no depd in tree)
- No install scripts, no native code

## Node.js-change risk

Low — documented-surface only:
1. **Response lifecycle APIs** — `statusCode`/`statusMessage` writability, `setHeader`/`removeHeader`, `res.end`, `headersSent` semantics; all stable public contract.
2. **Request teardown** — `req.socket.destroy()`, `req.unpipe()`, `req.resume()`; public API.
3. **on-finished dormancy condition** — same tracking item as the send audit: if core ever left `msg.socket === undefined` on live messages, the wrapper would activate (here further contained because finalhandler never passes the response).
4. Transitive exposure to parseurl's legacy `url.parse` consumption (DEP0169) on the `req.originalUrl`/`req.url` parse path.
