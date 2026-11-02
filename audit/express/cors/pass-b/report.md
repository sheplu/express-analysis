# Node.js patch audit: cors

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `cors` (Node.js CORS middleware), local checkout at `$PACKAGE_ROOT`
- Library: cors 2.8.6, git commit 5317ebe670db2aaebc1d496eb5d33493deefb3ed (github.com/expressjs/cors, branch master), source checkout with runtime dependencies installed (`--ignore-scripts --omit=dev`); no local modifications made
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (clean working tree)
- Reproduction runtime: Node.js v24.19.0 (identity/descriptor comparison script, see `repro/check-patching.js`)
- Scope: runtime entrypoint `$PACKAGE_ROOT/lib/index.js` (sole shipped file per package.json `files`/`main`) plus resolved runtime dependencies object-assign@4.1.1 (`node_modules/object-assign/index.js`) and vary@1.1.2 (`node_modules/vary/index.js`). Tests, examples, docs, devDependencies out of scope.
- Coverage: source complete (all three runtime files read in full, ~470 lines total); upstream corroboration complete (negative issue searches); runtime reproduction run and passing

## Patching verdict

No patching was demonstrated. Zero shared core mutations, zero instance/application
overrides of core-backed methods, zero module-loading interceptions, and zero core
source rewrites were found, in either the library itself (direct) or its two runtime
dependencies (transitive). All 12 candidate sites from the full search-pattern set
were resolved and rejected; none are unresolved. The entire runtime scope is three
small files with no conditional/optional entrypoints, no install scripts, and no
native bindings, so no branches were excluded from inspection.

The library interacts with Node.js core exclusively through the documented
`http.ServerResponse` instance API on objects handed to it by the caller:
`res.setHeader()`, `res.getHeader()` (via vary), `res.end()`, and an own-property
write `res.statusCode = ...`. It never touches `http.ServerResponse.prototype`,
`http.OutgoingMessage.prototype`, globals, `Object.prototype`, `Module._load`,
`require.cache`/`require.extensions`, or any `process.binding`/internal module.

## Confirmed Node.js patches

None. No reachable write or replacement of a core API, global, shared prototype,
core-backed instance method, core module loading hook, or core source was found.
Documented instance API usage (header/status writes on the caller-provided
response) is covered in Supporting context; it does not establish a patch.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/lib/index.js:5-6`, `require('object-assign')` / `require('vary')` | rejected as patch | Plain CommonJS loading of npm dependencies; no `node:`/core-module interception. Both dependency entrypoints audited (C-007..C-012). |
| C-002 | `$PACKAGE_ROOT/lib/index.js:153`, `res.setHeader(header.key, header.value)` | rejected as patch | Method call, not assignment. Documented API defined at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813` (`OutgoingMessage.prototype.setHeader`), re-exported via `lib/_http_outgoing.js`. Nothing is written to the method or prototype. |
| C-003 | `$PACKAGE_ROOT/lib/index.js:178`, `res.statusCode = options.optionsSuccessStatus` | rejected as patch | Own-property write of documented mutable response state on the caller-provided instance. Core baseline: `ServerResponse.prototype.statusCode = 200` default at `$NODEJS_SOURCE/lib/internal/http/server.js:285`; per-instance assignment shadowing that default is the documented contract. No method or prototype is replaced. Reproduction confirmed only `statusCode`/`statusMessage` own data props appear on a real `ServerResponse`. |
| C-004 | `$PACKAGE_ROOT/lib/index.js:179-180`, `res.setHeader('Content-Length','0')`; `res.end()` | rejected as patch | Documented API calls (`OutgoingMessage.prototype.end` at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289`). Calls only; no assignment. |
| C-005 | `$PACKAGE_ROOT/lib/index.js:208`, `assign({}, defaults, options)` | rejected as patch | `Object.assign`-style copy whose target is a fresh library-owned object literal; `defaults` is library-owned. No core or caller object mutated. |
| C-006 | `$PACKAGE_ROOT/lib/index.js:223`, `corsOptions.origin = origin` | rejected as patch | Write to the library-owned object produced at line 208. |
| C-007 | `node_modules/object-assign/index.js:10-11`, `Object.prototype.hasOwnProperty` / `propertyIsEnumerable` | rejected as patch | Read-only saved references to core prototype methods for later `.call()`; no write to `Object.prototype`. |
| C-008 | `node_modules/object-assign/index.js:65`, `module.exports = shouldUseNative() ? Object.assign : function (...)` | rejected as patch | Ponyfill, not polyfill: exports either a reference to native `Object.assign` or its own standalone function. `Object.assign` is never assigned/replaced; no global mutated. Fallback branch only activates on engines with missing/buggy `Object.assign` (pre-ES2015 V8), and even then mutates nothing global. |
| C-009 | `node_modules/object-assign/index.js:30-31`, `new String('abc')`; `test1[5] = 'de'` | rejected as patch | Feature-detection writes on locally created, immediately discarded wrapper/plain objects (`test1`..`test3`) inside `shouldUseNative()`; `String.prototype` untouched (confirmed by reproduction snapshot). |
| C-010 | `node_modules/object-assign/index.js:75,83`, `to[key] = from[key]` (fallback branch) | rejected as patch | Writes to the caller-supplied target object. Within the audited scope cors is the only caller and always passes a fresh `{}` (lib/index.js:208). Generic capability to mutate an arbitrary target exists, but no code path hands it a core-owned object. |
| C-011 | `node_modules/vary/index.js:134-148`, `vary(res, field)` -> `res.getHeader('Vary')` / `res.setHeader('Vary', val)` | rejected as patch | Documented instance API calls on the caller-provided response (duck-typed check at :134 reads, does not define, the methods). Mutates header state through the supported API only; no method replacement. |
| C-012 | `node_modules/vary/index.js:13-14`, `module.exports = vary`; `module.exports.append = append` | rejected as patch | Assignments to the module's own exports object; library-owned. |

Unresolved: none.

## Supporting context

- cors mutates per-response state on core-backed `ServerResponse` instances the
  application passes in — headers via `setHeader` (lib/index.js:153,179; vary
  index.js:147) and status via the `statusCode` own-property write
  (lib/index.js:178, only on the preflight short-circuit path when
  `preflightContinue` is false). These are the documented, intended mutation
  points of the Node.js HTTP response contract, not overrides.
- object-assign@4.1.1 is a compatibility shim for pre-ES2015 engines (cors
  supports node >= 0.10). It is a ponyfill: it never installs anything onto
  `Object` or any global, so no polyfill-style patching occurs on any engine.
- Reads of caller request state are limited to `req.method`, `req.headers.origin`,
  and `req.headers['access-control-request-headers']` — public `IncomingMessage`
  properties; no private/underscore core fields are read or written anywhere in
  scope.
- No install/postinstall scripts exist in cors or either dependency (and
  dependencies were installed with `--ignore-scripts`), so no on-disk core
  source rewriting vector exists.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/package.json`, `lib/`, `node_modules/` | file listing + metadata read | Single runtime entrypoint `lib/index.js`; deps object-assign@4.1.1, vary@1.1.2 (lockfile-pinned, integrity hashes present); no bin/exports/browser fields, no install scripts |
| `$PACKAGE_ROOT/lib/index.js`, `node_modules/object-assign/index.js`, `node_modules/vary/index.js` | full-file reads (238 + 90 + 149 lines) | Complete runtime source inspected; sha256: lib/index.js `ea5c1ee2...828697`, object-assign `e02cb971...9a4b7c`, vary `8e403119...32ab410` |
| Runtime scope | `rg -n "require\s*\(\|\bfrom\s*['\"]\|\bimport\s*\(\|\bnode:"` | 2 hits: lib/index.js:5-6 (npm dep requires only); no core-module or dynamic imports -> C-001 |
| Runtime scope | `rg -n "\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\("` | 0 hits (negative) |
| Runtime scope | `rg -n "\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign"` | 6 hits, all in object-assign/index.js -> C-007, C-008; reads/exports only |
| Runtime scope | `rg -ni "monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b"` | 2 hits: `PATCH` HTTP verb string (lib/index.js:10), comment "wrap in a function" (lib/index.js:193); neither is code |
| Runtime scope | `rg -n "require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks"` | 0 hits (negative) |
| Runtime scope | `rg -n "process\.(binding\|_linkedBinding)\|internalBinding\|['\"]_http_\|['\"]internal/"` | 0 hits (negative) |
| Runtime scope | `rg -n "\b(req\|res\|request\|response\|socket)\s*\.\s*\w+\s*="` | 1 hit: lib/index.js:178 -> C-003 |
| Runtime scope | `rg -n "\bdelete\s\|Object\.freeze\|Object\.seal"` + full assignment sweep | 0 deletions/freezes; every assignment accounted for in ledger (C-002..C-012) |
| `$NODEJS_SOURCE/lib/_http_server.js`, `lib/_http_outgoing.js` | targeted read (re-export shims) | Public `_http_*` files re-export `lib/internal/http/*` at this revision; followed re-exports per skill table |
| `$NODEJS_SOURCE/lib/internal/http/server.js:285` | `rg -n "statusCode"` | `ServerResponse.prototype.statusCode = 200` — per-instance assignment is the documented contract for C-003 |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813,914,1289` | `rg -n "OutgoingMessage\.prototype\.(setHeader\|getHeader...)"` | `setHeader`/`getHeader`/`end` are core prototype methods; cors/vary call them, never assign them (C-002, C-004, C-011) |
| Reproduction | `node repro/check-patching.js "$PACKAGE_ROOT"` (Node v24.19.0) | "after require(cors): no changes"; "after middleware calls: no changes"; only `statusCode`,`statusMessage` own props appear on a real ServerResponse; `Object.assign`, `Object.prototype`, `String.prototype`, `Module._load`, `require.extensions`, `process.binding`, HTTP prototype methods all identity-stable. Exit 0. Output in `repro/result.txt` |
| Upstream (expressjs/cors) | `gh search issues --repo expressjs/cors "monkeypatch OR monkey-patch OR patching prototype"` | 0 results (negative corroboration) |
| Upstream (expressjs/cors) | `gh api search/issues?q=repo:expressjs/cors+prototype+override` | 0 results (negative corroboration) |

## Coverage and limitations

- Entry points: `lib/index.js` is the only shipped runtime file (`package.json`
  `files: ["lib/index.js"]`, `main: ./lib/index.js`); no conditional, bin, or
  exports-map entrypoints exist. Fully read.
- Dependencies: both resolved runtime dependencies (object-assign@4.1.1,
  vary@1.1.2) have single-file entrypoints with zero transitive runtime
  dependencies (lockfile confirms); both fully read. No deeper imports to follow.
- Node.js baseline files read: `lib/_http_server.js`, `lib/_http_outgoing.js`
  (re-export shims), `lib/internal/http/server.js`, `lib/internal/http/outgoing.js`
  (targeted line reads) at commit d44625a4b80c672215b469906ce583ce7eeeebaf. No
  recursive core-tree scanning performed.
- Branches: the object-assign fallback branch (pre-ES2015 engines) was analyzed
  statically only — the reproduction runtime (v24.19.0) takes the native branch.
  Static reading shows the fallback also mutates nothing global, so this does not
  limit the verdict.
- Reproduction cannot prove universal absence across all inputs/runtimes, but the
  scope is fully covered statically; reproduction is corroborating, not
  load-bearing.
- What would change the verdict: evidence that an application passes a core-owned
  object as the `assign` target — not possible via cors's own code, which always
  supplies a fresh `{}` target (lib/index.js:208).

## Changes since the previous audit

First audit (independent pass; no prior report read or updated in this output
location by design of the double-blind protocol).
