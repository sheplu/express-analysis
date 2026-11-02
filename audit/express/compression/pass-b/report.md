# Node.js patch audit: compression

- Verdict: confirmed patching (instance/application overrides only; no shared core mutation)
- Status: complete
- Input: npm package `compression` (Node.js compression middleware), local source at `$PACKAGE_ROOT`
- Library: compression 1.8.2, git commit 0f9707417bd53d41a319fce8bdb80dfa08b435c8 of https://github.com/expressjs/compression (branch master), source checkout with runtime dependencies installed at `$PACKAGE_ROOT/node_modules` (`--ignore-scripts --omit=dev`), no local modifications observed
- Node.js baseline: `$NODEJS_SOURCE` main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Reproduction runtime: Node.js v24.19.0 (`node repro.js "$PACKAGE_ROOT"`, output in `repro-output.json`)
- Scope: runtime only — `$PACKAGE_ROOT/index.js` plus resolved runtime dependencies bytes@3.1.2, compressible@2.0.18, debug@2.6.9 (+ ms@2.0.0), destroy@1.2.0, mime-db@1.54.0, negotiator@0.6.4, on-headers@1.1.0, safe-buffer@5.2.1, vary@1.1.2. Tests, examples, docs out of scope.
- Coverage: full source coverage of the runtime scope (all shipped runtime .js files read); upstream advisories/PRs corroborated read-only via the GitHub API; reproduction executed on Node v24.19.0. Legacy Node (< 10) branches were analyzed statically only (see limitations).

## Patching verdict

**Confirmed patching — 4 instance/application overrides; 0 shared core mutations; 0 core module-loading interceptions; 0 core source rewrites.**

compression does not mutate any Node.js prototype, global, core module object, or module loader. What it does — on every request that passes through the middleware — is shadow core HTTP/stream methods with own properties on the live `ServerResponse` instance: `res.write`, `res.end`, and `res.on` directly (F-001..F-003), and `res.writeHead` transitively through on-headers@1.1.0 (F-004). Each override saves and ultimately invokes the original core function and is scoped to the single response instance; the shared prototypes (`OutgoingMessage.prototype`, `ServerResponse.prototype`, `EventEmitter.prototype`) were verified identical before/after require and after a full compressed request.

Three origins are direct (`$PACKAGE_ROOT/index.js`); one is transitive (compression -> on-headers@1.1.0). The on-headers override is notable because Node core itself dispatches through the instance property (`ServerResponse.prototype._implicitHeader` calls `this.writeHead(...)`), so the wrapper intercepts a core-internal code path for that response.

Dependency destroy@1.2.0 additionally ships version-guarded writes to core-internal zlib stream state (`_binding`/`_handle` replacement, `destroyed = true`, `_needDrain = true`) that are statically unreachable on the Node.js baseline (modern `zlib` defines its own `_destroy`, so the plain `stream.destroy()` branch is taken); they would activate only on Node <= 8 runtimes and are kept out of the confirmed findings (see supporting context, C-010..C-012). No other unresolved candidates remain.

## Confirmed Node.js patches

### F-001: `res.write` — per-instance shadow of `OutgoingMessage.prototype.write`

- Category: instance/application override (core-backed `http.ServerResponse` instance)
- Library site(s): `$PACKAGE_ROOT/index.js:101` (original saved at `index.js:90`, invoked at `index.js:112` and `index.js:251`) — https://github.com/expressjs/compression/blob/0f9707417bd53d41a319fce8bdb80dfa08b435c8/index.js#L101
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1027` (`OutgoingMessage.prototype.write`, commit d44625a4b80) — writes body data to the outgoing HTTP message
- Exact mutation: assignment of own property `write` on the response instance (`res.write = function write (chunk, encoding) {...}`), shadowing the prototype method; prototype untouched
- Execution chain: `require('compression')(opts)` -> returned middleware `(req, res, next)` -> assignment before `next()`
- Activation: unconditional on every request handled by the middleware; production path
- Scope and restoration: single response instance; never removed — the saved `_write` is used internally, but the own property persists for the life of the response
- Resulting behavior: after the compression stream exists, application `res.write()` calls are redirected into the zlib stream (`stream.write(toBuffer(...))`) instead of the socket; compressed output is forwarded to the real socket via `_write.call(res, chunk)`; writes after end return `false`; implicit `writeHead(statusCode)` is forced before first write
- Evidence: static read of `index.js:88-113, 250-254`; reproduction `repro-output.json` (`post.writeOwnOverride: true`, `afterRequest.protoWriteSame: true`)
- Upstream: long-standing design of expressjs/compression (method-proxy middleware pattern); no core accommodation involved

### F-002: `res.end` — per-instance shadow of `OutgoingMessage.prototype.end`

- Category: instance/application override (core-backed `http.ServerResponse` instance)
- Library site(s): `$PACKAGE_ROOT/index.js:115` (original saved at `index.js:88`, invoked at `index.js:130` and `index.js:257`) — https://github.com/expressjs/compression/blob/0f9707417bd53d41a319fce8bdb80dfa08b435c8/index.js#L115
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289` (`OutgoingMessage.prototype.end`) — finalizes the outgoing message
- Exact mutation: assignment of own property `end` on the response instance, shadowing the prototype method
- Execution chain: middleware `(req, res, next)` -> assignment before `next()`
- Activation: unconditional on every request handled by the middleware; production path
- Scope and restoration: single response instance; never removed
- Resulting behavior: when compressing, `res.end(chunk)` ends the zlib stream instead of the response; the real response is ended only from the stream's `'end'` event via `_end.call(res)` (`index.js:256-258`); content length is estimated for the threshold check; repeated end returns `false`
- Evidence: static read of `index.js:115-140, 256-258`; reproduction (`post.endOwnOverride: true`, prototypes unchanged)
- Upstream: same as F-001

### F-003: `res.on` — per-instance shadow of `EventEmitter.prototype.on`

- Category: instance/application override (core-backed `http.ServerResponse` instance)
- Library site(s): `$PACKAGE_ROOT/index.js:142` (original saved at `index.js:89`, invoked at `index.js:144`, `index.js:159` via `addListeners`, `index.js:169`, `index.js:260`) — https://github.com/expressjs/compression/blob/0f9707417bd53d41a319fce8bdb80dfa08b435c8/index.js#L142
- Origin: direct
- Core baseline: `$NODEJS_SOURCE/lib/events.js:615-619` (`EventEmitter.prototype.on = EventEmitter.prototype.addListener`) — registers listeners on the emitter
- Exact mutation: assignment of own property `on` on the response instance, shadowing the inherited EventEmitter method
- Execution chain: middleware `(req, res, next)` -> assignment before `next()`
- Activation: unconditional on every request handled by the middleware; production path
- Scope and restoration: single response instance; partial functional restoration — when compression is skipped, `nocompress()` (`index.js:157-161`) replays buffered listeners through the original `_on`, but the own property itself remains in place
- Resulting behavior: only `'drain'` registrations are intercepted — they are buffered until the compression stream exists and then attached to the zlib stream instead of the response, so backpressure signaling follows the compressed pipeline; all other event types pass through to the original `on`
- Evidence: static read of `index.js:142-155, 157-161, 242-243`; reproduction (`post.onOwnOverride: true`, `EventEmitter.prototype.on` identity preserved)
- Upstream: same as F-001

### F-004: `res.writeHead` — per-instance wrapper via on-headers@1.1.0

- Category: instance/application override (core-backed `http.ServerResponse` instance), transitive
- Library site(s): `$PACKAGE_ROOT/node_modules/on-headers/index.js:71` (`res.writeHead = createWriteHead(res.writeHead, listener)`), wrapper at `node_modules/on-headers/index.js:30-52`; installed from `$PACKAGE_ROOT/index.js:174` (`onHeaders(res, onResponseHeaders)`) — https://github.com/expressjs/on-headers/blob/v1.1.0/index.js#L71
- Origin: compression -> on-headers@1.1.0
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/server.js:423-424` (`ServerResponse.prototype.writeHead`); `$NODEJS_SOURCE/lib/internal/http/server.js:419-421` (`_implicitHeader` dispatches through `this.writeHead(this.statusCode)`, i.e. through the instance property)
- Exact mutation: assignment of own property `writeHead` on the response instance with a closure wrapper that captures the previous `writeHead` (`prevWriteHead`) and the listener
- Execution chain: middleware -> `onHeaders(res, listener)` -> `createWriteHead` -> instance assignment. Fired by any `res.writeHead(...)` call — application code, compression's own forced calls (`index.js:107`, `index.js:126`), or Node core's implicit-header path (`_implicitHeader`), since core reads `this.writeHead` off the instance
- Activation: unconditional on every request handled by the middleware; production path
- Scope and restoration: single response instance; permanent for the response — the wrapper remains and delegates to `prevWriteHead` after firing once
- Resulting behavior: before headers are written, headers passed as `writeHead` arguments are re-dispatched through `setHeader`/`appendHeader` (`on-headers/index.js:119-146, 158-180`) and `statusCode` is applied early, then compression's `onResponseHeaders` listener (`index.js:174-263`) runs and may mutate the response (adds `Vary: Accept-Encoding`, sets `Content-Encoding`, removes `Content-Length`, creates the zlib stream) before the original core `writeHead` executes. This changes observable semantics of a core method for that instance (header normalization order; a pre-1.1.0 bug in exactly this wrapper caused CVE-2025-7339)
- Evidence: static read of `on-headers/index.js` and `index.js:174-263`; reproduction (`post.writeHeadOwnOverride: true`, wrapper keeps core name `writeHead`, `ServerResponse.prototype.writeHead` identity preserved)
- Upstream: GHSA-76c9-3jph-rj3q / CVE-2025-7339 (on-headers < 1.1.0, header manipulation in this wrapper; fixed in the audited 1.1.0 — compression 1.8.1 changelog pins it); compression 1.8.0 changelog: "Replace `_implicitHeader` with `writeHead` property"

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `index.js:93` `res.flush = ...` | rejected as patch | No `flush` on baseline `OutgoingMessage` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js` defines only `flushHeaders`, :1461; repro `outgoingHasFlushMethod: false`): library-owned new method. Note: on Node < 13 (DEP0001 era) this shadowed the deprecated core alias `OutgoingMessage.prototype.flush` |
| C-002 | `index.js:101` `res.write = ...` | confirmed -> F-001 | Own-property shadow of `outgoing.js:1027` |
| C-003 | `index.js:115` `res.end = ...` | confirmed -> F-002 | Own-property shadow of `outgoing.js:1289` |
| C-004 | `index.js:142` `res.on = ...` | confirmed -> F-003 | Own-property shadow of `events.js:619` |
| C-005 | `index.js:343-347` reads `res._header` | rejected as patch | Read-only private-state fallback for legacy Node without boolean `headersSent`; baseline has `headersSent` getter (`outgoing.js:1007`), `_header` plain internal field (`outgoing.js:188`) |
| C-006 | `index.js:107,126` `this.writeHead(this.statusCode)` | rejected as patch | Documented API call (triggers F-004 wrapper, no write) |
| C-007 | `index.js:63,69` `Object.assign` on options | rejected as patch | Mutates local library objects only |
| C-008 | `node_modules/on-headers/index.js:71` `res.writeHead = createWriteHead(...)` | confirmed -> F-004 | Instance wrapper over `server.js:423`; intercepts core `_implicitHeader` dispatch (`server.js:419-421`) |
| C-009 | `node_modules/on-headers/index.js:19` reads `http.ServerResponse.prototype.appendHeader` | rejected as patch | Read-only feature detection at require time; no write |
| C-010 | `node_modules/destroy/index.js:112-119` `stream._needDrain = true`; `stream._binding.clear()` | rejected as reachable patch (legacy-only instance write) | Guarded on `stream._binding` (Node < 0.10 zlib); baseline zlib streams have no `_binding`; unreachable on baseline and any supported modern Node |
| C-011 | `node_modules/destroy/index.js:126` `stream.destroyed = true` | rejected as reachable patch (legacy-only instance write) | Node 7/8 branch; on baseline `ZlibBase` defines own `_destroy` (`$NODEJS_SOURCE/lib/zlib.js:529`), so the `stream._destroy !== Stream.Transform.prototype._destroy` branch (`destroy/index.js:121-123`) matches first and calls documented `stream.destroy()` |
| C-012 | `node_modules/destroy/index.js:78-89` replace `stream._binding`/`stream._handle` with fake `{close}` | rejected as reachable patch (legacy-only instance write) | Only when `typeof stream.destroy !== 'function'` (Node < 8) and `_hadError`; unreachable on baseline |
| C-013 | `node_modules/destroy/index.js:44-47` `removeAllListeners('error')` + noop listener | rejected as patch | Documented EventEmitter API; inactive here — compression calls `destroy(stream)` without `suppress` (`index.js:171,237`) |
| C-014 | `node_modules/destroy/index.js:59-66` fs.ReadStream `'open'`-close workaround | rejected as patch | Not activated by compression (zlib streams only); documented API calls on the passed instance |
| C-015 | `node_modules/debug/src/node.js:248` -> `debug.js:138-139` -> `node.js:139-147` writes/deletes `process.env.DEBUG` at require time | rejected as patch | `process.env` is a documented mutable object; write-back is idempotent (re-saves the value just loaded); not a core API/prototype mutation |
| C-016 | `node_modules/debug/src/node.js:169` `process.binding('tty_wrap')` | rejected as patch | Read-only deprecated private binding access; only when `DEBUG_FD` set to fd other than 1/2 (deprecated path) |
| C-017 | `node_modules/debug/src/node.js:204-205` `stream.readable = false; stream.read = null` on a `net.Socket` | rejected as patch | Socket is created by debug for its own logging (library-owned instance, never shared); code copied from Node's own bootstrap; activates only with `DEBUG_FD` naming a PIPE/TCP fd |
| C-018 | `node_modules/debug/src/node.js:186-188` `new fs.SyncWriteStream(fd, ...)` | rejected as patch | Use of removed core internal (DEP0061) — would throw on modern Node; private API usage on deprecated `DEBUG_FD`-file path, no core write |
| C-019 | `node_modules/debug/src/node.js:176,206,221-223` `stream._type`/`stream.fd`/`stream._isStdio` | rejected as patch | Property additions on debug's own stream instance |
| C-020 | `node_modules/safe-buffer/index.js:12-18` | rejected as patch | Modern branch re-exports the core `buffer` module object unmutated (repro: `safeBufferIsCoreBufferModule: true`, module property set unchanged); legacy branch copies core props onto its own exports and subclasses via `Object.create(Buffer.prototype)` — no write to core |
| C-021 | `node_modules/vary/index.js:140-147` `res.getHeader`/`res.setHeader('Vary', ...)` | rejected as patch | Documented response API; mutates header state, not core behavior |
| C-022 | bytes@3.1.2, compressible@2.0.18, mime-db@1.54.0, ms@2.0.0, negotiator@0.6.4 (entry + lib/*) | rejected — no candidates | Pure computation/data; only core interaction is reading `req.headers` (negotiator); all pattern searches negative |

No unresolved candidates remain.

## Supporting context

- **destroy@1.2.0 legacy zlib teardown (C-010..C-012):** shipped runtime code contains writes to core-internal zlib stream instance state (fake `_binding`/`_handle` object, `destroyed = true`, `_needDrain = true`) as documented workarounds for old core bugs. On the audited baseline (and any Node >= 10.15.1/11.1/12), `destroyZlibStream` reduces to the documented `stream.destroy()` because `ZlibBase` defines its own `_destroy` (`$NODEJS_SOURCE/lib/zlib.js:524-533`). `isZlibStream` (`destroy/index.js:172-180`) does not match `BrotliCompress`, so brotli streams always take the plain `stream.destroy()` path. The comment at `destroy/index.js:99` cites nodejs/node#23734 ("zlib: do not leak on destroy") — that PR is closed unmerged; the leak was resolved by later zlib refactoring, which is why the modern branch needs no workaround.
- **compression 1.8.2 close handling:** `index.js:169-172` registers a `'close'` listener (via the saved original `_on`) that calls `destroy(stream)` to free native zlib resources on premature client disconnect — the fix for CVE-2026-87776 / GHSA-vc2v-76pw-4v95. It uses documented listener registration plus the destroy paths above; no core mutation.
- **`res.flush` (C-001):** a library-owned convenience that flushes the zlib stream. On Node < 13 it shadowed the deprecated `OutgoingMessage.prototype.flush` alias (DEP0001); on the baseline no such core method exists, so this is an extension, not an override.
- **Private API reads:** `res._header` fallback in `headersSent()` (`index.js:343-347`) and debug's `process.binding('tty_wrap')`/`fs.SyncWriteStream` on the deprecated `DEBUG_FD` path are private/removed API usage, read-only or library-local — no core object is modified.
- **Copied core code:** `debug/src/node.js:167-226` (`createWritableStdioStream`) is a standalone copy of Node's historical bootstrap stdio setup; it builds debug's own stream and replaces nothing in core.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime file inventory | `find node_modules -type f \( -name '*.js' -o -name '*.json' \)` + `package.json` reads | 10 runtime deps, flat tree, entrypoints identified; full file list in searches.md |
| `$PACKAGE_ROOT` candidate patterns | `rg -n --no-ignore` over index.js + node_modules with the skill's 6 pattern sets | All hits triaged in candidates.md; module-interception and binding patterns negative except debug `process.binding` (C-016) |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | targeted `rg`/reads at d44625a4b80 | `write` :1027, `end` :1289, `headersSent` getter :1007, `flushHeaders` :1461, no `flush`; `_header` plain field :188/:636 |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | targeted reads :415-425 | `writeHead` :423-424; `_implicitHeader` :419-421 dispatches via `this.writeHead` (instance property) — F-004 interception path |
| `$NODEJS_SOURCE/lib/events.js` | targeted `rg` | `EventEmitter.prototype.on = addListener` :615-619 — F-003 baseline |
| `$NODEJS_SOURCE/lib/zlib.js` | targeted reads :520-545 | `ZlibBase` own `close` :524 and `_destroy` :529 — proves destroy@1.2.0 takes documented branch on baseline; `Gzip` :906, `BrotliCompress` :1046 |
| Reproduction | `node repro.js "$PACKAGE_ROOT"` (Node v24.19.0), `repro-output.json` | Shared prototypes and `buffer` module identical before/after require and after a gzip-compressed request; own-property overrides `write`/`end`/`on`/`writeHead` + new `flush` present on the live response |
| nodejs/node PR 23734 | https://github.com/nodejs/node/pull/23734 (GitHub API, read-only) | "zlib: do not leak on destroy" — closed, NOT merged; referenced by `destroy/index.js:99`; context for legacy branches only |
| on-headers advisory | https://github.com/expressjs/on-headers/security/advisories/GHSA-76c9-3jph-rj3q (CVE-2025-7339, < 1.1.0) | Confirms the writeHead wrapper materially alters core method semantics; audited 1.1.0 contains the fix (setHeader/appendHeader re-dispatch) |
| compression advisory | https://github.com/expressjs/compression/security/advisories/GHSA-vc2v-76pw-4v95 (CVE-2026-87776, < 1.8.2) | Motivation for the 1.8.2 `'close'` -> `destroy(stream)` handler at `index.js:169-172` |
| `$PACKAGE_ROOT/HISTORY.md` | local read | 1.8.2/1.8.1/1.8.0 entries corroborate destroy addition, on-headers 1.1.0 pin, and `_implicitHeader` -> `writeHead` switch |

File hashes (SHA-256, `$PACKAGE_ROOT`-relative):

```
332fbd6dca91e7a8937398dabf967df2d66e53908a1174a648860346fff40c61  index.js
76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856  node_modules/on-headers/index.js
b54f50db059987726ce2bdadca5d66a1e3ceef183aa5f43ce61aa53f05c36cb7  node_modules/destroy/index.js
a3e83594a4ce88997e2e4fc66bc942b17b9d736290ad62560c7f09d6d0989ad0  node_modules/debug/src/node.js
d8d1c1d6c387ab67c3f28d78fd0b20b9becd69442db9d3efe110ca464b509c8a  node_modules/debug/src/debug.js
184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1  node_modules/safe-buffer/index.js
8e40311960636d40473c57e335bbca115036766bf150df296b941256432ab410  node_modules/vary/index.js
893fcbbbe962dc00e40dc2e4b20e76e92d874dd257345003c6575d940e91a37f  node_modules/bytes/index.js
95c3bfff3e8e1719d93c7784adb4f24dc1ed3371ac2446067a58717bd9ad8bcd  node_modules/compressible/index.js
2e01e2337b17fb2036c1cd4e43832370510950f0cfdfbab63d67877879c542ae  node_modules/negotiator/index.js
4bd92209cb9dacf3e3773e725acb7aaec43ea9e78540324e4d0f73e5ce9adef7  node_modules/ms/index.js
2ccebf3d525708c915c6a86ffbb68e5023d34c9bc30b6b4021db9ebbc6ca9ecc  node_modules/mime-db/index.js
```

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (sole shipped runtime file per `package.json` `files`); every resolved runtime dependency's entrypoint and all transitive runtime files were read (`debug/src/index.js` -> `node.js`/`debug.js`; `debug/src/browser.js` reviewed, Electron-renderer-only; `debug/src/inspector-log.js` not reachable from any entry; `negotiator/lib/*` read via searches; `mime-db` is JSON data).
- Node.js baseline files read (targeted only): `lib/http.js` (exports), `lib/internal/http/server.js` (writeHead/_implicitHeader, internal `res.on`/`res.end` call sites), `lib/internal/http/outgoing.js` (write/end/headersSent/_header/flushHeaders), `lib/events.js` (on/addListener), `lib/zlib.js` (close/_destroy/class table), `lib/internal/streams/destroy.js` (dispatch to `_destroy`). No recursive scan of the Node tree was performed.
- Branches tested: modern Node (v24.19.0) gzip path end-to-end. Branches analyzed statically only: brotli stream teardown (same code shape, `hasDestroy` path), no-compression (`nocompress`) listener replay, legacy destroy@1.2.0 branches for Node <= 8 / < 0.10 (unreachable on baseline; would be additional instance-level private-state writes on those runtimes), debug `DEBUG_FD` non-stderr paths (deprecated, partially broken on modern Node), safe-buffer legacy copy branch (pre-`Buffer.from` Node). A tested branch cannot prove universal absence on untested legacy runtimes.
- The verdict would change to include additional instance-state writes (destroy C-010..C-012) only if the audit baseline were a Node <= 8 runtime; it would change to "shared core mutation" only if some write targeted a prototype/global, and none was found.
- Provenance: compression repo at commit 0f9707417bd53d41a319fce8bdb80dfa08b435c8 (v1.8.2); Node.js at d44625a4b80c672215b469906ce583ce7eeeebaf; dependency file hashes above.

## Changes since the previous audit

First audit (independent pass-b); no previous report at this path.
