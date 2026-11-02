# Pass A search log: multiparty@4.3.1

All searches run from `$PACKAGE_ROOT` (multiparty @ `dcec0ec02ba6c2ef1961dcf8e2f25fce94eb1c2d`, v4.3.1).

Search scope (`SCOPE`) = the shipped runtime files only:

- `index.js` (sole shipped file per package.json `files: ["index.js"]`; default main)
- `node_modules/depd/index.js`, `node_modules/depd/lib/browser/index.js`
- `node_modules/http-errors/index.js`
- `node_modules/inherits/inherits.js`, `node_modules/inherits/inherits_browser.js`
- `node_modules/random-bytes/index.js`
- `node_modules/safe-buffer/index.js`
- `node_modules/setprototypeof/index.js`
- `node_modules/statuses/index.js` (+ `codes.json`, data only)
- `node_modules/toidentifier/index.js`
- `node_modules/uid-safe/index.js`

Excluded: `test/`, `examples/`, `tool/`, `README.md`, dependency test files
(`setprototypeof/test/index.js`) — not shipped runtime code. Browser variants
(`depd/lib/browser/index.js`, `inherits/inherits_browser.js`) were searched but
are reachable only via `browser` package.json fields, never in Node runtime.

## Skill candidate pattern groups

| # | Pattern | Scope | Result |
| --- | --- | --- | --- |
| G1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | SCOPE | 21 hits. Full core import inventory: multiparty `index.js:11-19` (http-errors, uid-safe, stream, util, fs, path, os, safe-buffer, string_decoder); depd:11 (path); http-errors:15-19 (depd, setprototypeof, statuses, inherits, toidentifier); inherits:2,8 (util / browser fallback); random-bytes:14 (crypto); safe-buffer:3 (buffer); statuses:15 (codes.json); uid-safe:15 (random-bytes). No dynamic `import()`, no `node:` specifiers. |
| G2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | SCOPE | 40 hits. Leads: `index.js:51,570` util.inherits subclassing (C-001, C-006); http-errors:117,160,229 inherits (C-019); safe-buffer:12-27 Buffer branch/copy (C-010, C-011); depd:23,154-260 process reads/stderr/emit (C-016, C-017); uid-safe:50 & random-bytes:47 `global.Promise` read (C-030). All resolved in candidates.md. |
| G3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | SCOPE | 43 hits. Leads: depd:62,485 defineProperty (wrapproperty path, C-014); depd:496-521 defineProperty on fresh Error (C-015); http-errors:139,208 setPrototypeOf on fresh err (C-020); http-errors:142-155,211-224 defineProperty on fresh err (C-021); http-errors:163-165,232-234 library prototype writes (C-022); http-errors:249 nameFunc (C-023); setprototypeof:3,6 re-export/fallback (C-027); safe-buffer:24 (C-011); inherits_browser.js:6-24 (C-026, browser-only); multiparty `index.js` — all `.prototype` hits are definitions of multiparty's own `Form.prototype.*` / `LimitStream.prototype._transform` plus `Object.prototype.hasOwnProperty.call` guards (reads). |
| G4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | SCOPE | 5 hits, all comments: depd:436/469/477 + browser:57 ("Wrap property in a deprecation message" — leads to C-013/C-014); inherits_browser.js:17 ("old school shim" — browser-only). No code hits in multiparty itself. |
| G5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | SCOPE | Zero hits. No module-loading interception anywhere in scope. |
| G6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | SCOPE | Zero hits. No native-binding or core-internal module access. |

## Supplemental searches

| Query | Scope | Result |
| --- | --- | --- |
| `emitClose` | `$NODEJS_SOURCE/lib/internal/streams/writable.js`, `destroy.js` | Hits at writable.js:193 (option descriptor map), writable.js:324 (`options.emitClose === false` honored). Confirms C-002 is a documented constructor option. |
| `_write\b` | `$NODEJS_SOURCE/lib/internal/streams/writable.js` | writable.js:23 ("Implement an async ._write(chunk, encoding, cb)"), writable.js:410. Confirms `_write` is the documented subclass extension point (C-003). |
| `_readableState =\|this.decoder\|this.encoding\|setEncoding` | `$NODEJS_SOURCE/lib/internal/streams/readable.js` | readable.js:333-334 (state.decoder/state.encoding set by setEncoding/options), readable.js:363 (`this._readableState = new ReadableState(...)`), readable.js:631 (setEncoding). Confirms C-004 targets are internal state, read-only in multiparty. |
| `^function inherits` (context) | `$NODEJS_SOURCE/lib/util.js` | lib/util.js:344-363: `inherits` writes `ctor.super_` (defineProperty on ctor) and `ObjectSetPrototypeOf(ctor.prototype, superCtor.prototype)` — mutates only the caller-supplied subclass constructor, never the core superclass. Confirms C-001/C-006/C-019/C-025. |
| `prepareStackTrace` | `$NODEJS_SOURCE/lib/internal/errors.js`, `lib/internal/source_map/prepare_stack_trace.js` | errors.js:136-166: Node's realm `prepareStackTraceCallback` invokes a user-set `Error.prepareStackTrace` function in place of the default (source-map-aware) formatter. prepare_stack_trace.js:28 is the source-map default. Core baseline for F-001. |
| install hooks + browser fields | each dependency `package.json` | No preinstall/install/postinstall hook in any of the 9 dependencies. `browser` fields only on depd (`lib/browser/index.js`) and inherits (`./inherits_browser.js`) — Node runtime never loads them. |
| `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` | upstream | Hits: #32 "Why is this library overwriting Error type?" (closed), #36 "Incompatible with --enable-source-maps node 12 option" (closed), #39 "compatibility with Node.js' source-map implementation" (closed), #50 "callSite.getFileName is not a function" (open). Corroborates F-001. |
| `gh search issues --repo pillarjs/multiparty "monkeypatch OR prepareStackTrace OR prototype"` | upstream | Zero hits. No known patching discussion for multiparty itself. |
| PassThrough prototype-chain shadow check (node one-liner) | runtime (Node v24.19.0) | `headers`, `name`, `filename`, `byteOffset`, `byteCount` exist nowhere on the `stream.PassThrough` prototype chain — "NONE". Confirms C-005 writes are additive metadata, not overrides. |
