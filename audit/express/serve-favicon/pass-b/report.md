# Node.js patch audit: serve-favicon

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: npm package `serve-favicon` (Node.js favicon serving middleware), audited at `$PACKAGE_ROOT`
- Library: version 2.5.1, git clone of https://github.com/expressjs/serve-favicon, branch master, commit `1d9a8e7261557ec9a40463fd54e99b601016598c`, no local changes to runtime files
- Node.js baseline: main branch, commit `d44625a4b80c672215b469906ce583ce7eeeebaf` (`$NODEJS_SOURCE`, unmodified)
- Reproduction runtime: Node.js v24.19.0 (`repro-core-snapshot.js` beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` plus all five resolved runtime dependencies at `$PACKAGE_ROOT/node_modules`: etag@1.8.1, fresh@0.5.2, ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1 (installed `--ignore-scripts --omit=dev`). Tests, docs, and devDependencies out of scope.
- Coverage: source — all six runtime files read in full and pattern-swept (each package ships a single runtime `index.js`; no nested node_modules; no install/prepare scripts; no `browser`/`exports` remapping). Upstream — in-code core reference checked; issue search negative. Runtime — snapshot reproduction run on one Node version (v24.19.0); legacy safe-buffer branch (Node < 4.5) not executed, verified statically only.

## Patching verdict

No patching was demonstrated. Zero shared core mutations, zero core-backed
instance overrides, zero module-loading interceptions, and zero core source
rewrites were found, direct or transitive. Twelve candidate sites were traced
to their exact write target; all were rejected (library-owned objects,
documented API usage, or instance metadata that adds new keys without
replacing any core-defined property or behavior). No unresolved candidates
remain. The only untested branch is safe-buffer's legacy fallback, which is
statically dead on any Node providing `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow`
(Node >= 4.5; present at the baseline) and in any case writes only to
safe-buffer's own exports object and local `SafeBuffer` function.

## Confirmed Node.js patches

None. No candidate survived tracing to a write or replacement of a core API,
global, shared prototype, core-backed instance behavior, core module loading,
or core source. (Notable rejections that merit explanation are summarized in
Supporting context; the full accounting is in the candidate ledger.)

## Candidate ledger and unresolved questions

Full ledger with evidence in `candidates.md` beside this report. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `node_modules/parseurl/index.js:54` — `req._parsedUrl = parsed` on http.IncomingMessage instance | rejected as patch | Adds a new library-owned key; `_parsedUrl` absent from core IncomingMessage (`$NODEJS_SOURCE/lib/internal/http/incoming.js`, `lib/_http_incoming.js`); instance metadata, no core property/method replaced |
| C-002 | `node_modules/parseurl/index.js:84` — `req._parsedOriginalUrl = parsed` | rejected as patch | Same as C-001; also unreachable from serve-favicon (only `parseurl(req)` is called, `index.js:156`) |
| C-003 | `node_modules/parseurl/index.js:128-141` — `new Url()` + `url.path/href/pathname/query/search = ...` | rejected as patch | Writes target a freshly constructed, library-owned `Url` instance (local `var url` shadows the module); same own data properties the core ctor initializes (`$NODEJS_SOURCE/lib/url.js:77-89`); `Url` is publicly exported (`lib/url.js:1025`); no prototype or module-object mutation |
| C-004 | `node_modules/safe-buffer/index.js:13` — `module.exports = buffer` | rejected as patch | Re-export of the core `buffer` module object, unmodified; identity confirmed at runtime (`require('safe-buffer') === require('buffer')` → true) |
| C-005 | `node_modules/safe-buffer/index.js:16` — `copyProps(buffer, exports)` (legacy branch) | rejected as patch | `copyProps(src, dst)` writes to `dst` = safe-buffer's own fresh `exports` object, reads core `buffer`; branch dead on baseline (Buffer statics exist: `lib/buffer.js:351,454,473,496`) |
| C-006 | `node_modules/safe-buffer/index.js:17` — `exports.Buffer = SafeBuffer` (legacy branch) | rejected as patch | Write to safe-buffer's own exports; core `buffer.Buffer` untouched |
| C-007 | `node_modules/safe-buffer/index.js:24` — `SafeBuffer.prototype = Object.create(Buffer.prototype)` | rejected as patch | Creates a new object delegating to `Buffer.prototype`; delegation, not mutation of the shared prototype |
| C-008 | `node_modules/safe-buffer/index.js:27` — `copyProps(Buffer, SafeBuffer)` | rejected as patch | Copies Buffer statics FROM core Buffer TO the local `SafeBuffer` function; core Buffer is read-only source |
| C-009 | `index.js:73,216,222` — `res.statusCode = ...` | rejected as patch | Documented writable ServerResponse property (prototype default at `$NODEJS_SOURCE/lib/internal/http/server.js:285`); per-instance documented API usage |
| C-010 | `index.js:74-75,211,223-224` — `res.setHeader(...)`, `res.end(...)` | rejected as patch | Method calls on documented OutgoingMessage API (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`); no assignment/replacement |
| C-011 | `node_modules/etag/index.js:29` — `var toString = Object.prototype.toString` | rejected as patch | Read-only saved reference; no write to `Object.prototype` |
| C-012 | `index.js:138-145` — `createIsDirError` sets `code/errno/path/syscall` on a new Error | rejected as patch | Library-owned Error object mimicking the fs error shape; no core object touched |

Unresolved: none.

## Supporting context

- **parseurl request memoization (C-001/C-002):** parseurl caches its parse
  result as `req._parsedUrl` (and `req._parsedOriginalUrl` via the `original`
  export, unused by serve-favicon). These underscore-prefixed keys are not
  defined anywhere on core `IncomingMessage` at the baseline, so this is
  library-owned instance metadata on a core-backed instance — a supported
  extension pattern (shared convention with Express), not an override. The
  cache-freshness check (`parseurl/index.js:153-158`) only reads
  `parsedUrl._raw` and `instanceof Url`.
- **parseurl legacy-Url construction (C-003):** `fastparse` bypasses
  `url.parse()` for simple path-only URLs by constructing `new Url()` and
  assigning fields directly — use of a public-but-legacy core API in an
  unconventional way, and a standalone copy of a fast-path idea from the
  unmerged joyent/node PR #7878 ("Add fast path for simple URL parsing",
  closed, https://github.com/nodejs/node-v0.x-archive/pull/7878). Copied code
  that never replaces core `url.parse`; core behavior unchanged for all other
  consumers.
- **safe-buffer (C-004..C-008):** on any Node with the modern Buffer factory
  statics, safe-buffer is a pure re-export of the core `buffer` module. The
  legacy polyfill branch builds a separate `SafeBuffer` constructor on
  safe-buffer's own exports; in neither branch is a core object, prototype, or
  descriptor written. serve-favicon only reads `.Buffer` from it
  (`index.js:16`) and calls documented `Buffer.isBuffer`/`Buffer.from`.
- **fresh defensive comment:** `node_modules/fresh/index.js:97` guards against
  *third-party* patching of `Date.parse` ("guard against date.js Date.parse
  patching"); fresh itself patches nothing.
- **etag, ms:** pure computation; etag only reads `crypto.createHash`,
  `fs.Stats` (instanceof check), and Buffer statics.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime files (6) | Full reads of `index.js` and each dependency `index.js`; skill patterns P1-P6 via `rg -n --no-ignore` (see `searches.md`) | P1/P2 import/global inventory as expected; P3 two hits (C-007, C-011); P4 patch vocabulary: no hits; P5 module-loading interception: no hits; P6 internal bindings: no hits |
| `$PACKAGE_ROOT` supplementary sweeps | `rg` for req/res writes, `delete`/descriptor ops, writes to imported core module objects, nested node_modules, install scripts, `browser`/`exports` fields (see `searches.md`) | req/res writes → C-001/C-002/C-009; `url.* =` hits traced to local shadow (C-003); no deletes/freeze/descriptor ops; each dep is a single `index.js`, no nested deps, no install/prepare scripts, no entrypoint remapping |
| `$NODEJS_SOURCE/lib/_http_incoming.js`, `lib/internal/http/incoming.js` | `grep -n '_parsedUrl\|_parsedOriginalUrl'`; ctor field inventory | Both absent from core; `_http_incoming.js` is now a deprecated re-export shim (DEP0199) of `internal/http/incoming` — C-001/C-002 rejected |
| `$NODEJS_SOURCE/lib/url.js` | `grep` for `function Url`, field inits, exports block | `Url` ctor at :77 initializes the same own fields parseurl assigns (:85-89); `Url` publicly exported at :1025 — C-003 rejected |
| `$NODEJS_SOURCE/lib/buffer.js` | `grep` for `Buffer.from/alloc/allocUnsafe/allocUnsafeSlow` | Present at :351/:454/:473/:496 — safe-buffer legacy branch dead on baseline; modern branch is pure re-export |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js`, `lib/internal/http/server.js` | `grep` for `setHeader`, `statusCode` | `setHeader` defined at outgoing.js:813; `statusCode` prototype default at server.js:285 — C-009/C-010 are documented API usage |
| Runtime reproduction | `node repro-core-snapshot.js "$PACKAGE_ROOT"` (script beside report) | Node v24.19.0: no identity/descriptor/own-key changes to Buffer statics, `Buffer.prototype`, buffer module, `url.parse`/`url.Url`/`Url.prototype`, `IncomingMessage.prototype`, `ServerResponse.prototype`, `OutgoingMessage.prototype.setHeader/end`, `fs.readFile/statSync`, `Module._load/_resolveFilename`, `require.extensions['.js']`, `Date.parse`, `Object.assign`, `Object.prototype` after load and after exercising the middleware (GET hit, non-favicon path, POST). Only request expando added: `_parsedUrl`. `require('safe-buffer') === require('buffer')` → true |
| Upstream: joyent/node PR 7878 | https://github.com/nodejs/node-v0.x-archive/pull/7878 (`gh pr view`) | Closed/unmerged "Add fast path for simple URL parsing" — origin of parseurl's copied fast-path regex; supporting context only |
| Upstream: expressjs/serve-favicon issues | `gh search issues --repo expressjs/serve-favicon "monkeypatch OR patch prototype"` | No results; no known patching-related issues |

## Coverage and limitations

- Entry points: single runtime entrypoint `$PACKAGE_ROOT/index.js`
  (package.json `files`: LICENSE, HISTORY.md, index.js; `main` default). No
  conditional/optional entrypoints, no install scripts.
- Resolved runtime dependencies, each fully read: etag@1.8.1, fresh@0.5.2,
  ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1. Each is a single `index.js`
  with no transitive runtime dependencies (verified: no nested node_modules).
- Node.js files consulted (targeted only, at commit `d44625a4b80c672215b469906ce583ce7eeeebaf`):
  `lib/_http_incoming.js`, `lib/internal/http/incoming.js`,
  `lib/internal/http/outgoing.js`, `lib/internal/http/server.js`,
  `lib/url.js`, `lib/buffer.js`. No recursive scan of the Node tree.
- Branches not executed: safe-buffer's legacy (pre-Buffer.from) branch —
  statically verified to write only to local objects; parseurl's
  `originalurl`/`Url === undefined` fallbacks — statically verified, not
  reachable from serve-favicon. A tested branch cannot prove universal
  absence; reproduction covered Node v24.19.0 only.
- The Node baseline is a recent main-branch commit, newer than the Node
  versions this 2017-era package targets (`engines: node >= 0.8.0`); the
  rejections above do not depend on baseline-specific behavior (they rest on
  which object is written), so this does not affect the verdict.
- Runtime file hashes (SHA-256, `$PACKAGE_ROOT`-relative):
  - `index.js` `1f1c3ef10125e412ff99b9811562b0621ebc17899db787347b005123e0ddc279`
  - `node_modules/etag/index.js` `a95a23b9a60726a4522b768c88ad73a7ea2c539d220068227f5510a8ee2008ae`
  - `node_modules/fresh/index.js` `85b46ce10c4fba71fb41666586572277f626bbc698266026372941b5267bfb60`
  - `node_modules/ms/index.js` `e5f0b6a946a9b2b356a28557728410717df54ea2f599edb619f9839df6b7b0e9`
  - `node_modules/parseurl/index.js` `811223d4a19492ccc642384dc84f0af4ad935557dfe8f63750d7ffd673e40f17`
  - `node_modules/safe-buffer/index.js` `184d5c4a83512e3f49d4d5b52f7073f601f933bad11f1fbb3ad364ca5e6478e1`
- What would change the verdict: evidence of a write to a core module object,
  shared prototype, global, or loader hook in this scope — none exists in the
  shipped runtime files at the audited commit.

## Changes since the previous audit

First audit at this output path (independent pass; no prior report read or
reused, per double-blind protocol).
