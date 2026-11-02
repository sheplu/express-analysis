# Pass B search log: resolve-path@1.4.0

Scope of all searches: the runtime file set reachable from `$PACKAGE_ROOT/index.js`
(ripgrep with `--no-ignore`, explicit file list; tests/docs/examples excluded):

- `$PACKAGE_ROOT/index.js`
- `$PACKAGE_ROOT/node_modules/http-errors/index.js` (1.6.3)
- `$PACKAGE_ROOT/node_modules/path-is-absolute/index.js` (1.0.1)
- `$PACKAGE_ROOT/node_modules/depd/index.js` (1.1.2)
- `$PACKAGE_ROOT/node_modules/depd/lib/compat/index.js`
- `$PACKAGE_ROOT/node_modules/depd/lib/compat/callsite-tostring.js`
- `$PACKAGE_ROOT/node_modules/depd/lib/compat/event-listener-count.js`
- `$PACKAGE_ROOT/node_modules/depd/lib/browser/index.js` (browser field only; included for completeness, not loaded in Node)
- `$PACKAGE_ROOT/node_modules/setprototypeof/index.js` (1.1.0)
- `$PACKAGE_ROOT/node_modules/statuses/index.js` (1.5.0)
- `$PACKAGE_ROOT/node_modules/http-errors/node_modules/inherits/inherits.js` (2.0.3)
- `$PACKAGE_ROOT/node_modules/http-errors/node_modules/inherits/inherits_browser.js` (fallback, unreachable in Node)

## Skill group 1: imports / module loading

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

HITS (all read-only imports; full inventory):
- resolve-path index.js:15-20 — http-errors, path (join/normalize/resolve/sep), path-is-absolute
- http-errors index.js:15-18 — depd (called with 'http-errors'), setprototypeof, statuses, inherits
- depd index.js:11-13 — ./lib/compat (property access triggers lazy getters), path.relative
- depd lib/compat/index.js:14,42,46 — events.EventEmitter; conditional fallbacks ./callsite-tostring, ./event-listener-count
- statuses index.js:15 — ./codes.json
- inherits inherits.js:2,6 — util; fallback ./inherits_browser.js (only when util.inherits missing)

No `node:` imports, no dynamic `import()`, no computed require targets.

## Skill group 2: globals / inheritance

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

HITS:
- resolve-path index.js:52 — `process.cwd()` (read)
- path-is-absolute index.js:18 — `process.platform` (read; selects exported function)
- depd index.js:25,137,142,154,159,170,235,240,244 — process reads, `process.emit('deprecation')`, `process.stderr.write` (no mutation of process)
- http-errors index.js:121,164,211 — `inherits(HttpError, Error)`, `inherits(ClientError, HttpError)`, `inherits(ServerError, HttpError)` → candidates C-007
- inherits_browser.js:3,16 — fallback definitions (unreachable in Node)

No Buffer, no global/globalThis writes.

## Skill group 3: prototype / descriptor mutation

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

HITS:
- setprototypeof index.js:1,4 — exports native `Object.setPrototypeOf` on modern Node; `__proto__` write only in unreachable fallback → C-005
- http-errors index.js:143,190 — `setPrototypeOf(err, …)` on freshly created library Error instance → C-006
- http-errors index.js:146,154,193,201 — `Object.defineProperty(err, 'message'/'name', …)` on own instance → C-006
- http-errors index.js:166-168,213-215 — writes to ClientError/ServerError.prototype (library-owned ctors) → C-007
- depd index.js:64,469 — `Object.defineProperty(obj, prop, …)` in convertDataDescriptorToAccessor/wrapproperty (unreachable in this chain) → C-004
- depd index.js:480-519 — defineProperty on own new DeprecationError instance → C-014
- depd lib/compat/index.js:57,66 — lazyProperty defineProperty on depd's own module.exports → C-011
- inherits_browser.js:5,19-21 — fallback (unreachable in Node)

No `Object.assign`, no `Reflect.*` anywhere in scope.

## Skill group 4: patch/wrap keywords

Pattern (case-insensitive): `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

HITS (comments/function names only):
- inherits_browser.js:15 — comment "old school shim for old browsers" (unreachable branch)
- depd index.js:420,453,461 and lib/browser/index.js:57 — "Wrap property"/"wrap getter"/"wrap setter" comments → wrapproperty, C-004 (unreachable); browser file not loaded
- No monkeypatch/patch/polyfill/override hits.

## Skill group 5: module loader interception

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

ZERO HITS.

## Skill group 6: bindings / internals

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

ZERO HITS.

## Extra searches (beyond the six groups)

- `Error\.(prepareStackTrace|stackTraceLimit|captureStackTrace)\s*=|Error\.captureStackTrace`
  - HITS: depd index.js:370,371,379,380 (getStack swap/restore) → C-001; depd lib/compat/index.js:30,31,39,40 (feature-detect swap/restore) → C-002; Error.captureStackTrace invocations (read/use, not assignment) at http-errors index.js:93,140,187, depd index.js:374, depd lib/compat/index.js:34 → C-013
- `\beval\s*\(|new Function`
  - HIT: depd index.js:410 — eval-built wrapper in wrapfunction → C-003
- Assignments onto core module namespaces `(path|process|util|events)\.[A-Za-z_$]+\s*=[^=]`
  - ZERO HITS (confirms path-is-absolute ponyfill never installs onto `path`, depd never writes to process/events/util)
- package.json audit of all 7 packages: no install/postinstall/preinstall scripts; `browser` fields on depd (`lib/browser/index.js`) and inherits (`./inherits_browser.js`) are bundler-only and not loaded by Node.

## Node core verification searches (targeted, `$NODEJS_SOURCE` @ d44625a4b80)

- `rg -n "function inherits" lib/util.js` → lib/util.js:344; body mutates only `ctor` (defineProperty 'super_') and `ctor.prototype` ([[Prototype]] set). Error/Error.prototype untouched by util.inherits.
- `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js` → lib/internal/errors.js:136-166 `prepareStackTraceCallback` reads user-assigned `Error.prepareStackTrace` as a supported hook; Node core itself uses the same transient save/restore of `Error.stackTraceLimit` (lines 181-188, 416-419); line 248 comment warns V8 reads `Error.stackTraceLimit` as a data property (accessor traps disable capture — observed in repro attempt 1).
- `rg -n "listenerCount" lib/events.js` → lib/events.js:218 static exists; depd compat only reads it.
- `rg -n "isAbsolute" lib/path.js` → implementation present; nothing in scope assigns to it (repro confirms identity unchanged).

## Upstream corroboration (gh search, bounded)

- `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` → #32 (closed, "Why is this library overwriting Error type?"), #36/#39 (closed, conflicts with `--enable-source-maps` / Node source-map prepareStackTrace caused by the transient swap), #17, #28, #50.
- `gh search issues --repo dougwilson/nodejs-depd "eval"` → #20 (closed, "Drop eval usage"; removed in depd 2.x, still present in 1.1.2), #41 (open, `--disallow-code-generation-from-strings` incompatibility), #44, #53 (open, `--frozen-intrinsics` incompatibility — the Error.* writes throw when intrinsics are frozen, confirming they are writes to shared intrinsics).
