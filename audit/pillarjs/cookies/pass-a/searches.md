# Search log — cookies@0.9.2 patch audit (pass A)

Scope of every search below ("runtime files") unless stated otherwise:

- `$PACKAGE_ROOT/index.js` (sole shipped file per `package.json` `files`; no `main`/`exports` override, default entrypoint `index.js`)
- `$PACKAGE_ROOT/node_modules/depd/index.js` (depd@2.0.0 Node entrypoint; no `main`, defaults to index.js)
- `$PACKAGE_ROOT/node_modules/depd/lib/browser/index.js` (depd conditional `browser` entrypoint — bundler-only, inspected anyway)
- `$PACKAGE_ROOT/node_modules/keygrip/index.js` (keygrip@1.1.0; no `main`, defaults to index.js)
- `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js` (tsscmp@1.0.6; `main: lib/index.js`)

Excluded: `$PACKAGE_ROOT/test/`, `node_modules/tsscmp/test/` (tests), docs, lockfile-only devDependencies (never installed: `npm install --ignore-scripts --omit=dev`).

Tool: `rg -n --no-ignore <pattern> <runtime files>` run from `$PACKAGE_ROOT`.

## Skill pattern group 1 — module imports

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

Hits (complete):
- `index.js:10` require('depd')('cookies'); `index.js:11` require('keygrip'); `index.js:12` require('http')
- `node_modules/depd/index.js:11` require('path').relative
- `node_modules/keygrip/index.js:9` require('tsscmp'); `:10` require('crypto'); `:48` string literal only
- `node_modules/tsscmp/lib/index.js:9` require('crypto')

No dynamic `import()`, no `node:` specifiers, no computed requires. Core modules imported: `http` (cookies), `path` (depd), `crypto` (keygrip, tsscmp).

## Skill pattern group 2 — globals / inheritance

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

Hits (complete, all in depd/index.js): `:23` process.cwd() (read), `:154` process.noDeprecation (read), `:159` process.env.NO_DEPRECATION (read), `:170` process.traceDeprecation (read), `:175` process.env.TRACE_DEPRECATION (read), `:186` listener count on process (read), `:251` process.emit('deprecation', err) (library-defined event, no core mutation), `:256` process.stderr.isTTY (read), `:260` process.stderr.write (call).

Zero hits in cookies/keygrip/tsscmp/depd-browser. No Buffer, globalThis, extends, or inherits usage anywhere in scope.

## Skill pattern group 3 — prototype / descriptor mutation

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

Hits (complete):
- `index.js:103,133` Cookies.prototype method definitions (library-owned constructor)
- `index.js:167` **read** of `http.OutgoingMessage.prototype.setHeader` (candidate C-003)
- `index.js:214-243` Cookie.prototype defaults/methods (library-owned)
- `index.js:246` Object.defineProperty(Cookie.prototype, 'maxage', ...) (library-owned, candidate C-005)
- `index.js:252` deprecate.property(Cookie.prototype, 'maxage', ...) (library-owned target, candidate C-005/C-006)
- `node_modules/depd/index.js:62,485` Object.defineProperty(obj, prop, ...) inside convertDataDescriptorToAccessor/wrapproperty (caller-supplied obj, candidate C-006)
- `node_modules/depd/index.js:496,500,507,514,521` Object.defineProperty(error, ...) on a freshly created Error instance (candidate C-009)

No `__proto__`, no setPrototypeOf, no Object.assign, no Reflect mutation APIs in scope.

## Skill pattern group 4 — patch/wrap/shim keywords

Pattern (case-insensitive): `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

Hits (complete): comments only — `node_modules/depd/index.js:436,469,477` and `node_modules/depd/lib/browser/index.js:57` ("wrap getter/setter/property"). These refer to depd's wrapproperty/wrapfunction (candidates C-006/C-007). No other hits.

## Skill pattern group 5 — module loader interception

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

**Zero hits** across all runtime files.

## Skill pattern group 6 — bindings / internals

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

**Zero hits** across all runtime files.

## Supplemental search — Error stack-trace globals and assignments to core module refs

Pattern: `Error\.(prepareStackTrace|stackTraceLimit|captureStackTrace)|\bhttp\.[A-Za-z.]+\s*=[^=]|\bcrypto\.[A-Za-z.]+\s*=[^=]|\bprocess\.[A-Za-z.]+\s*=[^=]`

Hits (complete, all in depd/index.js getStack()):
- `:382` read Error.stackTraceLimit; `:384` read Error.prepareStackTrace
- `:386` **write** `Error.prepareStackTrace = prepareObjectStackTrace` (candidate C-001)
- `:387` **write** `Error.stackTraceLimit = Math.max(10, limit)` (candidate C-002)
- `:390` call Error.captureStackTrace(obj)
- `:395` restore `Error.prepareStackTrace = prep`; `:396` restore `Error.stackTraceLimit = limit`

No assignments to properties of the `http`, `crypto`, or `process` module objects anywhere in scope.

## Dependency metadata checks

- `package.json` of depd/keygrip/tsscmp: no `preinstall`/`install`/`postinstall` scripts (only test/lint/bench). Install used `--ignore-scripts` regardless.
- Resolved runtime dependency closure (package-lock + installed tree): cookies -> depd@2.0.0, keygrip@1.1.0 -> tsscmp@1.0.6. No further runtime deps.
- Installed runtime JS files enumerated with `find node_modules -type f -name '*.js'`: exactly the five runtime files above plus tsscmp tests (out of scope).

## Node.js core baseline lookups ($NODEJS_SOURCE, main @ d44625a4b80c672215b469906ce583ce7eeeebaf; bounded, file-specific — no tree scans)

- `rg -n "OutgoingMessage" lib/http.js` -> exported at `lib/http.js:269` (imported at `:50`).
- `rg -n "setHeader" lib/_http_outgoing.js` -> zero hits; file is now a re-export of `internal/http/outgoing`.
- `rg -n "setHeader" lib/internal/http/outgoing.js` -> `OutgoingMessage.prototype.setHeader` defined at `lib/internal/http/outgoing.js:813`.
- `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js` -> `prepareStackTraceCallback` at `lib/internal/errors.js:136-160` invokes a user-assigned `globalThis.Error.prepareStackTrace` in place of Node's default formatting (`:149-156`); Node's own default implementation nearby; Node itself uses the same temporary stackTraceLimit swap idiom (`:181-188`).
- `rg -n "prepareStackTrace" lib/internal/source_map/prepare_stack_trace.js` -> `prepareStackTraceWithSourceMaps` at `:28` (Node's source-map default, bypassed while a user prepareStackTrace is set).
- `rg -n "prepareStackTrace|stackTraceLimit" doc/api/errors.md` -> `Error.stackTraceLimit`/`Error.prepareStackTrace` are documented public V8 APIs that Node honors.
