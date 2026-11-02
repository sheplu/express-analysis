# body-parser — findings detail (files, lines, issues)

Library: body-parser 2.4.0 (master @ `151a0d9e72682662fd32b439da4693b4459a70b3`)
Verdict: **confirmed patching — 1 transitive transient finding** (depd). body-parser's own code patches nothing.

## Finding F-001 — transient `Error.prepareStackTrace` / `Error.stackTraceLimit` swap (depd, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `lib/read.js` | 14 | `require('http-errors')` — the import chain that reaches depd at `require('body-parser')` |
| `node_modules/http-errors/index.js` | 15 | `var deprecate = require('depd')('http-errors')` — depd factory runs `getStack()` |
| `node_modules/depd/index.js` | 382, 384 | saves `Error.stackTraceLimit` and `Error.prepareStackTrace` |
| `node_modules/depd/index.js` | 386–387 | **writes** both globals: `Error.prepareStackTrace = prepareObjectStackTrace; Error.stackTraceLimit = Math.max(10, limit)` |
| `node_modules/depd/index.js` | 395–396 | synchronous restore of both saved values |

Node.js core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:136-161` — core consults `Error.prepareStackTrace` as a documented user-assignable customization hook.

**Issue / Node.js-change risk:**
- The restore is **not exception-safe** (no try/finally); an exception during `Error.captureStackTrace` would leave the process-global hook pointing at depd's formatter.
- Any V8/Node change that defers, caches, or snapshots `prepareStackTrace` (instead of reading it live and synchronously) would expose the swap to other consumers.
- Fires on every `require('body-parser')` and on each deprecation emission — i.e., in virtually every Express app at startup.

## body-parser's own writes (not patches)

| File | Line(s) | Write | Classification |
|---|---|---|---|
| `lib/read.js` | 53 | `req.body = undefined` | library-owned metadata key on the live req; core defines no `body` property |
| `lib/read.js` | 194 | `req.body = parse(str, encoding)` | same |

(The historical `req._body` flag no longer exists in 2.4.0.)

## Latent pattern tracked for cross-package consistency (unreachable here)

| File | Line(s) | Pattern | Why unreachable via body-parser |
|---|---|---|---|
| `node_modules/on-finished/index.js` | 189–199 (`patchAssignSocket` at :195) | instance wrapper over core `res.assignSocket` (baseline `$NODEJS_SOURCE/lib/internal/http/server.js:312`) | body-parser calls on-finished with the **request** only; IncomingMessage has no `assignSocket`; guard requires `msg.socket === undefined` (Node 0.8-era state) |

## Dependency sweep summary (all rejected)

| Dependency | Checked | Result |
|---|---|---|
| http-errors@2.0.1 | setPrototypeOf/defineProperty usage | own fresh Error instances/constructors only |
| iconv-lite@0.7.3 | Buffer/codec machinery | documented Transform subclassing; no `extendNodeEncodings` in this version |
| safer-buffer | Buffer handling | `Safer.prototype = Buffer.prototype` assigns to its own export; `process.binding('buffer')` read-only |
| raw-body | stream internals | **reads** `_readableState.encoding`/`_decoder` only |
| unpipe | listener mechanics | public `stream.unpipe()` on Node ≥ 18; `_events` untouched |
| qs + side-channel family | `__proto__`/intrinsics | anti-pollution defenses on own objects; module-local caches |
| get-intrinsic / es-* / dunder-proto | intrinsic handling | read/cache-only; `dunder-proto/set` never required |
| setprototypeof | export | native `Object.setPrototypeOf` on Node ≥ 18 |
| debug@4.4.3 | load-time env write | documented own `DEBUG` env key |
| bytes, content-type, media-typer, type-is, statuses, toidentifier, ee-first, ms, inherits | entry/init | pure; no core interaction |

Negative sweeps: no `require.cache`/`Module._*`/`require.extensions`/loader hooks, no core prototype writes, no `internalBinding`, no install scripts, no native code — across the full 39-package runtime tree.
