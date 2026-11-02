# Node.js patch audit: errorhandler

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `errorhandler` (Express development error-page middleware), local source at `$PACKAGE_ROOT`
- Library: errorhandler 1.5.2, git clone of https://github.com/expressjs/errorhandler, branch master, commit 1922d04b78ed575ace5499b3d6f5591f2325f70b, source checkout with installed runtime node_modules
- Node.js baseline: `$NODEJS_SOURCE`, main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Reproduction runtime: Node v24.19.0 (`node repro-check.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (single entrypoint, 198 lines), runtime data files `public/error.html` and `public/style.css`, and all resolved runtime dependencies: accepts@1.3.8, escape-html@1.0.3, negotiator@0.6.3, mime-types@2.1.35, mime-db@1.52.0 (each entrypoint and all runtime helper files read or scanned). Tests, docs, and devDependencies out of scope.
- Coverage: source — complete (all 1,622 lines of runtime JS across target and dependencies read or pattern-scanned); upstream — bounded git history for the two private-API/status-code candidates; runtime — single-version reproduction on Node v24.19.0 covering all three content-negotiation branches plus the headers-already-sent branch.

## Patching verdict

**No confirmed patching in the inspected scope.** errorhandler does not patch or
monkeypatch Node.js core.

- Shared core mutations: 0. No writes to core module exports, core prototypes
  (`http.ServerResponse.prototype`, `http.IncomingMessage.prototype`,
  `Object.prototype`, `Error.prototype`, etc.), globals, `process`, or `Buffer`
  anywhere in the target or its dependency chain.
- Instance/application overrides of core-backed objects: 0. Every write to the
  core-backed `res` object uses documented, intended-for-user-code API
  (`res.statusCode` assignment; `res.setHeader()`/`res.end()` calls). No core
  method on `req`/`res`/`err` is replaced or wrapped.
- Core module loading interception: 0. No `require.cache`, `require.extensions`,
  `Module._load`/`_resolveFilename`/`_compile`, `syncBuiltinESMExports`, or
  loader-hook usage in the scope.
- Core source rewrites / native-binding access: 0. No on-disk patching, no
  `process.binding`/`internalBinding`, no install scripts in any package in the
  runtime tree (verified: no `preinstall`/`install`/`postinstall` in any
  runtime package.json).
- Unresolved candidates: 0. All 18 ledger candidates were resolved
  (see candidates.md beside this report).

The only private-API touch is a **read** of `res._header` (C-002, supporting
context below); a read does not establish a patch.

## Confirmed Node.js patches

None. No candidate survived verification as a reachable write or replacement of
core APIs, globals, shared prototypes, core-backed instances, core module
loading, or core source.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` beside this report. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:88-100` — `res.statusCode = ...` (http.ServerResponse) | rejected as patch | Documented writable public property; per-response own-property assignment shadowing prototype default `ServerResponse.prototype.statusCode = 200` at `$NODEJS_SOURCE/lib/internal/http/server.js:285`; consumed by the `writeHead` path (`server.js:420,424`). Supported API use, no core object replaced. |
| C-002 | `$PACKAGE_ROOT/index.js:109` — `res._header` (OutgoingMessage private state) | rejected as patch | Read-only access to the private header-flush field (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:188,636`); equivalent to the public `headersSent` getter (`outgoing.js:1011`). No write. Private API read -> supporting context. |
| C-003 | `$PACKAGE_ROOT/index.js:110` — `req.socket.destroy()` (net.Socket) | rejected as patch | Call to documented public method; no reassignment. |
| C-004 | `$PACKAGE_ROOT/index.js:118,138,145,149` — `res.setHeader(...)` | rejected as patch | Calls documented `OutgoingMessage.prototype.setHeader` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`); method not replaced. |
| C-005 | `$PACKAGE_ROOT/index.js:139,146,150` — `res.end(...)` | rejected as patch | Documented API call only. |
| C-006 | `$PACKAGE_ROOT/index.js:142-143` — error-object inspection | rejected as patch | Copies `err` enumerable props into a new library-owned object; `err` is never written. |
| C-007 | `$PACKAGE_ROOT/index.js:159` — `exports.title = 'Connect'` | rejected as patch | Library-owned module export designed to be overridden by consumers; not a core object. |
| C-008 | `$PACKAGE_ROOT/index.js:36-38` — `defer` setImmediate/process.nextTick fallback | rejected as patch | Feature detection + call; neither global is redefined. |
| C-009 | `$PACKAGE_ROOT/index.js:30-31` — load-time `fs.readFileSync` of `public/*` | rejected as patch | Core API calls reading the package's own data files; `fs` not mutated. |
| C-010 | `$PACKAGE_ROOT/index.js:33` — saved `Object.prototype.toString` | rejected as patch | Alias read; `Object.prototype` untouched (confirmed by reproduction). |
| C-011 | accepts/index.js:32-39 — wraps `req` | rejected as patch | Reads `req.headers`, passes `req` to `new Negotiator(req)`; `req` itself never written; returned object is library-owned. |
| C-012 | accepts/index.js:82-195 — `Accepts.prototype.*` assignments | rejected as patch | Prototype writes on the library-owned `Accepts` constructor only. |
| C-013 | negotiator/index.js:35 — `this.request = request` | rejected as patch | Stores a reference on the library-owned instance; only reads `request.headers` (lines 44, 53, 62, 71). |
| C-014 | negotiator/index.js:38-82 — `Negotiator.prototype.*` assignments | rejected as patch | Library-owned prototype. |
| C-015 | negotiator/lib/{charset,encoding,language,mediaType}.js | rejected as patch | Pure string parsers: zero core imports, zero global/prototype references (searches S1-S6). |
| C-016 | mime-types/index.js:35,37,40,154-188 — load-time table building | rejected as patch | `populateMaps` writes into module-owned `Object.create(null)` tables exported by mime-types itself; iterates mime-db data; no core object touched. |
| C-017 | mime-db/index.js:12 — `module.exports = require('./db.json')` | rejected as patch | Static JSON data export; no executable logic. |
| C-018 | escape-html/index.js — purity check | rejected as patch | Pure string function; no `require` at all, no globals beyond `module.exports`. |

## Supporting context

- **Private API read (from C-002):** `$PACKAGE_ROOT/index.js:109` reads
  `res._header` to decide whether headers were already flushed before
  destroying the socket. In the Node baseline, `_header` is internal state
  initialized at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:188` and set at
  flush (`outgoing.js:636`); the public equivalent is the `headersSent` getter
  (`outgoing.js:1011`, `get: function() { return !!this._header; }`). This
  usage dates to errorhandler commit 8c95711 ("Do not respond after headers
  sent", 2014-04-29), predating widespread `headersSent` availability
  (`engines: node >= 0.8`). It is fragile against core internals changes but is
  a read, not a patch.
- **Legacy-Node feature detection:** `$PACKAGE_ROOT/index.js:36-38` falls back
  from `setImmediate` to `process.nextTick` for Node < 0.10. Detection only;
  no global is defined or replaced (i.e., not a polyfill install).
- **Consumer-facing override point:** `exports.title`
  (`$PACKAGE_ROOT/index.js:159`) is documented in-code as a value "framework
  authors may override"; mutation flows toward the library, not core.
- **Load-time work:** errorhandler reads two template files via
  `fs.readFileSync` at require time; mime-types builds extension/type lookup
  tables from mime-db's JSON at require time. Both only populate module-owned
  structures.
- **No install-time surface:** no runtime package in the tree declares
  `preinstall`/`install`/`postinstall` scripts.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` provenance | `git log -1` | 1922d04b78ed575ace5499b3d6f5591f2325f70b (master), package.json version 1.5.2 |
| Runtime dependency resolution | package.json inspection of each `$PACKAGE_ROOT/node_modules/*` | accepts@1.3.8, escape-html@1.0.3, negotiator@0.6.3, mime-types@2.1.35, mime-db@1.52.0; all `main: index.js`, no `exports` maps, no install scripts |
| S1 imports | `rg -n 'require\s*\(` + `from`/`import(`/`node:` alternates over runtime scope | Only `accepts`, `escape-html`, `fs`, `path`, `util`, `negotiator`, `mime-types`, `mime-db`, `path.extname`, local libs. No dynamic/computed requires. |
| S2 globals | `rg -n` for `Buffer`/`process`/`globalThis`/`global`/`extends`/`inherits(` | Only `process.nextTick` call and `process.env.NODE_ENV` read in `$PACKAGE_ROOT/index.js:38,67`. Negative elsewhere. |
| S3 prototype/descriptor | `rg -n` for `.prototype`/`__proto__`/`setPrototypeOf`/`defineProperty|ies`/`Reflect.*`/`Object.assign` | Hits only on library-owned `Accepts.prototype`/`Negotiator.prototype` and a read of `Object.prototype.toString`. No core prototype writes. |
| S4 patch keywords | `rg -ni` for `monkey.?patch`/`patch`/`wrap`/`shim`/`polyfill`/`override` | Single hit: the `exports.title` doc comment in `$PACKAGE_ROOT/index.js:156`. |
| S5 module interception | `rg -n` for `require.cache`/`require.extensions`/`Module._*`/`syncBuiltinESMExports`/`registerHooks` | No matches. |
| S6 bindings/internals | `rg -n` for `process.binding`/`_linkedBinding`/`internalBinding`/`'_http_`/`'internal/` | No matches. |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | targeted `rg -n statusCode` | `ServerResponse.prototype.statusCode = 200` (line 285); `writeHead(this.statusCode)` consumption (lines 420, 424). Baseline for C-001. |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | targeted `rg -n '_header|setHeader'` | `this._header = null` init (188), flush write (636), `headersSent` getter (1011), `setHeader` definition (813). Baseline for C-002/C-004. |
| `$NODEJS_SOURCE/lib/_http_server.js` | `head -30` | Confirmed thin re-export of `internal/http/server` at this ref; implementation files followed per re-export. |
| errorhandler history | `git log -n 10 -S '_header' -- index.js`; `git log -n 5 -S 'res.statusCode' -- index.js` | `_header` read introduced 8c95711 (2014-04-29, "Do not respond after headers sent"); `err.statusCode` support a300b6e (2015-04-09). No patching rationale in history. |
| Runtime reproduction | `node repro-check.js "$PACKAGE_ROOT"` (script beside report) | 13/13 identity/descriptor checks unchanged after require and after exercising html/json/text and headers-sent branches; "RESULT: no core mutation observed (node v24.19.0)". |

Runtime file hashes (SHA-256, `$PACKAGE_ROOT`-relative):

| File | SHA-256 |
| --- | --- |
| index.js | bd4ec6617304fd5dae0e717bc47b04f932357d3d4e20af7f0dd4de4280de97ba |
| public/error.html | 550e820e4564a1f41a3d5638640e39d526c5709d26cb13097ad0261eadf4a588 |
| public/style.css | d94c682b379b6740d3ec22aa5bb3b880f12f5729602c696c15d4c88f4647a7df |
| node_modules/accepts/index.js | be2decbd50610e8f995c1e312ee4dd6d7c1244cfdf03ee4c4a3da68e572dada1 |
| node_modules/escape-html/index.js | 42a7f91883d0c5ce9292dda4e017e1f8664d34b09276d89fb6f3859c29d1ca9b |
| node_modules/negotiator/index.js | 4f9279bcffc74199c671739f2d0e91fe5176a7f7e4683ca59809a50463a842bd |
| node_modules/negotiator/lib/charset.js | e6522a2df58f21a6cdf8d146f7e85b9a49bcaf68b813dec15068a8e84fc582c3 |
| node_modules/negotiator/lib/encoding.js | 35421dc78d3c1b608922427bbd6e524518168621ff1a44919fc591ca297e813c |
| node_modules/negotiator/lib/language.js | 4aebb44da06094f2d56f0b20b4fbdd542cda00a4c9295e10bbe55203701c9024 |
| node_modules/negotiator/lib/mediaType.js | 0dab239c924fa4d5f823548e25dc9f10315bf490b821827b640318b7aa200577 |
| node_modules/mime-types/index.js | 8cfccaac306beb650d60c7f069ae0f4b39d648f1e3914696b18c133ab33e6419 |
| node_modules/mime-db/index.js | 2ccebf3d525708c915c6a86ffbb68e5023d34c9bc30b6b4021db9ebbc6ca9ecc |
| node_modules/mime-db/db.json | 85c8e1ba609079947c8df83c092900ab0226e1d7b60e5e7105fb7dd701833263 |

## Coverage and limitations

- Entry points: the package's single export (`index.js`) and each dependency's
  single `main: index.js` (no conditional `exports` maps, no bin/CLI surface).
  `public/error.html` and `public/style.css` are inert data loaded at require
  time.
- Dependency tree: fully flat — `$PACKAGE_ROOT/node_modules` contains exactly
  the five runtime packages with no nested node_modules; every runtime JS file
  (1,622 lines total) was read in full or covered by all six candidate
  searches.
- Node.js baseline: `$NODEJS_SOURCE` at d44625a4b80c672215b469906ce583ce7eeeebaf
  (main). At this ref `lib/_http_server.js`/`lib/_http_outgoing.js` re-export
  `lib/internal/http/server.js`/`lib/internal/http/outgoing.js`; cited lines
  are from the internal implementations. Only HTTP-related core files were
  read, per observed patch targets; fs/net were not read because the library
  only performs documented calls on them.
- Runtime reproduction used Node v24.19.0 with mock req/res objects (the
  middleware signature does not require real sockets); all three
  content-negotiation branches and the headers-already-sent branch executed.
  A single-version run cannot prove universal absence across all Node
  versions, but no version-conditional code paths other than the
  `setImmediate` detection (C-008) exist in the scope, and that branch is
  detection-only.
- Upstream corroboration was limited to bounded local git history; no external
  issue search was needed because no patch candidate survived static analysis.
  What would change the verdict: a future release adding install scripts, a
  dependency version drift replacing the audited flat tree, or new code
  writing (rather than reading) `res._header`/core prototypes.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous findings to
revalidate.
