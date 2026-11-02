# Search log: serve-favicon 2.5.1 patch audit (pass A)

All library commands ran from `$PACKAGE_ROOT`; Node.js commands from
`$NODEJS_SOURCE` (commit d44625a4b80c672215b469906ce583ce7eeeebaf). Scoped
file set for library sweeps ("SCOPE" below):
`index.js node_modules/etag/index.js node_modules/fresh/index.js
node_modules/ms/index.js node_modules/parseurl/index.js
node_modules/safe-buffer/index.js`.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 1 | `ls -la; cat package.json; git log -1; ls node_modules` | 2.5.1 at 1d9a8e7; runtime files = index.js only (package.json `files`); deps dirs: etag, fresh, ms, parseurl, safe-buffer |
| 2 | `node -e` dump of each `node_modules/*/package.json` (name, version, main, dependencies) + `ls` of each dep dir | etag@1.8.1, fresh@0.5.2, ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1; every dep: single index.js entrypoint, `dependencies: {}` (closure complete); no install scripts in scope |
| 3 | Full reads: `index.js` (227 lines) and all five dep `index.js` files | Complete source coverage of runtime scope |
| 4 | `shasum -a 256` over the six runtime files | Provenance hashes recorded in report.md |

## Skill candidate pattern set (rg -n over SCOPE)

| # | Pattern | Result |
| --- | --- | --- |
| P1 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | 12 hits: core imports only — parseurl: `url`; etag: `crypto`, `fs.Stats`; safe-buffer: `buffer`; serve-favicon: safe-buffer/etag/fresh/fs/ms/parseurl/path. ms: none. All traced (C-005, C-011, C-012) |
| P2 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | 20 hits: all Buffer reads/calls (`isBuffer`, `from`, `byteLength`) or JSDoc; safe-buffer guard + wrappers -> C-005..C-008. No `process`/`global`/`globalThis`/`extends`/`inherits` hits anywhere |
| P3 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | 2 hits: safe-buffer:24 `SafeBuffer.prototype = Object.create(Buffer.prototype)` (C-007); etag:29 `var toString = Object.prototype.toString` (C-012). No `__proto__`/`setPrototypeOf`/`defineProperty`/`Reflect`/`Object.assign` |
| P4 | `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive) | **0 hits** (exit 1) |
| P5 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | **0 hits** (exit 1) — no module-loading interception |
| P6 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | **0 hits** (exit 1) — no bindings/core-internals access |

## Supplemental write sweeps (rg -n over SCOPE)

| # | Pattern | Result |
| --- | --- | --- |
| S1 | `^\s*(fs|url|path|crypto|buffer|http|process|Buffer|global|globalThis)\s*\.\s*\w+\s*=` | 5 hits, all parseurl/index.js:132-138 — local `var url` (new `Url()` instance, declared line 128) shadows the core module import -> C-003. No true core-module writes |
| S2 | `\bdelete\s|getOwnPropertyDescriptor|defineProperty` | **0 hits** (exit 1) |
| S3 | `(req|res)\.\w+\s*=|req\._|res\._` | 7 hits: parseurl:43,54,73,84 (`req._parsedUrl`/`req._parsedOriginalUrl` -> C-001/C-002); index.js:73,216,222 (`res.statusCode` -> C-009) |
| S4 | `rg -n 'require|prototype|global|process|Object\.|module\.exports|exports\.' node_modules/ms/index.js` | 1 hit: `module.exports = function ...` — ms imports nothing, writes nothing external |

## Node.js baseline verification ($NODEJS_SOURCE, targeted only)

| # | Command | Result |
| --- | --- | --- |
| N1 | `rg -n '_parsedUrl' lib/_http_incoming.js` | **0 hits** — core does not define parseurl's cache key |
| N2 | `rg -n '_parsedUrl' lib/http.js lib/_http_server.js lib/_http_outgoing.js lib/_http_common.js` | **0 hits** |
| N3 | `rg -n '_parsedUrl' lib/internal/http/incoming.js lib/internal/http/server.js lib/internal/http/outgoing.js lib/internal/http/common.js` | **0 hits** (checked because `lib/_http_*.js` are now re-export shims; followed re-exports per skill table) |
| N4 | `wc -l` + head/tail of `lib/_http_{incoming,outgoing,server}.js` | 45-50-line DEP0199 re-export shims over `lib/internal/http/*` — real implementations identified |
| N5 | `rg -n 'OutgoingMessage\.prototype\.setHeader\s*=|statusCode' lib/internal/http/outgoing.js` | `setHeader` defined at outgoing.js:813 (public method, only called by target) |
| N6 | `rg -n 'statusCode' lib/internal/http/server.js` | `ServerResponse.prototype.statusCode = 200` at server.js:285 — plain data-property default; per-instance assignment is the documented usage -> C-009 rejected |
| N7 | `rg -n 'this\.url\s*=|this\.method\s*=|function IncomingMessage' lib/internal/http/incoming.js` | ctor at :61; `this.url`/`this.method` at :95-96 — parseurl reads `req.url` only |
| N8 | `rg -n 'module\.exports|function Url|urlParse' lib/url.js` | `Url` (:77) and `parse: urlParse` exported at :1025-1028 (public legacy API); DEP0169 warning at :134-145 suppressed via `isInsideNodeModules` |
| N9 | `rg -n 'Buffer\.(from|alloc|allocUnsafe|allocUnsafeSlow)\s*=|module\.exports' lib/buffer.js` | All four statics present (:351,:454,:473,:496) -> safe-buffer guard true -> pure re-export branch (C-005) |

No recursive scan of the Node.js tree was performed; every Node read above was
a named-file targeted search chosen from observed library identifiers.

## Upstream corroboration

| # | Query/link | Result |
| --- | --- | --- |
| U1 | joyent/node#7878 (referenced in code comment, parseurl/index.js:104) | Source of the unrolled fast-path regex; copied logic in library code, does not touch core — no patch, no further expansion warranted |
| U2 | DEP0169 (`url.parse`) and DEP0199 (`_http_*` shims) seen directly in `$NODEJS_SOURCE` | Supporting context only; neither triggered by a patch from this library. No library-specific core accommodation found in the selected core files |

No open/closed issue search beyond code-referenced items was needed: no patch
target was observed, so there was no patch claim to corroborate upstream.

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R1 | `node repro-no-mutation.js "$PACKAGE_ROOT"` (script beside report; Node v24.19.0) | PASS — snapshot of core identities/own-property sets (`buffer`, `Buffer`, `Buffer.prototype`, `fs`, `url`, `Url.prototype`, `http.IncomingMessage.prototype`, `http.ServerResponse.prototype`, `OutgoingMessage.prototype.setHeader`, `Object.prototype`, `Date.parse`) unchanged after require + middleware exercise (GET /favicon.ico -> 200); `require('safe-buffer') === require('buffer')` true; `_parsedUrl` present on req instance only |
