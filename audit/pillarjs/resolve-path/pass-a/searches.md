# Search log — resolve-path@1.4.0 patch audit (PASS A)

Scope of all searches: the runtime file set below, enumerated with
`find node_modules -name '*.js' -not -path '*/test/*'` from `$PACKAGE_ROOT`
plus the package's own `index.js`. All searches run with
`rg -n --no-ignore <pattern> <files>` from `$PACKAGE_ROOT`.

Runtime file set (complete; no other `.js` ships in the resolved tree):

```
index.js
node_modules/depd/index.js
node_modules/depd/lib/compat/index.js
node_modules/depd/lib/compat/callsite-tostring.js
node_modules/depd/lib/compat/event-listener-count.js
node_modules/depd/lib/browser/index.js          (browser-only entry; scanned anyway)
node_modules/http-errors/index.js
node_modules/http-errors/node_modules/inherits/inherits.js
node_modules/http-errors/node_modules/inherits/inherits_browser.js  (browser-only; scanned anyway)
node_modules/path-is-absolute/index.js
node_modules/setprototypeof/index.js
node_modules/statuses/index.js
```

`node_modules/statuses/codes.json` is pure data (status-code map), no code.

## Group 1 — module imports

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

HITS (all accounted for):
- `index.js:15-20` — http-errors, path (join/normalize/resolve/sep), path-is-absolute
- `node_modules/http-errors/index.js:15-18` — depd('http-errors'), setprototypeof, statuses, inherits
- `node_modules/depd/index.js:11-13` — ./lib/compat (callSiteToString, eventListenerCount), path.relative
- `node_modules/depd/lib/compat/index.js:14,42,46` — events.EventEmitter, lazy ./callsite-tostring, lazy ./event-listener-count
- `node_modules/statuses/index.js:15` — ./codes.json
- `node_modules/http-errors/node_modules/inherits/inherits.js:2,6` — util, ./inherits_browser.js fallback

No `node:` imports, no dynamic `import()`, no ESM.

## Group 2 — globals / core objects / inheritance

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

HITS:
- `index.js:52` — `process.cwd()` (read)
- `node_modules/path-is-absolute/index.js:18` — `process.platform` (read)
- `node_modules/depd/index.js:25,137,142,154,159,170,235,240,244` — process.cwd/noDeprecation/env/traceDeprecation reads; `process.emit('deprecation', err)` (custom event, no core override); `process.stderr.isTTY` read; `process.stderr.write(...)` call
- `node_modules/http-errors/index.js:121,164,211` — `inherits(HttpError, Error)`, `inherits(ClientError, HttpError)`, `inherits(ServerError, HttpError)` (ordinary inheritance of library-owned constructors)
- `node_modules/http-errors/node_modules/inherits/inherits_browser.js:3,16` — browser shim definitions (not loaded under Node)

No Buffer, no globalThis/global writes.

## Group 3 — prototype / descriptor mutation

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

HITS (all traced; see candidates.md):
- `node_modules/setprototypeof/index.js:1,4` — export selection + fallback `obj.__proto__ = proto` (mutates passed object only; fallback branch dead on modern Node)
- `node_modules/depd/lib/compat/index.js:57,66` — defineProperty on depd's own `module.exports` (lazy props)
- `node_modules/depd/index.js:64,469` — defineProperty inside wrapproperty helpers (NOT activated in this chain)
- `node_modules/depd/index.js:480-505` — defineProperty on depd's own fresh DeprecationError instance
- `node_modules/http-errors/index.js:143,190` — `setPrototypeOf(err, …)` on http-errors' own fresh `new Error()` instances
- `node_modules/http-errors/index.js:146,154,193,201` — defineProperty message/name on those same library-created instances
- `node_modules/http-errors/index.js:166-168,213-215` — writes to `ClientError.prototype` / `ServerError.prototype` (library-owned prototypes)
- `node_modules/http-errors/node_modules/inherits/inherits_browser.js:5,19-21` — browser shim (not loaded under Node)

No `Reflect.*` mutation, no `Object.assign` anywhere; no write targets `Error.prototype`, `Object.prototype`, `Function.prototype`, or any `require('<core>')` module object.

## Group 4 — patch vocabulary

Pattern: `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

HITS:
- `node_modules/http-errors/node_modules/inherits/inherits_browser.js:15` — comment "old school shim for old browsers"
- `node_modules/depd/index.js:453,461` — comments "wrap getter"/"wrap setter" inside wrapproperty (not activated here)

No executable patch machinery behind these words.

## Group 5 — module loading interception

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

ZERO HITS across the whole runtime set.

## Group 6 — internals / bindings

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

ZERO HITS across the whole runtime set.

## Extra sweep — eval / Function / V8 stack-trace API

Pattern: `\beval\s*\(|new Function|prepareStackTrace|captureStackTrace|stackTraceLimit`

HITS:
- `node_modules/depd/index.js:366-380` — getStack(): saves then REASSIGNS `Error.prepareStackTrace` and `Error.stackTraceLimit`, captures, restores both (CONFIRMED transient shared mutation; F-001/F-002)
- `node_modules/depd/lib/compat/index.js:22-40` — callSiteToString lazy initializer: same save/reassign/restore pair with `stackTraceLimit = 2` (CONFIRMED transient shared mutation; second site of F-001/F-002)
- `node_modules/depd/index.js:410` — `eval('(function (...)...')` in wrapfunction — runs at import via http-errors (wraps library-owned ImATeapot ctor); not a core patch
- `node_modules/depd/index.js:374`, `lib/compat/index.js:34`, `http-errors/index.js:93,140,187` — `Error.captureStackTrace(...)` usage (V8 API call; defines `stack` on the library's own objects; no mutation of shared state)

No `new Function`.

## Manifest / lifecycle checks

- `package.json` of resolve-path and all five deps + nested inherits: no `preinstall`/`install`/`postinstall` scripts; no `exports` maps; depd and inherits carry `browser` fields whose targets were still scanned.
- Install performed with `--ignore-scripts --omit=dev` per provenance; no lifecycle code ran.
