# Search log — serve-favicon 2.5.1 patch audit (pass-b)

All package searches run from `$PACKAGE_ROOT` over the six runtime files:
`index.js`, `node_modules/{etag,fresh,ms,parseurl,safe-buffer}/index.js`
(set as `"$@"` below). Node.js searches are targeted single-file greps in
`$NODEJS_SOURCE` at `d44625a4b80c672215b469906ce583ce7eeeebaf`. `rg` exit=1
means no matches.

## Scope establishment

| Command | Result |
| --- | --- |
| `ls -la $PACKAGE_ROOT && cat package.json` | Runtime surface = `index.js` only (`files`: LICENSE, HISTORY.md, index.js; default `main`); deps: etag ~1.8.1, fresh ~0.5.2, ms ~2.1.3, parseurl ~1.3.2, safe-buffer ~5.2.1; scripts: lint/test only (no install/postinstall/prepare) |
| `git -C $PACKAGE_ROOT log -1` | `1d9a8e7261557ec9a40463fd54e99b601016598c` (matches provenance) |
| per-dep `package.json` + `ls` | etag@1.8.1, fresh@0.5.2, ms@2.1.3, parseurl@1.3.3, safe-buffer@5.2.1; each a single runtime `index.js`; entrypoints `index.js`/`./index` |
| Full `Read` of all six runtime files | Complete line-by-line review (basis for candidate tracing) |

## Skill candidate pattern set (P1-P6)

| # | Pattern (`rg -n --no-ignore ... "$@"`) | Result |
| --- | --- | --- |
| P1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | 12 hits: core imports only — serve-favicon: safe-buffer/etag/fresh/fs/ms/parseurl/path (index.js:16-22); parseurl: url (:15); safe-buffer: buffer (:3); etag: crypto (:21), fs.Stats (:22). fresh/ms: none. No dynamic import, no `node:` specifiers |
| P2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | 21 hits, all Buffer-related reads/calls/comments: safe-buffer :4,:12,:17,:21,:24,:27,:33,:40,:57 (→ C-004..C-008); index.js :58-59 `Buffer.isBuffer/from` (calls); etag :54,:82 `Buffer.byteLength/isBuffer` (calls); rest JSDoc. No `process`/`global`/`globalThis`/`extends`/`inherits` anywhere |
| P3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | 2 hits: safe-buffer/index.js:24 `SafeBuffer.prototype = Object.create(Buffer.prototype)` (→ C-007); etag/index.js:29 `Object.prototype.toString` saved ref (→ C-011) |
| P4 | `-i 'monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b'` | exit=1 — no hits (fresh:97 says "patching", not matched; reviewed manually, it is a defensive comment about third-party date.js) |
| P5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | exit=1 — no module-loading interception |
| P6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | exit=1 — no internal bindings or internal-module specifiers |

## Supplementary sweeps (S1-S6)

| # | Command | Result |
| --- | --- | --- |
| S1 | `rg -n --no-ignore '\b(req\|res)\.[A-Za-z_$][\w$]*\s*=[^=]' "$@"` | 5 hits: parseurl :54 `req._parsedUrl =` (C-001), :84 `req._parsedOriginalUrl =` (C-002); index.js :73,:216,:222 `res.statusCode =` (C-009) |
| S2 | `rg -n --no-ignore '\bdelete\s\|getOwnPropertyDescriptor\|freeze\|seal' "$@"` | exit=1 — no deletions or descriptor operations |
| S3 | `rg -n --no-ignore '\b(fs\|url\|crypto\|buffer\|path\|http)\.[A-Za-z_$][\w$]*\s*=[^=]' "$@"` | 5 hits, all parseurl :132-138 `url.* =` — traced: local `var url = new Url()` at :128 shadows the module import; writes hit a fresh instance, not the core module (→ C-003). No writes to fs/crypto/buffer/path/http module objects |
| S4 | `find node_modules -mindepth 2 -name node_modules -o -mindepth 2 -name '*.js'` | Only the five dependency `index.js` files; no nested node_modules, no extra shipped JS |
| S5 | scripts scan of each dep `package.json` for `install`/`prepare` keys | None — no lifecycle/install scripts in any dependency |
| S6 | `browser`/`exports` field scan of each dep `package.json` | None — no entrypoint remapping; resolved entrypoints are the files read |

## Node.js baseline verification (targeted files only)

| Command | Result |
| --- | --- |
| `git -C $NODEJS_SOURCE log -1 --format='%H'` | `d44625a4b80c672215b469906ce583ce7eeeebaf` |
| `grep -n '_parsedUrl\|_parsedOriginalUrl' lib/_http_incoming.js` | exit=1 — absent (file is now a DEP0199 re-export shim of `internal/http/incoming`) |
| `grep -n '_parsedUrl\|_parsedOriginalUrl' lib/internal/http/incoming.js` | exit=1 — absent; IncomingMessage ctor own fields (:77-106) do not include them → C-001/C-002 rejected |
| `grep -n 'function Url\|this.path\b\|this.href\|...' lib/url.js` | `Url` ctor :77; initializes `search/query/pathname/path/href` :85-89; `parse` assigns the same fields (:260-272, :467-504) → C-003 contract check |
| `sed -n '1025,1045p' lib/url.js` | `module.exports = { Url, parse, ... }` — `Url` is a public "Original API" export |
| `grep -n 'Buffer.from\|Buffer.alloc...' lib/buffer.js` | `Buffer.from` :351, `Buffer.alloc` :454, `Buffer.allocUnsafe` :473, `Buffer.allocUnsafeSlow` :496 → safe-buffer modern branch live, legacy branch dead |
| `grep -n 'setHeader(' lib/internal/http/outgoing.js` | `OutgoingMessage.prototype.setHeader` :813 → C-010 documented API |
| `grep -n 'statusCode' lib/internal/http/server.js` | `ServerResponse.prototype.statusCode = 200` :285 → C-009 documented writable property |

## Runtime reproduction

| Command | Result |
| --- | --- |
| `node repro-core-snapshot.js "$PACKAGE_ROOT"` (Node v24.19.0) | `RESULT: no core identity/descriptor/prototype changes detected` — snapshots of Buffer statics, Buffer.prototype own keys, buffer module own keys, url.parse/url.Url/Url.prototype, IncomingMessage.prototype, ServerResponse.prototype, OutgoingMessage setHeader/end, fs.readFile/statSync, Module._load/_resolveFilename, require.extensions['.js'], Date.parse, Object.assign, Object.prototype are identical before load, after load, and after exercising the middleware (GET /favicon.ico, other path, POST). Request expando added: `_parsedUrl` only. `require('safe-buffer') === require('buffer')` → true |

## Upstream corroboration (read-only)

| Query | Result |
| --- | --- |
| `gh pr view 7878 --repo joyent/node` | "Add fast path for simple URL parsing" — CLOSED (unmerged), https://github.com/nodejs/node-v0.x-archive/pull/7878; referenced by parseurl/index.js:104 comment; confirms the fast path is a standalone copy, not a core change this package relies on or applies |
| `gh search issues --repo expressjs/serve-favicon "monkeypatch OR patch prototype"` | `[]` — no results |
