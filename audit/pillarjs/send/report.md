# Node.js patch audit: send

- Verdict: **confirmed patching**
- Status: complete
- Input: issue sheplu/express-analysis#23 (`send`, https://github.com/pillarjs/send)
- Library: send 1.2.1, git master @ `092f3fc77f0e796519ac328c543c11cced8f2244`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): debug@4.4.3, depd@2.0.0, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, etag@1.8.1, fresh@2.0.0, http-errors@2.0.1, inherits@2.0.4, mime-db@1.54.0, mime-types@3.0.2, ms@2.1.3, on-finished@2.4.2, range-parser@1.3.0, setprototypeof@1.2.0, statuses@2.0.2, toidentifier@1.0.1 (flat tree verified)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; live HTTP 200 / Range 206 / 404 served through `send(req, path).pipe(res)`)
- Scope: production/runtime code — `index.js` plus all 17 resolved runtime dependencies' runtime files. Tests, examples, docs, devDependencies, browser-only variants excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream corroboration found (dougwilson/nodejs-depd#32, #36, #50)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements (one finding-granularity difference merged); key sites re-verified directly during reconciliation.

## Patching verdict

send **patches Node.js core transitively and transiently** through depd@2.0.0, reached via http-errors@2.0.1. send's own code patches nothing: it consumes documented req/res/fs/stream APIs only. One confirmed patch site (two property writes; pass B counted them as F-001/F-002, merged per site convention):

- **F-001:** depd's `getStack()` transiently swaps `Error.prepareStackTrace` (displacing Node's bootstrap-installed default) and `Error.stackTraceLimit` on the global `Error` constructor, restoring both synchronously. Fires unconditionally at `require('send')` and again on any depd deprecation log (none on send's own serve paths at this version).

0 permanent mutations; 0 reachable instance/application overrides (one **dormant** historical override in on-finished, see ledger); 0 module interception; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd `getStack()`)

- Category: shared core mutation (process-global `Error` constructor properties), transient
- Library site(s): `node_modules/depd/index.js:386-387` (writes), `:382,:384` (saves), `:395-396` (restores) — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js
- Origin: transitive — send -> http-errors@2.0.1 -> depd@2.0.0
- Core baseline: bootstrap-installed default hook `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:492-511` (writable data property, value `ErrorPrepareStackTrace`, impl `lib/internal/errors.js:168`); userland assignment honored at `errors.js:149-151`; `Error.stackTraceLimit` is V8's capture-depth control (default 10).
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (callsite-array formatter) and `Error.stackTraceLimit = Math.max(10, limit)`; both restored to saved originals.
- Execution chain: `require('send')` -> `index.js:15` (`require('http-errors')`) -> `http-errors/index.js:15` (`require('depd')('http-errors')`) -> `depd/index.js:108` (`getStack()`); re-fires per deprecation log via `depd/index.js:199`. send's own runtime paths (2xx/3xx/4xx/5xx serving) do not trigger deprecation logs at this version.
- Activation: unconditional at import time; production path; no opt-out of the import-time capture.
- Scope and restoration: process-wide while held; synchronous same-tick restore; **not exception-guarded** (a throwing user-installed hook inside the window would leak the swap — static reasoning).
- Resulting behavior: during each window, any stack captured anywhere in the process is formatted by depd's hook and capture depth is forced ≥ 10; after restore, baseline behavior returns. Documented interference with `--enable-source-maps` upstream.
- Evidence: static (sites + chain re-verified by orchestrator); dynamic (both passes, Node v24.19.0): accessor trap caught exactly 2 writes during `require('send')` with faithful restoration of Node's `ErrorPrepareStackTrace`, none during serving; zero steady-state diffs across all snapshot surfaces.
- Upstream: dougwilson/nodejs-depd#32, #36, #50. No fix shipped as of depd 2.0.0.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (25 entries), `pass-b/candidates.md` (25 entries) — same sites, 1 confirmed site, rest rejected, 0 unresolved in both. Key entries:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-01 | `depd/index.js:386-387` -> `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | transient swap/restore at require + per deprecation log |
| C-02 | `on-finished/index.js:189-199` `patchAssignSocket` wraps `res.assignSocket` as own property | rejected — **dormant** | "node.js 0.8 patch": call-site guard requires `msg.socket === undefined`, but core sets `this[kSocket] = null` in the constructor (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`) with a prototype `socket` accessor (`outgoing.js:304`) — `res.socket` is `null` or a socket, never `undefined`, on any supported Node; send attaches `onFinished` only to live responses (`index.js:690`). Runtime-confirmed: no own `assignSocket` property on any served response |
| C-03 | `debug/src/node.js:203-210` `save()` writes/deletes `process.env.DEBUG` at import | rejected | documented mutable process state (env), idempotent at load — state write, not an API patch; supporting context |
| C-04 | `http-errors` `setPrototypeOf`/`inherits` prototype work | rejected | targets library-owned error constructors/instances only; `Error.prototype` and `Object.setPrototypeOf` identities verified untouched |
| C-05 | `setprototypeof@1.2.0` polyfill branches (`__proto__` setter / mixin copy) | rejected | exports a chooser; on modern Node uses native `Object.setPrototypeOf`; fallback branches dead; never assigns core globals |
| C-06 | `inherits@2.0.4` | rejected | `Object.setPrototypeOf(ctor.prototype, superCtor.prototype)` on library-owned constructors (documented pattern) |
| C-07 | `on-finished` `msg.__onFinished` expando | rejected | library-owned instance metadata (listener queue), removed on finish |
| C-08 | send `SendStream.prototype` / `inherits(SendStream, Stream)` | rejected | library-owned constructor subclassing `Stream` via documented pattern |
| C-09 | send res/req usage (`setHeader`, `getHeaderNames`, `removeHeader`, `statusCode`, `res.end`, `req.destroy`, stream `pipe`/`destroy`/`unpipe`) | rejected | documented API calls/settable instance properties on passed-in objects; no prototype writes |
| C-10 | `fs.createReadStream` + stream lifecycle (`stream.destroy()` in cleanup) | rejected | documented fs/stream API usage on library-created instances |
| C-11 | depd `wrapfunction`/`wrapproperty` (descriptor machinery) | rejected | exported capability, proven uncalled anywhere in this dependency tree |
| C-12 | mime-types/mime-db/etag/fresh/statuses/range-parser/encodeurl/escape-html/ms/ee-first/toidentifier | rejected | pure computation / own-export writes only; entrypoints individually checked |

## Supporting context

- **on-finished's `patchAssignSocket` is real latent instance-override code** — the one place in this tree written to shadow a core prototype method (`ServerResponse.prototype.assignSocket`) on an instance. It is dormant on every supported Node (guard unreachable since the `socket` accessor era) and send requires Node >= 18. Track it: if on-finished's guard logic or Node's `socket` accessor semantics ever changed, it could reactivate.
- `debug@4.4.3` writes/deletes `process.env.DEBUG` at import (`src/node.js:203-210` via its setup tail) — mutable documented process state, visible to other consumers of the env var; not a core API patch.
- http-errors constructs subclassed error prototypes with `setprototypeof`/`inherits` — documented patterns, library-owned objects.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree (18 packages) | skill's six candidate pattern groups via scoped `rg -n` (logs: `pass-a/searches.md`, `pass-b/searches.md`) | groups 5 (loader interception) and 6 (bindings/internals) zero hits across the entire scope; all other hits ledgered |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187,304`; `lib/internal/http/server.js`; `lib/internal/bootstrap/realm.js:492-511`; `lib/internal/errors.js:136-170`; `lib/util.js` | direct reads at `d44625a4b80` | C-02 dormancy proof; F-001 core baseline |
| Reproduction | `node pass-a/repro-check.js "$PACKAGE_ROOT"`; `node pass-b/repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | 2 transient writes at require, faithful restore; zero steady-state diffs across http/fs/stream/EventEmitter/Object prototypes, Module._*, require.extensions/cache, process.binding, globals; live 200/206/404 exercised |
| Upstream depd | dougwilson/nodejs-depd#32, #36, #50 | corroborate F-001 code and real-world interference |

## Coverage and limitations

- Source coverage complete for send + all 17 resolved deps (versions match provenance exactly; flat tree verified).
- Untested runtime branches statically accounted for: HEAD/redirect/412/416 paths share the exercised res API surface; depd runtime logging uses the same mechanism as F-001; wrapfunction/wrapproperty unreached; setprototypeof fallbacks dead on modern Node.
- F-001 exception-leak path reasoned statically, not fault-injected.
- Node baseline is main (`d44625a4b80`), repro on v24.19.0 — key facts confirmed on both; no finding depends on a difference.
- Verdict pinned to resolved dep versions; send declares semver ranges (`^`), so future resolutions could differ — depd is reached only through http-errors@2.x.

## Changes since the previous audit

First audit of send in this workspace.
