# Node.js patch audit: method-override

- Verdict: confirmed patching
- Status: complete
- Input: npm package `method-override` (Express HTTP method override middleware), local source at `$PACKAGE_ROOT`
- Library: version 3.0.0, git clone of https://github.com/expressjs/method-override, branch master, commit 4df570e14dddc88b9464808f4cab3b2a73fc6dc8, unmodified source tree; runtime file `index.js` sha256 32a184f57f26efe5849cc4f413c3a66663073619a09ae7f31f9265f0fb412c11
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (2026-10-31), unmodified checkout at `$NODEJS_SOURCE`
- Reproduction runtime: Node.js v24.19.0 (separate from the source baseline)
- Scope: production/runtime code only — entrypoint `$PACKAGE_ROOT/index.js` plus resolved runtime dependencies installed at `$PACKAGE_ROOT/node_modules`: debug@3.1.0, methods@1.1.2, ms@2.0.0 (transitive via debug), parseurl@1.3.3, vary@1.1.2. Tests, docs, and examples out of scope.
- Coverage: full source scan of the runtime entrypoint and every dependency entrypoint/initialization path; targeted Node.js core baseline reads; one reproduction run; bounded upstream corroboration via repository docs and issue search. No material limitations.

## Patching verdict

**Confirmed patching: 1 instance/application override; 0 shared core mutations; 0 core module interceptions; 0 core source rewrites. Origin: direct (the library's own entrypoint).**

method-override's entire purpose is to rewrite `req.method` on the live
`http.IncomingMessage` instance (`$PACKAGE_ROOT/index.js:75`). Node.js core
assigns `method` as a plain own data property during parsing
(`$NODEJS_SOURCE/lib/internal/http/common.js:118`) and documents it as
**"Read only"** (`$NODEJS_SOURCE/doc/api/http.md:2987`). There is no documented
setter, option, or extension point for changing a request's method, so this is
not use of a documented/conventional mutable API: it is an instance-level
override of core-assigned state on a core-backed object (F-001). It is
per-request and does not touch shared prototypes, module exports, globals, core
loading, or core source, so no shared core mutation exists.

Explicit classification judgment (key question): core sets `method` as an own
writable/enumerable/configurable data property — initialized to `null` in the
`IncomingMessage` constructor (`$NODEJS_SOURCE/lib/internal/http/incoming.js:96`)
and assigned the parsed verb in `parserOnHeadersComplete`
(`$NODEJS_SOURCE/lib/internal/http/common.js:77,118`, from
`internalBinding('http_parser').allMethods`, line 31). The property being
mechanically writable (no accessor, no freeze — verified by reproduction) does
not make mutation a supported API: the HTTP docs state "The request method as a
string. Read only." (`$NODEJS_SOURCE/doc/api/http.md:2983-2987`), wording that
predates the 2016 docs migration (`git log -S` in `$NODEJS_SOURCE`). Replacing
the value of this core-assigned instance data property is therefore classified
as a **confirmed instance/application override** — counted separately from
shared core mutations, of which there are none. It is deliberate and documented
by the library (README: "override the `req.method` property ... as if it has
originally been that value"), which affects risk assessment but not the
patch classification.

All other candidates were rejected: `req.originalMethod` and parseurl's
`req._parsedUrl` are library-owned property additions absent from core; vary
uses the documented `res.getHeader`/`res.setHeader` API; methods reads
`http.METHODS` without mutating it; debug's load-time `process.env.DEBUG` write
targets documented mutable process state and is idempotent at load. No
unresolved candidates remain.

## Confirmed Node.js patches

### F-001: `http.IncomingMessage` instance — core-assigned `method` property value replaced

- Category: instance or application override (core-backed instance state; not a shared core mutation)
- Library site(s):
  - `$PACKAGE_ROOT/index.js:75` — `req.method = method.toUpperCase()` (the override)
  - `$PACKAGE_ROOT/index.js:61` — `req.originalMethod = req.originalMethod || req.method` (saves the core-assigned value into a library-owned property first)
  - Pinned source: https://github.com/expressjs/method-override/blob/4df570e14dddc88b9464808f4cab3b2a73fc6dc8/index.js#L61-L77
- Origin: direct (method-override's own runtime entrypoint)
- Core baseline (at `$NODEJS_SOURCE`, commit d44625a4b80c672215b469906ce583ce7eeeebaf):
  - `$NODEJS_SOURCE/lib/internal/http/incoming.js:96` — constructor initializes `this.method = null;` as an own data property ("request (server) only")
  - `$NODEJS_SOURCE/lib/internal/http/common.js:77,118` — `parserOnHeadersComplete` assigns `incoming.method = allMethods[method];` (server branch) with the verb parsed from the wire; `allMethods` comes from `internalBinding('http_parser')` (line 31)
  - `$NODEJS_SOURCE/lib/_http_incoming.js:33` — legacy module path re-exports `internal/http/incoming` (same implementation)
  - `$NODEJS_SOURCE/doc/api/http.md:2977-2987` — `message.method`: "Only valid for request obtained from http.Server. The request method as a string. **Read only.**"
  - Original behavior: `req.method` faithfully reports the HTTP verb the client sent, assigned once by the parser before user code runs.
- Exact mutation: plain assignment replacing the value of the existing own data property `method` (descriptor `{writable:true, enumerable:true, configurable:true}`) on the live `IncomingMessage` instance; no descriptor change, no prototype involvement.
- Execution chain: `require('method-override')` -> `methodOverride(getter, options)` returns middleware -> middleware `(req, res, next)` runs per request -> getter extracts an override value (default: `X-HTTP-Method-Override` request header via `createHeaderGetter`, `index.js:112-134`; or query-string key via `createQueryGetter`, `index.js:100-106`; or a user-supplied function) -> `supports(method)` validates against the known-method list (`index.js:140-144`) -> `req.method = method.toUpperCase()` (`index.js:75`).
- Activation: production runtime path; requires the app to mount the middleware. Guards: the incoming (original) method must be in `opts.methods` (default `['POST']`, `index.js:53-55,64-66`); an override value must be present; the value must appear in the methods list (lower-cased `http.METHODS`). No environment or version guard.
- Scope and restoration: per-request instance only — other requests, `IncomingMessage.prototype`, and the `http` module are untouched. The override is permanent for the lifetime of that request object; no restoration mechanism. The original verb survives only in the library-owned `req.originalMethod` (a non-core property).
- Resulting behavior: before — `req.method` is the wire verb (e.g. `POST`); after — `req.method` is the client-requested override (e.g. `DELETE`), so every downstream consumer (Express/router dispatch, loggers, security middleware, any code reading `req.method`) treats the request "as if it has originally been that value" (README). Code trusting the documented read-only semantics of `message.method` observes a value core never parsed.
- Evidence:
  - Static: file:line references above.
  - Reproduction (`repro-method-override.js` beside this report; `node repro-method-override.js "$PACKAGE_ROOT"`, Node.js v24.19.0): live server request with `X-HTTP-Method-Override: DELETE` on a `POST`. Before middleware: `method: "POST"`, own descriptor `{value:"POST", writable:true, enumerable:true, configurable:true}`, no `method` accessor on `IncomingMessage.prototype`. After middleware: `method: "DELETE"`, `originalMethod: "POST"`, same descriptor shape with replaced value, `req instanceof http.IncomingMessage === true`.
- Upstream: behavior is the package's documented contract — README ("Create a new middleware function to override the `req.method` property ... as if it has originally been that value. The previous `req.method` value will be stored in `req.originalMethod`"), pinned: https://github.com/expressjs/method-override/blob/4df570e14dddc88b9464808f4cab3b2a73fc6dc8/README.md. Node.js docs have described `message.method` as "Read only" since before the 2016 markdown migration (`$NODEJS_SOURCE` `git log -S 'The request method as a string. Read only' -- doc/api/http.md` -> carried through "doc: git mv to .md", 0800c0aa727). No upstream Node.js accommodation for mutating `method` was found in the inspected core files.

No other confirmed patches. Library-owned property additions (`req.originalMethod`, `req._parsedUrl`) and documented-API use (`res.setHeader`, `process.env`) are not promoted here; see supporting context.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:75` — `req.method = method.toUpperCase()` on `http.IncomingMessage` | confirmed -> F-001 | Replaces core-assigned own data property documented "Read only" (`$NODEJS_SOURCE/doc/api/http.md:2987`); reproduction confirms in-place value replacement on live core instance |
| C-002 | `$PACKAGE_ROOT/index.js:61` — `req.originalMethod = ...` | rejected as patch | Adds a new library-owned property; `originalMethod` absent from `$NODEJS_SOURCE/lib/internal/http/*.js` and `lib/_http_*.js`; adding request metadata does not replace core state |
| C-003 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:54` — `req._parsedUrl = parsed` | rejected as patch | Library-owned memoization property on the request; `_parsedUrl` absent from core http sources; does not alter core-read state (`req.url` untouched) |
| C-004 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:84` — `req._parsedOriginalUrl = parsed` | rejected as patch | Same as C-003; additionally not activated — method-override calls only `parseurl(req)` (`index.js:102`), never `parseurl.original` |
| C-005 | `$PACKAGE_ROOT/node_modules/vary/index.js:140,147` — `res.getHeader('Vary')` / `res.setHeader('Vary', val)` | rejected as patch | Uses the documented public `OutgoingMessage.setHeader` API to set a response header; no core function/property is replaced |
| C-006 | `$PACKAGE_ROOT/node_modules/methods/index.js:30` — `http.METHODS.map(...)` | rejected as patch | Read-only consumption of `http.METHODS` (`$NODEJS_SOURCE/lib/http.js:264`); `.map` returns a new array; no mutation of the exported array or `http` module |
| C-007 | `$PACKAGE_ROOT/node_modules/debug/src/node.js:149,151` — `delete process.env.DEBUG` / `process.env.DEBUG = namespaces`, triggered at load by `exports.enable(load())` (`src/node.js:186` via `src/debug.js:153`) | rejected as patch | `process.env` is documented mutable process state, not a core API surface being replaced; at load time the write is idempotent (rewrites the current `DEBUG` value, or deletes an already-unset key). method-override never calls `debug.enable()/disable()` at runtime |
| C-008 | `$PACKAGE_ROOT/node_modules/debug/src/node.js:29` — `require('supports-color')` | rejected as patch | Wrapped in try/catch; package not installed in the resolved tree, so branch is inert; would only read terminal capability anyway |
| C-009 | `$PACKAGE_ROOT/node_modules/debug/src/browser.js:133` — `Function.prototype.apply.call(console.log, ...)` | rejected as patch | Invocation only, no assignment; file is the browser entrypoint, not loaded under Node (`src/index.js:6-9` selects `node.js` when `process.type !== 'renderer'`) |
| C-010 | `$PACKAGE_ROOT/index.js:19,103` — `require('querystring')`, `querystring.parse(...)` | rejected as patch | Read-only use of a core module function; no reassignment of module exports |
| C-011 | `$PACKAGE_ROOT/node_modules/debug/src/node.js:135` — `process.stderr.write(...)` | rejected as patch | Documented stream write API on process stdio; no override of core behavior |

No unresolved candidates. Searches for module-loading interception (`require.cache`, `require.extensions`, `Module._*`, `syncBuiltinESMExports`, `registerHooks`), internal bindings (`process.binding`, `internalBinding`, `'internal/'`, `'_http_'`), and prototype/descriptor mutation (`.prototype` writes, `__proto__`, `setPrototypeOf`, `defineProperty`, `Object.assign` onto core objects) returned no runtime hits (see searches.md).

## Supporting context

- `req.originalMethod` (C-002) and parseurl's `req._parsedUrl` cache (C-003) are the conventional Express-ecosystem pattern of attaching library-owned metadata to the request instance. Verified absent from core: `rg "_parsedUrl|originalMethod|originalUrl"` over `$NODEJS_SOURCE/lib/internal/http/*.js`, `lib/_http_incoming.js`, `lib/_http_common.js` -> no matches.
- methods@1.1.2 falls back to a snapshot list of Node 0.10 verbs (`node_modules/methods/index.js:40-68`) when `http.METHODS` is absent — a standalone copy of core data, not a replacement of core.
- debug@3.1.0 has process-global side effects at `require` time (reads `DEBUG*` env vars, re-saves `process.env.DEBUG`) and exposes `enable()/disable()` that write `process.env.DEBUG` process-wide if an application calls them; method-override itself only creates a namespaced logger (`index.js:16`) and logs (`index.js:76`).
- The override in F-001 only accepts verbs Node itself supports (`supports()` checks the lower-cased `http.METHODS` list), so the rewritten value always stays within core's own method vocabulary.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `node_modules/{debug,methods,ms,parseurl,vary}` entrypoints | `rg -n` candidate pattern sweeps (require/import, globals/inherits, prototype/defineProperty, patch vocabulary, module interception, internals/bindings) — full log in `searches.md` | Only writes found: C-001..C-007 above; module-interception and internals sweeps returned zero hits |
| Dependency resolution | `package.json`, `ls node_modules`, per-package `package.json` main fields | debug@3.1.0 (`./src/index.js` -> `src/node.js`), methods@1.1.2, ms@2.0.0, parseurl@1.3.3, vary@1.1.2; no install scripts; `supports-color` not installed |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` | targeted read, lines 85-105 | `this.method = null` own data property in constructor (line 96) |
| `$NODEJS_SOURCE/lib/internal/http/common.js` | targeted read, lines 105-125; `rg -n "allMethods"` | Parser assigns `incoming.method = allMethods[method]` (line 118) inside `parserOnHeadersComplete` (line 77); verbs from `internalBinding('http_parser')` (line 31) |
| `$NODEJS_SOURCE/lib/_http_incoming.js` | targeted read, head | Legacy module path re-exports `internal/http/incoming`; same implementation backs both module names |
| `$NODEJS_SOURCE/doc/api/http.md` | `rg -n -A 12` on the `message.method` heading | Lines 2977-2987: `message.method` documented "Read only" — baseline contract for the F-001 classification |
| `$NODEJS_SOURCE/lib/http.js` | `rg -n "METHODS"` | Line 264: `METHODS: methods.toSorted()` — methods package reads this without mutation |
| `$NODEJS_SOURCE` doc history | `git log -S 'The request method as a string. Read only' -- doc/api/http.md` | Wording predates 2016 markdown migration (0800c0aa727) — long-standing contract |
| Reproduction | `node repro-method-override.js "$PACKAGE_ROOT"` (script beside this report; Node v24.19.0) | Confirms own writable data property on instance, no prototype accessor, in-place value replacement POST -> DELETE, `originalMethod` preserved |
| Upstream library docs | https://github.com/expressjs/method-override/blob/4df570e14dddc88b9464808f4cab3b2a73fc6dc8/README.md | Override of `req.method` is the documented, intended contract |
| Upstream issues | `gh search issues --repo expressjs/method-override "req.method"` | #7, #8 (closed, usage questions); no issue disputing or altering the override mechanism |

## Coverage and limitations

- Entry points: single runtime export `$PACKAGE_ROOT/index.js` (package `files`: LICENSE, HISTORY.md, index.js). No install/postinstall scripts, no conditional exports, no bundled/dist artifacts.
- Dependencies: all five resolved runtime packages' entrypoints and initialization paths read in full (debug src/index.js + src/node.js + src/debug.js; methods, ms, parseurl, vary index.js). debug's browser entrypoint inspected and ruled inert under Node. `supports-color` optional dependency absent from the tree; its branch is dead code here (try/catch).
- Node.js files read (targeted only): lib/internal/http/incoming.js (constructor region), lib/internal/http/common.js (parser callback region), lib/_http_incoming.js (re-export head), lib/http.js (METHODS), doc/api/http.md (message.method, message.url sections). No recursive scan of the Node tree.
- Tests/docs of the target were out of scope by instruction; `.github`, eslint configs, and HISTORY.md consulted only for provenance.
- Reproduction ran on Node v24.19.0, which may differ in minor layout from the source baseline commit; both exhibit `method` as an own data property, and the doc contract is identical. A tested branch cannot prove universal absence, but the runtime surface here is 144 lines and was read exhaustively.
- What would change the verdict: Node.js converting `message.method` into a documented writable/settable property (or an official override API) would downgrade F-001 from an override of core state to documented mutable API usage; no such change exists at the audited baseline.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at this path.
