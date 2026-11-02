# Search log — multer 2.5.0 patch audit (pass B)

All commands run from `$PACKAGE_ROOT` unless noted. Scope variable used throughout:

```
SCOPE = index.js lib storage
        node_modules/append-field/index.js node_modules/append-field/lib
        node_modules/busboy/lib node_modules/streamsearch/lib
        node_modules/media-typer/index.js node_modules/mime-db/index.js
        node_modules/mime-types/index.js node_modules/type-is/index.js
```

(Tests, benches, examples, `.eslintrc.js` files intentionally excluded — out of scope.)

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `cat package.json` | multer 2.5.0; runtime deps append-field ^1.0.0, busboy ^1.6.0, type-is ^1.6.18; files: index.js, lib/, storage/ |
| S-02 | `git log -1 --format='%H %s'` | `2c380d06cdaacc68bbef8b36244493a3d33d6b88 2.5.0 (#1490)` |
| S-03 | `find lib storage -type f` | 6 lib files + storage/disk.js + storage/memory.js |
| S-04 | `node -e ...package.json` per dep | append-field 1.0.0 (main index.js), busboy 1.6.0 (main ./lib/index.js, dep streamsearch ^1.1.0), streamsearch 1.1.0 (main ./lib/sbmh.js), media-typer 0.3.0, mime-db 1.52.0, mime-types 2.1.35 (dep mime-db 1.52.0), type-is 1.6.18 (deps media-typer, mime-types). No install scripts run (installed with --ignore-scripts; none of these packages declare install hooks in their package.json) |
| S-05 | `find node_modules -name '*.js' -not -path '*/node_modules/*'` | Full runtime JS inventory; only lib/entry files are runtime, rest are test/bench |

## Candidate pattern set (skill section "Find actual writes and replacements")

| # | Pattern | Command | Result |
| --- | --- | --- | --- |
| P-01 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | `rg -n --no-ignore <pat> $SCOPE` | Core imports found: fs, os, path, crypto, stream (multer storage/disk.js:1-5), events (lib/counter.js:1), util (lib/multer-error.js:1), async_hooks (lib/make-middleware.js:2), stream (busboy multipart.js:3, urlencoded.js:3), path.extname (mime-types/index.js:16). No `node:` specifiers, no dynamic import, no conditional entrypoints |
| P-02 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | `rg -n --no-ignore <pat> $SCOPE` | Buffer.concat/from/isBuffer/allocUnsafe calls (reads); `util.inherits(MulterError, Error)` lib/multer-error.js:44; `class URLEncoded extends Writable`, `class FileStream extends Readable`, `class Multipart extends Writable` (busboy); `process.nextTick(cb)` multipart.js:190 (call). No global/globalThis writes |
| P-03 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | `rg -n --no-ignore <pat> $SCOPE` | All `.prototype` hits are definitions on library-owned constructors (Multer, MemoryStorage, DiskStorage, FileAppender, Counter) or `Object.prototype.hasOwnProperty.call` reads; `Object.defineProperty(file,'stream',...)` make-middleware.js:384 (library object); `Object.assign(placeholder, file)` file-appender.js:62 (library object); `Counter.prototype = Object.create(EventEmitter.prototype)` counter.js:8 (inheritance, no write to EventEmitter.prototype). No `__proto__`, no setPrototypeOf, no Reflect mutators anywhere in scope |
| P-04 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | `rg -n --no-ignore -i <pat> $SCOPE` | **No matches** (exit 1) |
| P-05 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | `rg -n --no-ignore <pat> $SCOPE` | **No matches** (exit 1) — no module loading interception |
| P-06 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | `rg -n --no-ignore <pat> $SCOPE` | **No matches** (exit 1) — no native binding / core-internal module access |

## Targeted follow-up searches

| # | Command | Result |
| --- | --- | --- |
| T-01 | `rg -n --no-ignore "__proto__\|prototype\|constructor" node_modules/append-field/index.js node_modules/append-field/lib` | **No matches** — append-field has no special-casing of proto keys; they are handled as ordinary keys (see C-023) |
| T-02 | `rg -n --no-ignore "_events\|\.pause\s*\(\|\.resume\s*\(\|\.unpipe\s*\(\|\.pipe\s*\(\|removeListener\|removeAllListeners\|\.emit\s*\(" $SCOPE` | All hits are method **calls**: `req.pipe(busboy)` make-middleware.js:66, `req.unpipe(busboy)` :160/:231, `req.resume()` :169, `fileStream.resume()` :342/:361/:371, `busboy.removeAllListeners()` :162, `outStream.removeListener` disk.js:153-154, `this.emit(...)` inside busboy's own stream subclasses. **No `_events` access anywhere; no reassignment of pause/resume/pipe/unpipe/emit on any object** |
| T-03 | `rg -n --no-ignore "req\.[A-Za-z_$]+\s*=\|request\.[A-Za-z_$]+\s*=" $SCOPE` | Exactly four writes to the live request: `req.body = Object.create(null)` make-middleware.js:136; `req.files = []` / `req.files = Object.create(null)` file-appender.js:13-14; `this.req.file = file` file-appender.js:57. All new library-owned keys (see C-002..C-004) |
| T-04 | `rg -n --no-ignore "latin1Slice\|utf8Slice\|ucs2Slice\|base64Slice" node_modules/busboy/lib` | 18 call sites (utils.js:434,442,450,458; urlencoded.js:88,96,124,132,149,159,188,196,213,295,315; multipart.js:63,73,112) — all **calls** to undocumented core Buffer.prototype methods, never assignments (see C-018) |
| T-05 | `grep -n "context\[step.key\]\|Object.create(null)\|obj\[" node_modules/append-field/lib/set-value.js` | All writes target `context` (the store multer passes = `req.body`, a null-prototype object) or freshly created `Object.create(null)` intermediates (set-value.js:39,49,57) |
| T-06 | Full reads of every runtime file in scope (multer index.js + 6 lib + 2 storage; busboy lib/index.js, lib/utils.js, lib/types/multipart.js, lib/types/urlencoded.js; streamsearch lib/sbmh.js; append-field index.js + 2 lib; type-is, media-typer, mime-types, mime-db index.js) | Complete; no computed-key mutation helpers, no patching dependencies (no shimmer / require-in-the-middle anywhere in the tree) |

## Node.js baseline verification ($NODEJS_SOURCE, commit d44625a4b80c672215b469906ce583ce7eeeebaf) — targeted reads only

| # | Command | Result |
| --- | --- | --- |
| N-01 | `rg -n "_write\b|_final" lib/internal/streams/writable.js` + read of lines 837-850, 410, 1166 | `Writable.prototype._write` (:837) throws ERR_METHOD_NOT_IMPLEMENTED unless overridden; `options.write` accepted at :410; `Writable.prototype._destroy` :1166 — confirms `_write`/`_writev`/`_destroy`/`_final` are the documented subclass extension points busboy implements |
| N-02 | `rg -n "Readable.prototype._read|push|resume|pipe|unpipe" lib/internal/streams/readable.js` | `push` :411, `_read` :974, `pipe` :978, `unpipe` :1180, `resume` :1327 — multer/busboy only call these; none reassigned |
| N-03 | `rg -n "latin1Slice|utf8Slice|ucs2Slice|base64Slice" lib/buffer.js lib/internal/buffer.js` | Core itself installs them on the Buffer prototype: lib/internal/buffer.js:1071-1076 (`proto.latin1Slice = ...` etc.). busboy reads/calls them — private API usage, not mutation |
| N-04 | `rg -n "bytesWritten|closed" lib/internal/fs/streams.js lib/internal/streams/utils.js` | `this.bytesWritten` set by core WriteStream (fs/streams.js:415, :458); `stream.closed` boolean recognized by core (streams/utils.js:240-251) — multer reads both (disk.js) |
| N-05 | `rg -n "class AsyncResource|runInAsyncScope" lib/async_hooks.js` | Public class :180, method :220 — multer calls `new AsyncResource('multer')` + `runInAsyncScope` (documented API) |
| N-06 | `rg -n "\.body\b|\bfiles\b|\bfile\b" lib/_http_incoming.js` | Only a license-comment hit — IncomingMessage defines no `body`/`file`/`files` property, so multer's writes add new keys rather than shadowing/replacing core members |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R-01 | `node repro-core-identity.js "$PACKAGE_ROOT"` (script beside this report; Node v24.19.0) | `OK: no core prototype/function identity change after loading+instantiating multer` — own-key sets of Readable/Writable/IncomingMessage/EventEmitter/Buffer/Object prototypes and `fs` and identities of pipe/unpipe/resume/push/write/emit/on/removeAllListeners/createWriteStream/unlink/open/fsync/latin1Slice/utf8Slice all unchanged after `require` + instantiating all middleware factories |
| R-02 | Same script, append-field section | `__proto__`, `__proto__[x]`, `constructor[prototype][y]`, `a[__proto__][z]` all land as inert own keys on the null-prototype store; `Object.prototype` own-key set unchanged; `{}.x/y/z` undefined |

## Upstream corroboration (read-only)

| # | Command | Result |
| --- | --- | --- |
| U-01 | `gh search issues --repo expressjs/multer "monkeypatch OR monkey-patch OR prototype pollution"` | `[]` — no matching issues |
| U-02 | `gh api repos/expressjs/multer/commits/2c380d06...` | Confirmed: commit is the `2.5.0 (#1490)` release commit |
| U-03 | `npm pack append-field@1.0.0` + `diff -r` vs installed copy | **IDENTICAL** to the registry artifact (rules out a locally patched dependency; confirms upstream 1.0.0 already uses `Object.create(null)` intermediates) |
