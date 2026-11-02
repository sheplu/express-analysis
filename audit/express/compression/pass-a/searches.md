# Search log — compression@1.8.2 monkeypatch audit (pass A)

All library commands run from `$PACKAGE_ROOT` (compression@1.8.2, commit
0f9707417bd53d41a319fce8bdb80dfa08b435c8). Node.js baseline commands run from
`$NODEJS_SOURCE` (main, commit d44625a4b80c672215b469906ce583ce7eeeebaf).
Scope globs excluded nested dep node_modules, tests, and markdown.

Scoped file set used for the candidate sweeps (all runtime entrypoints and
followed imports): `index.js`, `node_modules/*/index.js`,
`node_modules/debug/src/*.js`, `node_modules/negotiator/lib/*.js`,
`node_modules/mime-db/index.js`.

## S0 — scope establishment

| Command | Result |
| --- | --- |
| `cat package.json` | runtime deps: bytes 3.1.2, compressible ~2.0.18, debug 2.6.9, destroy 1.2.0, negotiator ~0.6.4, on-headers ~1.1.0, safe-buffer 5.2.1, vary ~1.1.2; `files` ships only `index.js`; engines `>= 0.8.0`; no install scripts in run path (installed with `--ignore-scripts`) |
| `ls node_modules` | bytes, compressible, debug, destroy, mime-db, ms, negotiator, on-headers, safe-buffer, vary (mime-db transitive of compressible; ms transitive of debug) |
| `node -e "require('./node_modules/<d>/package.json')..."` for each dep | resolved versions/entrypoints: bytes@3.1.2 index.js, compressible@2.0.18 index.js, debug@2.6.9 src/index.js, destroy@1.2.0 index.js, mime-db@1.54.0 index.js, ms@2.0.0 index.js, negotiator@0.6.4 index.js, on-headers@1.1.0 index.js, safe-buffer@5.2.1 index.js, vary@1.1.2 index.js |
| `git log -1 --format='%H %ci'` | 0f9707417bd53d41a319fce8bdb80dfa08b435c8 (2026-09-11), matches requested provenance |

## S1 — imports / core module inventory

Pattern: `rg -n --no-ignore "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:"` over the scoped file set.

Hits (all accounted for): compression index.js requires negotiator,
safe-buffer, bytes, compressible, debug, destroy, on-headers, vary, **zlib**;
on-headers requires **http**; destroy requires **events, fs, stream, zlib**;
safe-buffer requires **buffer**; debug/src/node.js requires **tty, util**,
lazily **fs** (SyncWriteStream) and **net** (Socket) inside
`createWritableStdioStream`; debug/src/index.js picks browser.js vs node.js on
`process.type`; compressible requires mime-db; mime-db re-exports `db.json`;
negotiator requires only its own `./lib/*`. No `node:` specifiers, no dynamic
`import()`. `debug/src/inspector-log.js` requires stream but is not on any
require path from `src/index.js` (checked: only index.js -> browser.js|node.js
-> debug.js -> ms).

## S2 — globals / Buffer / process / inheritance

Pattern: `rg -n --no-ignore "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\("`.

Hits: compression index.js uses safe-buffer's Buffer (isBuffer/byteLength/from
— reads only); safe-buffer reads `buffer.Buffer` and feature-detects
from/alloc/allocUnsafe/allocUnsafeSlow; debug/src/node.js reads
`process.env.*` (lines 34-52, 61, 156-158), writes `process.env.DEBUG`
(143-145), selects `process.stdout`/`process.stderr` (67-68);
debug/src/browser.js references window/process (not loaded on Node). No
`globalThis`/`global` writes anywhere. Negative for `inherits(`/`extends` in
runtime scope.

## S3 — prototype / defineProperty / Object.assign

Pattern: `rg -n --no-ignore "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign"`.

Hits: compression index.js:63,69 `Object.assign` onto its own options objects;
safe-buffer:24 `SafeBuffer.prototype = Object.create(Buffer.prototype)`
(library-owned ctor, no write to Buffer.prototype); destroy:121 **reads**
`Stream.Transform.prototype._destroy` for identity comparison; on-headers:19
**reads** `http.ServerResponse.prototype.appendHeader` (feature detection);
negotiator:38-82 methods on its own `Negotiator.prototype`. **No assignment to
any core prototype anywhere in scope.** No `__proto__`, `setPrototypeOf`,
`defineProperty`, `Reflect.*` hits.

## S4 — patch keywords

Pattern: `rg -n --no-ignore -i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b"`.

Hits: only debug/src/node.js:56,64 ("override" in DEBUG_FD deprecation text).
Negative otherwise.

## S5 — module loading interception

Pattern: `rg -n --no-ignore "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks"` over index.js and all of node_modules.

**No hits.** No loader interception anywhere in the runtime tree.

## S6 — bindings / internals

Pattern: `rg -n --no-ignore "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"`.

Hits: only debug/src/node.js:169 `process.binding('tty_wrap')` (read-only,
reached only when `DEBUG_FD` is set to an fd other than 1/2). No
internalBinding, no requires of `_http_*` or `internal/*`.

## S7 — full reads of entrypoints

Read in full: `index.js` (348 lines), `node_modules/on-headers/index.js`,
`node_modules/destroy/index.js`, `node_modules/debug/src/node.js`,
`node_modules/safe-buffer/index.js`, `node_modules/vary/index.js`,
`node_modules/compressible/index.js`, `node_modules/negotiator/index.js`,
`node_modules/ms/index.js` (head + grep), `node_modules/bytes/index.js`
(grep: exports/parse/format only), `node_modules/debug/src/index.js`,
`node_modules/debug/src/debug.js` (grep: enable at 138 calls `exports.save`).
`rg` over `negotiator/lib/` for `require(`/process/Buffer/global/prototype
writes: **no hits** (pure parsing).

## S8 — Node.js baseline (targeted reads only)

| Command | Result |
| --- | --- |
| `rg -n "require|ServerResponse|OutgoingMessage" lib/http.js` (head) | HTTP implementation re-exported from `lib/internal/http/outgoing.js` and `lib/internal/http/server.js` on this main-branch checkout (legacy `lib/_http_*.js` files are license-header shims) |
| `rg -n "OutgoingMessage\.prototype\.(write|end|flush|on)\b|prototype\.flushHeaders" lib/internal/http/outgoing.js` | `write` at 1027, `end` at 1289, `flushHeaders` at 1461; **no `flush` method exists** |
| `rg -n "ServerResponse\.prototype\.writeHead|ObjectSetPrototypeOf\(ServerResponse" lib/internal/http/server.js` | `writeHead` defined at 423-424; `ServerResponse.prototype` inherits `OutgoingMessage.prototype` at 259-260 |
| `rg -n "EventEmitter\.prototype\.on\b|EventEmitter\.prototype\.addListener" lib/events.js` | `addListener` at 615; `on = addListener` at 619 |
| `rg -n "_destroy|prototype\.close|this\._handle" lib/zlib.js` + reads around 395/455/529 | `class ZlibBase extends Transform` at 395; `this._handle = handle` at 455; own `_destroy(err, callback)` at 529 calling `_close(this)` — confirms modern zlib streams take destroy@1.2.0's plain `stream.destroy()` branch |

No recursive scan of the Node tree was performed.

## S9 — reproduction

`node repro.js "$PACKAGE_ROOT"` on Node v24.19.0 (script beside this report).
Output: prototypes unchanged after require and after a full gzip round trip;
res gains own properties `write,end,on,flush,writeHead` only after the
middleware runs; each shadows (does not replace) the prototype/core method;
response served with `content-encoding: gzip` and body gunzips correctly.

## S10 — upstream corroboration (read-only)

| Query | Result |
| --- | --- |
| `git log -n 6 --oneline` / `git log -S 'onResponseClose' -- index.js` in `$PACKAGE_ROOT` | close-listener added by commit 151f63e "fix: destroy compression stream on response close", released in 1.8.2 (0f97074) |
| `gh pr view 23734 --repo nodejs/node --json state,title,mergedAt` | "zlib: do not leak on destroy" — state CLOSED, mergedAt null (unmerged); it is the PR referenced in destroy@1.2.0 source as rationale for the close+destroy dance |
| `gh api repos/expressjs/compression/releases/latest` | v1.8.2 (2026-09-11) — audited commit is the latest release |
