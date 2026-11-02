# Node.js patch audit: cors

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `cors` (Node.js CORS middleware), local source at `$PACKAGE_ROOT`
- Library: cors 2.8.6, git commit 5317ebe670db2aaebc1d496eb5d33493deefb3ed (github.com/expressjs/cors, branch master), plain source package (no build/dist artifacts, no native addons)
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf, unmodified checkout at `$NODEJS_SOURCE`
- Reproduction runtime: not run (static proof sufficient; all three runtime files read in full)
- Scope: runtime entrypoint `$PACKAGE_ROOT/lib/index.js` plus resolved runtime dependencies object-assign@4.1.1 and vary@1.1.2 (installed with `--ignore-scripts --omit=dev`). Tests, examples, and docs out of scope.
- Coverage: source complete (every line of all three runtime files read); upstream corroboration bounded (one negative issue search); runtime reproduction not run

## Patching verdict

No patching was demonstrated. Zero shared core mutations, zero core-backed
instance method/behavior overrides, zero module-loading interceptions, and zero
core source rewrites were found, directly or transitively.

The entire runtime surface is three small single files: `lib/index.js` (239
lines), `node_modules/object-assign/index.js` (91 lines), and
`node_modules/vary/index.js` (149 lines), each read in full. `cors` itself
loads **no Node.js core module at all** -- its only `require` calls are its two
declared dependencies (`lib/index.js:5-6`), and neither dependency requires
anything. Neither dependency declares install scripts or further dependencies.

All interaction with Node.js core is consumption of the documented
`http.ServerResponse` instance API on the per-request response object handed to
the middleware: calls to `res.setHeader()`, `res.getHeader()`, `res.end()`, and
one documented data-property assignment `res.statusCode = ...`. None of these
assigns to a core function, prototype, global, module cache, or loader hook.
All 13 candidates were resolved (rejected); none are unresolved.

## Confirmed Node.js patches

None. No candidate qualified as a patch. Instance API consumption, a saved
reference re-export of native `Object.assign`, and writes to library-owned
objects are documented in the candidate ledger and supporting context below;
none replaces or mutates core behavior.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/lib/index.js:5-6`, `require('object-assign')`, `require('vary')` | rejected as patch | Only module loads in the package; no core module is ever required by cors; dependencies followed below |
| C-002 | `$PACKAGE_ROOT/lib/index.js:153`, `res.setHeader(header.key, header.value)` | rejected as patch | Method call on the per-request response instance; `OutgoingMessage.prototype.setHeader` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`) is invoked, never assigned |
| C-003 | `$PACKAGE_ROOT/lib/index.js:178`, `res.statusCode = options.optionsSuccessStatus` | rejected as patch | Documented settable data property; creates an own instance property shadowing the prototype default `ServerResponse.prototype.statusCode = 200` (`$NODEJS_SOURCE/lib/internal/http/server.js:285`) exactly as the API contract intends (consumed by `writeHead(this.statusCode)`, `server.js:420`). Per-response instance write within the documented contract, not an override of core behavior |
| C-004 | `$PACKAGE_ROOT/lib/index.js:179`, `res.setHeader('Content-Length', '0')` | rejected as patch | Method call, API consumption (Safari preflight workaround; see supporting context) |
| C-005 | `$PACKAGE_ROOT/lib/index.js:180`, `res.end()` | rejected as patch | Method call; `OutgoingMessage.prototype.end` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1289`) invoked, never reassigned or wrapped |
| C-006 | `$PACKAGE_ROOT/lib/index.js:208`, `assign({}, defaults, options)` | rejected as patch | Object.assign semantics applied to a fresh object literal target; never targets a core object |
| C-007 | `$PACKAGE_ROOT/lib/index.js:223`, `corsOptions.origin = origin` | rejected as patch | Write to a library-owned plain options object |
| C-008 | `node_modules/object-assign/index.js:9-11`, `Object.getOwnPropertySymbols` / `Object.prototype.hasOwnProperty` / `Object.prototype.propertyIsEnumerable` | rejected as patch | Saved references only; reads, no write or descriptor change to `Object` or `Object.prototype` |
| C-009 | `node_modules/object-assign/index.js:65`, `module.exports = shouldUseNative() ? Object.assign : function (...)` | rejected as patch | Re-exports a reference to the unmodified native builtin (or a local fallback); never assigns to `Object.assign` or installs a polyfill onto a global |
| C-010 | `node_modules/object-assign/index.js:30-55`, feature-detection writes (`test1[5] = 'de'`, `test2`/`test3` properties) | rejected as patch | Load-time writes to local throwaway objects (including a local `String` wrapper instance); nothing shared or core |
| C-011 | `node_modules/object-assign/index.js:73-85`, fallback `to[key] = from[key]` | rejected as patch | Mutates the caller-provided target; within cors the target is always a fresh `{}` (C-006); on any modern Node the native branch is taken anyway |
| C-012 | `node_modules/vary/index.js:13-14`, `module.exports = vary` / `module.exports.append = append` | rejected as patch | Property writes on the module's own export object |
| C-013 | `node_modules/vary/index.js:140,147`, `res.getHeader('Vary')` / `res.setHeader('Vary', val)` | rejected as patch | Method calls on the response instance passed through from cors (`applyHeaders`, `lib/index.js:151`); read-merge-set of the `Vary` header value via public API; `OutgoingMessage.prototype.getHeader` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:914`) untouched |

No unresolved candidates.

## Supporting context

- Response header/state writes are per-request instance state changes made
  through the documented `http.ServerResponse` API (`setHeader`, `getHeader`,
  `statusCode`, `end`). At the audited Node.js revision these are defined at
  `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813` (setHeader), `:914`
  (getHeader), `:1289` (end), and `$NODEJS_SOURCE/lib/internal/http/server.js:285`
  (statusCode prototype default), re-exported through `lib/_http_outgoing.js` /
  `lib/_http_server.js` shims and `lib/http.js`. cors only calls these; it never
  reassigns, wraps, or shadows any method.
- `lib/index.js:176-180` sets `Content-Length: 0` and a configurable
  204 status on preflight responses as a browser (Safari) compatibility
  workaround -- an HTTP-level behavior choice, not a Node.js workaround or patch.
- object-assign@4.1.1 is a userland ponyfill: it returns native `Object.assign`
  when available and sane (true on all supported modern Node versions) and
  otherwise a self-contained fallback. It is explicitly *not* a polyfill -- it
  never writes the implementation onto `Object` or any global.
- vary@1.1.2 duck-types the response (`vary/index.js:134`) and works purely
  through `getHeader`/`setHeader`; it carries no Node-version branches.
- cors declares `engines.node >= 0.10`; no version-gated code paths exist in
  any of the three files.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/package.json` | read | `main: ./lib/index.js`, `files: [lib/index.js]` -- single shipped runtime file; deps object-assign ^4, vary ^1; no install scripts; no exports map/browser field |
| `$PACKAGE_ROOT/lib/index.js`, `node_modules/object-assign/index.js`, `node_modules/vary/index.js` | full read (239/91/149 lines) | Entire runtime surface inspected line by line |
| Runtime files (all three) | `rg -n "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:"` | Only `lib/index.js:5-6` (the two declared deps). No core module imports anywhere |
| Runtime files | `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\("` | No matches |
| Runtime files | `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign"` | Matches only in object-assign (reads/saved references/native re-export; C-008..C-011). No prototype writes |
| Runtime files | `rg -ni "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b"` | Only the HTTP verb string `PATCH` and a comment "wrap in a function". No patching code |
| Runtime files | `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks"` | No matches -- no module-loading interception |
| Runtime files | `rg -n "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"` | No matches -- no internals/bindings access |
| Runtime files | `rg -n "res\.\w+\s*(=[^=]|\+=)|setHeader|removeHeader|writeHead|getHeader|\.end\s*\("` | C-002..C-005, C-013 -- all instance API consumption |
| Runtime files | `rg -n "\bdelete\s+\w|getOwnPropertyDescriptor"` | No matches |
| `$NODEJS_SOURCE/lib/http.js` | targeted read (imports/exports) | `OutgoingMessage` from `internal/http/outgoing`, `ServerResponse` from `internal/http/server` at audited revision |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | `rg -n "OutgoingMessage\.prototype\.(setHeader|getHeader|removeHeader|end)\s*="` | Public methods at :813/:914/:973/:1289 -- the contract cors/vary consume |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | `rg -n "statusCode"` | `ServerResponse.prototype.statusCode = 200` (:285); `this.writeHead(this.statusCode)` (:420) -- confirms `res.statusCode` is the documented settable status property |
| `$NODEJS_SOURCE/lib/_http_outgoing.js` | targeted read | Re-export shim of `internal/http/outgoing` at this revision |
| Dependency metadata | `node -e` over both dep package.json files + lockfile | object-assign@4.1.1 and vary@1.1.2, both dependency-free, no install scripts; lockfile integrity hashes match registry tarballs |
| `node_modules` | `find node_modules -name '*.js'` | Exactly two JS files -- no hidden/bundled code |
| github.com/expressjs/cors issues | `gh search issues --repo expressjs/cors "monkeypatch OR monkey-patch OR patch prototype"` | Empty result -- no upstream patching discussion found |

File hashes (SHA-256, relative to `$PACKAGE_ROOT`):

- `lib/index.js` ea5c1ee247ad5204dad41a86326197d9d85a3bc46e8c9078cc4f1f323a828697
- `node_modules/object-assign/index.js` e02cb9714ef6e561e971fe400644330212f07ca86120587199470d8b759a4b7c
- `node_modules/vary/index.js` 8e40311960636d40473c57e335bbca115036766bf150df296b941256432ab410
- `package.json` b314218cdfc9e9442efd35c74c4176902c0bbd74700ba30d6055e70a76455174

## Coverage and limitations

- Entry point: `lib/index.js` (sole shipped runtime file per `package.json`
  `files`/`main`). No conditional, optional, or alternate entrypoints, no
  exports map, no browser builds, no native code, no install scripts.
- Resolved runtime dependencies: object-assign@4.1.1 and vary@1.1.2, both
  single-file and dependency-free; their full transitive closure is therefore
  covered. Installed with `--ignore-scripts --omit=dev`; neither declares
  lifecycle scripts regardless.
- Node.js files consulted (targeted only): `lib/http.js`,
  `lib/internal/http/outgoing.js`, `lib/internal/http/server.js`,
  `lib/_http_outgoing.js` at commit d44625a4b80c672215b469906ce583ce7eeeebaf.
  At this revision the HTTP implementation lives under `lib/internal/http/`
  with `lib/_http_*.js` as re-export shims; on older Node lines the same
  public methods live directly in `lib/_http_outgoing.js`/`lib/_http_server.js`,
  which does not change any classification here.
- Out of scope: `test/**`, `.github/**`, docs, devDependencies (express,
  mocha, supertest, etc. are never loaded at runtime).
- Reproduction not run: with the complete 479-line runtime surface read and
  zero candidate writes to core objects, static evidence settles the verdict.
- What would change the verdict: a different resolved version of object-assign
  or vary (semver ranges `^4`/`^1`) introducing patching code, or runtime files
  outside the published `files` set. Neither applies to the audited tree.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at
this output path.
