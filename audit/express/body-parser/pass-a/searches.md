# Search log: body-parser 2.4.0 patch audit (pass A)

All commands ran from `$PACKAGE_ROOT` or `$PACKAGE_ROOT/node_modules` (noted),
with targeted reads in `$NODEJS_SOURCE`. Paths in results are relative to those
roots. Negative results are recorded explicitly.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 1 | `cat package.json; ls; ls lib lib/types; git log -1` | body-parser 2.4.0 @ 151a0d9e72682662fd32b439da4693b4459a70b3; runtime files: `index.js`, `lib/read.js`, `lib/utils.js`, `lib/types/{json,raw,text,urlencoded}.js`; no install scripts; `files` ships only `lib/`, `index.js`, LICENSE |
| 2 | `ls node_modules` + `node -p version` loop | 37 packages at resolved versions (list in report Coverage section) |
| 3 | Full reads of `index.js`, `lib/read.js`, `lib/utils.js`, `lib/types/*.js` | complete first-party runtime inventory; only core import is `node:zlib` (`lib/read.js:18`) |

## First-party candidate sweeps (`$PACKAGE_ROOT`: index.js, lib/)

| # | Pattern (rg -n over index.js lib/) | Result |
| --- | --- | --- |
| S1 | `_body` | NO HITS (the historical `req._body` flag is gone in 2.4.0) |
| S2 | `require\s*\(|\bnode:` | only library/relative requires + `node:zlib`; no dynamic/computed loading |
| S3 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | NO HITS |
| S4 | `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive) | NO HITS |
| S5 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks|process\.(binding|_linkedBinding)|internalBinding|['"]internal/` | NO HITS |

## Dependency-tree sweeps (`$PACKAGE_ROOT/node_modules`, `--no-ignore`, tests/docs excluded)

| # | Pattern / scope | Result |
| --- | --- | --- |
| D1 | prototype reassignment: `\.prototype\s*=[^=]|__proto__\s*[\]=]|Object\.setPrototypeOf\s*\(|Reflect\.setPrototypeOf\s*\(` over `*.js` excl. `test/`, `*.md`, `*.ts` | hits: `setprototypeof/index.js:6`; `content-type/dist/index.js:29`; `function-bind/implementation.js:78-80`; `iconv-lite/lib/streams.js:19,66`; `dunder-proto/get.js:9`, `dunder-proto/set.js:10,32`; `inherits/inherits_browser.js:6,22-23`; `safer-buffer/safer.js:25`; `object-inspect/index.js:39`; `qs/dist/qs.js` (browser bundle copies of same helpers); `qs/test/*` (out of scope) -> ledger C-012/C-021/C-022/C-015/C-024/C-025/C-013/C-023 |
| D2 | `Object.definePropert(y|ies)\(|Reflect.definePropert` over `*.js` excl. tests/dist | hits: `debug/src/common.js:122`; `http-errors/index.js:142,150,211,219,249`; `depd/index.js:62,485,496,500,507,514,521` -> C-020/C-010/C-011/C-004/C-005/C-006 |
| D3 | loader interception / bindings: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks|process\.(binding|_linkedBinding)|internalBinding|['"]internal/` | ONLY `safer-buffer/safer.js:61,63` (`process.binding('buffer')` READ) -> C-014. No module-loading interception anywhere |
| D4 | global writes: `globalThis\.X =|global\.X =|global[...] =` excl. tests/dist | NO HITS |
| D5 | `prepareStackTrace|stackTraceLimit` tree-wide excl. tests, excl. dist | ONLY `depd/index.js:382,384,386,387,395,396` -> C-003/F-001 |
| D6 | require sites of `dunder-proto/set` | NONE outside dunder-proto's own tests -> C-024 dead in scope |
| D7 | require sites of `safer-buffer` | iconv-lite lib+encodings files (and object-inspect/example, out of scope) — safer-buffer IS loaded at body-parser load |
| D8 | core-object writes `(Object|Array|Function|...|Buffer|process)\.X = ` over `qs/lib`, `side-channel*`, `get-intrinsic`, `object-inspect` | ONLY `get-intrinsic/index.js:159` (`INTRINSICS['%Error.prototype%'] = errorProto` — own table) -> C-023 |
| D9 | `process.X =|process.env.X =|\.prototype\.X =|Object.definePropert` over debug, ms, bytes, content-type, statuses, toidentifier, type-is, media-typer, hasown | hits: `debug/src/common.js:122`, `debug/src/node.js:205` (`process.env.DEBUG = namespaces`) -> C-019/C-020; others clean |
| D10 | es-helper family write scan (get-intrinsic, es-object-atoms, es-define-property, es-errors, has-symbols, hasown, gopd, call-bind-apply-helpers, call-bound, math-intrinsics, get-proto, dunder-proto, side-channel*, object-inspect, function-bind) | only reads/exported references (`functionCall.js:4` exports `Function.prototype.call`; `function-bind/index.js:5` exports native bind); NO writes to core objects |
| D11 | iconv-lite: `extendNodeEncodings|Buffer\.prototype|_readableState|_writableState` over whole package | NO HITS (legacy 0.4-era Node monkeypatch API absent in 0.7.3) |
| D12 | entrypoint sweep (head/assignment scan) of bytes, ms, statuses, toidentifier, media-typer, type-is, hasown, gopd, es-errors, es-define-property, es-object-atoms, has-symbols, math-intrinsics, get-proto, call-bound, call-bind-apply-helpers, function-bind, side-channel-list/map/weakmap | all load-time work writes only to own exports/locals; feature tests on fresh literals (C-027) |

## Full/targeted dependency reads

| # | File(s) | Finding |
| --- | --- | --- |
| R1 | `http-errors/index.js` (full) | depd factory at :15 (load-time); `setPrototypeOf(err, ...)` :139/:208 on fresh `new Error` instances; defineProperty on own instances/constructors; `Error.captureStackTrace` (documented API) |
| R2 | `depd/index.js` (full, sectioned) | `getStack()` :381-398 writes/restores `Error.prepareStackTrace`/`stackTraceLimit`; called from `depd()` :108 (load time), `log()` :199, `wrapfunction` :419, `wrapproperty` :455; `wrapfunction`/`wrapproperty` have no callers in scope |
| R3 | `on-finished/index.js` (full) | `patchAssignSocket` :189-198 (write :195), call-site guard :126-131; `msg.__onFinished` :147,:164; AsyncResource wrap :205-230 |
| R4 | `raw-body/index.js` (full) | `_readableState`/`_decoder` READS :170-181; listener add/remove, `pause()`, unpipe pkg; no stream method reassignment |
| R5 | `iconv-lite/lib/index.js` (full), `lib/streams.js` (full), `lib/helpers/merge-exports.js` | all writes to own `module.exports`; Transform subclassing only |
| R6 | `unpipe/index.js` (full) | no writes; legacy branch invokes existing `close` listeners |
| R7 | `safer-buffer/safer.js` (full) | own `Safer` object; `Buffer.prototype` read; `process.binding` read in try/catch |
| R8 | `setprototypeof/index.js`, `inherits/inherits.js`, `ee-first/index.js` (full) | native export / util.inherits / pure listener bookkeeping |
| R9 | `qs/lib/index.js`, `side-channel/index.js`, `get-intrinsic/index.js` (head+scan) | pure exports; library-owned Map/WeakMap channels; intrinsic READS |
| R10 | `debug/src/node.js:190-230`, `debug/src/common.js` (enable/load/save) | `process.env.DEBUG` write at :205 / delete :209; load-time `enable(load())` at common.js:287 round-trips existing value |
| R11 | `content-type/dist/index.js:20-40` | local NullObject ctor; `main`/`exports` -> `./dist/index.js` |

## Node.js baseline reads (`$NODEJS_SOURCE` @ d44625a4b80, targeted only)

| # | Command | Result |
| --- | --- | --- |
| N1 | `rg -n 'assignSocket|ServerResponse.prototype' lib/_http_server.js` | no hits — implementation moved; `lib/_http_server.js` re-exports from `internal/http/server` |
| N2 | `rg -n 'assignSocket' lib/` then read `lib/internal/http/server.js:312-326` | `ServerResponse.prototype.assignSocket` baseline for C-007 |
| N3 | `rg -n 'this\.socket|assignSocket' lib/internal/http/incoming.js` | `this.socket = socket` at :77; no `assignSocket` on IncomingMessage — C-007 unreachable via req |
| N4 | `rg -n 'prepareStackTrace' lib/internal/errors.js` | :91-150 — core polyfills V8 API and CALLS user `globalThis.Error.prepareStackTrace` when set (:149-150) — F-001 core baseline |
| N5 | `rg -n 'this\.decoder|this\.encoding|setEncoding' lib/internal/streams/readable.js` | ReadableState `decoder`/`encoding` at :333-334; `setEncoding` at :631 — C-017 baseline (reads only) |

## Upstream corroboration (read-only)

| # | Query | Result |
| --- | --- | --- |
| U1 | `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` | #32 closed "Why is this library overwriting Error type?"; #36 closed (--enable-source-maps incompatibility); #50 open (interference from another prepareStackTrace); #18, #28 related callsite issues — corroborates F-001 |
| U2 | `gh search issues --repo jshttp/on-finished "assignSocket"` | no matching issue (only #10, unrelated); the "node.js 0.8 patch" code comment is the primary documentation for C-007 |

## Reproductions (scripts beside this report; Node v24.19.0)

| # | Command | Result |
| --- | --- | --- |
| P1 | `node repro-error-hook-write.js "$PACKAGE_ROOT"` | recorded `Error.prepareStackTrace <- function prepareObjectStackTrace` and `Error.stackTraceLimit <- 10` during require; instrumented run throws at `depd/index.js:393` (accessor instrumentation perturbs V8 data-property lookups), proving load-time execution of `getStack()` and the non-exception-safe restore |
| P2 | `node repro-restore-check.js "$PACKAGE_ROOT"` | un-instrumented control: exports `{json,raw,text,urlencoded}` loaded; `prepareStackTraceUnchanged: true`, `stackTraceLimitUnchanged: true` — normal-path restoration confirmed |
