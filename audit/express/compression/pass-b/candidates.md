# Candidate ledger — compression@1.8.2 monkeypatch audit (pass-b)

Every candidate site surfaced by the searches in `searches.md`, with the exact
object/key written, status, and reason. Paths are `$PACKAGE_ROOT`-relative;
core baselines are `$NODEJS_SOURCE`-relative at commit d44625a4b80.

## Confirmed (4 — all instance/application overrides; 0 shared core mutations)

| ID | Site | What it writes/modifies | Status | Detail |
| --- | --- | --- | --- | --- |
| C-002 | `index.js:101` | Own property `write` on the live `http.ServerResponse` instance, shadowing `OutgoingMessage.prototype.write` (`lib/internal/http/outgoing.js:1027`) | confirmed -> F-001 | Original saved as `_write` (`index.js:90`) and invoked (`index.js:112`, `index.js:251`). Activation: every request through the middleware. No restoration; instance-scoped. Redirects body writes into the zlib stream once created. |
| C-003 | `index.js:115` | Own property `end` on the instance, shadowing `OutgoingMessage.prototype.end` (`outgoing.js:1289`) | confirmed -> F-002 | Original saved as `_end` (`index.js:88`), invoked (`index.js:130`, `index.js:257`). Ends the zlib stream instead of the response when compressing; real end deferred to stream `'end'`. Instance-scoped, permanent. |
| C-004 | `index.js:142` | Own property `on` on the instance, shadowing `EventEmitter.prototype.on` (`lib/events.js:615-619`) | confirmed -> F-003 | Original saved as `_on` (`index.js:89`), invoked (`index.js:144,159,169,260`). Diverts only `'drain'` listeners to the zlib stream (buffered until created); `nocompress()` replays buffered listeners via `_on` but the own property persists. |
| C-008 | `node_modules/on-headers/index.js:71` (called from `index.js:174`) | Own property `writeHead` on the instance, wrapping the previous `writeHead` (`ServerResponse.prototype.writeHead`, `lib/internal/http/server.js:423-424`) | confirmed -> F-004 | Transitive (compression -> on-headers@1.1.0). Wrapper (`on-headers/index.js:30-52`) saves `prevWriteHead`, re-dispatches header args through `setHeader`/`appendHeader`, fires the listener once, then calls the original. Intercepts core's `_implicitHeader` path (`server.js:419-421`) because core dispatches via `this.writeHead`. Instance-scoped, permanent. |

## Rejected (17)

| ID | Site | What it writes/modifies | Status | Reason |
| --- | --- | --- | --- | --- |
| C-001 | `index.js:93` | Own property `flush` (new function) on the response instance | rejected | No `flush` on baseline `OutgoingMessage` (only `flushHeaders`, `outgoing.js:1461`; repro confirms absence) — library-owned method, not an override. Historical note: shadowed deprecated `OutgoingMessage.prototype.flush` on Node < 13 (DEP0001). |
| C-005 | `index.js:343-347` | Nothing — reads `res.headersSent` / falls back to reading `res._header` | rejected | Read-only; `headersSent` is the documented getter (`outgoing.js:1007`); `_header` read is legacy private-API fallback. |
| C-006 | `index.js:107`, `index.js:126` | Nothing — calls `this.writeHead(this.statusCode)` | rejected | Documented API invocation (goes through the C-008 wrapper). |
| C-007 | `index.js:63`, `index.js:69` | `Object.assign` onto `optsBrotli`/`brotliParams` | rejected | Library-local option objects only. |
| C-009 | `node_modules/on-headers/index.js:19-20` | Nothing — reads `http.ServerResponse.prototype.appendHeader` for feature detection at require time | rejected | Read-only prototype access; selects `set1dArrayWithAppend` vs `set1dArrayWithSet`. |
| C-013 | `node_modules/destroy/index.js:44-47` | `stream.removeAllListeners('error')` + noop `'error'` listener | rejected | Documented EventEmitter API; inactive in this package — compression calls `destroy(stream)` with no `suppress` arg (`index.js:171`, `index.js:237`). |
| C-014 | `node_modules/destroy/index.js:59-66` | `stream.on('open', onOpenClose)` on fs.ReadStream | rejected | fs.ReadStream path never reached from compression (only zlib streams passed); documented API. |
| C-015 | `node_modules/debug/src/node.js:248` -> `src/debug.js:138-139` -> `src/node.js:139-147` | `process.env.DEBUG` (assign or delete) at require time | rejected | `process.env` is documented-mutable; write-back is idempotent (`enable(load())` re-saves the value it just read, or deletes an already-absent key). Not a core API/prototype/global-function mutation. |
| C-016 | `node_modules/debug/src/node.js:169` | Nothing — `process.binding('tty_wrap')` read | rejected | Deprecated private binding, read-only; reached only when `DEBUG_FD` env var is set to an fd other than 1/2 (deprecated path, `node.js:61-69`). |
| C-017 | `node_modules/debug/src/node.js:204-205` | `stream.readable = false; stream.read = null` on a `net.Socket` | rejected | The socket is created by debug itself for its private log stream (`createWritableStdioStream`); mirrors Node's own historical bootstrap code; never touches an application- or core-shared object. Opt-in via deprecated `DEBUG_FD` pointing at a PIPE/TCP fd. |
| C-018 | `node_modules/debug/src/node.js:186-188` | Nothing mutated — constructs `fs.SyncWriteStream` | rejected | Removed core internal (DEP0061); would throw on modern Node; private API use on the deprecated `DEBUG_FD` FILE path, no core write. |
| C-019 | `node_modules/debug/src/node.js:176,206,221-223` | `stream._type`, `stream.fd`, `stream._isStdio` on debug's own stream | rejected | Property additions on a library-owned instance. |
| C-020 | `node_modules/safe-buffer/index.js:12-18,24,27` | `module.exports = buffer` (modern) / `copyProps(buffer, exports)`, `SafeBuffer.prototype = Object.create(Buffer.prototype)`, `copyProps(Buffer, SafeBuffer)` (legacy) | rejected | All writes target safe-buffer's own exports/constructor; the core `buffer` module object is re-exported unmutated (repro: `safeBufferIsCoreBufferModule: true`, own-property set of the module unchanged). |
| C-021 | `node_modules/vary/index.js:134-147` | Response header state via `res.getHeader`/`res.setHeader('Vary', ...)` | rejected | Documented response API; header data, not core behavior. |
| C-022a | `node_modules/debug/src/debug.js:9-29,117-124,141-142` | debug's own exports (`names`, `skips`, `formatters`, per-instance `debug.*` props) | rejected | Library-owned objects only; `exports.formatters.o`/`.O` (`src/node.js:85-100`) also library-owned. |
| C-022b | `node_modules/negotiator/index.js:35` | `this.request = request` on a Negotiator instance | rejected | Stores a reference to `req`; read-only use of `req.headers` (`index.js:44,53,62`); no write to the request. |
| C-022c | bytes@3.1.2, compressible@2.0.18, mime-db@1.54.0, ms@2.0.0, negotiator lib/* | — | rejected — no candidate writes | Pure computation/data modules; all six pattern sets negative (see searches.md). |

## Legacy-guarded instance-state writes (rejected as reachable patches on the baseline; would activate only on Node <= 8)

| ID | Site | What it writes/modifies | Status | Detail |
| --- | --- | --- | --- | --- |
| C-010 | `node_modules/destroy/index.js:112-119` | On a zlib stream instance: `stream._needDrain = true`; `stream._binding.clear()`; `once('drain', onDrainClearBinding)` (`:195-197`) | rejected as reachable patch | Guard: `stream._binding` truthy — Node < 0.10 zlib internals. Baseline zlib streams (`lib/zlib.js`) have no `_binding`; branch is dead on all modern Node. |
| C-011 | `node_modules/destroy/index.js:124-127` | `stream.destroyed = true` then `stream.close()` on a zlib stream instance | rejected as reachable patch | Guard chain: reached only when `stream._destroy` exists AND equals `Stream.Transform.prototype._destroy` (Node 7/8). On baseline `ZlibBase` defines its own `_destroy` (`lib/zlib.js:529`), so `destroy/index.js:121-123` matches first and calls documented `stream.destroy()`. Note `isZlibStream` (`:172-180`) omits `BrotliCompress`, so brotli streams always take the plain `hasDestroy` -> `stream.destroy()` path (`:40-42`). |
| C-012 | `node_modules/destroy/index.js:78-89` | Replaces `stream._binding` or `stream._handle` with a fake `{ close() { this[prop] = null } }` object before `stream.close()` | rejected as reachable patch | Guard: `typeof stream.destroy !== 'function'` (Node < 8) AND `stream._hadError === true`. Unreachable on baseline; on affected legacy runtimes this swaps a core-internal native-handle field on the instance to neutralize a buggy `close()`. |

## Unresolved

None.
