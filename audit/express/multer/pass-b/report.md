# Node.js patch audit: multer

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: npm package `multer` (Express multipart/form-data middleware), local checkout at `$PACKAGE_ROOT`
- Library: multer 2.5.0, git commit 2c380d06cdaacc68bbef8b36244493a3d33d6b88 (release commit "2.5.0 (#1490)", https://github.com/expressjs/multer), source checkout with runtime dependencies installed (`--ignore-scripts --omit=dev`); no local modifications observed, and the dependency whose content mattered most (append-field@1.0.0) was verified byte-identical to the npm registry artifact
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf at `$NODEJS_SOURCE`
- Reproduction runtime: Node.js v24.19.0 (`node <audit-dir>/repro-core-identity.js "$PACKAGE_ROOT"`)
- Scope: runtime code only — `index.js`, `lib/**` (6 files), `storage/**` (2 files), and the resolved runtime dependency tree: append-field@1.0.0, busboy@1.6.0 (→ streamsearch@1.1.0), type-is@1.6.18 (→ media-typer@0.3.0, mime-types@2.1.35 → mime-db@1.52.0). Tests, benches, examples, docs excluded
- Coverage: source — complete (every runtime file in the target and every dependency entry/initialization path read in full); upstream — release commit verified via GitHub API, issue search run, append-field artifact diffed against registry; runtime — load-time + instantiation identity check executed (no per-request HTTP reproduction; static proof sufficed)

## Patching verdict

Multer 2.5.0 does **not** patch or monkeypatch Node.js core, directly or through
its runtime dependencies.

- Shared core mutations: **0**. No write to any core module object, global,
  core prototype (`Object`, `Buffer`, `stream.Readable/Writable`,
  `EventEmitter`, `http.IncomingMessage`, `fs`), and no descriptor change,
  prototype reassignment, or deletion on core-owned objects anywhere in scope.
- Instance/application overrides: **0**. The only writes to core-backed
  instances are three new library-owned metadata keys on the live request
  (`req.body`, `req.file`, `req.files`) — none shadows or replaces an
  `http.IncomingMessage` member (verified against
  `$NODEJS_SOURCE/lib/_http_incoming.js`). No method or field of the request,
  any stream, or any fs object is overwritten, wrapped, or restored.
- Core module interception: **0**. No `require.cache`/`require.extensions`/
  `Module._*`/loader-hook/`internalBinding` usage in scope (patterns P-05,
  P-06: zero matches).
- Core source rewrites: **0**. No on-disk modification of anything under a
  Node.js installation; dependencies installed with `--ignore-scripts` and none
  declares install hooks.
- Unresolved candidates: none. All 29 ledger candidates were traced to their
  exact write target and rejected (see candidates.md).

Key sub-questions from the audit brief, answered:

- **busboy's handling of the request stream**: busboy never touches the request.
  Multer pipes the request into busboy (`lib/make-middleware.js:66`) and on
  teardown calls `req.unpipe(busboy)`, `req.resume()`, and a `read()` drain loop
  (`lib/make-middleware.js:160,168-169,39-43`) — all documented
  `Readable.prototype` method **calls** (`$NODEJS_SOURCE/lib/internal/streams/readable.js:978,1180,1327`),
  never reassignments. busboy itself is a `Writable` subclass implementing the
  documented `_write`/`_destroy`/`_final` extension points
  (`node_modules/busboy/lib/types/multipart.js:565,572,585`; core contract at
  `$NODEJS_SOURCE/lib/internal/streams/writable.js:837,1166`), and its deferred
  `_writecb`/`_readcb` backpressure fields are busboy-owned properties on
  busboy-owned instances — core's write state lives in `_writableState`, which
  busboy never touches.
- **Event-listener manipulation**: only documented `on`/`once`/
  `removeListener`/`removeAllListeners` calls; `removeAllListeners` is invoked
  solely on multer's own busboy instance (`lib/make-middleware.js:162`). No
  `_events` access anywhere in scope (search T-02).
- **streamsearch internals**: pure Boyer-Moore-Horspool state on its own
  instance; chunk buffers are read and copied via documented Buffer methods,
  never structurally modified (`node_modules/streamsearch/lib/sbmh.js`).
- **append-field and `__proto__`/`constructor` keys**: append-field writes only
  into the store the caller passes. Multer passes
  `req.body = Object.create(null)` (`lib/make-middleware.js:136`) and
  append-field creates all intermediates with `Object.create(null)`
  (`node_modules/append-field/lib/set-value.js:39,49,57`), so proto-named keys
  become inert own properties; no shared-prototype write is reachable.
  Confirmed by reproduction (R-02).
- **mime-types/mime-db load-time work**: populates mime-types' own
  `exports.extensions`/`exports.types` maps from static JSON at require time
  (`node_modules/mime-types/index.js:30-39`); `path.extname` is referenced and
  called, never modified. mime-db exports JSON only.

## Confirmed Node.js patches

None. No candidate rose to a reachable write or replacement of a core API,
global, shared prototype, core-backed instance member, module loading, or core
source. (Private API reads and normal extension-point usage are listed under
supporting context, per the skill.)

## Candidate ledger and unresolved questions

Full ledger with per-site analysis in `candidates.md` (same directory).
Condensed view — all rejected, none unresolved:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | lib/make-middleware.js:77 — `next` reassignment | rejected as patch | Local closure variable wrapping caller's callback with public `AsyncResource.runInAsyncScope`; no object property written |
| C-002..C-004 | lib/make-middleware.js:136; lib/file-appender.js:13-14,57 — `req.body`/`req.files`/`req.file` on live IncomingMessage | rejected as patch | New library-owned keys; IncomingMessage defines none of them ($NODEJS_SOURCE lib/_http_incoming.js) — request metadata, not an override |
| C-005 | lib/make-middleware.js:384 — `Object.defineProperty(file,'stream',…)` | rejected as patch | Library-owned plain object |
| C-006 | lib/make-middleware.js:66,160,168-169,231,342,361,371 — req/fileStream `pipe`/`unpipe`/`resume`/read-drain | rejected as patch | Documented method calls; no reassignment of any stream method in scope |
| C-007, C-014 | lib/make-middleware.js:162,165,177-179,237-248 — listener add/remove | rejected as patch | Documented EventEmitter API; `removeAllListeners` only on multer's own busboy instance; no `_events` access |
| C-008, C-009 | lib/counter.js:8; lib/multer-error.js:44 — inheritance from EventEmitter/Error | rejected as patch | Writes own `prototype`/subclass chain only; core prototypes read, never mutated |
| C-010..C-012, C-015 | storage/disk.js, storage/memory.js, index.js, lib/file-appender.js — fs/stream usage and own-prototype method definitions | rejected as patch | Documented fs/stream/pipeline calls; reads of core-set `bytesWritten`/`closed`; all `.prototype` writes on library constructors |
| C-016..C-018, C-020..C-023 | busboy lib/index.js, lib/types/multipart.js, lib/types/urlencoded.js, lib/utils.js — Writable/Readable subclasses, `_writecb`/`_readcb`/`_bparser` fields, header parsers | rejected as patch | Documented `_write`/`_read`/`_destroy`/`_final` subclass contract ($NODEJS_SOURCE lib/internal/streams/writable.js:837,1166; readable.js:411,974); all mutated fields are busboy-owned on busboy-owned instances |
| C-019 | busboy utils.js:434,442,450,458 + 14 further sites — `latin1Slice`/`utf8Slice`/`ucs2Slice`/`base64Slice` | rejected as patch | Calls to undocumented core Buffer.prototype methods installed by core itself ($NODEJS_SOURCE lib/internal/buffer.js:1071-1076); reads only → supporting context |
| C-024 | streamsearch lib/sbmh.js | rejected as patch | Own-state computation; documented Buffer copies |
| C-025 | append-field lib/set-value.js (all writes) — `__proto__`/`constructor` key handling | rejected as patch | Writes land on multer's null-prototype `req.body` or append-field's `Object.create(null)` intermediates; no shared-prototype path; reproduction R-02 confirms no `Object.prototype` change; artifact identical to registry (U-03) |
| C-026..C-029 | type-is, media-typer, mime-types, mime-db entry/init | rejected as patch | Header reads and own-exports map population only; `path.extname` called, not modified |

## Supporting context

- **Private core API reads (busboy)**: busboy calls the undocumented
  `Buffer.prototype.latin1Slice/utf8Slice/ucs2Slice/base64Slice` fast-path
  methods (18 call sites, e.g. `node_modules/busboy/lib/utils.js:434-458`,
  `node_modules/busboy/lib/types/multipart.js:63`). Core installs these on the
  Buffer prototype itself (`$NODEJS_SOURCE/lib/internal/buffer.js:1071-1076`);
  busboy only invokes them. This is a fragility/compat concern, not a patch.
- **Request metadata (multer)**: `req.body`, `req.file`, `req.files` are added
  to the live request per the standard Express middleware convention; cleared
  candidates C-002..C-004.
- **Library-level workaround, not a core workaround**: multer re-checks
  `fieldNameSize` itself (`lib/make-middleware.js:278-281,344-347`) to work
  around busboy bug https://github.com/mscdex/busboy/issues/6 — a fix layered
  over a dependency, with no Node.js involvement.
- **Documented extension points**: busboy's `Multipart`/`URLEncoded`/
  `FileStream` subclass `stream.Writable`/`stream.Readable` through the
  constructor/underscore-method contract; multer's storage engines consume
  `file.stream` with ordinary `pipeline`/listener APIs. multer's
  `AsyncResource('multer')` usage is the documented userland
  async-context-tracking pattern.
- **Hardening observations (not patches)**: multer initializes `req.body` and
  nested containers as null-prototype objects and busboy/mime-types use
  `Object.create(null)` maps, which is what keeps the client-controlled
  `__proto__`/`constructor` field names inert (reproduction R-02).

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime tree | Full reads of index.js, lib/** (6), storage/** (2) + skill pattern set P-01..P-06 (searches.md) | No patch-keyword, loader-hook, or binding/internal hits (P-04/P-05/P-06 zero matches); every `.prototype`/defineProperty/assign write traced to library-owned objects |
| Dependency entry/init paths | Full reads: append-field (index + 2 lib files), busboy (lib/index.js, utils.js, types/multipart.js, types/urlencoded.js), streamsearch (lib/sbmh.js), type-is, media-typer, mime-types, mime-db | No core writes; all load-time work confined to each module's own exports |
| $NODEJS_SOURCE lib/internal/streams/writable.js:410,837,845,1166; lib/internal/streams/readable.js:411,974,978,1180,1327 | targeted `rg -n` + line reads | Confirms `_write`/`_writev`/`_destroy`/`_final`/`_read` are the subclass extension points busboy implements, and that `pipe`/`unpipe`/`resume`/`push` are prototype methods multer only calls |
| $NODEJS_SOURCE lib/internal/buffer.js:1071-1076; lib/buffer.js | targeted `rg -n` | Core itself installs the `*Slice` methods busboy calls — busboy reads private API, mutates nothing |
| $NODEJS_SOURCE lib/internal/fs/streams.js:415; lib/internal/streams/utils.js:240-251; lib/async_hooks.js:180,220; lib/_http_incoming.js | targeted `rg -n` | `bytesWritten`/`closed` are core-provided fields multer reads; `AsyncResource.runInAsyncScope` is public API; IncomingMessage has no `body`/`file`/`files` member |
| Reproduction | `node repro-core-identity.js "$PACKAGE_ROOT"` (Node v24.19.0; script beside this report) | Own-key sets and function identities of Readable/Writable/IncomingMessage/EventEmitter/Buffer/Object prototypes and `fs` unchanged after `require('multer')` + instantiating all factories; append-field proto-key probe left `Object.prototype` untouched |
| Upstream — expressjs/multer | `gh api repos/expressjs/multer/commits/2c380d0…`; `gh search issues --repo expressjs/multer "monkeypatch OR monkey-patch OR prototype pollution"` | Commit confirmed as release "2.5.0 (#1490)"; issue search returned no results |
| Upstream — append-field | `npm pack append-field@1.0.0` + recursive diff vs installed copy | Byte-identical to registry — the installed `Object.create(null)` behavior is upstream, not a local patch |
| Upstream — busboy | https://github.com/mscdex/busboy/issues/6 (referenced in lib/make-middleware.js:278,344) | Open busboy limitation; multer's in-code workaround is library-level, no Node.js patch involved |

## Coverage and limitations

- Entry points covered: multer's single export (`index.js`) and every factory
  it exposes (`single`/`array`/`fields`/`none`/`any`, `diskStorage`,
  `memoryStorage`, `MulterError`), plus the full middleware execution path in
  `lib/make-middleware.js`. All 9 multer runtime files read in full.
- Dependencies covered at their resolved versions with entry/initialization
  paths followed: append-field@1.0.0, busboy@1.6.0, streamsearch@1.1.0,
  type-is@1.6.18, media-typer@0.3.0, mime-types@2.1.35, mime-db@1.52.0.
  busboy's urlencoded branch was audited even though multer never activates it
  (multer gates on `multipart`).
- Node.js baseline files read (targeted only, per the skill): internal stream
  writable/readable implementations, internal buffer, fs streams, stream utils,
  async_hooks, _http_incoming — all at commit d44625a4b80c672215b469906ce583ce7eeeebaf.
- Reproduction limits: the identity check covers module load and middleware
  construction on Node v24.19.0; it does not drive a live HTTP multipart
  request. Static analysis of the per-request path found only documented calls,
  so a tested-branch caveat applies in principle but no unresolved candidate
  depends on it.
- Out of scope / untested: devDependencies, tests, examples, benches; optional
  user-supplied hooks (`storage` engines, `fileFilter`, `streamHandler`,
  `limits` functions) are application code injected by the consumer — a
  third-party engine could itself patch core, but nothing shipped in this
  package does.
- What would change the verdict: discovery of a shipped code path writing to a
  core prototype/module/global, loader interception, or replacement of a method
  on `req`/streams/fs objects. None exists in the audited tree.

## Changes since the previous audit

First audit (independent pass B of a double-blind protocol; no other audit
output was read).
