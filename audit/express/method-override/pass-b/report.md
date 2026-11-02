# Node.js patch audit: method-override

- Verdict: confirmed patching (one per-request instance/application override; no shared core mutations)
- Status: complete
- Input: npm package `method-override` (Express HTTP method override middleware), local clone at `$PACKAGE_ROOT`
- Library: method-override 3.0.0, git commit 4df570e14dddc88b9464808f4cab3b2a73fc6dc8 (https://github.com/expressjs/method-override, branch master), source checkout with installed runtime dependencies; no local modifications
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf at `$NODEJS_SOURCE`
- Reproduction runtime: Node.js v24.19.0
- Scope: runtime only — `$PACKAGE_ROOT/index.js` (sole shipped runtime file per `package.json` `files`) and resolved runtime dependencies debug@3.1.0, methods@1.1.2, ms@2.0.0, parseurl@1.3.3, vary@1.1.2. Tests, examples, and docs out of scope.
- Coverage: full source read of every runtime file in scope; full skill pattern set run with negative results logged; targeted Node.js core reads (http incoming/common/server/http.js, doc/api/http.md); runtime reproduction executed. No gaps identified for this scope.

## Patching verdict

Patching is demonstrated, in the narrowest category the skill defines: **one
instance/application override** and **zero shared core mutations, zero core
module interceptions, and zero core source rewrites**.

method-override's entire purpose is to reassign `req.method` on the live
`http.IncomingMessage` instance (`$PACKAGE_ROOT/index.js:75`). That property is
core-assigned state: Node.js initializes it in the `IncomingMessage`
constructor (`$NODEJS_SOURCE/lib/internal/http/incoming.js:96`) and the HTTP
parser writes the wire value in `parserOnHeadersComplete`
(`$NODEJS_SOURCE/lib/internal/http/common.js:118`), and the core API contract
documents `message.method` as "Read only"
(`$NODEJS_SOURCE/doc/api/http.md:2977-2987`). Overwriting it rewrites what
every downstream consumer of that request observes as the HTTP method, so it
is classified as a core-state instance override rather than conventional
mutable request state — core, not the ecosystem, owns and populates the field,
and core's documentation does not sanction writing it. The override is direct
(in method-override itself), per-request, and never touches shared state: no
prototype, global, core module export, loader path, or descriptor is modified
anywhere in the package or its dependency tree (verified statically and by
before/after reproduction).

All other candidates (library-owned `req.originalMethod`, parseurl's
`req._parsedUrl` cache, vary's documented `setHeader` use, methods' read of
`http.METHODS`, debug's `process.env.DEBUG` handling) were rejected as patches;
see the ledger. No unresolved candidates remain.

## Confirmed Node.js patches

### F-001: `IncomingMessage` instance `method` property overwritten per request

- Category: instance or application override (core-state instance override; not a shared core mutation)
- Library site(s): `$PACKAGE_ROOT/index.js:75` (`req.method = method.toUpperCase()`), guarded by `$PACKAGE_ROOT/index.js:74` (`supports(method)`); original value saved at `$PACKAGE_ROOT/index.js:61` (`req.originalMethod = req.originalMethod || req.method`). Pinned source: https://github.com/expressjs/method-override/blob/4df570e14dddc88b9464808f4cab3b2a73fc6dc8/index.js#L75
- Origin: direct (method-override itself)
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/incoming.js:96` (`this.method = null` in the `IncomingMessage` constructor — an own writable/enumerable/configurable data property) and `$NODEJS_SOURCE/lib/internal/http/common.js:118` (`incoming.method = allMethods[method]` in `parserOnHeadersComplete`, where `allMethods` comes from `internalBinding('http_parser')`), re-exported through `$NODEJS_SOURCE/lib/http.js:33,268`; commit d44625a4b80c672215b469906ce583ce7eeeebaf. Documented contract: `$NODEJS_SOURCE/doc/api/http.md:2977-2987` — "`message.method` ... The request method as a string. Read only." No accessor exists on the prototype; read-only is a documented convention, not descriptor-enforced.
- Exact mutation: plain assignment replacing the value of the own data property `method` on one live `http.IncomingMessage` instance with the upper-cased override value (e.g. `'POST'` -> `'DELETE'`). Descriptor shape unchanged (writable/enumerable/configurable data property). The previous value is copied to the library-owned `req.originalMethod` first.
- Execution chain: application `require('method-override')` -> `methodOverride(getter, options)` returns middleware -> middleware invoked per request by connect/Express -> getter reads the `X-HTTP-Method-Override` header (default) or a query key -> `supports(method)` checks membership in the `methods` list (derived from `http.METHODS`) -> write at `index.js:75`.
- Activation: production path; runs only when the middleware is mounted, the incoming method is in `opts.methods` (default `['POST']`, `index.js:53-55,64`), a getter value is present, and the value is a method Node's parser supports (`index.js:74,140-144`). No load-time effect; nothing happens at `require()` time.
- Scope and restoration: exactly one request instance per invocation; no shared object is touched. Not automatically restored — `req.method` keeps the override for the remainder of that request's lifecycle; the wire value remains available in `req.originalMethod`. Subsequent requests are unaffected.
- Resulting behavior: before — `req.method` is the parser-assigned wire method (`'POST'`); after — all downstream middleware, routers, and any code reading `req.method` on that instance observe the overridden verb (`'DELETE'`), i.e. routing and semantics behave "as if it has originally been that value" (README.md:34-36). Core's own pre-middleware uses of `req.method` (e.g. `$NODEJS_SOURCE/lib/internal/http/server.js:222` HEAD body handling) run before the middleware and still see the wire value.
- Evidence: static — full read of `index.js` plus core baseline reads above. Reproduction — `node repro-method-override.js "$PACKAGE_ROOT"` (script and `repro-output.txt` beside this report, Node v24.19.0): own-descriptor of `method` before middleware `{"value":"POST","writable":true,"enumerable":true,"configurable":true}`, after `{"value":"DELETE",...}`; `req.originalMethod === 'POST'`; shared-state snapshot (constructor/prototype identities, prototype property lists, `http.METHODS`) shows `none` diffs after both `require()` and request handling.
- Upstream: behavior is the library's documented contract (README.md:28-36; https://github.com/expressjs/method-override#readme). Closed issue https://github.com/expressjs/method-override/issues/8 discusses the override design. No Node.js-side issue sanctions writing `message.method`; the http doc labels it read only.

No other patches were confirmed. In particular there are no shared prototype,
global, `http.METHODS`, module-cache, loader-hook, or binding mutations
anywhere in the package or its resolved dependency tree.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:75`, `req.method` on live `http.IncomingMessage` | confirmed -> F-001 | Overwrites core-assigned, documented-read-only instance state (`$NODEJS_SOURCE/lib/internal/http/common.js:118`, `doc/api/http.md:2987`) |
| C-002 | `$PACKAGE_ROOT/index.js:61`, `req.originalMethod` | rejected as patch | Adds a new library-owned property; `originalMethod` does not exist in core http files (grep negative) — request metadata, no core symbol replaced |
| C-003 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:54`, `req._parsedUrl` | rejected as patch | Ecosystem-conventional cache property added to the instance; `_parsedUrl` absent from `$NODEJS_SOURCE/lib/internal/http/incoming.js` and `server.js` (grep negative) — new metadata, replaces nothing |
| C-004 | `$PACKAGE_ROOT/node_modules/parseurl/index.js:84`, `req._parsedOriginalUrl` | rejected as patch | Same rationale as C-003; additionally unreachable — method-override calls only `parseurl(req)` (`index.js:102`), never `parseurl.original` |
| C-005 | `$PACKAGE_ROOT/node_modules/vary/index.js:140,147`, `res.getHeader`/`res.setHeader('Vary', ...)` | rejected as patch | Invokes documented public `ServerResponse` header APIs; mutates per-response header state through the supported interface, overrides nothing |
| C-006 | `$PACKAGE_ROOT/node_modules/methods/index.js:22,30`, `http.METHODS` | rejected as patch | Read-only use: `.map()` returns a new lower-cased array at load time; no write. Core exposes a copied array anyway (`$NODEJS_SOURCE/lib/http.js:264`, `methods.toSorted()`) |
| C-007 | `$PACKAGE_ROOT/node_modules/debug/src/node.js:149,151` (`delete process.env.DEBUG` / `process.env.DEBUG = namespaces`), triggered at load via `node.js:186` -> `debug.js:152-153` | rejected as patch | `process.env` is a documented-mutable core object; load-time call round-trips the existing `DEBUG` value unchanged (delete when unset is a no-op). Application/env state, no core behavior rewritten |
| C-008 | `$PACKAGE_ROOT/node_modules/debug/src/node.js:29`, optional `require('supports-color')` | rejected as patch | Not in the resolved tree (debug@3.1.0 declares only `ms`); try/catch-swallowed; branch inert in this install (excluded branch) |
| C-009 | `$PACKAGE_ROOT/node_modules/debug/src/browser.js:133`, `Function.prototype.apply.call(console.log, ...)` | rejected as patch | Invocation of `Function.prototype.apply`, not an assignment; file loads only in browser/Electron-renderer (`debug/src/index.js:6-9`), not under Node |
| C-010 | `$PACKAGE_ROOT/node_modules/debug/src/debug.js:19,25-26,34,129` and `node.js:83,95` (exports.instances/names/skips/formatters mutations) | rejected as patch | Mutations of debug's own module exports — library-owned state, no core object involved |
| C-011 | `$PACKAGE_ROOT/index.js:19,102-104`, `querystring.parse` / core `url` use in parseurl (`parseurl/index.js:15-17,97,124,129`) | rejected as patch | Read-only use of core modules (`querystring.parse`, `url.parse`, `new Url()` constructs a fresh object); no export or prototype written |
| C-012 | `$PACKAGE_ROOT/node_modules/debug/src/node.js:135`, `process.stderr.write(...)` | rejected as patch | Calls the core stream's documented method; does not replace it |

No unresolved candidates.

## Supporting context

- `req.originalMethod` (C-002) and parseurl's `req._parsedUrl` (C-003) are
  Express-ecosystem conventions for stashing library state on the request
  instance; neither name exists in core, so they extend rather than override.
- methods@1.1.2 carries a hard-coded snapshot of the Node 0.10 method list
  (`methods/index.js:40-69`) as a fallback when `http.METHODS` is absent —
  copied data, not a replacement of core code.
- debug@3.1.0 reads `DEBUG_*` environment variables at load
  (`debug/src/node.js:49-67`) and writes to `process.stderr`; both are
  documented core API uses.
- The `supports` guard (`index.js:140-144`) intentionally restricts overrides
  to methods Node's own parser advertises via `http.METHODS`, so the override
  can never set a verb core could not itself have produced.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `package.json` | full read; `git log -1` | Sole runtime file (per `files`), 144 lines; commit 4df570e14dddc88b9464808f4cab3b2a73fc6dc8, v3.0.0; no install scripts |
| Resolved deps (debug, methods, ms, parseurl, vary) | full read of every entrypoint file; `package.json` scripts check | 5 packages, no install/postinstall scripts; entrypoints: debug `src/index.js`->`src/node.js`, others `index.js` |
| Skill pattern set P1-P6 over all 9 runtime files | `rg -n` (see searches.md) | P5 module-interception and P6 bindings/internals: zero hits. P3 prototype/defineProperty: only a non-Node `apply.call` read. Writes found: C-001..C-007 only |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js:96` | targeted read (constructor lines 60-110) + `rg "defineProperty|get method|set method"` | `this.method = null`: own writable data property; no accessor/descriptor definition for `method` |
| `$NODEJS_SOURCE/lib/internal/http/common.js:118` | targeted read (lines 55-135) | `parserOnHeadersComplete` assigns `incoming.method = allMethods[method]` (server side); `allMethods` from `internalBinding('http_parser')` |
| `$NODEJS_SOURCE/lib/http.js:33,264,268` | targeted read | `IncomingMessage` re-export; `METHODS: methods.toSorted()` — exported list is a copy |
| `$NODEJS_SOURCE/doc/api/http.md:2977-2987,3677-3685` | targeted read | `message.method`: "Read only"; `http.METHODS`: parser-supported method list |
| `$NODEJS_SOURCE/lib/internal/http/{incoming,server}.js` | `rg "_parsedUrl|originalMethod"` | Negative — both names are library conventions, not core state |
| method-override history | `git log -n 10 -S 'req.method =' -- index.js` | Write present since initial commit (e6d87e8 "init") — long-standing documented behavior |
| Upstream issues | `gh search issues --repo expressjs/method-override "req.method"`; `gh search issues --repo nodejs/node "IncomingMessage method read only"` | method-override #7, #8 (closed; override semantics discussion); nodejs/node: no results — no core accommodation or sanction found |
| Reproduction | `node repro-method-override.js "$PACKAGE_ROOT"` (Node v24.19.0) | Shared-state diffs after require and after request: none; per-instance `method` data property rewritten POST->DELETE; output in `repro-output.txt` |

Runtime-file SHA-256 (relative to `$PACKAGE_ROOT`):

| File | SHA-256 |
| --- | --- |
| index.js | 32a184f57f26efe5849cc4f413c3a66663073619a09ae7f31f9265f0fb412c11 |
| node_modules/methods/index.js | 670576bfe96eb9e4fecd1e8c19f491a68b9bfd7da0e7564cd0a3c2ebd3839180 |
| node_modules/parseurl/index.js | 811223d4a19492ccc642384dc84f0af4ad935557dfe8f63750d7ffd673e40f17 |
| node_modules/vary/index.js | 8e40311960636d40473c57e335bbca115036766bf150df296b941256432ab410 |
| node_modules/ms/index.js | 4bd92209cb9dacf3e3773e725acb7aaec43ea9e78540324e4d0f73e5ce9adef7 |
| node_modules/debug/src/index.js | 27a340bb23865b2eee705d7fdc000538ad2664564bfd2148f30cc5921ceb722e |
| node_modules/debug/src/node.js | 23a1f983515544cdb386e1c17605ec4717399ac95c1be9d8f1cb5b2c116a1494 |
| node_modules/debug/src/debug.js | c2df5319cf8768d1bb64f99f74e7dc14188a9455b20509b9a8c4bd126a2b5e4e |
| node_modules/debug/src/browser.js | ff0797d27d04ba7f69485abb04357ec274d6e0e896896e6cf640d29a9d399bb0 |

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` only (package `files` ships LICENSE,
  HISTORY.md, index.js). No bin, no exports map, no install scripts.
- Dependencies: all five resolved runtime dependencies read in full at their
  installed versions (debug@3.1.0, methods@1.1.2, ms@2.0.0, parseurl@1.3.3,
  vary@1.1.2). Transitive closure complete: debug -> ms only;
  `supports-color` optional and absent. `debug/src/browser.js` inspected but
  inert under Node (Electron-renderer/browser branch) — excluded from the
  Node verdict.
- Node.js files read: lib/http.js, lib/internal/http/incoming.js,
  lib/internal/http/common.js, lib/internal/http/server.js (targeted lines),
  doc/api/http.md — at commit d44625a4b80c672215b469906ce583ce7eeeebaf. The
  legacy `lib/_http_incoming.js` at this ref defers to lib/internal/http/;
  older Node lines keep the same own-data-property shape for `method`, so the
  classification does not depend on the ref.
- Reproduction ran on Node v24.19.0 with the default header getter; the
  query-string getter path (`createQueryGetter`) was verified statically only
  (same write site, index.js:75). Custom-function getters supplied by an
  application are out of the library's code and out of scope.
- What would change the verdict: nothing found; demonstrating a shared
  mutation would require code outside the inspected tree. If one treats
  documented-mutable per-request state as exempt, F-001 would downgrade the
  verdict to "no confirmed patching" — but the core doc's explicit "Read only"
  contract and core's ownership of the property keep it in the
  instance-override category per this skill's definitions.

## Changes since the previous audit

First audit (independent pass; no prior report read or updated).
