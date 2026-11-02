# Node.js patch audit: serve-favicon

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: npm package `serve-favicon` (Node.js favicon serving middleware), audited at `$PACKAGE_ROOT`
- Library: serve-favicon 2.5.1, git clone of https://github.com/expressjs/serve-favicon, branch master, commit `1d9a8e7261557ec9a40463fd54e99b601016598c`; runtime artifact is a single file (`index.js`, per package.json `files`)
- Node.js baseline: `$NODEJS_SOURCE`, main branch, commit `d44625a4b80c672215b469906ce583ce7eeeebaf`
- Reproduction runtime: Node.js v24.19.0 (`node repro-no-mutation.js "$PACKAGE_ROOT"`, beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` plus the five resolved runtime dependencies installed at `$PACKAGE_ROOT/node_modules` (`--ignore-scripts --omit=dev`): etag@1.8.1, fresh@0.5.2, ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1 (each a single-file entrypoint with zero transitive dependencies). Tests/docs out of scope.
- Coverage: source — full (all 6 runtime files read in full, hashed below); upstream — code-referenced items checked (joyent/node#7878 reference, DEP0169 in-core suppression); runtime — one reproduction run on v24.19.0.

## Patching verdict

No patching of Node.js core was demonstrated anywhere in the inspected runtime
scope. Zero shared core mutations, zero core-backed instance overrides, zero
module-loading interceptions, and zero core source rewrites were found, in the
target or in any of its five runtime dependencies. All 12 candidate sites were
traced to the exact write or read and rejected as patches (ledger below); none
remain unresolved. The closest items are instance-level metadata caches added
by parseurl (`req._parsedUrl` / `req._parsedOriginalUrl` — property names Node
core never defines) and safe-buffer's conditional re-export of the unmodified
core `buffer` module; neither replaces or shadows any core-defined behavior. A
runtime reproduction confirmed no observable change to core function
identities or own-property sets of `buffer`/`Buffer`/`Buffer.prototype`, `fs`,
`url`/`Url.prototype`, `http.IncomingMessage.prototype`,
`http.ServerResponse.prototype`, `Object.prototype`, or `Date.parse` after
requiring and exercising the middleware.

## Confirmed Node.js patches

None. No candidate qualified as a reachable write to or replacement of a core
API, global, shared prototype, core-backed instance behavior, core module
loading, or core source. Private API usage and instance metadata writes are in
supporting context, not promoted here.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:54` — `req._parsedUrl = parsed` (http.IncomingMessage instance) | rejected as patch | Library-owned cache key on the request instance. `_parsedUrl` is not defined anywhere in core: negative greps over `$NODEJS_SOURCE/lib/_http_incoming.js`, `lib/http.js`, `lib/_http_server.js`, `lib/_http_outgoing.js`, `lib/_http_common.js`, and `lib/internal/http/{incoming,server,outgoing,common}.js`. Adds metadata; shadows/replaces nothing. Reproduction: property lands on the instance only; `http.IncomingMessage.prototype` unchanged. |
| C-002 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:84` — `req._parsedOriginalUrl = parsed` | rejected as patch | Same analysis as C-001; additionally dead in this consumer (serve-favicon calls only `parseurl(req)`, never `parseurl.original`). |
| C-003 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:132-138` — `url.path/href/pathname/query/search = ...` (looks like a write to the core `url` module) | rejected as patch | Writes target the function-local `var url = Url !== undefined ? new Url() : {}` declared at index.js:128, which shadows the module-level core import (index.js:15). Own properties on a freshly constructed `url.Url` instance; `url.Url` is a public export (`$NODEJS_SOURCE/lib/url.js:1025-1028`). Core module object untouched (reproduction: `url` own-property set and `url.parse` identity unchanged). |
| C-004 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:52,82` — `parsed._raw = url` | rejected as patch | Own property on the library-created parse-result object (from C-003's local instance or `url.parse` output owned by the caller); not a shared prototype or core module write. |
| C-005 | `$PACKAGE_ROOT/node_modules/safe-buffer/index.js:13` — `module.exports = buffer` (core buffer module re-export) | rejected as patch | On any Node with `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` (all present at `$NODEJS_SOURCE/lib/buffer.js:351,454,473,496`), safe-buffer re-exports the core module object verbatim. Assignment is to safe-buffer's own `module.exports`; nothing is written to the `buffer` module or `Buffer`. Reproduction: `require('safe-buffer') === require('buffer')` is true and `buffer`/`Buffer` own-property sets unchanged. |
| C-006 | `$PACKAGE_ROOT/node_modules/safe-buffer/index.js:16-17` — legacy branch `copyProps(buffer, exports); exports.Buffer = SafeBuffer` | rejected as patch | `copyProps(src, dst)` (index.js:7-11) reads from the core module and writes only to safe-buffer's own `exports`; `SafeBuffer` replaces nothing in core. Branch is also unreachable on the Node baseline (requires pre-4.5 Buffer without `from/alloc`). |
| C-007 | `$PACKAGE_ROOT/node_modules/safe-buffer/index.js:24` — `SafeBuffer.prototype = Object.create(Buffer.prototype)` | rejected as patch | `Object.create` returns a new object inheriting from `Buffer.prototype`; the assignment targets `SafeBuffer.prototype`. `Buffer.prototype` is read, never written (reproduction: `Buffer.prototype` own-property set unchanged). |
| C-008 | `$PACKAGE_ROOT/node_modules/safe-buffer/index.js:27` — `copyProps(Buffer, SafeBuffer)` | rejected as patch | Copies enumerable properties from core `Buffer` (read) onto the library-owned `SafeBuffer` function (write). Direction is core -> library. |
| C-009 | `$PACKAGE_ROOT/index.js:73,216,222` — `res.statusCode = 405/200/304` on http.ServerResponse | rejected as patch | Documented public API: core defines the default as a plain prototype data property `ServerResponse.prototype.statusCode = 200` (`$NODEJS_SOURCE/lib/internal/http/server.js:285`, re-exported via `lib/_http_server.js`), intended to be shadowed per-instance by the application. No core method or shared prototype is replaced. |
| C-010 | `$PACKAGE_ROOT/index.js:74-75,211,223-224` — `res.setHeader(...)`, index.js:174 `res.getHeader(...)`, index.js:76,217,225 `res.end(...)` | rejected as patch | Plain calls into public core methods (`OutgoingMessage.prototype.setHeader`, `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`); nothing assigned over them. |
| C-011 | `$PACKAGE_ROOT/index.js:85,187` — `fs.readFile(...)`, `fs.statSync(...)`; index.js:16-22 core imports (`fs`, `path`) | rejected as patch | Read-only calls on the `fs`/`path` module objects; no assignment, deletion, or descriptor change to any core module binding (negative write-pattern grep; reproduction: `fs` own-property set and `fs.readFile`/`fs.statSync` identities unchanged). |
| C-012 | `$PACKAGE_ROOT/node_modules/etag/index.js:21-22,29` — `require('crypto')`, `require('fs').Stats`, `var toString = Object.prototype.toString` | rejected as patch | `crypto.createHash` call and `Stats` used only as an `instanceof` operand (etag/index.js:106); `Object.prototype.toString` is saved into a local and invoked via `.call` — reads only, no write to `Object.prototype` (reproduction confirms). |

Pattern sweeps P4 (patch/wrap/shim/polyfill/override), P5 (require.cache /
require.extensions / Module._load / Module._compile / syncBuiltinESMExports /
registerHooks), and P6 (process.binding / internalBinding / `_http_` /
`internal/` specifiers) returned zero hits across all six runtime files, so no
candidates arose for module-loading interception, native-binding access, or
core-internals loading. `fresh/index.js` and `ms/index.js` import no core
modules at all. No unresolved candidates remain.

## Supporting context

- **Legacy/private core API usage (reads, not patches):** parseurl uses the
  legacy `url.parse` and the `url.Url` constructor
  (`$PACKAGE_ROOT/node_modules/parseurl/index.js:15-17,96,124,128`). Both are
  public exports of `$NODEJS_SOURCE/lib/url.js:1025-1028`; `url.parse` carries
  runtime deprecation DEP0169 whose warning core itself suppresses for calls
  originating inside `node_modules` (`$NODEJS_SOURCE/lib/url.js:134-145`,
  `isInsideNodeModules` guard) — a generic core accommodation for the
  ecosystem, not specific to this library.
- **Copied core logic, not replacing core:** parseurl's `fastparse` unrolls a
  regex from nodejs/node-era PR joyent/node#7878 (comment at
  `$PACKAGE_ROOT/node_modules/parseurl/index.js:104-106`) as a standalone
  fast path; it produces a fresh `Url` instance and leaves `url.parse` intact.
- **Defensive note, not a patch:** fresh guards against *third parties*
  patching `Date.parse` (`$PACKAGE_ROOT/node_modules/fresh/index.js:97-100`);
  it only reads `Date.parse`.
- **Core-shaped error object:** serve-favicon fabricates an `EISDIR` error
  mimicking an fs syscall error (`$PACKAGE_ROOT/index.js:138-145`,
  `createIsDirError`) — a new `Error` instance with `code/errno/path/syscall`
  fields; no core error machinery is modified.
- **Instance metadata:** the `req._parsedUrl` cache (C-001) is an
  Express-ecosystem convention; core never reads or defines it, so no core
  code path changes behavior because of it.
- The deprecation of the `_http_incoming`/`_http_outgoing` shim modules on
  Node main (DEP0199) is irrelevant here: neither the target nor its
  dependencies require any `_http_*` or `internal/*` module.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/package.json`, `package-lock.json`, `node_modules/*/package.json` | read; `node -e` version dump | Runtime scope = index.js + etag@1.8.1, fresh@0.5.2, ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1; each dep is a single `index.js` with no transitive deps; no install scripts in scope (installed `--ignore-scripts --omit=dev`) |
| All 6 runtime files | skill pattern set P1-P6 (`rg -n` per pattern; see searches.md) | P1-P3 hits all traced (ledger C-001..C-012); P4/P5/P6 zero hits — no loader hooks, no binding access, no patch-keyword leads |
| All 6 runtime files | write-pattern sweep `^\s*(fs|url|path|crypto|buffer|http|process|Buffer|global|globalThis)\.\w+\s*=`, `delete`/`defineProperty`, `(req|res)\.\w+\s*=` | Only C-003 (local-variable shadow) and C-001/C-002/C-009 (instance writes); no descriptor ops or deletions anywhere |
| `$NODEJS_SOURCE/lib/_http_incoming.js`, `lib/http.js`, `lib/_http_server.js`, `lib/_http_outgoing.js`, `lib/_http_common.js`, `lib/internal/http/{incoming,server,outgoing,common}.js` | `rg -n '_parsedUrl'` | Zero matches — `_parsedUrl` is not a core property; C-001/C-002 are library-owned keys |
| `$NODEJS_SOURCE/lib/internal/http/server.js:285`, `lib/internal/http/outgoing.js:813`, `lib/internal/http/incoming.js:61,95-96` | targeted `rg -n` + reads (followed `_http_*` re-export shims) | `statusCode` is a shadowable prototype data-property default; `setHeader` a public method; `IncomingMessage` defines `url`/`method` (parseurl only reads `req.url`) |
| `$NODEJS_SOURCE/lib/buffer.js:351,454,473,496,1539` | targeted `rg -n` | `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` all present -> safe-buffer takes the pure re-export branch on the baseline |
| `$NODEJS_SOURCE/lib/url.js:77,134-145,1025-1028` | targeted `rg -n` + read | `Url` and `parse` are public exports; DEP0169 warning suppressed inside node_modules (generic core accommodation) |
| joyent/node#7878 | reference embedded at `$PACKAGE_ROOT/node_modules/parseurl/index.js:104` | Origin of the copied fast-path regex; copied logic, no core replacement — no further upstream expansion needed (no patch observed) |
| Reproduction | `node repro-no-mutation.js "$PACKAGE_ROOT"` (script beside this report), Node v24.19.0 | PASS: zero diffs in core identity/own-property snapshots after require + middleware exercise; `require('safe-buffer') === require('buffer')` true; `_parsedUrl` instance-only |

Runtime file provenance (SHA-256, `$PACKAGE_ROOT`-relative):

```
1f1c3ef10125e412ff99b9811562b0621ebc17899db787347b005123e0ddc279  index.js
a95a23b9a60726a4522b768c88ad73a7ea2c539d220068227f5510a8ee2008ae  node_modules/etag/index.js
85b46ce10c4fba71fb41666586572277f626bbc698266026372941b5267bfb60  node_modules/fresh/index.js
e5f0b6a946a9b2b356a28557728410717df54ea2f599edb619f9839df6b7b0e9  node_modules/ms/index.js
811223d4a19492ccc642384dc84f0af4ad935557dfe8f63750d7ffd673e40f17  node_modules/parseurl/index.js
184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1  node_modules/safe-buffer/index.js
```

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` is the sole shipped runtime file
  (package.json `files` = LICENSE, HISTORY.md, index.js; `main` default). No
  conditional exports, no install/postinstall scripts, no native code, no
  bundled/dist output. Each of the five dependencies was audited at its single
  resolved entrypoint; none has transitive dependencies, so the dependency
  closure is complete.
- Node.js files were selected per the observed targets (http
  incoming/outgoing/server, buffer, url, fs identifiers only) and read at
  commit `d44625a4b80c672215b469906ce583ce7eeeebaf`; `lib/_http_*.js` are
  re-export shims on this ref, so the referenced `lib/internal/http/*`
  implementations were used as baselines. No recursive scan of the Node tree
  was performed.
- The safe-buffer legacy polyfill branch
  (`$PACKAGE_ROOT/node_modules/safe-buffer/index.js:14-18`) is unreachable on
  the baseline and any Node >= 4.5; it was verified statically only (it writes
  solely to safe-buffer's own exports even when taken). Reproduction covers
  Node v24.19.0 only; a tested branch cannot prove universal absence across
  all runtimes, but every write site is accounted for statically.
- Tests, docs, examples, and devDependencies were excluded per the requested
  scope. `parseurl.original` (C-002) is exported but never called by
  serve-favicon; it was audited anyway and rejected.
- What would change the verdict: a different resolved dependency tree (e.g., a
  hoisted, tampered `parseurl`/`safe-buffer`), or new code in a future version
  assigning to core module objects or shared prototypes. Nothing in the
  audited revisions does so.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no prior findings to
revalidate.
