# Pass B search log — multiparty@4.3.1

All searches ran with `rg -n --no-ignore` over the exact runtime scope below
(from `$PACKAGE_ROOT`). Nested dependencies, tests, examples, docs, and
devDependencies were excluded; browser-only files were included in the search
scope and marked dead-on-Node in the ledger.

## Scope (12 files)

- `index.js` (the only shipped file: `files: ["index.js"]` in package.json)
- `node_modules/depd/index.js`
- `node_modules/depd/lib/browser/index.js` (browser field target; dead on Node)
- `node_modules/http-errors/index.js`
- `node_modules/inherits/inherits.js`
- `node_modules/inherits/inherits_browser.js` (dead on Node)
- `node_modules/random-bytes/index.js`
- `node_modules/safe-buffer/index.js`
- `node_modules/setprototypeof/index.js`
- `node_modules/statuses/index.js` (+ `codes.json` data, read separately)
- `node_modules/toidentifier/index.js`
- `node_modules/uid-safe/index.js`

File inventory command: `find node_modules/<dep> -type f \( -name '*.js' -o -name '*.json' \)`
per dependency; `setprototypeof/test/index.js` excluded (test). Alternate
entrypoint check: `main`/`browser`/`exports` fields of every dependency
package.json inspected — no `exports` maps, no conditional Node entrypoints
beyond the files above.

## Group 1: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

HITS. Full core-import inventory:

- `index.js:11-19` — http-errors, uid-safe, `stream`, `util`, `fs`, `path`, `os`, safe-buffer `.Buffer`, `string_decoder.StringDecoder`
- `node_modules/depd/index.js:11` — `require('path').relative`
- `node_modules/http-errors/index.js:15-19` — depd (invoked immediately: `require('depd')('http-errors')`), setprototypeof, statuses, inherits, toidentifier
- `node_modules/inherits/inherits.js:2,8` — `util` (re-export of `util.inherits`), browser fallback
- `node_modules/random-bytes/index.js:14` — `crypto`
- `node_modules/safe-buffer/index.js:3` — `buffer`
- `node_modules/statuses/index.js:15` — `./codes.json`
- `node_modules/uid-safe/index.js:15` — random-bytes

No `node:` specifiers, no dynamic `import()`, no computed requires.

## Group 2: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

HITS (all traced):

- `index.js:51,570` — `util.inherits(Form, stream.Writable)`, `util.inherits(LimitStream, stream.Transform)` → ledger C-005/C-006
- `index.js:579-580,833,836` — `Buffer.isBuffer/byteLength/alloc` reads (via safe-buffer re-export) — reads only
- `index.js:111,236,521,598,643` — `process.nextTick` calls — reads only
- `node_modules/safe-buffer/index.js:4,12-27,33,40,57` — Buffer branch logic → C-003/C-004
- `node_modules/depd/index.js:23,154,159,170,175,186,251,256,260` — `process.cwd/noDeprecation/env/emit/stderr` — reads + `process.emit('deprecation')` (event emission, not mutation)
- `node_modules/http-errors/index.js:117,160,229` — `inherits(..., Error/HttpError)` → C-011
- `node_modules/uid-safe/index.js:50`, `node_modules/random-bytes/index.js:47` — `global.Promise` reads only
- `node_modules/inherits/inherits_browser.js:3,18` — dead on Node

## Group 3: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

HITS (all traced):

- `index.js:92-578` — `Form.prototype.*` / `LimitStream.prototype.*` definitions (library-owned prototypes) + `Object.prototype.hasOwnProperty.call` reads (131,141)
- `node_modules/safe-buffer/index.js:24` — `SafeBuffer.prototype = Object.create(Buffer.prototype)` → C-004
- `node_modules/http-errors/index.js:139,208` — `setPrototypeOf(err, ...)` on errors it constructs → C-010
- `node_modules/http-errors/index.js:142,150,211,219,249` — `Object.defineProperty` on library-created error instances / library ctor `name` → C-010/C-012
- `node_modules/http-errors/index.js:163-165,232-234` — `ClientError.prototype.status` etc. (library-owned prototypes)
- `node_modules/setprototypeof/index.js:3,6,12` — re-export of `Object.setPrototypeOf`; fallbacks mutate caller-passed objects only → C-013
- `node_modules/inherits/inherits_browser.js:6,22-24` — dead on Node → C-014
- `node_modules/depd/index.js:62,485,496-521` — `Object.defineProperty` in `convertDataDescriptorToAccessor`/`wrapproperty` (caller-supplied objects; unreachable here) and `DeprecationError` (fresh Error instance) → C-017/C-018
- `node_modules/statuses/index.js:96,109` — `Object.prototype.hasOwnProperty.call` reads

No `Object.assign`, no `Reflect.*` writes anywhere in scope.

## Group 4: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive)

HITS — comments only:

- `node_modules/inherits/inherits_browser.js:17` — "old school shim" comment (dead code)
- `node_modules/depd/index.js:436,469,477` and `node_modules/depd/lib/browser/index.js:57` — "wrap" comments on `wrapproperty`/`wrapfunction` (caller-object wrappers, unreachable via http-errors) → C-017/C-019

## Group 5: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

ZERO HITS across the full scope. No module-loading interception.

## Group 6: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

ZERO HITS across the full scope. No binding/internal-module access.

## Auxiliary searches

| Query | Scope | Result |
| --- | --- | --- |
| `Error\.` over the 12 scoped files | package tree | Hits only in `depd/index.js:382-396` (getStack swap/restore), `depd/index.js:493` (`new Error`), `http-errors/index.js:89,136,205` (`Error.captureStackTrace` — documented V8 API, read/call only), `http-errors/index.js:117` (`inherits(HttpError, Error)`) |
| `prepareStackTrace` in `$NODEJS_SOURCE/lib/internal/errors.js` | Node core | Baseline at errors.js:136-170 (`prepareStackTraceCallback`, `ErrorPrepareStackTrace`) |
| `prepareStackTrace` in `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js` | Node core | realm.js:485-511 `setupPrepareStackTrace()` installs default `Error.prepareStackTrace = ErrorPrepareStackTrace` (writable, configurable data property) |
| `_write` in `$NODEJS_SOURCE/lib/internal/streams/writable.js` | Node core | writable.js:23-24 documents "Implement an async ._write(chunk, encoding, cb)" — subclass extension contract |
| `_transform` in `$NODEJS_SOURCE/lib/internal/streams/transform.js` | Node core | transform.js:162-163 base `_transform` throws `ERR_METHOD_NOT_IMPLEMENTED` — designed for subclass override |
| `$NODEJS_SOURCE/lib/internal/streams/passthrough.js` (read) | Node core | Plain minimal Transform; no core members named `headers/name/filename/byteOffset/byteCount` — no shadowing by C-007 |
| `this.decoder|this.encoding` in `$NODEJS_SOURCE/lib/internal/streams/readable.js` | Node core | readable.js:333-334 — `ReadableState.decoder/encoding` fields read (not written) by multiparty index.js:167-168 |
| `function inherits` in `$NODEJS_SOURCE/lib/util.js` | Node core | util.js:344-363 — mutates only `ctor` and `ctor.prototype` |
| `gh api search/issues repo:dougwilson/nodejs-depd prepareStackTrace` | upstream | Issues #32 (closed, "Why is this library overwriting Error type?"), #36 (closed, `--enable-source-maps` incompatibility), #39 (closed), PR #48 / issue #50 (open, CallSite robustness) — corroborate the getStack swap |
