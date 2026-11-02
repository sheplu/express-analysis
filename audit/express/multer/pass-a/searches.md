# Search log — multer 2.5.0 patch audit (pass A)

All commands were run from `$PACKAGE_ROOT` unless noted. `$SCOPE` expands to the full runtime scope:

```
index.js lib storage \
node_modules/append-field/index.js node_modules/append-field/lib \
node_modules/busboy/lib node_modules/streamsearch/lib \
node_modules/media-typer/index.js node_modules/mime-db/index.js \
node_modules/mime-types/index.js node_modules/type-is/index.js
```

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `git log -1 --format='%H %s'` | `2c380d06cdaacc68bbef8b36244493a3d33d6b88 2.5.0 (#1490)` — provenance pinned |
| S-02 | `cat package.json` | files: LICENSE, index.js, storage/, lib/; deps: append-field ^1.0.0, busboy ^1.6.0, type-is ^1.6.18; no install/postinstall scripts; engines node >= 10.16.0 |
| S-03 | `find . -path ./node_modules -prune -o -type f -name '*.js' -print` | 9 runtime files (index.js, lib/*.js x6, storage/*.js x2) + tests/examples (out of scope) |
| S-04 | `ls node_modules` + per-package `package.json` read | append-field@1.0.0 (main index.js), busboy@1.6.0 (main ./lib/index.js), streamsearch@1.1.0 (main ./lib/sbmh.js), media-typer@0.3.0, mime-db@1.52.0, mime-types@2.1.35, type-is@1.6.18; none declare `exports` maps or native binaries |
| S-05 | `find <deps> -type f \( -name '*.js' -o -name '*.json' -o -name '*.node' \)` excluding tests/bench | 13 dependency runtime files, no `.node` native addons, no dist bundles |

## Skill candidate patterns (P1–P6), `rg -n --no-ignore <pattern> $SCOPE`

| # | Pattern | Result |
| --- | --- | --- |
| P1 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | 35 hits, all plain `require` of core modules (`fs`, `os`, `path`, `crypto`, `stream`, `util`, `events`, `async_hooks`) or of the packages themselves. No dynamic/computed loading, no `node:` specifiers, no dual entrypoints. |
| P2 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | Hits: `Buffer.concat/from/isBuffer/allocUnsafe` calls (multer memory storage, busboy, streamsearch); `process.nextTick(cb)` call (busboy multipart.js:190); `util.inherits(MulterError, Error)` → C-009; `extends Writable/Readable` in busboy → C-017/C-018/C-021. No `globalThis`/`global` usage at all. |
| P3 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | Hits only in multer's own files: library-owned `X.prototype.method =` definitions (index.js, storage/*, lib/counter.js, lib/file-appender.js); guard reads `Object.prototype.hasOwnProperty.call` (make-middleware.js:279,283,287,345 — read-only); `Object.defineProperty(file,'stream',…)` → C-007; `Counter.prototype = Object.create(EventEmitter.prototype)` → C-008; `Object.assign(placeholder, file)` → C-015. **Zero hits in any dependency** (no `__proto__`, no `setPrototypeOf`, no `defineProperty` anywhere in append-field/busboy/streamsearch/type-is/media-typer/mime-types). |
| P4 | `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive) | **No hits.** |
| P5 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | **No hits** — no module-loading interception. |
| P6 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | **No hits** — no internal bindings or internal-module requires. |

## Targeted write/mutation searches, `rg -n --no-ignore <pattern> $SCOPE`

| # | Pattern | Result |
| --- | --- | --- |
| T-A | `\b(fs|os|path|crypto|stream|util|process|Buffer|EventEmitter|Readable|Writable|http|events|async_hooks)\s*\.\s*[A-Za-z_$]+\s*=[^=]` | **No hits** — no assignment onto any core module object, core class, or core-exported function. |
| T-B | `\b(req|res|request|response)\s*\.\s*[A-Za-z_$]+\s*=[^=]` | 4 hits: `lib/make-middleware.js:136` (`req.body =`) → C-001; `lib/file-appender.js:13,14,57` (`req.files =`, `this.req.file =`) → C-002. No other request/response property writes in scope; dependencies never write to req/res. |
| T-C | `delete\s+\w+\.` | 6 hits, all on library-owned objects: `storage/memory.js:27`, `storage/disk.js:128-130`, `lib/file-appender.js:49,61` → C-014. |
| T-D | per-dependency `package.json` scripts check (`install|prepare|postinstall|preinstall`) | All 7 dependencies: **none**. |
| T-E | `\boriginal|_old|saved` (saved-original wrapper idiom) | Hits are `originalname` (multer's file metadata field) and `originalNext` (local Express-callback wrapper, C-003). No saved-and-replaced core function idiom. |
| T-F | `globalThis\[|global\[|process\[|Buffer\[` (computed writes on globals) | **No hits.** |

## Full-file reads (content inspection, no pattern reliance)

- `$PACKAGE_ROOT`: `index.js`, `lib/counter.js`, `lib/file-appender.js`, `lib/make-middleware.js`, `lib/multer-error.js`, `lib/remove-uploaded-files.js`, `lib/validate-limits.js`, `storage/disk.js`, `storage/memory.js` — read in full.
- Dependencies (all runtime files read in full): `append-field/index.js`, `append-field/lib/parse-path.js`, `append-field/lib/set-value.js`, `busboy/lib/index.js`, `busboy/lib/types/multipart.js`, `busboy/lib/types/urlencoded.js`, `busboy/lib/utils.js` (header + decoder sections in full; middle parse section line-scanned for writes with `grep -nE '=[^=]|delete |definePr|proto'` — string parsing into `Object.create(null)` params only), `streamsearch/lib/sbmh.js`, `type-is/index.js`, `media-typer/index.js`, `mime-types/index.js` (+ header), `mime-db/index.js`.

## Node.js baseline verification (targeted reads at `$NODEJS_SOURCE`, commit d44625a4b80)

| # | Command | Result |
| --- | --- | --- |
| N-01 | `grep -n 'Writable\|Readable' lib/stream.js` | `Stream.Readable`/`Stream.Writable` re-export internal implementations (lines 63, 104) |
| N-02 | `grep -n '_write\b\|_final\b\|_destroy\b' lib/internal/streams/writable.js` | Constructor accepts `options.write/destroy/final` (410-419); default `Writable.prototype._write` throws `ERR_METHOD_NOT_IMPLEMENTED` (837-841) → implementing `_write/_destroy/_final` in a subclass is the documented contract (C-017/C-021 rejected) |
| N-03 | `grep -n '_read\b' lib/internal/streams/readable.js` | Line 699: "You can override either this method, or the async _read(n) below" → C-018 rejected |
| N-04 | `grep -n 'Readable.prototype.unpipe\|Readable.prototype.resume\|Readable.prototype.pipe\b' lib/internal/streams/readable.js` | pipe:978, unpipe:1180, resume:1327 — all exist as core prototype methods; multer only calls them (C-004) |
| N-05 | `grep -rn 'latin1Slice\|utf8Slice\|ucs2Slice\|base64Slice' lib/buffer.js lib/internal/buffer.js` | Core installs these on `Buffer.prototype` (`lib/internal/buffer.js:1071-1076`); busboy/urlencoded call them (C-020: private API usage, not mutation) |
| N-06 | `grep -n "\bbody\b\|\bfiles\b" lib/_http_incoming.js` | Only a license-comment hit; IncomingMessage defines no `body`/`file`/`files` → C-001/C-002 are additive app data |
| N-07 | `grep -n 'function createWriteStream\|function mkdirSync\|function open(\|function fsync\|function unlink' lib/fs.js` | open:741, fsync:1647, mkdirSync:1740, unlink:2418, createWriteStream:3971 — all public fs APIs called by disk storage (C-010) |

## Upstream corroboration (read-only)

| # | Query | Result |
| --- | --- | --- |
| U-01 | `gh search issues --repo mscdex/busboy "latin1Slice"` | 1 hit: mscdex/busboy#319 (closed) "Incorrect parsing due to using latin1Slice in multipart.js" |
| U-02 | `gh issue view 319 --repo mscdex/busboy` | Issue is about filename charset decoding behavior of the private Buffer API usage; discussion of calls only — corroborates C-020 as usage, not patching. |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R-01 | `node repro-no-patch.js "$PACKAGE_ROOT"` (Node v24.19.0; script beside this log) | `PASS [after require(multer)] all 26 core identities unchanged`; `PASS middleware completed; files=1 body keys=plain|__proto__|a|arr`; `PASS [after middleware run] all 26 core identities unchanged`; `PASS Object.prototype not polluted by __proto__ field names`; `PASS req.body is a null-prototype object`; `ALL CHECKS PASSED`. Identity set covered: fs.createWriteStream/open/fsync/unlink/mkdirSync, stream.pipeline, Readable.prototype.{pipe,unpipe,resume,read,push,_read}, Writable.prototype.{write,_write,destroy}, EventEmitter.prototype.{emit,on,removeAllListeners}, IncomingMessage.prototype key set, Buffer.prototype key set + latin1Slice/utf8Slice, Object.prototype key set, Array.prototype key count, Error.prototype key set, util.inherits. |

## Negative-result summary

- No hits anywhere in scope for: monkeypatch/shim/polyfill vocabulary, loader interception, `process.binding`/`internalBinding`, internal-module requires, assignments to core module properties or core prototypes, `__proto__`/`setPrototypeOf`/`defineProperty` in any dependency, computed writes on globals, saved-original wrapper idioms, install scripts, native addons.
