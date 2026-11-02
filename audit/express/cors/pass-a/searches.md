# Search log: cors 2.8.6 monkeypatch audit (pass A)

All commands run from `$PACKAGE_ROOT` unless noted. The three scoped runtime
files were passed explicitly to every `rg` invocation (with `--no-ignore` so
node_modules is not skipped):
`lib/index.js node_modules/object-assign/index.js node_modules/vary/index.js`.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `ls -la; cat package.json; git log -1` | cors 2.8.6 at commit 5317ebe670db2aaebc1d496eb5d33493deefb3ed; `main: ./lib/index.js`; `files: ["lib/index.js"]`; deps: object-assign ^4, vary ^1; scripts are test/lint only (no install/postinstall) |
| S-02 | `ls node_modules/object-assign node_modules/vary` + package.json inspection via `node -e` | object-assign@4.1.1 and vary@1.1.2; both single-file (`index.js`), zero dependencies, zero lifecycle scripts, no exports map/browser field |
| S-03 | `find node_modules -name '*.js' -not -path '*/.*'` | Exactly 2 files: `node_modules/vary/index.js`, `node_modules/object-assign/index.js` -- no hidden or bundled runtime code |
| S-04 | Full `Read` of `lib/index.js` (239 lines), `node_modules/object-assign/index.js` (91 lines), `node_modules/vary/index.js` (149 lines) | Complete runtime surface read line by line |
| S-05 | `node -e` over `package-lock.json` for both deps | vary 1.1.2 and object-assign 4.1.1 resolved from registry.npmjs.org with sha512 integrity recorded |
| S-06 | `shasum -a 256` over the 4 runtime/metadata files | Hashes recorded in report provenance section |

## Skill candidate pattern set (over the three runtime files)

| # | Pattern (`rg -n --no-ignore`) | Result |
| --- | --- | --- |
| S-10 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | 2 hits: `lib/index.js:5` `require('object-assign')`, `lib/index.js:6` `require('vary')`. NEGATIVE for any core/node: import -> C-001 |
| S-11 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | NEGATIVE (0 hits) -- no globals, no inheritance from core classes |
| S-12 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | 6 hits, all in object-assign/index.js (lines 10, 11, 15, 23, 53, 65): saved prototype-method references (reads), existence checks, error-message string, native re-export -> C-008, C-009. No writes to any prototype |
| S-13 | `-i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b"` | 2 hits, both benign: `lib/index.js:10` (HTTP verb string `PATCH` in defaults.methods), `lib/index.js:193` (comment "wrap in a function"). NEGATIVE for actual patching code |
| S-14 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | NEGATIVE (0 hits) -- no module-loading interception |
| S-15 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | NEGATIVE (0 hits) -- no bindings or Node internals access |

## Supplemental write/override sweeps

| # | Pattern | Result |
| --- | --- | --- |
| S-20 | `res\.\w+\s*=|global\w*\.\w+\s*=|process\.\w+\s*=|Buffer\.\w+\s*=` | 1 hit: `lib/index.js:178` `res.statusCode = options.optionsSuccessStatus` -> C-003. NEGATIVE for global/process/Buffer writes |
| S-21 | `res\.\w+\s*(=[^=]|\+=)|setHeader|removeHeader|writeHead|getHeader|\.end\s*\(` | 7 hits: vary/index.js:134 (duck-type check), :140 (getHeader), :147 (setHeader) -> C-013; lib/index.js:153 (setHeader) -> C-002; :178 (statusCode) -> C-003; :179 (setHeader) -> C-004; :180 (end) -> C-005. All method calls / documented instance property write; zero method assignments |
| S-22 | `\bdelete\s+\w|getOwnPropertyDescriptor` | NEGATIVE (0 hits) -- no deletions or descriptor reads/changes |

## Node.js baseline verification (targeted, at commit d44625a4b80c672215b469906ce583ce7eeeebaf)

| # | Command (in `$NODEJS_SOURCE`) | Result |
| --- | --- | --- |
| S-30 | `rg -n "ServerResponse|OutgoingMessage" lib/http.js` + read of import block (lines 30-70) | At this ref, `OutgoingMessage` comes from `internal/http/outgoing`, `ServerResponse` from `internal/http/server`; `lib/_http_*.js` are re-export shims |
| S-31 | `rg -n "OutgoingMessage\.prototype\.(setHeader|getHeader|removeHeader|end)\s*=" lib/internal/http/outgoing.js` | setHeader :813, getHeader :914, removeHeader :973, end :1289 -- public prototype methods; confirms cors/vary call (not replace) documented API |
| S-32 | `rg -n "statusCode" lib/internal/http/server.js` | `ServerResponse.prototype.statusCode = 200` (:285); implicit-header path `this.writeHead(this.statusCode)` (:420) -- confirms `res.statusCode` is a documented settable instance property, so C-003 is API consumption |
| S-33 | `sed -n '1,40p' lib/_http_outgoing.js` | Confirms shim re-exporting `internal/http/outgoing`; no divergent legacy implementation at this ref |

No recursive scan of the Node.js tree was performed; only the four files above were opened.

## Upstream corroboration (read-only)

| # | Command | Result |
| --- | --- | --- |
| S-40 | `gh search issues --repo expressjs/cors "monkeypatch OR monkey-patch OR patch prototype" --limit 10` | NEGATIVE: `[]` -- no upstream issues discussing patching behavior |

## Negative-result summary

- No Node.js core module is imported anywhere in the runtime scope.
- No assignment to any core API, global, shared prototype, or core-backed instance method.
- No `defineProperty`/`setPrototypeOf`/`__proto__`/`delete` usage.
- No require.cache/require.extensions/Module._* loader interception.
- No process.binding/internalBinding/internal-module access.
- No install scripts, no bundled/dist code, no native addons.
