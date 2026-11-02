# Pass B — search log: cookies@0.9.2

Scope of all searches (runtime-reachable files only; tests/docs excluded):

- `$PACKAGE_ROOT/index.js` (sole shipped file per package.json `files`; `main` defaults to index.js; no `exports` map)
- `$PACKAGE_ROOT/node_modules/depd/index.js` (depd@2.0.0 Node entrypoint)
- `$PACKAGE_ROOT/node_modules/depd/lib/browser/index.js` (depd@2.0.0 conditional `browser` entrypoint — included per skill rule on conditional entrypoints)
- `$PACKAGE_ROOT/node_modules/keygrip/index.js` (keygrip@1.1.0, `main` defaults to index.js)
- `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js` (tsscmp@1.0.6, `main: lib/index.js`; `tsscmp/test/**` excluded as out of scope)

Tool: `rg -n --no-ignore <pattern> <scoped files>` from `$PACKAGE_ROOT`.

## Skill pattern group 1 — imports / module loads

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

Hits (complete):
- index.js:10 `require('depd')('cookies')`
- index.js:11 `require('keygrip')`
- index.js:12 `require('http')`
- node_modules/depd/index.js:11 `require('path').relative`
- node_modules/keygrip/index.js:9 `require('tsscmp')`
- node_modules/keygrip/index.js:10 `require("crypto")`
- node_modules/tsscmp/lib/index.js:9 `require('crypto')`
- (node_modules/keygrip/index.js:48 is a string in an error message, not an import)

No dynamic `import()`, no `node:` specifiers, no computed require targets. Core modules consumed: `http`, `path`, `crypto` (plus implicit `process` global).

## Skill pattern group 2 — globals / inheritance

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

Hits (complete; all in depd/index.js): 23 (`process.cwd()`), 154 (`process.noDeprecation` read), 159 (`process.env.NO_DEPRECATION` read), 170 (`process.traceDeprecation` read), 175 (`process.env.TRACE_DEPRECATION` read), 186 (listener count on `process`), 251 (`process.emit('deprecation', err)`), 256 (`process.stderr.isTTY` read), 260 (`process.stderr.write`).

All reads/calls; no assignment to `process`, no `global`/`globalThis` writes, no `Buffer` use, no class extension of core.

## Skill pattern group 3 — prototype / descriptor writes

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

Hits (complete):
- depd/index.js:62, 485 `Object.defineProperty(obj, prop, descriptor)` — generic helper; in this dependency tree invoked only with `Cookie.prototype` (library-owned) via index.js:252. Candidates C-004/C-005.
- depd/index.js:496–521 `Object.defineProperty(error, ...)` — properties defined on a freshly created `Error` instance owned by depd (DeprecationError). Candidate C-006.
- index.js:103, 133 `Cookies.prototype.get/set` — definitions on library-owned constructor.
- index.js:167 `http.OutgoingMessage.prototype.setHeader` — READ of core prototype method (no assignment). Candidate C-001.
- index.js:214–243 `Cookie.prototype.*` — definitions on library-owned constructor.
- index.js:246 `Object.defineProperty(Cookie.prototype, 'maxage', ...)` — library-owned object. Candidate C-004.
- index.js:252 `deprecate.property(Cookie.prototype, 'maxage', ...)` — library-owned object. Candidate C-005.

No `__proto__`, no `setPrototypeOf`, no `Reflect.*`, no `Object.assign` anywhere in scope.

## Skill pattern group 4 — patch vocabulary

Pattern (case-insensitive): `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

Hits (complete): comments only — depd/index.js:436, 469, 477 and depd/lib/browser/index.js:57 ("wrap property/getter/setter"). These describe depd's `wrapfunction`/`wrapproperty` API, which returns wrappers / redefines properties on caller-supplied objects (here only `Cookie.prototype`). No patching vocabulary tied to core objects.

## Skill pattern group 5 — module system hooks

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

Zero hits in scope.

## Skill pattern group 6 — bindings / internals

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

Zero hits in scope.

## Supplementary searches

- `Error\.(prepareStackTrace|stackTraceLimit|captureStackTrace)` over scope:
  - depd/index.js:382 read `Error.stackTraceLimit`
  - depd/index.js:384 read `Error.prepareStackTrace`
  - depd/index.js:386 **WRITE** `Error.prepareStackTrace = prepareObjectStackTrace` — candidate C-002 (confirmed F-001)
  - depd/index.js:387 **WRITE** `Error.stackTraceLimit = Math.max(10, limit)` — candidate C-003 (confirmed F-002)
  - depd/index.js:390 call `Error.captureStackTrace(obj)` (read/use)
  - depd/index.js:395 restore `Error.prepareStackTrace = prep`
  - depd/index.js:396 restore `Error.stackTraceLimit = limit`
- `http\.|crypto\.|process\.` over scope: only reads/calls (`crypto.timingSafeEqual`, `crypto.pseudoRandomBytes`, `crypto.createHmac` in tsscmp/keygrip; `process.*` reads in depd; `http.OutgoingMessage.prototype.setHeader` read in index.js:167). No assignment to any `http.*`, `crypto.*`, or `process.*` property.

## Node.js core-baseline verification searches ($NODEJS_SOURCE, main @ d44625a4b80, read-only, bounded)

- `rg -n "OutgoingMessage" lib/http.js` → exported at lib/http.js:50, 269.
- `rg -n "OutgoingMessage.prototype.setHeader" lib/internal/http/outgoing.js` → defined at lib/internal/http/outgoing.js:813 (re-exported through lib/_http_outgoing.js:32,43). Public documented API; cookies only reads/calls it.
- `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js` → Node's realm `prepareStackTraceCallback` (lib/internal/errors.js:136–156) explicitly consults a user/library-assigned `Error.prepareStackTrace` function and delegates to it; Node core itself uses the same save/replace/restore pattern on `Error.stackTraceLimit` (e.g., lib/internal/errors.js:181–188, 416–419). Confirms `Error.prepareStackTrace`/`Error.stackTraceLimit` are shared, realm-global hooks whose assignment changes stack formatting for every error serialized while set.
- `rg -n "prepareStackTrace" lib/internal/source_map/prepare_stack_trace.js` → `prepareStackTraceWithSourceMaps` (line 28): Node's `--enable-source-maps` stack processing participates in the same single global hook — basis for the historical depd conflict (depd#36/#39).

## Upstream corroboration searches

- `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` → depd#32 "Why is this library overwriting Error type?" (closed) — quotes `getStack()` verbatim and reports collision symptom `callSite.getFileName is not a function`; depd#50 (open) same symptom class; depd#36 "Incompatible with --enable-source-maps node 12 option" (closed); depd#39 "compatibility with Node.js' source-map implementation" (closed, opened by a Node.js source-maps author).
- `gh search issues --repo pillarjs/cookies "setHeader"` → cookies#122 (open) "setHeader method may be set incorrectly", cookies#144 (closed) "make setHeader compatible with fastify reply" — both concern the index.js:167 `res.set` detection heuristic (plain usage, not patching).
- `git log -n 5 -S 'OutgoingMessage.prototype.setHeader' -- index.js` in $PACKAGE_ROOT → predates the 2017 rename to index.js (b6a8ceb); long-standing read-only usage.

## Zero-hit confirmations

- No `require.cache` / `require.extensions` / `Module._*` / loader hooks anywhere in scope (group 5).
- No `process.binding` / `internalBinding` / `'internal/'` / `'_http_'` specifiers anywhere in scope (group 6).
- No `Object.assign`, `__proto__`, `setPrototypeOf`, `Reflect.*` mutation primitives in scope (group 3).
- No install scripts: cookies package.json has only lint/test scripts; deps installed with `--ignore-scripts` and none of depd/keygrip/tsscmp declares install hooks.
