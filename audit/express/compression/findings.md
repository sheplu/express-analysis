# compression — findings detail (files, lines, issues)

Library: compression 1.8.2 (master @ `0f9707417bd53d41a319fce8bdb80dfa08b435c8`)
Verdict: **confirmed patching — instance/application overrides only** (4 active findings + 1 legacy-gated; zero shared core mutations).

## Active findings (every response through the middleware)

| ID | File | Line | Write | Shadows (core baseline) | Behavior change |
|---|---|---|---|---|---|
| F-001 | `index.js` | 101 | `res.write = function write(chunk, encoding){…}` | `OutgoingMessage.prototype.write` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1027`) | body writes diverted into zlib stream; forces `writeHead(statusCode)` if headers unsent; original saved as `_write`, used on nocompress path |
| F-002 | `index.js` | 115 | `res.end = function end(chunk, encoding){…}` | `OutgoingMessage.prototype.end` (`outgoing.js:1289`) | ends zlib stream instead; real `end` deferred to stream completion; **core end-callback arg not forwarded on compressed path** |
| F-003 | `index.js` | 142 | `res.on = function on(type, listener){…}` | `EventEmitter.prototype.on/addListener` (`$NODEJS_SOURCE/lib/events.js:615-619`) | intercepts only `'drain'` listeners, re-targets them to the compression stream; others delegated to saved `_on` |
| F-004 | `node_modules/on-headers/index.js` | 71 | `res.writeHead = createWriteHead(res.writeHead, listener)` (installed from `index.js:174`) | `ServerResponse.prototype.writeHead` (`$NODEJS_SOURCE/lib/internal/http/server.js:423`) | one-shot pre-headers hook: converts writeHead args to `setHeader`/`appendHeader`, runs compression's filter/vary/encoding logic, then delegates. Also intercepts core's internal `_implicitHeader` since core dispatches via `this.writeHead` (`server.js:419-421`) |

All four are **own-property writes on the live instance**; prototypes are never touched (verified by identity/descriptor snapshots at runtime, both passes).

## Legacy-gated finding (unreachable on Node ≥ 10.15.1)

| ID | File | Line(s) | Write | Gate |
|---|---|---|---|---|
| F-005 | `node_modules/destroy/index.js` | 84–87 | replaces errored zlib stream's `_binding`/`_handle` with a fake `{close(){…}}` | only when `stream._hadError === true` with legacy `_binding`/`_handle` layout |
| | | 112–119 | `stream._needDrain = true` / `stream._binding.clear()` | Node < 0.10 branch (`stream._binding` truthy) |
| | | 126 | `stream.destroyed = true` before `close()` | Node 7/8 branch (`_destroy` missing/inherited) |
| | | 195–197 | `onDrainClearBinding`: `this._binding.clear()` | Node < 0.10 drain path |

On the audited baseline, `destroyZlibStream` takes the `stream._destroy !== Stream.Transform.prototype._destroy` branch → plain documented `stream.destroy()` (modern zlib owns `_destroy`, `$NODEJS_SOURCE/lib/zlib.js:529`). The core memory-leak PR the workaround cites (nodejs/node#23734) is **closed-unmerged**. `isZlibStream` omits brotli classes, so brotli streams never reach these branches on any Node version.

## Library-owned addition (not a patch)

- `index.js:93` — `res.flush = flush`: **new** method; baseline `OutgoingMessage.prototype` has no `flush` (only `flushHeaders`), so nothing is shadowed or overridden.

## Rejected candidates

| Site | Why rejected |
|---|---|
| safe-buffer | re-exports core `buffer` unmodified on modern Node |
| debug@2.6.9 | `process.env.DEBUG` write (documented), `process.binding('tty_wrap')` **read**, self-created-stream mutation behind deprecated `DEBUG_FD` |
| vary | documented `setHeader('Vary', …)` |
| bytes, ms, mime-db, compressible, negotiator | pure data/parsing, no core objects touched |
| destroy error-suppression | branch never activated by compression's call pattern |

Negative sweeps (both passes): no `require.cache`/`Module._*`/`require.extensions`, no `setPrototypeOf`/`__proto__`/`defineProperty` on core objects, no global/globalThis writes, no `internalBinding`, no install scripts, no native code.

## Node.js-change risk

1. **`this.writeHead` dispatch** — core's `_implicitHeader` calling through the instance (`server.js:419-421`) is what makes on-headers work. A core change to call `ServerResponse.prototype.writeHead` directly (or cache it) silently disables compression's header negotiation.
2. **Instance-shadowing semantics** — freezing/sealing res, or core moving `write`/`end`/`on` dispatch to private fields/internal slots, breaks F-001–F-003.
3. **zlib `_destroy` identity** — if zlib ever stops defining its own `_destroy` (or the Transform prototype comparison changes), destroy@1.2.0 would fall into the Node-7/8 branch (`destroyed = true` + `close()`) on modern Node.
4. **`end` callback contract** — compressed path drops the `end(chunk, encoding, callback)` callback; a core change relying on callback invocation ordering would surface latent bugs here.
