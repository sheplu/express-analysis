# Node.js patch audit: multiparty (pass B, blind)

- Verdict: **confirmed patching** — two transient shared core mutations, both transitive (depd), both restored synchronously; zero permanent mutations; zero patches in multiparty's own code
- Status: complete
- Input: issue sheplu/express-analysis#25 (`multiparty` — multipart/form-data parser, https://github.com/pillarjs/multiparty)
- Library: multiparty@4.3.1, `$PACKAGE_ROOT` = clone of pillarjs/multiparty default branch `master` @ `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d` (verified `git log -1`), npm artifact layout (`files: ["index.js"]`), no local changes; runtime deps installed via `npm install --ignore-scripts --omit=dev`
- Node.js baseline: `$NODEJS_SOURCE` = nodejs/node `main` @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only, no local changes
- Reproduction runtime: Node.js v24.19.0
- Scope: production/runtime only — `$PACKAGE_ROOT/index.js` (sole shipped entrypoint) and all nine resolved runtime dependencies at their installed versions: depd@2.0.0, http-errors@2.0.0, inherits@2.0.4, random-bytes@1.0.0, safe-buffer@5.2.1, setprototypeof@1.2.0, statuses@2.0.1, toidentifier@1.0.1, uid-safe@2.1.5. Tests, examples, docs, devDependencies out of scope.
- Coverage: source — complete (all 12 runtime files read in full; six candidate pattern groups all run, see `searches.md`); upstream — corroborated (depd issues #32/#36/#39); runtime — reproduction executed (before/after snapshots + accessor trap + real multipart POST, see `repro/`)

## Patching verdict

Patching is demonstrated: **2 confirmed shared core mutations**, both from the
same transitive helper (`multiparty -> http-errors@2.0.0 -> depd@2.0.0`), both
**transient** — applied and restored synchronously inside one function call
(`depd` `getStack()`):

1. `Error.prepareStackTrace` is replaced (F-001), and
2. `Error.stackTraceLimit` is raised (F-002),

for the duration of one `Error.captureStackTrace` + `.stack` read, then both
are restored. The swap executes unconditionally at `require('multiparty')`
time (http-errors calls `require('depd')('http-errors')` at module load) and
again whenever a depd deprecation message is logged. Through multiparty's own
code paths no deprecation ever fires (it only creates 400/413/415 errors), so
in this tree the runtime occurrence is the module-load execution.

**Instance/application overrides: 0 confirmed.** multiparty's stream work is
entirely documented subclassing (`Form extends stream.Writable` with own
`_write`; `LimitStream extends stream.Transform` with own `_transform`) plus
metadata properties on PassThrough instances it creates itself. It never
writes a property on the incoming `req`, never touches shared core
prototypes, and never intercepts module loading. safe-buffer takes the
pure re-export branch (`module.exports = require('buffer')`) on any Node this
package supports in practice (>= 4.5; verified on v24.19.0). The runtime
reproduction found **zero** identity/descriptor/key differences on every
monitored core surface before vs. after require and before vs. after a full
multipart request.

Unresolved candidates: none. Verdict limits are listed under Coverage.

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` — transient replacement of the global V8 stack-formatting hook

- Category: shared core mutation (transient, restored synchronously)
- Library site(s): `node_modules/depd/index.js:386` (write), `node_modules/depd/index.js:395` (restore), inside `getStack()` (`index.js:381-399`); pinned: https://github.com/dougwilson/nodejs-depd/blob/2.0.0/index.js#L381-L399
- Origin: transitive — multiparty@4.3.1 -> http-errors@2.0.0 (`node_modules/http-errors/index.js:15`) -> depd@2.0.0
- Core baseline: Node installs a default data property `Error.prepareStackTrace = ErrorPrepareStackTrace` at bootstrap (`$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:485-511`); V8 stack formatting delegates to whatever function is found there (`$NODEJS_SOURCE/lib/internal/errors.js:136-170`, `prepareStackTraceCallback` -> `globalThis.Error.prepareStackTrace`). Default behavior: format `error.stack` as a string.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (a function returning the raw `CallSite[]` array instead of a string), then `Error.prepareStackTrace = prep` (saved original) after one stack capture.
- Execution chain: `require('multiparty')` (`index.js:11`) -> `require('http-errors')` -> `require('depd')('http-errors')` (`node_modules/http-errors/index.js:15`) -> `depd()` (`node_modules/depd/index.js:108`) -> `getStack()` -> write/restore. Re-executed by `log()` (`node_modules/depd/index.js:199`) on each deprecation emission.
- Activation: unconditional at module load; no guards, no env toggle (NO_DEPRECATION suppresses output, not the load-time `getStack()` call). Production code path.
- Scope and restoration: process-global (`Error` intrinsic), affects any `error.stack` materialized inside the swap window (the swap never spans a tick); restored at `index.js:395` before `getStack()` returns. Final state identical to initial state.
- Resulting behavior: during the window, any `.stack` read yields a `CallSite[]` array instead of a string; known real-world interaction: crashes under `--enable-source-maps` on some Node 12 versions (upstream #36) because the CallSite contract differed.
- Evidence: static (lines above read in full) and runtime — `repro/repro.js` installed an accessor trap on `Error.prepareStackTrace` before require; `repro/results.json` records exactly two set events, both in phase `require`: `ErrorPrepareStackTrace -> prepareObjectStackTrace`, then restore to `ErrorPrepareStackTrace`; final state unchanged; zero set events during the multipart exercise.
- Upstream: dougwilson/nodejs-depd#32 ("Why is this library overwriting Error type?", closed — behavior kept by design), #36 and #39 (closed, `--enable-source-maps`/source-map interactions). Present in depd 2.0.0 as shipped.

### F-002: `Error.stackTraceLimit` — transient raise of the global V8 stack-depth limit

- Category: shared core mutation (transient, restored synchronously)
- Library site(s): `node_modules/depd/index.js:387` (write `Error.stackTraceLimit = Math.max(10, limit)`), `node_modules/depd/index.js:396` (restore); pinned: https://github.com/dougwilson/nodejs-depd/blob/2.0.0/index.js#L381-L399
- Origin: transitive — multiparty@4.3.1 -> http-errors@2.0.0 -> depd@2.0.0
- Core baseline: `Error.stackTraceLimit` is the V8-defined global data property (default 10) controlling captured frame count; V8 reads it with data-property semantics. (Observed default 10 on the repro runtime; V8 stack-trace API, referenced from `$NODEJS_SOURCE/lib/internal/errors.js:91-93`.)
- Exact mutation: global numeric static raised to at least 10, restored to the saved value after one capture.
- Execution chain / activation: identical to F-001 (same `getStack()` body).
- Scope and restoration: process-global; any error created inside the window captures up to the raised limit; restored synchronously.
- Resulting behavior: if an application lowers `Error.stackTraceLimit` (e.g. to 3 for performance), errors constructed inside the window still capture 10 frames. No effect when the application limit is already >= 10.
- Evidence: static plus runtime — repro pre-set `Error.stackTraceLimit = 3`; the trap recorded the limit as `3` at the moment of the F-001 write and `10` at the moment of the F-001 restore (i.e. the raise was live in between), and the post-require snapshot shows `3` again (restored). Side proof: an accessor trap placed on `Error.stackTraceLimit` itself disabled V8 stack capture entirely (depd then crashed on `obj.stack === undefined`), confirming both that V8 requires a data property here and that depd genuinely depends on mutating this global.
- Upstream: same as F-001 (dougwilson/nodejs-depd#32).

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` (21 entries). Summary:

| ID | Site and core target | Status | Reason (short) |
| --- | --- | --- | --- |
| C-001 | depd/index.js:386/395 — `Error.prepareStackTrace` | confirmed -> F-001 | runtime-proven transient swap at require time |
| C-002 | depd/index.js:387/396 — `Error.stackTraceLimit` | confirmed -> F-002 | runtime-proven transient raise at require time |
| C-003 | safe-buffer/index.js:12-17 — `buffer`/`Buffer` | rejected | modern branch is `module.exports = buffer`, pure re-export |
| C-004 | safe-buffer/index.js:24,27 — SafeBuffer setup | rejected | writes only to library-owned `SafeBuffer` |
| C-005 | index.js:51,240 — `Form` extends `stream.Writable`, own `_write` | rejected | documented extension contract (writable.js:23-24) |
| C-006 | index.js:570,578 — `LimitStream` extends `stream.Transform`, own `_transform` | rejected | documented extension contract (transform.js:162) |
| C-007 | index.js:551-559 — metadata props on own PassThrough | rejected | instance props on library-created object, no shadowing |
| C-008 | index.js:157 — `self.handleError` | rejected | own instance |
| C-009 | index.js:167-168 — `req._readableState`/`req._decoder` | rejected | private API reads only (supporting context) |
| C-010 | http-errors/index.js:139,208 etc. — `setPrototypeOf(err, ...)` | rejected | err created by the library; instance-level |
| C-011 | http-errors/index.js:117,160,229 — `inherits(..., Error)` | rejected | mutates library ctors only |
| C-012 | http-errors/index.js:244-251 — `nameFunc` | rejected | library-owned functions |
| C-013 | setprototypeof/index.js:3 | rejected | re-export of `Object.setPrototypeOf`; fallbacks dead + caller-object only |
| C-014 | inherits@2.0.4 | rejected | re-export of `util.inherits`; browser file dead on Node |
| C-015 | statuses/index.js | rejected | own-export data tables |
| C-016 | uid-safe / random-bytes | rejected | crypto wrappers, reads only |
| C-017 | depd wrapproperty/convertDataDescriptorToAccessor | rejected | caller-supplied objects; unreachable via http-errors |
| C-018 | depd DeprecationError defineProperty | rejected | fresh library-created Error instance |
| C-019 | depd wrapfunction (`new Function`) | rejected | returns new wrapper; unreachable here |
| C-020 | index.js:188 — regex `lastIndex` | rejected | library-owned object |
| C-021 | depd/index.js:251 — `process.emit('deprecation')` | rejected | documented EventEmitter API use |

Unresolved: none.

## Supporting context

- Private API reads (no writes): `index.js:167-168` reads `req._readableState`
  (`state.encoding`, `state.decoder`; baseline `$NODEJS_SOURCE/lib/internal/streams/readable.js:333-334`)
  and the legacy `req._decoder` field to refuse requests whose stream has an
  encoding set. Undocumented-internal coupling, not a mutation.
- Documented stream extension: `Form` (Writable subclass with `emitClose: false`
  option and own `_write`) and `LimitStream` (Transform subclass with own
  `_transform`) follow the exact contracts stated in
  `$NODEJS_SOURCE/lib/internal/streams/writable.js:23-24` and
  `transform.js:162-163`.
- Part streams: each part is a `new stream.PassThrough()` the library creates
  and decorates with `headers/name/filename/byteOffset/byteCount`
  (`index.js:547-559`) — additive metadata on library-owned instances, the
  pattern the skill explicitly excludes from patch findings.
- safe-buffer@5.2.1 exists purely as a deprecation-safe `Buffer` facade; on all
  supported modern Nodes it is an unmodified re-export of the core `buffer`
  module (`node_modules/safe-buffer/index.js:12-13`).
- depd's `deprecate.function`/`deprecate.property` wrappers (the "wrap" grep
  hits) can redefine properties, but only on objects their caller passes in,
  and http-errors never invokes them.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` | `git log -1` | `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d` = tag 4.3.1 (matches assignment) |
| `$PACKAGE_ROOT/index.js` + 9 dep entrypoints (12 files) | six `rg -n --no-ignore` pattern groups (see `searches.md`) | G1-G4 hits all traced to ledger; G5 (module interception) and G6 (bindings/internals) zero hits |
| `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:485-511` | read | Node default `Error.prepareStackTrace = ErrorPrepareStackTrace` (writable, configurable data property) — baseline for F-001 |
| `$NODEJS_SOURCE/lib/internal/errors.js:88-170` | read | `prepareStackTraceCallback` delegates to `globalThis.Error.prepareStackTrace`; `ErrorPrepareStackTrace` definition at :168 |
| `$NODEJS_SOURCE/lib/internal/streams/writable.js`, `transform.js`, `passthrough.js`, `readable.js` | targeted reads/greps | `_write`/`_transform` are subclass extension points; PassThrough defines no members that C-007 props would shadow; `ReadableState.decoder/encoding` at readable.js:333-334 |
| `$NODEJS_SOURCE/lib/util.js:344-363` | read | `util.inherits` mutates only `ctor`/`ctor.prototype` |
| depd upstream | https://github.com/dougwilson/nodejs-depd/issues/32 (closed), /issues/36 (closed), /issues/39 (closed) | maintainer-acknowledged `Error.prepareStackTrace` swap; real-world source-maps interaction |
| Runtime reproduction | `PACKAGE_ROOT="$PACKAGE_ROOT" node repro/repro.js` (Node v24.19.0) | `repro/results.json`: 2 trap events (F-001/F-002 swap + restore, phase `require`); empty diffs on all monitored core surfaces before vs. after require and after a real multipart POST (field parsed, 25-byte file written and verified); final `Error.prepareStackTrace`/`stackTraceLimit` restored |

Runtime surfaces monitored by the repro (all unchanged): `stream.Writable/Readable/Duplex/Transform/PassThrough` prototypes and ctor identities (own keys, per-key descriptors, function identities), `fs.WriteStream` + prototype, `fs.createWriteStream`, `fs.unlink`, `http.IncomingMessage.prototype`, `events.EventEmitter.prototype`, `Buffer` ctor + 7 statics + `Buffer.prototype`, `string_decoder.StringDecoder` + prototype, `Error.captureStackTrace`, `Object/Array/String/Function.prototype` own keys, `Object.assign/setPrototypeOf/defineProperty`, `Module._load`, `Module._resolveFilename`, `Module._extensions` keys, `require.cache` builtin-style entries, `process.binding`, `process.nextTick`, `globalThis` own keys.

File hashes (SHA-256, relative to `$PACKAGE_ROOT`):

```
9619dcd68f48a349ec5f8fc2908850c0ca7d3078860e42f51cabc2032adc27f2  index.js
4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91  node_modules/depd/index.js
0f484a62f0587e00002f3fd194b1aca9bcdd1881fcb3250e98b5ac17df7dd1fd  node_modules/http-errors/index.js
bb380f32bef5feb18678f0f45f88073fed5d7a0069a309132cb2080cd553d5c7  node_modules/inherits/inherits.js
ad322a7b1dec60f3d2ebda2091816469efb55b567d241cf3cf0fa4c5a4afe500  node_modules/inherits/inherits_browser.js
d9a829fc576892245375789e614a398a577243d1649f7aed0e1b3d2e19bd8376  node_modules/random-bytes/index.js
184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1  node_modules/safe-buffer/index.js
3e3495ca7ae72a7f0ca459f47dd3d97ae3a48fa4b1a669a31672be778cc97a5f  node_modules/setprototypeof/index.js
96a0698e899f5889cf254d1f2e351f3253a37921c7f87269b0e87a497dec666a  node_modules/statuses/index.js
d2daa083f11600277bd2bf9823bb48ede916a5b0924d2991d6bc4ce331d5604b  node_modules/statuses/codes.json
f9f26b0e90e2569b61d02ef2a92718624b8854592b1ede7f2c8879a69cfdba05  node_modules/toidentifier/index.js
1068a5918f3669a939c1c8865f2394cdc3ac126677e04d016a9e6fa9d9ff9a91  node_modules/uid-safe/index.js
10b4d4a4e9d14e9e6a5ab7ced64405ef90e6bec94d479a8e223cbba88828ad79  node_modules/depd/lib/browser/index.js
```

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` is the only file shipped by the npm
  `files` whitelist and the only export; every dependency's resolved `main`
  entrypoint was read in full before exclusion. No `exports` maps or
  conditional Node entrypoints exist in any dependency. Browser-field files
  (`depd/lib/browser/index.js`, `inherits/inherits_browser.js`) are
  unreachable under Node's CJS resolver and were still scanned (no patch
  code; the depd browser build contains no `getStack`).
- Dependency tree: matches the assignment exactly (9 packages); no install
  scripts ran (`--ignore-scripts`), and none of the packages declare runtime
  install hooks relevant to patching.
- Branches not exercised at runtime: safe-buffer's legacy `else` branch and
  setprototypeof/inherits fallbacks (dead on Node >= 4.5/5); depd's
  deprecation `log()` path including `process.emit('deprecation')` (would
  re-run the F-001/F-002 swap per message; statically identical sites);
  depd's `wrapfunction`/`wrapproperty` (unreachable from this tree);
  `transfer-encoding: base64` parts and the `part` event path of multiparty
  (static review only — they contain no candidate writes). A tested branch
  cannot prove universal absence, but every untested branch was read in full.
- Error.stackTraceLimit trapping limitation: V8 reads the limit with
  data-property semantics, so set-interception is impossible without
  disabling stack capture; the transient raise was instead proven via the
  value observed inside the F-001 trap events (3 -> 10 -> restored 3).
- Node.js baseline is the `main` branch (`d44625a4b80`), not the v24.19.0
  release used for the repro; the verified baselines (default
  `prepareStackTrace` bootstrap, stream extension contracts, `util.inherits`)
  are stable across both (bootstrap default confirmed present in the
  v24.19.0 runtime by the trap's initial value `ErrorPrepareStackTrace`).
- Blind-pass constraint honored: nothing outside `pass-b/` under the audit
  root was read.
- What would change the verdict: evidence that `getStack()` can be made
  non-restoring (e.g. an exception between write and restore —
  `Error.captureStackTrace`/`obj.stack.slice` would have to throw; the
  only known case is the accessor-trap experiment above, which is an
  environment modification, plus upstream #36's source-maps crash where the
  TypeError occurs inside `callSiteLocation` *after* restore), or a new
  dependency version changing these sites.

## Changes since the previous audit

First audit (pass B, blind; no prior report read or updated).
