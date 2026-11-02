# Node.js patch audit: multer

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: npm package `multer` (Node.js multipart/form-data upload middleware), local clone at `$PACKAGE_ROOT`
- Library: multer 2.5.0, commit `2c380d06cdaacc68bbef8b36244493a3d33d6b88` (branch main), git clone of https://github.com/expressjs/multer; no local changes observed
- Node.js baseline: `$NODEJS_SOURCE`, main branch, commit `d44625a4b80`
- Reproduction runtime: Node v24.19.0 (`repro-no-patch.js` beside this report)
- Scope: production/runtime code only — `index.js`, `lib/**` (counter, file-appender, make-middleware, multer-error, remove-uploaded-files, validate-limits), `storage/**` (disk, memory), plus all resolved runtime dependencies installed at `$PACKAGE_ROOT/node_modules` (`--ignore-scripts --omit=dev`): append-field@1.0.0, busboy@1.6.0, streamsearch@1.1.0, type-is@1.6.18, media-typer@0.3.0, mime-types@2.1.35, mime-db@1.52.0. Tests, examples, and docs excluded.
- Coverage: source — complete (every runtime file of the target and of each resolved runtime dependency read in full, all skill search patterns run over the whole scope); upstream — targeted corroboration of busboy issue #319; runtime — identity/prototype reproduction run on Node v24.19.0. No limitations that affect the verdict.

## Patching verdict

No patching of Node.js core was demonstrated anywhere in the inspected scope.

- Shared core mutations (core APIs, globals, shared prototypes, module loading, core source): **0 confirmed**. The skill's search patterns for prototype mutation, `defineProperty` on core objects, loader interception (`require.cache`, `Module._*`, `require.extensions`, `syncBuiltinESMExports`, `registerHooks`), `process.binding`/`internalBinding`, and patch/wrap/shim vocabulary returned no hits on core targets across multer and all seven runtime dependencies.
- Instance/application overrides of core-backed objects: **0 confirmed**. Multer writes only *additive application-data properties* on the live request instance (`req.body`, `req.file`, `req.files`); none of these names is a core `http.IncomingMessage` API (verified against `$NODEJS_SOURCE/lib/_http_incoming.js`), and no existing core method or accessor on the request, response, or any stream is reassigned or deleted. All interaction with core streams and `fs` is through documented method calls (`req.pipe/unpipe/resume/on`, `fs.createWriteStream/mkdirSync/open/fsync/close/unlink`, `stream.pipeline`).
- Transitive origin: busboy and streamsearch subclass `stream.Writable`/`stream.Readable` strictly through the documented `_write`/`_final`/`_destroy`/`_read` extension contract and mutate only their own instances; append-field writes only into the null-prototype `req.body` container multer hands it (no reachable `Object.prototype`/`__proto__` pollution in multer's usage — confirmed statically and by reproduction); type-is/media-typer/mime-types/mime-db are read-only parsers/data.
- Unresolved candidates: none. All 29 ledger candidates were resolved (all rejected as patches). The urlencoded branch of busboy is never activated by multer (multipart content-type only) but was inspected anyway and is clean.

## Confirmed Node.js patches

None. No reachable write or replacement of a core API, global, shared prototype, core-backed instance method, core module loading mechanism, or core source was found. (Private core API *calls* and documented extension points observed during the audit are listed under Supporting context; none of them mutates core.)

## Candidate ledger and unresolved questions

Full ledger with rationale in `candidates.md`. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `lib/make-middleware.js:136` — `req.body =` on IncomingMessage instance | rejected as patch | additive app-data property; no core `body` API on IncomingMessage (`$NODEJS_SOURCE/lib/_http_incoming.js`) |
| C-002 | `lib/file-appender.js:13-14,57` — `req.files`/`req.file` writes | rejected as patch | additive app-data properties on the request instance; no core API shadowed |
| C-003 | `lib/make-middleware.js:76-79` — reassigns `next` | rejected as patch | local variable wrapping caller-supplied Express callback via documented `AsyncResource.runInAsyncScope`; not core |
| C-004 | `lib/make-middleware.js:66,160,169,231` — `req.pipe/unpipe/resume` | rejected as patch | method calls, never reassignment; methods verified at `$NODEJS_SOURCE/lib/internal/streams/readable.js:978,1180,1327` |
| C-005 | `lib/make-middleware.js:39-43` — drainStream on req | rejected as patch | additive `'readable'` listener + `read()` calls only |
| C-006 | `lib/make-middleware.js:161-165` — `busboy.removeAllListeners()` | rejected as patch | listener management on library-owned busboy instance, not a core object |
| C-007 | `lib/make-middleware.js:384-388` — `Object.defineProperty(file,'stream',…)` | rejected as patch | target is a library-owned plain object, not core |
| C-008 | `lib/counter.js:8` — `Counter.prototype = Object.create(EventEmitter.prototype)` | rejected as patch | ordinary inheritance; `EventEmitter.prototype` itself untouched |
| C-009 | `lib/multer-error.js:44` — `util.inherits(MulterError, Error)` | rejected as patch | mutates only library-owned `MulterError.prototype`; `Error.prototype` untouched |
| C-010 | `storage/disk.js:53,73,107,113-114,137` — fs API usage | rejected as patch | calls only; APIs exist at `$NODEJS_SOURCE/lib/fs.js:741,1647,1740,2418,3971`; no write to `fs` |
| C-011 | `storage/disk.js:76-77,142-160` — fs.WriteStream instance handling | rejected as patch | listener additions, `destroy()` call, reads of documented `closed`/`bytesWritten`; no property written on the core stream (WeakMaps keyed by file object) |
| C-012–C-016 | remaining multer sites (pipeline call, memory-storage listeners, `delete file.*`, own prototypes, AsyncResource) | rejected as patch | calls/deletes on library-owned objects or documented API use |
| C-017/C-021 | busboy `multipart.js:221,565,572,585` / `urlencoded.js:7,56,220` — `extends Writable` + `_write/_destroy/_final` | rejected as patch | documented subclass contract (`$NODEJS_SOURCE/lib/internal/streams/writable.js:837` default throws `ERR_METHOD_NOT_IMPLEMENTED`; options accepted at 410-419) |
| C-018/C-019/C-022 | busboy `multipart.js:174,194,484,479-480` — `FileStream extends Readable`, `_read`, `_readcb`, `emit('limit')`, `truncated` | rejected as patch | documented `_read` override (`$NODEJS_SOURCE/lib/internal/streams/readable.js:699`); `_readcb`/`truncated` are library-defined props on its own subclass instances |
| C-020 | busboy `multipart.js:63,73,112` + `utils.js:434,442,450,458`; urlencoded equivalents — `chunk.latin1Slice/utf8Slice/ucs2Slice/base64Slice` | rejected as patch | *calls* of undocumented core `Buffer.prototype` methods (`$NODEJS_SOURCE/lib/internal/buffer.js:1071-1076`); private API usage, zero mutation → supporting context |
| C-023 | streamsearch `lib/sbmh.js` (whole file) | rejected as patch | plain class; writes only into its own `_lookbehind` buffer; incoming chunks only read/copied-from |
| C-024 | append-field `lib/set-value.js:12-23,37-59` — computed-key writes incl. possible `__proto__` keys | rejected as patch | every container in multer's usage is null-prototype (`req.body = Object.create(null)` at `lib/make-middleware.js:136`; nested objects `Object.create(null)` at `set-value.js:39,49,57`); array steps numeric-only (`parse-path.js:28-35`); no reachable shared-prototype write — confirmed by reproduction |
| C-025–C-029 | mime-types/mime-db/type-is/media-typer; busboy `this.write(BUF_CRLF)`, `new TextDecoder`, multer req listeners | rejected as patch | own-exports population, read-only parsing, self-calls, additive listeners |

Unresolved: none.

## Supporting context

- **Private core API usage (calls, not mutation):** busboy and its urlencoded branch call the undocumented `Buffer.prototype.latin1Slice`, `utf8Slice`, `ucs2Slice`, `base64Slice` methods that Node attaches to buffers (`$NODEJS_SOURCE/lib/internal/buffer.js:1071-1076`). This is a portability/correctness dependency on core internals, not a patch. Upstream corroboration: mscdex/busboy#319 (closed) discusses the `latin1Slice` usage affecting filename decoding; multer compensates at the application layer (`defParamCharset` option, WHATWG escape reversal in `lib/make-middleware.js:52-60`), without touching core.
- **Core-backed instance, additive data only:** `req.body`/`req.file`/`req.files` are the documented multer outputs placed on the live `http.IncomingMessage`; they shadow nothing in core and follow the Express-ecosystem convention. `req.body` is deliberately a null-prototype object, which also neutralizes append-field's `__proto__`-shaped field names.
- **Supported stream extensions:** busboy's `Multipart`/`URLEncoded` (Writable) and `FileStream` (Readable) implement exactly the `_write/_final/_destroy/_read` hooks the stream classes define for subclasses. Deferring the `_write` callback for backpressure (`multipart.js:482-486`) is the documented mechanism, not an override of core behavior.
- **No install-time vector:** neither multer nor any runtime dependency declares preinstall/install/postinstall/prepare scripts; dependencies were installed with `--ignore-scripts` in any case. No native addons, no bundled/dist artifacts beyond the plain JS files listed below.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree | `find` + full reads of `index.js`, `lib/*.js`, `storage/*.js` | 9 runtime files; all read in full; no core writes |
| Runtime dependencies | full reads of append-field (3 files), busboy (5 files), streamsearch (1), type-is (1), media-typer (1), mime-types (1), mime-db (1) | all entrypoints/initialization inspected; no core writes; no install hooks |
| Skill patterns P1–P6 | `rg -n --no-ignore` over the full scope (see `searches.md`) | P4 (patch/wrap/shim), P5 (loader interception), P6 (bindings/internals): zero hits; P1–P3 hits all triaged in ledger |
| Targeted writes | `rg` for `core-module.prop =`, `req./res. =`, `delete x.y`, `globalThis[`/`process[` etc. | only `req.body/file/files` writes and deletes on library-owned objects (C-001/C-002/C-014) |
| `$NODEJS_SOURCE/lib/internal/streams/writable.js` | grep `_write|_final|_destroy` | lines 410-419 (constructor options), 837-841 (default `_write` throws): subclass contract confirmed |
| `$NODEJS_SOURCE/lib/internal/streams/readable.js` | grep `_read`, `prototype.pipe/unpipe/resume` | line 699 override comment; methods at 978/1180/1327: multer only calls them |
| `$NODEJS_SOURCE/lib/internal/buffer.js` | grep `latin1Slice` etc. | lines 1071-1076: core-provided private prototype methods; busboy calls, never assigns |
| `$NODEJS_SOURCE/lib/_http_incoming.js` | grep `body|files` | no core `body`/`file`/`files` property on IncomingMessage |
| `$NODEJS_SOURCE/lib/fs.js` | grep API names | `open:741, fsync:1647, mkdirSync:1740, unlink:2418, createWriteStream:3971` all exist; disk storage calls only |
| Upstream busboy | https://github.com/mscdex/busboy/issues/319 (closed) | corroborates `latin1Slice` private-API usage as a usage issue, not a patch |
| Reproduction | `node repro-no-patch.js "$PACKAGE_ROOT"` (Node v24.19.0) | 26 core identities (fs/stream/EventEmitter/Buffer/Object/Error prototypes and functions) unchanged after require and after a full multipart middleware run; `Object.prototype` not polluted by `__proto__[x]` / `a[__proto__][x]` field names; ALL CHECKS PASSED |

## Coverage and limitations

- Entry points: `index.js` (sole export, plus `diskStorage`/`memoryStorage`/`MulterError` re-exports); `package.json` ships only `LICENSE`, `index.js`, `storage/`, `lib/` — no conditional exports, no dist/bundled artifacts, no install scripts.
- Resolved runtime dependencies all inspected at their installed versions (entrypoint and every transitive runtime file): append-field@1.0.0, busboy@1.6.0 (→ streamsearch@1.1.0), type-is@1.6.18 (→ media-typer@0.3.0, mime-types@2.1.35 → mime-db@1.52.0).
- Node.js files read (targeted only, per skill table): `lib/stream.js`, `lib/internal/streams/writable.js`, `lib/internal/streams/readable.js`, `lib/buffer.js`, `lib/internal/buffer.js`, `lib/_http_incoming.js`, `lib/fs.js` at commit `d44625a4b80`.
- Branches tested/excluded: memory storage exercised in reproduction; disk storage verified statically (pure `fs` calls; its `flush` branch re-opens the file with `fs.open` — still calls only). busboy's urlencoded type is unreachable from multer (multipart-only) but was inspected and is clean. The reproduction exercises one Node version (v24.19.0); the static analysis is version-independent, and a tested branch cannot prove universal absence, but no unresolved static candidate remains.
- What would change the verdict: a future dependency version drift (e.g. a different busboy resolution) would need re-inspection; this audit is pinned to the installed versions above.
- Runtime file hashes (sha256, first 16 hex chars), relative to `$PACKAGE_ROOT`:
  - `0f22dd72885ab7e5 index.js`
  - `64d87543234af259 lib/counter.js`
  - `241d21ca3ce5d4df lib/file-appender.js`
  - `2e0b341454fafd93 lib/make-middleware.js`
  - `038786618f29709f lib/multer-error.js`
  - `3eed40d41317c3d1 lib/remove-uploaded-files.js`
  - `086ef5c8525ed2c9 lib/validate-limits.js`
  - `756e3ca6eefb2824 storage/disk.js`
  - `70f8bc157693264d storage/memory.js`
  - `7936bb3a4f3ddd27 node_modules/append-field/index.js`
  - `2ecbacf8bb8141a9 node_modules/append-field/lib/parse-path.js`
  - `1b2beb3a462895e8 node_modules/append-field/lib/set-value.js`
  - `68b02752427ebe8b node_modules/busboy/lib/index.js`
  - `32df95b2d52d7f1c node_modules/busboy/lib/utils.js`
  - `ed88b51e44c230f1 node_modules/busboy/lib/types/multipart.js`
  - `282f1bdfc0b39031 node_modules/busboy/lib/types/urlencoded.js`
  - `b12da7985e18a80e node_modules/streamsearch/lib/sbmh.js`
  - `4a94338bd746c6b1 node_modules/type-is/index.js`
  - `27af6de782c53c57 node_modules/media-typer/index.js`
  - `8cfccaac306beb65 node_modules/mime-types/index.js`
  - `2ccebf3d525708c9 node_modules/mime-db/index.js`

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous findings to revalidate.
