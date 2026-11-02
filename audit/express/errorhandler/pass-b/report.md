# Node.js patch audit: errorhandler

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: npm package `errorhandler` (Express development error-page middleware), local clone at `$PACKAGE_ROOT`
- Library: errorhandler 1.5.2, git commit `1922d04b78ed575ace5499b3d6f5591f2325f70b` (expressjs/errorhandler, branch master), source checkout with installed runtime dependencies; no local modifications made
- Node.js baseline: main branch, commit `d44625a4b80c672215b469906ce583ce7eeeebaf` (`$NODEJS_SOURCE`), unchanged
- Reproduction runtime: Node.js v24.19.0 (`node repro-check.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: runtime entrypoint `index.js` plus all resolved runtime dependencies: accepts@1.3.8, escape-html@1.0.3, mime-types@2.1.35, mime-db@1.52.0, negotiator@0.6.3. Tests, docs, CI, lint config, and `scripts/` build tooling out of scope; `public/error.html` and `public/style.css` included as runtime-loaded data files.
- Coverage: source — complete (all 10 runtime JS files read/pattern-swept, 1,622 total lines incl. errorhandler index.js); upstream — targeted history and issue/PR searches on expressjs/errorhandler (no relevant patch discussion found); runtime — identity/behavior reproduction run successfully on one Node version.

## Patching verdict

No patching of Node.js core was demonstrated anywhere in the inspected runtime scope.

- Shared core mutations: **0**. No writes to core module exports, core prototypes (`http.ServerResponse.prototype`, `http.IncomingMessage.prototype`, `Object.prototype`, `Error.prototype`, etc.), globals, `Buffer`, `process`, timers, or `console`.
- Instance/application overrides of core-backed objects: **0**. The middleware writes only plain data to the response instance through the documented setter `res.statusCode` and the documented methods `res.setHeader`/`res.end`; no core-backed instance method or accessor is replaced. The passed error object is never mutated (its enumerable properties are copied into a fresh plain object for the JSON branch, `$PACKAGE_ROOT/index.js:142-143`).
- Core module loading interception: **0**. No `require.cache`/`require.extensions`/`Module._*`/loader-hook usage in the target or any dependency.
- Core source rewrites / install-time patches: **0**. No install/postinstall scripts in errorhandler or any dependency; no on-disk patching code.
- Transitive origin: all five dependencies verified at their resolved entrypoints; none applies a patch. accepts and negotiator construct their own wrapper objects around `req` (reads only); mime-types populates its own null-prototype maps from the static `mime-db` JSON at load time; escape-html is a pure string function.
- Unresolved candidates: none. All 20 ledger candidates were resolved (all rejected as patches).

## Confirmed Node.js patches

None. No candidate survived tracing to an actual write or replacement of a Node.js core API, global, shared prototype, core-backed instance behavior, module loader, or core source. Private API usage and documented instance writes found during the sweep are listed under supporting context, not promoted here.

## Candidate ledger and unresolved questions

Full ledger with evidence in `candidates.md` beside this report. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:36-38`, global `setImmediate` / `process.nextTick` | rejected as patch | Feature-detect read + call only (`defer`); neither global is written |
| C-002 | `$PACKAGE_ROOT/index.js:67`, `process.env` | rejected as patch | Read of `NODE_ENV` only |
| C-003 | `$PACKAGE_ROOT/index.js:33`, `Object.prototype.toString` | rejected as patch | Saved reference for later `.call()`; no write to `Object.prototype` |
| C-004 | `$PACKAGE_ROOT/index.js:89,94,99`, `res.statusCode =` | rejected as patch | Documented public setter (`$NODEJS_SOURCE/doc/api/http.md` `response.statusCode`); instance data write shadowing prototype default `$NODEJS_SOURCE/lib/internal/http/server.js:285`; no function replaced |
| C-005 | `$PACKAGE_ROOT/index.js:109`, `res._header` | rejected as patch | Read-only private/internal API use (state set at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:188`); never written — see supporting context |
| C-006 | `$PACKAGE_ROOT/index.js:110`, `req.socket.destroy()` | rejected as patch | Documented `net.Socket` method call, no mutation |
| C-007 | `$PACKAGE_ROOT/index.js:118,138,145,149`, `res.setHeader(...)` | rejected as patch | Documented API calls |
| C-008 | `$PACKAGE_ROOT/index.js:139,146,150`, `res.end(...)` | rejected as patch | Documented API calls |
| C-009 | `$PACKAGE_ROOT/index.js:142-143`, error object | rejected as patch | Copies `err`'s enumerable props into a new `{}`; `err` never mutated (reproduction-confirmed) |
| C-010 | `$PACKAGE_ROOT/index.js:159`, `exports.title` | rejected as patch | Library-owned export used as a documented extension point; not core |
| C-011 | `$PACKAGE_ROOT/index.js:30-31`, load-time `fs.readFileSync` | rejected as patch | Reads shipped `public/` template/stylesheet data; `fs` not modified |
| C-012 | `accepts/index.js:82-195`, `Accepts.prototype.*` | rejected as patch | Writes to the library's own constructor prototype |
| C-013 | `accepts/index.js:36-37`, wrapper construction | rejected as patch | Writes `this.headers`/`this.negotiator` on its own `Accepts` instance; only reads `req.headers` |
| C-014 | `negotiator/index.js:38-82`, `Negotiator.prototype.*` | rejected as patch | Writes to the library's own constructor prototype (incl. backwards-compat aliases) |
| C-015 | `negotiator/index.js:35`, `this.request = request` | rejected as patch | Stores a reference to `req` on its own instance; never writes to `req` |
| C-016 | `mime-types/index.js:31-39,150-188`, load-time map population | rejected as patch | `populateMaps` fills the module's own `Object.create(null)` maps from mime-db JSON; no core object touched |
| C-017 | `mime-types/index.js:16`, `require('path').extname` | rejected as patch | Destructured read + call of a core function; no write |
| C-018 | `mime-db/index.js:12`, `module.exports = require('./db.json')` | rejected as patch | Static JSON data export; no executable behavior |
| C-019 | `escape-html/index.js` (whole file) | rejected as patch | Pure string-escaping function; module-scope regexp only; zero core references |
| C-020 | `negotiator/lib/{charset,encoding,language,mediaType}.js` | rejected as patch | Pure header parsers; writes only to local arrays/objects; zero `require`/`process`/`global`/`prototype` references |

Unresolved: none.

## Supporting context

- **Private API read (not a patch):** `$PACKAGE_ROOT/index.js:109` reads `res._header` to detect whether headers were already flushed before attempting a response (`if (res._header) return req.socket.destroy()`). `_header` is internal per-instance state of `OutgoingMessage` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:188`, and backs the documented `headersSent` getter at `outgoing.js:1011`). errorhandler only reads it. Introduced by errorhandler commit `8c957112` ("Do not respond after headers sent", 2014), predating `res.headersSent` adoption in this codebase. A future removal/rename of `_header` in core would silently break this check, but it rewrites nothing in core.
- **Documented instance writes:** `res.statusCode = ...` (`index.js:89,94,99`) uses the documented `response.statusCode` setter; the core default lives on the prototype (`$NODEJS_SOURCE/lib/internal/http/server.js:285`, `ServerResponse.prototype.statusCode = 200`) and the assignment creates an own data property on the response instance — the intended usage pattern.
- **Library-owned mutable surfaces:** `exports.title` (`index.js:159`, explicitly "framework authors may override this value") and mime-types' `exports.types`/`exports.extensions` maps are mutable shared state owned by the libraries themselves; mutating them affects only these packages, not Node core.
- **Load-time behavior:** errorhandler reads two shipped data files via `fs.readFileSync` at require time (`index.js:30-31`); mime-types builds its lookup maps at require time (C-016); mime-db is a pure JSON export. None registers hooks, timers, or global state.
- **No install scripts:** none of the six packages define preinstall/install/postinstall scripts (verified from each `package.json`).

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime files (10 JS files) | Skill pattern set P1-P6 via `rg -n --no-ignore` (see `searches.md`) | Imports inventoried; prototype hits only on library-owned `Accepts`/`Negotiator`; P5 module interception and P6 bindings/internals both zero hits |
| `$PACKAGE_ROOT` runtime files | Supplementary sweeps S1-S5: writes to `req/res/request/response/socket/err`, `delete`, writes on global builtins, header writes, negotiator-lib core refs | Only hits: documented `res.statusCode`/`res.setHeader` writes and the `res._header` read in `index.js`; negotiator lib has zero core references |
| `$PACKAGE_ROOT/package.json` + 5 dependency `package.json` files | `node -e` metadata dump | No install/postinstall scripts; entrypoints all `index.js`; dependency tree closed (accepts -> mime-types -> mime-db, accepts -> negotiator, escape-html) |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | `rg -n 'statusCode' lib/internal/http/server.js` | `ServerResponse.prototype.statusCode = 200` at line 285; instance assignment is the documented contract |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | `rg -n "_header" lib/internal/http/outgoing.js` | `this._header = null` init at line 188; `headersSent` getter at line 1011; confirms `_header` is internal instance state, read-only in errorhandler |
| `$NODEJS_SOURCE/doc/api/http.md`, `doc/api/deprecations.md` | `rg -n` for `response.statusCode`, `_header` | `response.statusCode` documented (http.md line 2446); DEP0066 covers `_headers`/`_headerNames`, not the `_header` string read here |
| expressjs/errorhandler history | `git log -n 10 -S '_header' -- index.js`; `git show 8c95711` | Commit `8c957112` (2014) added the `res._header` guard + tests; read-only usage from introduction |
| expressjs/errorhandler issues/PRs | `gh search issues/prs --repo expressjs/errorhandler "headersSent OR _header"` | No results; no upstream patch-related discussion found |
| Runtime reproduction | `node repro-check.js "$PACKAGE_ROOT"` (script beside report) | No change in identity of http prototype methods, `Object.prototype`/`Error.prototype` key sets, `setImmediate`, `process.nextTick`, `fs.readFileSync`, `util.inspect`, `Module._load`, `Module._resolveFilename`, `require.extensions`, `JSON.stringify`, `console.error` after require and after invoking the middleware on html/json/text branches; error object own-keys unchanged. Exit 0 on Node v24.19.0 |

File hashes (SHA-256, `$PACKAGE_ROOT`-relative), for provenance:

- `index.js` bd4ec6617304fd5dae0e717bc47b04f932357d3d4e20af7f0dd4de4280de97ba
- `public/error.html` 550e820e4564a1f41a3d5638640e39d526c5709d26cb13097ad0261eadf4a588
- `public/style.css` d94c682b379b6740d3ec22aa5bb3b880f12f5729602c696c15d4c88f4647a7df
- `node_modules/accepts/index.js` be2decbd50610e8f995c1e312ee4dd6d7c1244cfdf03ee4c4a3da68e572dada1
- `node_modules/escape-html/index.js` 42a7f91883d0c5ce9292dda4e017e1f8664d34b09276d89fb6f3859c29d1ca9b
- `node_modules/mime-db/index.js` 2ccebf3d525708c915c6a86ffbb68e5023d34c9bc30b6b4021db9ebbc6ca9ecc
- `node_modules/mime-db/db.json` 85c8e1ba609079947c8df83c092900ab0226e1d7b60e5e7105fb7dd701833263
- `node_modules/mime-types/index.js` 8cfccaac306beb650d60c7f069ae0f4b39d648f1e3914696b18c133ab33e6419
- `node_modules/negotiator/index.js` 4f9279bcffc74199c671739f2d0e91fe5176a7f7e4683ca59809a50463a842bd
- `node_modules/negotiator/lib/charset.js` e6522a2df58f21a6cdf8d146f7e85b9a49bcaf68b813dec15068a8e84fc582c3
- `node_modules/negotiator/lib/encoding.js` 35421dc78d3c1b608922427bbd6e524518168621ff1a44919fc591ca297e813c
- `node_modules/negotiator/lib/language.js` 4aebb44da06094f2d56f0b20b4fbdd542cda00a4c9295e10bbe55203701c9024
- `node_modules/negotiator/lib/mediaType.js` 0dab239c924fa4d5f823548e25dc9f10315bf490b821827b640318b7aa200577

## Coverage and limitations

- Entry points covered: `$PACKAGE_ROOT/index.js` (sole shipped runtime file per `package.json` `files`, plus `public/` data assets), and the resolved entrypoints and all runtime JS of accepts@1.3.8, escape-html@1.0.3, mime-types@2.1.35, mime-db@1.52.0, negotiator@0.6.3. No conditional/optional entrypoints exist (`main: index.js` everywhere, no `exports` maps, no browser fields, no native addons).
- Node.js baseline files read: `lib/http.js` (re-export trace), `lib/internal/http/server.js`, `lib/internal/http/outgoing.js`, `doc/api/http.md`, `doc/api/deprecations.md`, at commit `d44625a4b80c672215b469906ce583ce7eeeebaf`. No recursive scan of the Node tree was performed.
- Reproduction ran on Node v24.19.0 only; one runtime version cannot prove universal absence, but the static sweep found no version-guarded patch branches anywhere in scope (the only feature detection is the `setImmediate` fallback, which performs no writes).
- Excluded from scope: `test/`, `.github/`, lint config, `mime-db` `scripts/` (build tooling not shipped on the require path), `HISTORY.md`/`README.md`. These contain no runtime-reachable code.
- What would change the verdict: a different resolved dependency version introducing patch behavior (the audited lockfile pins the versions above), or runtime-only code paths outside the three negotiated branches — none exist in the 198-line entrypoint.

## Changes since the previous audit

First audit in this output location (independent double-blind pass; no other audit output consulted).
