# multiparty — findings detail (files, lines, issues)

Library: multiparty 4.3.1 (master @ `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d`)
Verdict: **confirmed patching** — 1 confirmed patch site (2 property writes), transitive via http-errors@2.0.0 -> depd@2.0.0, transient.

## F-001 — depd transient `Error.prepareStackTrace` + `Error.stackTraceLimit` swap

| Item | Detail |
|---|---|
| Patch site | `node_modules/depd/index.js:386` (`Error.prepareStackTrace = prepareObjectStackTrace`), `:387` (`Error.stackTraceLimit = Math.max(10, limit)`); saves `:382,:384`; restores `:395-396` |
| Trigger chain | `require('multiparty')` -> `index.js:11` `require('http-errors')` -> `http-errors/index.js:15` `require('depd')('http-errors')` -> `depd/index.js:108` `getStack()`; per-log re-fire (`depd/index.js:199`) never reached by multiparty's own 400/413/415 paths |
| Core objects mutated | global `Error` constructor — bootstrap default at `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:485-511`, impl `errors.js:168`, user hook honored `errors.js:149-151`; `stackTraceLimit` = V8 capture depth |
| Scope / persistence | process-wide while held; synchronous same-tick restore; **not exception-guarded** |
| Runtime proof | Node v24.19.0: trap recorded exactly 2 set events during require (swap + faithful restore); sentinel `stackTraceLimit=3` observed 3 at swap, 10 inside window, 3 after — transient raise proven; parse of real field+file multipart succeeded with zero steady-state diffs |
| Upstream | dougwilson/nodejs-depd#32 (maintainer keeps behavior), #36/#39 (source-maps), #50 |

## multiparty own-code core interactions (all verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 11-14 | requires: http-errors (F-001 conduit), uid-safe, core `stream`, `util` (+ `fs`, `path`, `crypto`, `string_decoder` elsewhere) | imports |
| `index.js` | Form ctor | `util.inherits(Form, stream.Writable)` + own-prototype `_write` | documented Writable subclassing (`$NODEJS_SOURCE/lib/internal/streams/writable.js:23-24`) |
| `index.js` | LimitStream | Transform subclass with own `_transform` | documented (`transform.js:162`) |
| `index.js` | 167-168 | `var state = req._readableState; if (req._decoder || (state && (state.encoding || state.decoder)))` | **private API read** (undocumented internals usage to track); no write to req anywhere |
| `index.js` | 547-559 | `self.destStream = new stream.PassThrough(); destStream.headers/name/filename/byteOffset/byteCount = ...` | additive expando metadata on library-created instance; shadows no core prototype member (runtime-verified) |
| `index.js` | upload paths | `fs.createWriteStream`, `fs.unlink`, `crypto` via uid-safe/random-bytes | documented API calls on library-created objects |

## Dependency analysis (all 9 resolved)

| Dependency | Key observation | Outcome |
|---|---|---|
| http-errors@2.0.0 | requires depd at `index.js:15` (F-001 conduit); `setprototypeof`/`inherits` on its own ctors | clean except conduit |
| depd@2.0.0 | `getStack()` swap — F-001; `wrapfunction`/`wrapproperty` have **zero call sites** in this closure | F-001 |
| safe-buffer@5.2.1 | modern branch: `module.exports = buffer` (`index.js:12-13`) — identity `=== require('buffer')` verified; legacy copy branch dead on Node ≥ 4.5 | clean (patch-avoidance shim) |
| inherits@2.0.4 | re-export of `util.inherits` under Node | clean |
| setprototypeof@1.2.0 | re-export of native `Object.setPrototypeOf` on modern Node | clean |
| uid-safe@2.1.5 / random-bytes@1.0.0 | `crypto.randomBytes` consumers | clean |
| statuses@2.0.1 / toidentifier@1.0.1 | pure data/string computation | clean |

## Negative sweeps (both passes, zero hits in runtime scope)

- Module-loading interception: `require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`
- Internals/bindings: `process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'`
- Core prototype/descriptor writes beyond ledgered library-owned sites: zero
- No install scripts, no native code, no browser-only code reachable under Node

## Node.js-change risk

1. **`Error.prepareStackTrace`/`stackTraceLimit` writability (F-001)** — identical exposure to every depd consumer: freezing/accessor-izing the property or changing callsite-array semantics breaks `require('multiparty')` at import; interacts with `--enable-source-maps` (upstream #36/#39).
2. **`req._readableState` layout (`index.js:167-168`)** — multiparty reads `state.encoding`/`state.decoder` to reject encoded request streams. These are **undocumented internals**: Node renaming/moving ReadableState fields would silently disable this corruption guard (parse would proceed on corrupted input instead of erroring early). This is the package's most concrete internals-coupling to track.
3. **Stream subclassing contract** — documented `_write`/`_transform` hooks and `emitClose` option; only a breaking change to the public extension API affects it.
