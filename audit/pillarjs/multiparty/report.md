# Node.js patch audit: multiparty

- Verdict: **confirmed patching**
- Status: complete
- Input: issue sheplu/express-analysis#25 (`multiparty`, https://github.com/pillarjs/multiparty)
- Library: multiparty 4.3.1, git master @ `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): http-errors@2.0.0, safe-buffer@5.2.1, uid-safe@2.1.5 (+ transitives depd@2.0.0, inherits@2.0.4, random-bytes@1.0.0, setprototypeof@1.2.0, statuses@2.0.1, toidentifier@1.0.1)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; real multipart POST — field + file — through `http.createServer` + `form.parse(req)`)
- Scope: production/runtime code — `index.js` plus all 9 resolved runtime dependencies' runtime files. Tests, examples, docs, devDependencies, browser-field variants excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream corroboration found (dougwilson/nodejs-depd#32, #36, #39, #50)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements (one finding-granularity difference merged); key sites re-verified directly during reconciliation.

## Patching verdict

multiparty **patches Node.js core transitively and transiently** through depd@2.0.0, reached via http-errors@2.0.0. multiparty's own shipped code performs no Node core patch: it subclasses core streams through documented extension points and writes metadata only to library-created instances. One confirmed patch site (two property writes; pass B counted them as F-001/F-002, merged per site convention):

- **F-001:** depd's `getStack()` transiently swaps `Error.prepareStackTrace` (displacing Node's bootstrap-installed default) and `Error.stackTraceLimit` on the global `Error` constructor, restoring both synchronously. Fires unconditionally at `require('multiparty')`; multiparty's own error paths (400/413/415) never trigger deprecation logs.

0 permanent mutations; 0 instance/application overrides qualifying as patches; 0 module interception; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd `getStack()`)

- Category: shared core mutation (process-global `Error` constructor properties), transient
- Library site(s): `node_modules/depd/index.js:386-387` (writes), `:382,:384` (saves), `:395-396` (restores) — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js
- Origin: transitive — multiparty -> http-errors@2.0.0 -> depd@2.0.0
- Core baseline: bootstrap-installed default `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:485-511` (value `ErrorPrepareStackTrace`, impl `lib/internal/errors.js:168`; userland assignment honored at `errors.js:149-151`) — depd replaces an actual core-installed function, not an empty hook; `Error.stackTraceLimit` is V8's capture-depth control.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace`; `Error.stackTraceLimit = Math.max(10, limit)`; both restored to saved originals.
- Execution chain: `require('multiparty')` -> `index.js:11` (`require('http-errors')`) -> `http-errors/index.js:15` (`require('depd')('http-errors')`) -> `depd/index.js:108` (`getStack()`); re-fires per deprecation log (`depd/index.js:199`) — never on multiparty's own call paths at this version.
- Activation: unconditional at import time; production path; no opt-out.
- Scope and restoration: process-wide while held; synchronous same-tick restore; **not exception-guarded** (static reasoning).
- Resulting behavior: within each window, stacks captured anywhere in the process format as depd's callsite array (bypassing Node's source-map-aware default) and capture depth is forced ≥ 10; baseline restored afterwards.
- Evidence: static (chain re-verified by orchestrator); dynamic (both passes, Node v24.19.0): accessor trap recorded exactly 2 set events during require (swap + faithful restore of `ErrorPrepareStackTrace`); with `stackTraceLimit` pre-set to 3, the trap observed 3 at swap time and 10 at restore time, final value restored to 3 — proving the transient raise; zero steady-state diffs across all monitored surfaces after require AND after a full multipart parse.
- Upstream: dougwilson/nodejs-depd#32 (closed, maintainer keeps behavior), #36/#39 (source-maps interactions), #50.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (31 entries), `pass-b/candidates.md` (21 entries) — same substantive sites at different granularity, 0 unresolved in both. Key entries:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-01 | `depd/index.js:386-387` -> `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | transient swap/restore at require time |
| C-02 | `index.js` Form `extends`-style Writable subclassing via `util.inherits`, LimitStream Transform subclassing (`_write`/`_transform`, `emitClose:false`) | rejected | documented extension points (`$NODEJS_SOURCE/lib/internal/streams/writable.js:23-24,193,324,410`, `transform.js:162`); core prototypes untouched |
| C-03 | `index.js:167-168` `req._readableState` / `req._decoder` | rejected | private API **reads** only — no write to req anywhere in the package; supporting context |
| C-04 | `index.js:547-559` `destStream.headers/name/filename/byteOffset/byteCount` | rejected | additive metadata on a `PassThrough` the library itself creates (`index.js:547`); shadows nothing on the core prototype chain (runtime-verified) |
| C-05 | `safe-buffer@5.2.1` | rejected | modern branch taken: `module.exports = buffer` pure re-export (`index.js:12-13`), identity-verified `=== require('buffer')`; legacy copy branch dead on Node ≥ 4.5 |
| C-06 | `inherits@2.0.4` / `setprototypeof@1.2.0` | rejected | re-exports of native `util.inherits` / `Object.setPrototypeOf`; applied to library-owned ctors only |
| C-07 | `http-errors@2.0.0` prototype work | rejected | mutates only its own constructors and freshly created error instances |
| C-08 | depd `wrapfunction`/`wrapproperty` | rejected | zero call sites in this closure |
| C-09 | statuses/toidentifier/uid-safe/random-bytes | rejected | pure data/crypto reads; own exports only |

## Supporting context

- `index.js:167-168` reads the **private** `req._readableState` (and legacy `req._decoder`) to detect a corrupting `setEncoding` on the request — undocumented-internals *usage* to track (`_readableState` layout is not API), but read-only: not a patch.
- Part streams expose `headers/name/filename/byteOffset/byteCount` expandos on library-created `PassThrough` instances — additive instance metadata, no core member shadowed.
- safe-buffer's raison d'être is patch-*avoidance*: on modern Node it is a byte-for-byte re-export of `require('buffer')`.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree (10 packages) | skill's six candidate pattern groups via scoped `rg -n` (logs: `pass-a/searches.md`, `pass-b/searches.md`) | groups 5 (loader interception) and 6 (bindings/internals) zero hits; all other hits ledgered |
| `$NODEJS_SOURCE/lib/internal/streams/writable.js:23-24,193,324,410`, `transform.js:162`; `lib/internal/bootstrap/realm.js:485-511`; `lib/internal/errors.js:136-170` | direct reads at `d44625a4b80` | documented subclassing contract; F-001 core baseline |
| Reproduction | `node pass-a/repro-core-mutation-check.js "$PACKAGE_ROOT"`; `node pass-b/repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | real multipart POST (field + 25-byte file) parsed correctly; 2 transient writes at require with faithful restore; sentinel stackTraceLimit=3 observed 3→10→3; zero diffs across stream/fs/http/EventEmitter/Buffer/StringDecoder/Object prototypes, Module._*, require.cache, process.binding, globals |
| Upstream depd | dougwilson/nodejs-depd#32, #36, #39, #50 | corroborate F-001 code and maintainer stance |

## Coverage and limitations

- File-upload, base64, and error-cleanup paths verified statically (runtime repro exercised load + field + file parse); all candidate-pattern hits in those paths accounted for.
- Accessor-trapping `Error.stackTraceLimit` itself is infeasible (V8 reads it with data-property semantics and disables capture, crashing depd) — the transient raise was proven via trap-on-`prepareStackTrace` timing + sentinel values instead.
- Browser-field files (depd, inherits) and legacy fallbacks (safe-buffer pre-`Buffer.alloc`, setprototypeof ES5) excluded as unreachable under Node.
- F-001 exception-leak path statically reasoned, not fault-injected.
- Node baseline is main; repro on v24.19.0 — relevant baselines stable across both. Verdict pinned to resolved dep versions (exact pins in multiparty's package.json).

## Changes since the previous audit

First audit of multiparty in this workspace.
