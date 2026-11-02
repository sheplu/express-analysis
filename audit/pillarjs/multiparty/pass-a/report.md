# Node.js patch audit: multiparty

- Verdict: **confirmed patching** — one transitive, transient shared-global mutation (depd's `Error.prepareStackTrace` / `Error.stackTraceLimit` swap); multiparty's own code performs no Node.js core patch.
- Status: complete
- Input: issue sheplu/express-analysis#25 — `multiparty` (multipart/form-data parser, https://github.com/pillarjs/multiparty)
- Library: multiparty 4.3.1, default branch `master` @ `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d`, git checkout with runtime deps installed via `npm install --ignore-scripts --omit=dev`; shipped artifact is a single file (`files: ["index.js"]`), no local changes.
- Node.js baseline: main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (read-only, clean working tree).
- Reproduction runtime: Node v24.19.0 (`node repro-core-mutation-check.js "$PACKAGE_ROOT"`, script beside this report).
- Scope: production/runtime only — `$PACKAGE_ROOT/index.js` (sole entrypoint) plus the resolved entrypoint/initialization of every runtime dependency: depd@2.0.0, http-errors@2.0.0, inherits@2.0.4, random-bytes@1.0.0, safe-buffer@5.2.1, setprototypeof@1.2.0, statuses@2.0.1, toidentifier@1.0.1, uid-safe@2.1.5. Tests, examples, `tool/`, docs, devDependencies excluded.
- Coverage: source — complete (all 6 skill pattern groups over every scoped runtime file; every hit traced; see searches.md/candidates.md). Upstream — bounded issue searches on depd and multiparty repos done. Runtime — load + full field-only parse exercised with core-surface snapshot diff; file-upload branch (`fs.createWriteStream`) verified statically only.

## Patching verdict

Patching is demonstrated, but it is narrow and entirely transitive:

- **Shared core mutations: 1** (F-001). depd@2.0.0 — reached via multiparty -> http-errors@2.0.0 -> depd — temporarily replaces `Error.prepareStackTrace` and raises `Error.stackTraceLimit` on the global `Error` constructor inside `getStack()`, restoring both synchronously before returning. It executes unconditionally at `require('multiparty')` time (and again on any deprecation log, which multiparty itself never triggers). **Transient, not permanent**: both properties are restored in the same synchronous frame; the reproduction shows no lasting change.
- **Instance/application overrides: 0.** multiparty's stream work is all documented extension (Writable/Transform subclassing via `util.inherits`, `_write`/`_transform` implementations, `emitClose: false` constructor option). Its writes onto part streams (`headers`, `name`, `filename`, `byteOffset`, `byteCount` on a library-created `PassThrough`) are additive metadata that shadow nothing on the core prototype chain. http-errors re-prototypes only error instances it creates itself.
- **Core module interception / core source rewrites: 0** (pattern groups G5/G6 zero-hit).
- Unresolved candidates: none. 31 candidates traced: 1 confirmed, 30 rejected.
- Excluded branches limiting the verdict: browser-only files (`depd/lib/browser/index.js`, `inherits/inherits_browser.js`), legacy fallbacks never taken on supported Node (safe-buffer pre-`Buffer.alloc` branch, setprototypeof ES5 fallbacks), and depd's `wrapfunction`/`wrapproperty` (capable of patching arbitrary objects, but with zero call sites in the inspected runtime scope).

## Confirmed Node.js patches

### F-001: transient replacement of `Error.prepareStackTrace` (and `Error.stackTraceLimit`) by depd's `getStack()`

- Category: shared core mutation (global `Error` constructor) — transient, synchronously restored
- Library site(s): `node_modules/depd/index.js:381-399` (writes at 386-387, restores at 395-396); pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399
- Origin: transitive — multiparty@4.3.1 -> http-errors@2.0.0 (`index.js:15`) -> depd@2.0.0
- Core baseline: `$NODEJS_SOURCE/lib/internal/errors.js:136-166` @ `d44625a4b80` — Node's per-realm `prepareStackTraceCallback` invokes a user-set `Error.prepareStackTrace` function **in place of** the default formatter (`$NODEJS_SOURCE/lib/internal/source_map/prepare_stack_trace.js:28`, source-map-aware). `Error.stackTraceLimit` caps frames collected by V8 for every stack capture.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (a depd function returning the raw CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)`; both previous values saved to locals and written back after `Error.captureStackTrace(obj)` + one `obj.stack` read.
- Execution chain: `require('multiparty')` ($PACKAGE_ROOT/index.js:11 `require('http-errors')`) -> http-errors `index.js:15` `require('depd')('http-errors')` -> depd `index.js:108` `getStack()` -> writes. Also re-executed per deprecation via `log()` (depd `index.js:199`) and in `wrapfunction`/`wrapproperty` (unreachable here).
- Activation: unconditional at module load — no guard, no env flag, production path. multiparty never triggers the additional per-call path (its `createError` statuses 400/413/415 never hit the http-errors `deprecate()` branch at http-errors `index.js:73`).
- Scope and restoration: process-global (every consumer of `Error` in the realm) during the write window; restored synchronously in the same job, so under single-threaded execution no other code observes the swap unless it, too, hooks stack preparation concurrently via re-entrancy (e.g. another `prepareStackTrace` implementation whose CallSites depd then consumes). After restore, behavior is baseline.
- Resulting behavior: during the window, any `error.stack` materialization would return a raw CallSite array instead of a formatted string, and stack collection depth is forced to >= 10. Practical effects are the historically documented collisions: with `--enable-source-maps` on early Node 12, Node's own stack machinery and depd's swap conflicted and crashed (`callSite.getFileName is not a function`); custom `prepareStackTrace` installations (e.g. source-map-support) interleave with depd's.
- Evidence: static — linear read of `getStack()` (save/replace/capture/restore). Reproduction (`repro-core-mutation-check.js`, output in `repro-output.txt`, Node v24.19.0): a sentinel `Error.prepareStackTrace` returning a string was installed before `require`; the require succeeded (impossible unless depd swapped in its own function — the sentinel's string return would crash depd's `stack[1]` CallSite access), the sentinel was intact afterwards (`restored to sentinel after require: true`), `Error.stackTraceLimit` restored (`true`), sentinel never invoked (`0`), and the full core-surface snapshot diff after load + a complete parse was `NONE`. Side observation: defining `Error.stackTraceLimit`/`prepareStackTrace` as accessors breaks depd's capture (V8 fast path expects data properties), which also confirms the write executes at require time.
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed — maintainer-acknowledged design); #36 "Incompatible with --enable-source-maps node 12 option" (closed; resolved on the Node side in later 12.x) and #39 "compatibility with Node.js' source-map implementation" (closed); #50 "callSite.getFileName is not a function" (open — third-party `prepareStackTrace` interplay). Behavior unchanged and present in the audited depd@2.0.0.

No other patch was demonstrated. multiparty's own shipped code contains no write to any core module, global, shared prototype, or foreign core-backed instance.

## Candidate ledger and unresolved questions

Full ledger with reasons: `candidates.md` (31 candidates: 1 confirmed, 30 rejected, 0 unresolved). Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-013 | depd `index.js:386-387,395-396`, `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | Transient global swap, load-time reachable, restored; repro + upstream issues |
| C-001/C-006 | `index.js:51,570`, `util.inherits(Form/LimitStream, stream.Writable/Transform)` | rejected | Core `util.inherits` ($NODEJS_SOURCE/lib/util.js:344-363) writes only the subclass ctor |
| C-002/C-003 | `index.js:55,240`, Writable `emitClose` option + `_write` | rejected | Documented option/extension point (writable.js:193,324 / 23,410) |
| C-004 | `index.js:167-168`, `req._readableState`/`req._decoder`/state.encoding/decoder | rejected | Private internal **reads** only; no write to `req` anywhere |
| C-005 | `index.js:551-559`, metadata props on library-created PassThrough | rejected | Additive; shadows nothing on the core prototype chain (runtime check: NONE) |
| C-007-C-010 | `index.js` misc (`self.handleError`, regex `lastIndex`, safe-buffer binding, `process.nextTick`) | rejected | Library-owned state / documented calls |
| C-011/C-012 | safe-buffer `index.js:12-27` | rejected | Modern branch `module.exports = buffer` is a pure re-export (identity-verified); writes flow core -> library only |
| C-014/C-015 | depd `wrapfunction`/`wrapproperty` | rejected | Patch-capable helpers with zero call sites in scope (http-errors never uses `deprecate.function/.property`) |
| C-016-C-019 | depd fresh-Error defineProperty, `process.emit('deprecation')`, stderr write, process reads | rejected | Own instances / documented additive API use |
| C-020-C-026 | http-errors load line, `inherits(..., Error)`, `setPrototypeOf(err, ...)`, instance/library-prototype defineProperty, `Error.captureStackTrace` | rejected | All writes land on library-owned constructors/prototypes or freshly created own error instances; `Error.prototype` untouched (repro diff NONE) |
| C-027-C-029 | inherits re-export, inherits browser fallback, setprototypeof re-export/fallbacks | rejected | Identity re-exports of `util.inherits`/`Object.setPrototypeOf`; fallbacks unreachable in Node runtime / mutate caller objects only |
| C-030/C-031 | statuses, toidentifier, uid-safe, random-bytes | rejected | Pure data/strings; read-only `global.Promise`/crypto feature detection and documented `crypto.randomBytes` calls |

Unresolved: none.

## Supporting context

- **Private API reads (no mutation):** $PACKAGE_ROOT `index.js:167-168` reads `req._readableState` (and its `.encoding`/`.decoder`) plus the ancient `req._decoder` to reject requests with an encoding set — a compatibility guard spanning Node 0.10-era and modern streams internals ($NODEJS_SOURCE/lib/internal/streams/readable.js:333-334,363). Fragile against internals changes, but strictly read-only.
- **Supported stream extension:** `Form` is a `stream.Writable` with `_write` and `emitClose: false`; parts are plain `stream.PassThrough` instances; `LimitStream` is a `stream.Transform` with `_transform`; files go through documented `fs.createWriteStream(..., { flags: 'wx' })`. All per-contract.
- **Part metadata:** multiparty decorates its own PassThrough part streams with `headers/name/filename/byteOffset/byteCount` — application-facing additive metadata, not an override.
- **safe-buffer:** on all supported Nodes it is byte-for-byte `require('buffer')` (identity-verified); the SafeBuffer shim class exists but is neither exported on that branch nor mutating core.
- **http-errors error classes:** classic pre-`class` subclass emulation (own constructors + `setPrototypeOf` on freshly created instances). Spec-sanctioned object surgery on objects the library owns.
- **depd patch-capable helpers:** `deprecate.function`/`deprecate.property` can redefine properties on arbitrary objects (including core ones) but have no call sites in this dependency closure — worth re-checking if http-errors ever starts using them.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT | `git log -1` | `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d` = v4.3.1; shipped runtime = `index.js` only (`files` array); no install hooks |
| $PACKAGE_ROOT runtime scope | skill pattern groups G1-G6 (`rg -n`, see searches.md) | G1-G4 hits fully traced (candidates.md); G5 (loader interception) and G6 (bindings/internals) zero-hit |
| Dependency tree | `npm install --ignore-scripts --omit=dev` result; per-package `package.json` | 9 packages at the pinned versions; no preinstall/install/postinstall; `browser` fields on depd/inherits only (not used by Node) |
| $NODEJS_SOURCE/lib/internal/streams/writable.js | `rg -n "emitClose"; rg -n "_write\b"` | `emitClose` documented option (193, 324); `_write` documented extension point (23, 410) |
| $NODEJS_SOURCE/lib/internal/streams/readable.js | `rg -n "_readableState =\|this.decoder\|this.encoding\|setEncoding"` | 333-334, 363, 631 — internal state multiparty only reads |
| $NODEJS_SOURCE/lib/util.js | `rg -n -A 20 "^function inherits"` | 344-363 — `inherits` mutates only the subclass ctor |
| $NODEJS_SOURCE/lib/internal/errors.js + lib/internal/source_map/prepare_stack_trace.js | `rg -n "prepareStackTrace"` | 136-166: user-set `Error.prepareStackTrace` replaces Node's default (source-map-aware) formatting — core baseline for F-001 |
| Reproduction | `node repro-core-mutation-check.js "$PACKAGE_ROOT"` (Node v24.19.0; output: repro-output.txt) | Sentinel proof of depd's save/replace/restore at require time; safe-buffer/inherits/setprototypeof identity re-exports; full field parse OK; core-surface snapshot diff NONE across stream/Buffer/Error/http/events/string_decoder/fs surfaces |
| Upstream depd | https://github.com/dougwilson/nodejs-depd/issues/32, /36, /39, /50 | Acknowledged `Error.prepareStackTrace` overwrite and its real-world collisions (source maps, foreign CallSites); behavior present in depd@2.0.0 |
| Upstream multiparty | `gh search issues --repo pillarjs/multiparty "monkeypatch OR prepareStackTrace OR prototype"` | Zero hits — no patching discussion for multiparty itself |

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (only shipped file; default `main`) read in full. `examples/`, `test/`, `tool/` excluded (not shipped, out of scope).
- Dependencies: every resolved runtime package's entrypoint read in full before exclusion (depd, http-errors, inherits, random-bytes, safe-buffer, setprototypeof, statuses, toidentifier, uid-safe). Browser-field files inspected and excluded as unreachable under Node.
- Node.js files consulted (targeted only, @ `d44625a4b80`): lib/internal/streams/writable.js, lib/internal/streams/readable.js, lib/internal/streams/destroy.js, lib/util.js, lib/internal/errors.js, lib/internal/source_map/prepare_stack_trace.js. No recursive core-tree scans.
- Branches tested: load + field-only parse (reproduction). Verified statically only: file-upload path (`fs.createWriteStream`/LimitStream piping), base64 transfer-encoding path, error/cleanup paths (`cleanupOpenFiles`, `fs.unlink`), depd per-call `log()` path. None of these contains additional candidate writes (all G1-G6 hits are accounted for), so this does not weaken the verdict.
- Untaken legacy branches (not patch-capable toward core by inspection): safe-buffer pre-`Buffer.alloc` branch, setprototypeof `__proto__`/mixin fallbacks, inherits browser fallback.
- What would change the verdict: http-errors (or another consumer in the closure) starting to call depd's `wrapproperty`/`wrapfunction` on core objects; a future safe-buffer/setprototypeof version mutating what it re-exports; evidence that depd's restore can be skipped (none exists — no early return or throw between write and restore in `getStack()`; `Error.captureStackTrace` on a plain object with a pure `prepareStackTrace` does not throw in supported engines).
- Provenance hashes (SHA-256, relative to $PACKAGE_ROOT): index.js `9619dcd68f48a349ec5f8fc2908850c0ca7d3078860e42f51cabc2032adc27f2`; depd/index.js `4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91`; http-errors/index.js `0f484a62f0587e00002f3fd194b1aca9bcdd1881fcb3250e98b5ac17df7dd1fd`; safe-buffer/index.js `184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1`; inherits/inherits.js `bb380f32bef5feb18678f0f45f88073fed5d7a0069a309132cb2080cd553d5c7`; setprototypeof/index.js `3e3495ca7ae72a7f0ca459f47dd3d97ae3a48fa4b1a669a31672be778cc97a5f`; statuses/index.js `96a0698e899f5889cf254d1f2e351f3253a37921c7f87269b0e87a497dec666a`; toidentifier/index.js `f9f26b0e90e2569b61d02ef2a92718624b8854592b1ede7f2c8879a69cfdba05`; uid-safe/index.js `1068a5918f3669a939c1c8865f2394cdc3ac126677e04d016a9e6fa9d9ff9a91`; random-bytes/index.js `d9a829fc576892245375789e614a398a577243d1649f7aed0e1b3d2e19bd8376`.

## Changes since the previous audit

First audit (pass A of the blind two-pass protocol); no previous report existed in this folder.
