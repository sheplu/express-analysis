# Pass B search log — finalhandler patch audit

Scope searched ("runtime scope"): `$PACKAGE_ROOT/index.js` plus every resolved runtime
dependency's shipped JS (`$PACKAGE_ROOT/node_modules/{debug/src,ee-first,encodeurl,escape-html,ms,on-finished,parseurl,statuses}`).
Tests, docs, examples, devDependencies excluded. `rg -n --no-ignore` used throughout
(target lives inside a git checkout + node_modules).

Runtime files in scope (12 files):
- `index.js` (finalhandler 2.1.1; package.json `files` ships only index.js)
- `node_modules/debug/src/{index.js,node.js,common.js,browser.js}` (browser.js shipped but not loaded under Node; scanned anyway)
- `node_modules/ee-first/index.js`
- `node_modules/encodeurl/index.js`
- `node_modules/escape-html/index.js`
- `node_modules/ms/index.js`
- `node_modules/on-finished/index.js`
- `node_modules/parseurl/index.js`
- `node_modules/statuses/index.js` (+ `codes.json` data)

## Skill candidate pattern groups

### G1 — module loading: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`
HITS (all ordinary requires, no dynamic/computed specifiers):
- `index.js:14-19` — debug, encodeurl, escape-html, on-finished, parseurl, statuses
- `node_modules/debug/src/index.js:7,9` — routes to browser.js/node.js on `process` detection
- `node_modules/debug/src/node.js:5,6,32,240` — tty, util, optional `supports-color` in try/catch (NOT installed in this tree; catch path taken), common.js
- `node_modules/debug/src/common.js:14` — ms
- `node_modules/on-finished/index.js:24,208` — ee-first, `require('async_hooks')` in try/catch
- `node_modules/parseurl/index.js:15` — url (legacy `url.parse`/`url.Url`)
- `node_modules/statuses/index.js:15` — ./codes.json
No `node:` specifiers, no `import()`, no ESM.

### G2 — `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`
HITS (all reads or documented uses; zero writes to globals except process.env, see C-004):
- `index.js:73` `process.env.NODE_ENV` (read); `index.js:274` `Buffer.byteLength` (read/call)
- `node_modules/on-finished/index.js:34` `process.nextTick` fallback (call)
- `node_modules/debug/src/node.js:124,136,158,194,205,209,221` — process.env reads; `process.env.DEBUG` write/delete inside `save()` (→ C-004); `process.stderr.write` (call); `tty.isatty(process.stderr.fd)` (read)
- `node_modules/debug/src/browser.js:119,229-230,249-250` — browser-only branch, not loaded under Node
- `node_modules/debug/src/index.js:6` — `process.type` detection (read)
No `extends`, no `inherits(`, no `global`/`globalThis` writes anywhere in scope.

### G3 — `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`
HITS:
- `node_modules/on-finished/index.js:181` — comment "Patch ServerResponse.prototype.assignSocket for node.js 0.8" (→ C-001; actual write at 195 is per-instance, guarded, dormant)
- `node_modules/statuses/index.js:96,109` — `Object.prototype.hasOwnProperty.call` (read-only, → C-012)
- `node_modules/debug/src/common.js:122` — `Object.defineProperty(debug, 'enabled', …)` on library-created function (→ C-005)
ZERO hits for `__proto__`, `setPrototypeOf`, `Reflect.*`, `Object.assign` in scope.

### G4 — `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` (case-insensitive)
HITS:
- `node_modules/on-finished/index.js:53,215,220` — library-local `wrap()` binding the user callback to an AsyncResource (→ C-013; no core write)
- `node_modules/on-finished/index.js:129,181,188` — the node.js 0.8 `patchAssignSocket` branch (→ C-001)
ZERO hits elsewhere in scope.

### G5 — `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`
ZERO hits in scope.

### G6 — `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`
ZERO hits in scope.

## Follow-up targeted searches

| Query | Scope | Result |
| --- | --- | --- |
| `\.socket\s*=` / `assignSocket` | `$PACKAGE_ROOT` runtime scope | only on-finished:195 instance write inside guarded `patchAssignSocket` |
| `__onFinished` | runtime scope | on-finished:143,147,164 — library-owned expando on msg (→ C-002) |
| `_parsedUrl|_parsedOriginalUrl` | runtime scope | parseurl:43,54,73,84 — library-owned cache expandos on req (→ C-003) |
| `removeHeader|setHeader|statusCode|statusMessage` | `index.js` | lines 250-274 — documented per-response instance API (→ C-008) |
| `unpipe|resume\(` | `index.js` | lines 290,294 — documented stream API calls (→ C-009) |
| `localStorage|window\.` | debug/src/browser.js | browser-global usage only; file not loaded under Node |

## Core-baseline verification searches ($NODEJS_SOURCE, targeted files only)

| Query | File | Result |
| --- | --- | --- |
| `this.socket` / `socket = null` | `lib/internal/http/incoming.js` | `:77` ctor sets `this.socket = socket`; destroy path uses `this.socket`, never sets `undefined` |
| `kSocket` / `get socket` | `lib/internal/http/outgoing.js` | `:187` ctor `this[kSocket] = null`; `:303-315` `socket` accessor on prototype → `res.socket` is `null`, never `undefined` |
| `assignSocket` | `lib/internal/http/server.js` | `:312` `ServerResponse.prototype.assignSocket` core baseline (data property on prototype) |
| `_parsedUrl|__onFinished` | `lib/internal/http/incoming.js` | ZERO hits — both expandos are library-owned, no core property replaced |
| `\.socket = ` | `lib/internal/http/server.js` | `:211,:318` set to socket, `:327` set to `null` (detachSocket) — never `undefined` |
| shim check | `lib/_http_{incoming,outgoing,server}.js` | 45-50-line deprecation shims (DEP0199) re-exporting `lib/internal/http/*`; re-exports followed per skill table |

## Upstream corroboration queries

| Query | Result |
| --- | --- |
| `gh search issues --repo jshttp/on-finished "assignSocket"` | 1 hit: jshttp/on-finished#10 "onFinished(res) may trigger early" (closed) — historical context for socket-event listening, not a current patch |
| `gh search prs --repo jshttp/on-finished "assignSocket OR 0.8"` | 0 hits |
| `gh api repos/jshttp/on-finished/git/ref/tags/v2.4.2` | tag exists (`9a73f9c1…`); installed copy verified instead via npm lockfile integrity (see report provenance) |
