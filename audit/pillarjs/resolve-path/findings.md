# resolve-path — findings detail (files, lines, issues)

Library: resolve-path 1.4.0 (master @ `4b98ecfd39a342fbf8b909844a9ec13fe2fa8cc5`)
Verdict: **confirmed patching** — 2 confirmed patch sites (transient), transitive via http-errors@1.6.3 -> **depd@1.1.2** (the old 1.x line, larger patch surface than depd 2.x).

## F-001 — depd `getStack()` transient `Error.prepareStackTrace` + `stackTraceLimit` swap

| Item | Detail |
|---|---|
| Patch site | `node_modules/depd/index.js:370` (`Error.prepareStackTrace = prepareObjectStackTrace`), `:371` (`Error.stackTraceLimit = Math.max(10, limit)`); saves `:366,:368`; restores `:379-380` |
| Trigger chain | `require('resolve-path')` -> http-errors -> `http-errors/index.js:15` `require('depd')('http-errors')` -> `depd/index.js:110` `getStack()`; **and** `http-errors/index.js:247-248` `deprecate.function(exports.ImATeapot, ...)` -> `depd/index.js:404` `getStack()` — i.e. twice at import; plus per deprecation log |
| Core objects mutated | global `Error` constructor (bootstrap default hook `$NODEJS_SOURCE/lib/internal/errors.js:136-166`) |
| Scope / persistence | process-wide while held; synchronous restore; not exception-guarded |
| Runtime proof | Node v24.19.0: accessor spy — 3 swap/restore pairs total at require (2 from this site), 0 during exercising, full restoration |

## F-002 — depd compat lazy `callSiteToString` detection swap (limit = 2)

| Item | Detail |
|---|---|
| Patch site | `node_modules/depd/lib/compat/index.js:30` (`Error.prepareStackTrace = prepareObjectStackTrace`), `:31` (`Error.stackTraceLimit = 2`); saves `:22,:24`; restores `:39-40`; lazy property defined `:21` |
| Trigger chain | `depd/index.js:11` `require('./lib/compat').callSiteToString` — the lazy getter materializes at depd load (once per process on this chain) |
| Distinctive effect | capture depth **clamped to 2** within the window (vs raised ≥ 10 in F-001); a same-tick concurrent capture would see a truncated callsite-array stack |
| Note | the compat module does not exist in depd 2.x — this finding is unique to the old dep generation |

## Import-time eval machinery (NOT a core patch — tracked)

| Item | Detail |
|---|---|
| Site | `node_modules/depd/index.js:409-414` — `eval('(function (' + args + ') {...})')` builds the deprecation wrapper |
| Reached at import? | **Yes**: http-errors wraps its legacy `"I'mateapot"` export at `index.js:247-248`, so the eval runs on every `require('resolve-path')` |
| Why not a patch | wraps a library-owned export (http-errors' own constructor alias), mutating nothing core |
| Real-world impact | `require('resolve-path')` **fails under `--disallow-code-generation-from-strings`** and `--frozen-intrinsics` (dougwilson/nodejs-depd#41, #44, #53); removed in depd 2.x |

## resolve-path own-code interactions (clean)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | imports | `http-errors`, `path-is-absolute`, core `path` (`resolve`, `normalize`, `sep`, `join`) | API consumption only |
| `index.js` | validation paths | throws `createError(400/403, ...)` instances | library/dep-owned error objects |

## Dependency analysis

| Dependency | Key observation | Outcome |
|---|---|---|
| http-errors@1.6.3 | depd factory at `:15` + teapot wrap at `:247-248` (conduit for F-001 x2); `util.inherits` + own ctor prototype writes (ClientError/ServerError) | clean except conduit |
| depd@1.1.2 | F-001 + F-002 + eval wrapper; `wrapproperty` unreachable (no caller) | 2 patch sites |
| setprototypeof@1.1.0 | export `===` native `Object.setPrototypeOf`; fallbacks dead | clean |
| path-is-absolute@1.0.1 | pure ponyfill; never imports `path`; `path.isAbsolute` identity stable | clean |
| statuses@1.5.0 | self-populating own export | clean |
| inherits@2.0.3 (nested) | re-export of `util.inherits` (`$NODEJS_SOURCE/lib/util.js:344-363` mutates only passed ctors) | clean |

## Negative sweeps (both passes, zero hits in runtime scope)

- Module-loading interception (group 5) and internals/bindings (group 6): zero hits
- Core prototype/descriptor writes beyond ledgered library-owned sites: zero
- No lifecycle scripts anywhere in the tree; no native code

## Runtime reproduction (both passes, Node v24.19.0)

Accessor trap on `Error.prepareStackTrace`: exactly **3 swap/restore pairs during `require('resolve-path')`** (compat detection with limit 2; two getStack calls with limit 10), **0 swaps** while exercising `resolvePath` success, `../x` traversal (403), NUL byte (400), absolute path (400) — all thrown as http-errors instances with library prototypes. Before/after snapshot: no changes to Error/Object/Array/String/Function prototype keys, path exports (`isAbsolute` identity unchanged), `Object.assign`/`setPrototypeOf`, `Module._load/_resolveFilename`, `require.extensions`, `process.binding`, global keys.

## Node.js-change risk

1. **`Error.prepareStackTrace`/`stackTraceLimit` writability** — same class of exposure as the depd 2.x consumers, but with **3 windows per import** and a depth-**clamping** window (F-002) that can truncate concurrent captures.
2. **String-eval dependence** — the old chain cannot load under `--disallow-code-generation-from-strings`/`--frozen-intrinsics`. If Node ever hardened defaults in that direction, `require('resolve-path')` breaks at import. Upgrading to http-errors ≥ 2 (depd 2.x) removes both the compat site and the eval.
3. **V8 data-property requirement for `stackTraceLimit`** — empirically re-confirmed: accessor-trapping it disables stack capture entirely (crashed depd's own detection during repro) — any core/V8 change to that property's semantics directly affects this chain.
