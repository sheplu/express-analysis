# send — findings detail (files, lines, issues)

Library: send 1.2.1 (master @ `092f3fc77f0e796519ac328c543c11cced8f2244`)
Verdict: **confirmed patching** — 1 confirmed patch site (2 property writes), transitive via http-errors@2.0.1 -> depd@2.0.0, transient.

## F-001 — depd transient `Error.prepareStackTrace` + `Error.stackTraceLimit` swap

| Item | Detail |
|---|---|
| Patch site | `node_modules/depd/index.js:386` (`Error.prepareStackTrace = prepareObjectStackTrace`), `:387` (`Error.stackTraceLimit = Math.max(10, limit)`); saves `:382,:384`; restores `:395-396` |
| Trigger chain | `require('send')` -> `index.js:15` `require('http-errors')` -> `http-errors/index.js:15` `require('depd')('http-errors')` -> `depd/index.js:108` `getStack()`; re-fires per deprecation log (`depd/index.js:199`) — send's own serve paths trigger none at this version |
| Core objects mutated | global `Error` constructor — `prepareStackTrace` (bootstrap default at `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:492-511`, impl `errors.js:168`, user hook honored at `errors.js:149-151`) and `stackTraceLimit` |
| Scope / persistence | process-wide while held; restored synchronously same tick; **not exception-guarded** |
| Runtime proof | Node v24.19.0 (both passes): accessor trap caught exactly 2 writes during `require('send')`, faithful restoration of `ErrorPrepareStackTrace`; none while serving 200/206/404 |
| Upstream | dougwilson/nodejs-depd#32 (quotes the code), #36/#50 (`--enable-source-maps` interference) |

## Dormant instance-override code (NOT active — tracked)

| Item | Detail |
|---|---|
| Site | `node_modules/on-finished/index.js:189-199` `patchAssignSocket(res, callback)` — wraps `res.assignSocket` as an own property shadowing `ServerResponse.prototype.assignSocket` (comment: "node.js 0.8 patch") |
| Why dormant | call-site guard requires `msg.socket === undefined`; core sets `this[kSocket] = null` at construction (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`) and exposes a prototype `socket` accessor (`outgoing.js:304`) returning `null` — never `undefined` — on any Node ≥ 0.10; send requires Node ≥ 18 and attaches `onFinished(res, cleanup)` at `index.js:690` to live responses |
| Runtime check | both passes confirmed no own `assignSocket` property appears on any served response |
| Risk | reactivates only if Node changed `socket` to be absent/undefined pre-assignment, or on-finished changed the guard — worth tracking, zero current effect |

## send own-code core interactions (all verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 15-25 | requires: http-errors, debug, encodeurl, escape-html, etag, fresh, mime-types, ms, on-finished, range-parser, statuses + core `fs`, `path`, `stream`, `util` | imports; depd reached via http-errors |
| `index.js` | SendStream setup | `util.inherits(SendStream, Stream)` | documented subclassing of `Stream`; core prototype untouched |
| `index.js` | throughout | `res.setHeader/getHeaderNames/removeHeader/statusCode/end`, `req` listeners, `stream.pipe/destroy/unpipe` | documented API calls / settable instance props on passed objects |
| `index.js` | 685-695 | `onFinished(res, cleanup)` + `stream.on('error', ...)` -> `stream.destroy()` | documented fs ReadStream lifecycle on library-created instance |

## Dependency analysis (all 17 resolved)

| Dependency | Key observation | Outcome |
|---|---|---|
| http-errors@2.0.1 | requires depd (F-001 conduit); builds error classes with `setprototypeof`/`inherits` on library-owned ctors | clean except conduit |
| depd@2.0.0 | `getStack()` swap — F-001; `wrapfunction`/`wrapproperty` exported but **uncalled** in this tree | F-001 |
| debug@4.4.3 | writes/deletes `process.env.DEBUG` at import (`src/node.js:203-210`); tty/env inspection | env state write, not a patch |
| on-finished@2.4.2 | dormant `patchAssignSocket` (above); `msg.__onFinished` expando queue | clean (dormant code tracked) |
| setprototypeof@1.2.0 | chooser: native `Object.setPrototypeOf` on modern Node; `__proto__`/mixin fallbacks dead | clean |
| inherits@2.0.4 | `Object.setPrototypeOf(ctor.prototype, superCtor.prototype)` on passed ctors (library-owned here) | clean |
| ee-first@1.1.1 | listener add/remove on passed emitters (documented EventEmitter API) | clean |
| etag, fresh, statuses, range-parser, encodeurl, escape-html, ms, toidentifier, mime-types, mime-db | pure computation / own exports | clean |

## Negative sweeps (both passes, zero hits in runtime scope)

- Module-loading interception: `require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`
- Internals: `process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'`
- Core prototype/descriptor writes: zero beyond ledgered library-owned sites
- No install scripts, no native code

## Node.js-change risk

1. **`Error.prepareStackTrace`/`stackTraceLimit` writability (F-001)** — same exposure as every depd consumer: freezing the property, making it an accessor, or changing callsite-array semantics breaks `require('send')` at import; `--enable-source-maps` interference already documented upstream.
2. **`res.socket === undefined` semantics (dormant C-02)** — if a future Node ever leaves `socket` undefined on fresh responses, on-finished would begin wrapping `res.assignSocket` on every tracked response (behavior change + own-property shadow). Conversely, removing `assignSocket` entirely would make the dormant path throw if ever reactivated.
3. **fs ReadStream lifecycle** — send relies on documented `createReadStream`/`destroy`/`'error'` ordering; core changes here affect streaming correctness but involve no patched surface.
