# Node.js patch audit: body-parser

- Verdict: confirmed patching
- Status: complete
- Input: npm package `body-parser` (Node.js request body parsing middleware), local source at `$PACKAGE_ROOT`
- Library: body-parser 2.4.0, git clone of https://github.com/expressjs/body-parser, branch master, commit `151a0d9e72682662fd32b439da4693b4459a70b3`; runtime dependencies installed at `$PACKAGE_ROOT/node_modules` with `--ignore-scripts --omit=dev` (37 top-level packages plus nested `mime-types@3.0.2`/`mime-db@1.54.0` under `type-is`)
- Node.js baseline: main branch, commit `d44625a4b80c672215b469906ce583ce7eeeebaf`
- Reproduction runtime: Node.js v24.19.0 (`node repro-error-hook-write.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only — `index.js`, `lib/**`, and every resolved runtime dependency's entrypoint/initialization path (tests/examples/docs excluded)
- Coverage: full static sweep of library + dependency runtime files with the skill's candidate pattern set; targeted Node.js source verification; one reproduction run; upstream corroboration for the confirmed finding (depd issues #32/#36). No unresolved candidates.

## Patching verdict

Patching was demonstrated: **one confirmed patch**, transitive in origin and temporary in effect.

- Shared core/global mutations: **1 confirmed** (F-001). `depd@2.0.0` (body-parser -> `http-errors@2.0.1` -> `depd`) writes the global `Error.prepareStackTrace` hook and `Error.stackTraceLimit`, captures a stack, then synchronously restores both saved originals. The write runs unconditionally at `require('body-parser')` time. It uses the documented, user-assignable V8/Node.js hook interface and is restored before any other code runs, but it is a real, reachable write to a shared global that changes stack-trace formatting behavior while installed.
- Instance/application overrides: **0 confirmed**. `on-finished@2.4.2` contains a latent instance-level override of the core `ServerResponse.prototype.assignSocket` method (`patchAssignSocket`, a Node.js 0.8-era workaround), but it is statically unreachable through body-parser, which only ever passes `IncomingMessage` objects to on-finished (see C-006 and supporting context).
- Core module loading interception: none found. Core source rewrites: none found. Permanent mutations of core prototypes, core module objects, globals, or intrinsics: none found — including the entire `get-intrinsic`/`es-define-property`/`dunder-proto`/`side-channel` helper family, which only reads and caches intrinsics into its own module-local maps.

No unresolved candidates remain. Branches excluded as unreachable on the supported runtime (Node >= 18) are listed in the ledger (legacy `unpipe` fallback, `setprototypeof` fallbacks, on-finished 0.8 patch path).

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` / `Error.stackTraceLimit` temporarily replaced by depd `getStack()`

- Category: shared core/global mutation (temporary; save-and-restore)
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:382-396` (`getStack()`: saves at 382/384, writes at 386-387, restores at 395-396); pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L377-L399
- Origin: transitive — body-parser 2.4.0 -> http-errors@2.0.1 (`$PACKAGE_ROOT/node_modules/http-errors/index.js:15`) -> depd@2.0.0
- Core baseline: `Error.prepareStackTrace` defaults to `undefined`; Node.js implements the V8 stack-trace customization API in `$NODEJS_SOURCE/lib/internal/errors.js:136-161` (`prepareStackTraceCallback` invokes `globalThis.Error.prepareStackTrace` when it is a function, otherwise falls back to the internal default formatter at `$NODEJS_SOURCE/lib/internal/errors.js:95-111`). `Error.stackTraceLimit` is a documented mutable data property (default 10).
- Exact mutation: on the global `Error` constructor, assigns `Error.prepareStackTrace = prepareObjectStackTrace` (a function returning the raw `CallSite[]` instead of a formatted string) and `Error.stackTraceLimit = Math.max(10, previous)`; after `Error.captureStackTrace(obj)` and reading `obj.stack`, assigns both saved originals back.
- Execution chain: `require('body-parser')` -> `$PACKAGE_ROOT/index.js:27` -> `$PACKAGE_ROOT/lib/types/json.js:16` -> `$PACKAGE_ROOT/lib/read.js:14` `require('http-errors')` -> `$PACKAGE_ROOT/node_modules/http-errors/index.js:15` `require('depd')('http-errors')` -> `$PACKAGE_ROOT/node_modules/depd/index.js:103-108` (`depd()` calls `getStack()`) -> writes at `depd/index.js:386-387`.
- Activation: unconditional at module load of body-parser (production path, no guards). Also re-runs on every deprecation log (`depd/index.js:199`) and in `wrapfunction`/`wrapproperty` (`:419`, `:455`); body-parser itself never triggers those at runtime (it creates only 400/403/413/415 errors, below the `deprecate()` threshold in `http-errors/index.js:73`, and never calls `deprecate.function`/`deprecate.property`).
- Scope and restoration: process-wide global while installed; restored synchronously within the same tick, no interleaving JavaScript can run between write and restore in normal single-threaded execution. Saved originals are reinstated exactly (verified by reproduction).
- Resulting behavior: during the window, any `error.stack` materialization would be formatted by depd's hook (raw CallSite array) instead of Node's default or a previously installed user hook; in practice only depd's own capture object is formatted in the window. If another library had installed its own `prepareStackTrace`, it is shadowed for the duration and restored afterwards. `Error.stackTraceLimit` is raised to >= 10 during the window.
- Evidence: static trace above; reproduction (`node repro-error-hook-write.js "$PACKAGE_ROOT"`, Node v24.19.0) observed exactly two writes during `require('body-parser')` — `prepareStackTrace <- function prepareObjectStackTrace` (with `stackTraceLimit` still at the pre-set value 3) then `prepareStackTrace <- undefined` (with `stackTraceLimit` at 10, proving the intermediate limit write) — and both values restored after require (`undefined` / 3).
- Upstream: https://github.com/dougwilson/nodejs-depd/issues/32 ("Why is this library overwriting Error type?", closed — maintainer-acknowledged behavior); https://github.com/dougwilson/nodejs-depd/issues/36 (closed, interaction with `--enable-source-maps`); https://github.com/dougwilson/nodejs-depd/issues/50 (open, `callSite.getFileName is not a function` — interaction with other `prepareStackTrace` implementations). Behavior present in depd v2.0.0 as audited.

No other patches were confirmed.

## Candidate ledger and unresolved questions

Full ledger in `candidates.md` beside this report. Summary of the decisive entries:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-005 | `node_modules/depd/index.js:386-387` — `Error.prepareStackTrace`, `Error.stackTraceLimit` | confirmed -> F-001 | reachable at require time; reproduced |
| C-006 | `node_modules/on-finished/index.js:195` — instance override of `ServerResponse.prototype.assignSocket` | rejected as patch (in scope) | unreachable: body-parser passes only `IncomingMessage` (`lib/read.js:46,245-249`); `isFinished` returns true whenever `msg.socket` is falsy (`on-finished/index.js:75-77`), so the `msg.socket === undefined` branch (`:128-130`) cannot be reached; and `IncomingMessage` has no `assignSocket`, so `:192` would return without patching |
| C-001 | `lib/read.js:53,194` — `req.body` write on live `IncomingMessage` | rejected as patch | library-owned metadata key; core defines no `body` property (`$NODEJS_SOURCE/lib/internal/http/incoming.js`) |
| C-008 | `node_modules/debug/src/node.js:205,209` — `process.env.DEBUG` write/delete at load | rejected as patch | library-owned env config key via documented env interface; writes back the existing value or deletes an absent key; no API behavior replaced |
| C-012 | `node_modules/safer-buffer/safer.js:19-25,61` — Buffer statics copy; `process.binding('buffer')` | rejected as patch | copies core values onto its own object; `Safer.prototype = Buffer.prototype` writes safer's own object; `process.binding` is a read in try/catch (private API read) |
| C-017 | `node_modules/get-intrinsic/index.js:159,183,373` and es-*/dunder-proto/side-channel family | rejected as patch | intrinsic handling is read/cache only, into module-local `INTRINSICS` map; `dunder-proto` load-time `__proto__` writes target local literals only |
| others (C-002..C-004, C-007, C-009..C-011, C-013..C-016, C-018..C-024) | see `candidates.md` | rejected as patch | public API use, own-object writes, reads of private state, or documented extension points |

Unresolved: none.

## Supporting context

- `req.body` (`$PACKAGE_ROOT/lib/read.js:53,194`) and on-finished's `msg.__onFinished` (`node_modules/on-finished/index.js:143-147,164`) add library-owned properties to the live core `IncomingMessage` instance. Property additions carrying library state; no core-defined key or method is replaced.
- `on-finished@2.4.2` ships `patchAssignSocket` (`index.js:189-197`), which replaces `assignSocket` on a response instance to wrap the core method (`$NODEJS_SOURCE/lib/internal/http/server.js:312`, re-exported through `lib/_http_server.js`). It is a Node.js 0.8 workaround, guarded and unreachable through body-parser's usage (C-006). It would be an instance override if activated by a consumer that passes a socketless `OutgoingMessage`.
- Private core API reads (no writes): `raw-body/index.js:176-177` reads `stream._readableState` (constructed at `$NODEJS_SOURCE/lib/internal/streams/readable.js:363`) and legacy `stream._decoder` to reject pre-encoded streams; `safer-buffer/safer.js:61` reads `process.binding('buffer')` in try/catch.
- Documented extension points used as intended: iconv-lite subclasses `stream.Transform` via `Object.create(Transform.prototype)` and implements `_transform`/`_flush` (`node_modules/iconv-lite/lib/streams.js:19-23,66-70`; contract at `$NODEJS_SOURCE/lib/internal/streams/transform.js:162`); body-parser uses public `req.pipe`/`req.unpipe`/`req.resume` (`lib/read.js:119,151,165,170,249`; baselines `$NODEJS_SOURCE/lib/internal/streams/readable.js:978,1180,1327`) and public zlib factories plus a read-only `'createZstdDecompress' in zlib` feature check (`lib/read.js:32`).
- `http-errors` re-prototypes only Error instances it creates itself (`index.js:139,208`) and writes only its own constructors' prototypes (`:163-165,232-234`); `setprototypeof` resolves to native `Object.setPrototypeOf` on Node >= 18.
- `json.js` `normalizeJsonSyntaxError` (`lib/types/json.js:170-184`) deletes/rewrites own properties of the specific `SyntaxError` instance thrown by `JSON.parse`; `SyntaxError.prototype` is untouched.
- `debug@4.4.3` writes `process.env.DEBUG` back (or no-op deletes it) once at load (`src/common.js:287` -> `:163` -> `src/node.js:205,209`): environment-variable state, not an API override.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `lib/**` | full read + skill pattern set (`rg -n`, 6 pattern groups) | only `require` hits; zero prototype/defineProperty/global/interception/binding hits in body-parser's own code |
| `$PACKAGE_ROOT/node_modules/**` (runtime JS, incl. nested `type-is/node_modules`) | skill pattern sweeps: prototype writes, `setPrototypeOf`, `defineProperty`, patch keywords, module interception, `process.binding`/`internal/`, global writes, `Error` hook writes, `process.env` writes, `Object.assign`, core-module-identifier writes | all hits triaged in `candidates.md`; module interception: zero hits; global function writes: zero hits; `Error` hook writes only in depd |
| `node_modules/depd/index.js:382-396` | full file read; reproduction `node repro-error-hook-write.js "$PACKAGE_ROOT"` (Node v24.19.0) | F-001 confirmed: 2 writes observed during require, both restored |
| `$NODEJS_SOURCE/lib/internal/errors.js:85-170` | targeted read | `Error.prepareStackTrace` is Node's polyfilled V8 user hook; default `undefined`; internal default formatter documented |
| `$NODEJS_SOURCE/lib/internal/http/server.js:312-329` | targeted read (followed re-export from `lib/_http_server.js:34`) | `ServerResponse.prototype.assignSocket` baseline for C-006 |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js:77-121` | targeted grep | `IncomingMessage` defines `socket`/`complete`, no `body`, no `assignSocket` |
| `$NODEJS_SOURCE/lib/internal/streams/readable.js:978,1180,1327,363`; `transform.js:113-171` | targeted grep | `pipe`/`unpipe`/`resume` public; `_readableState` internal; `_transform`/`_flush` documented subclass contract |
| `$NODEJS_SOURCE/lib/zlib.js:1345-1354` | targeted grep | `createInflate`/`createGunzip`/`createBrotliDecompress`/`createZstdDecompress` public factories |
| depd upstream | `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` | #32 (closed; "Why is this library overwriting Error type?"), #36 (closed; `--enable-source-maps` interaction), #50 (open; interaction with other hooks) |
| install scripts | grep `"preinstall"/"postinstall"` across dep package.json files | none present |

Evidence file hashes (sha256, `$PACKAGE_ROOT`-relative):
`index.js` 4d33d19d4ce36726988a1fa508f4d6f15254cc52fe95b777b30f49d97d825668; `lib/read.js` c77982d481a9fe5b13c0fdd68515a5931729961e7135124f70236d5a30bdd701; `node_modules/depd/index.js` 4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91; `node_modules/on-finished/index.js` ecd342e4d92b4f4df3e1af6a1ee4028ced17421702e0ec93fe2dd5afff3a4807; `node_modules/http-errors/index.js` 33bda88afcd1a83566eb4ebb305f852b701e19aad5e1d92cb3a11161d35c50f0.

## Coverage and limitations

- Entry points covered: `index.js` and all four `exports` subpaths (`lib/types/{json,raw,text,urlencoded}.js`), `lib/read.js`, `lib/utils.js`. All load `lib/read.js`, so the F-001 load chain triggers for every entrypoint.
- Runtime dependencies covered (entry/init paths read or pattern-swept at resolved versions): bytes@3.1.2, call-bind-apply-helpers@1.0.2, call-bound@1.0.4, content-type@2.1.0, debug@4.4.3 (src/index.js -> node.js -> common.js), depd@2.0.0, dunder-proto@1.0.1, ee-first@1.1.1, es-define-property@1.0.1, es-errors@1.3.0, es-object-atoms@1.1.2, function-bind@1.1.2, get-intrinsic@1.3.0, get-proto@1.0.1, gopd@1.2.0, has-symbols@1.1.0, hasown@2.0.4, http-errors@2.0.1, iconv-lite@0.7.3 (incl. lazy `encodings/` codecs), inherits@2.0.4, math-intrinsics@1.1.0, media-typer@1.1.1, ms@2.1.3, object-inspect@1.13.4, on-finished@2.4.2, qs@6.17.1 (lib/ entry; bundled dist/ also swept), raw-body@3.0.2, safer-buffer@2.1.2, setprototypeof@1.2.0, side-channel@1.1.1 (+ -list@1.0.1/-map@1.0.1/-weakmap@1.0.2), statuses@2.0.2, toidentifier@1.0.1, type-is@2.1.0, unpipe@1.0.0, and nested mime-types@3.0.2/mime-db@1.54.0.
- Node.js files read were limited to the targeted set above at commit `d44625a4b80c672215b469906ce583ce7eeeebaf`; no recursive scan of the Node tree.
- Branches excluded as unreachable on the supported runtime (Node >= 18): setprototypeof `setProtoOf`/`mixinProperties` fallbacks (native `Object.setPrototypeOf` exists), unpipe pre-streams2 fallback (`stream.unpipe` is a function), on-finished `patchAssignSocket` (guard analysis in C-006), safer-buffer `Safer.from`/`Safer.alloc` fallback installation (native `Buffer.from`/`alloc` exist), debug browser entry (`src/browser.js`, non-Node environments only), iconv-lite non-stream environment branch.
- What would change the verdict: a consumer-visible path that calls on-finished with a socketless `OutgoingMessage` would add an instance-override finding (not reachable through body-parser); removal of depd from http-errors (or depd dropping `getStack`) would remove F-001 and flip the verdict to "no confirmed patching".
- Reproduction tested the Node v24.19.0 runtime only; the static analysis is version-independent within the audited sources. A tested branch cannot prove universal absence.
- Per the double-blind protocol, no other audit output was read or consulted.

## Changes since the previous audit

First audit (independent verification pass B); no previous report at this path.
