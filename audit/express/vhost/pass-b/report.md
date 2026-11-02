# Node.js patch audit: vhost

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `vhost` (Node.js virtual-host routing middleware), local clone under `$PACKAGE_ROOT`
- Library: version 3.0.2, git commit f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99 (https://github.com/expressjs/vhost, branch master), git checkout artifact; no local modifications observed. File hashes (SHA-256): `index.js` 1e9e6a3b35ea4eeb4c18f25d25219f3ad03f2d06b8b5da0f31f7a36cb6f8d843, `package.json` d13daebbb3f9c64e7160020e955959fd4081f9831d66476a06313b90f98516c0
- Node.js baseline: `$NODEJS_SOURCE` main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Reproduction runtime: not run (static proof suffices; runtime surface is a single 164-line file with zero imports)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (sole entrypoint; no `main`/`exports` field so CommonJS default resolution applies; npm `files` whitelist ships only LICENSE, README.md, index.js). Zero runtime dependencies (`package.json` has no `dependencies` field; no node_modules present). No install/preinstall/postinstall scripts, no `bin`. Tests (`test/`) and docs are out of scope.
- Coverage: source — complete (entire runtime file read line-by-line and pattern-scanned); upstream — bounded issue search, no patch-relevant items; runtime — not exercised (not required)

## Patching verdict

No patching of Node.js was demonstrated anywhere in the inspected scope.

- Shared core mutations: **0**. vhost contains no `require`/`import` statements at all — it never loads a Node.js core module, never touches `process`, `global`/`globalThis`, `Buffer`, prototypes, property descriptors, module loading machinery, or native bindings. Its only use of an ECMAScript intrinsic is a read-only `Object.prototype.toString.call(val)` (`$PACKAGE_ROOT/index.js:102`).
- Instance/application overrides: **0**. The single write to a non-library object is `req.vhost = vhostdata` (`$PACKAGE_ROOT/index.js:61`). `vhost` is not a member of `http.IncomingMessage` (or any core class) at the baseline ref, so this is additive library metadata on a request instance, not a shadowing or replacement of any core member.
- Transitive patches: **0 possible** — zero runtime dependencies.
- Unresolved candidates: none. All 6 candidate sites were traced to resolution (see ledger).

The host-header read path (`req.headers.host`, `$PACKAGE_ROOT/index.js:77` and `:140`) is read-only through the documented `headers` prototype accessor; vhost never writes `req.headers` or mutates the headers object. The handler dispatch (`handle(req, res, next)`, `$PACKAGE_ROOT/index.js:64`) invokes the user-supplied function with the original `req`/`res` unchanged — no method on `req` or `res` (e.g. `res.end`, `res.writeHead`, `req.emit`) is saved, wrapped, or replaced.

## Confirmed Node.js patches

None. No reachable write or replacement of a core API, global, shared prototype, core-backed instance member, core module loading mechanism, or core source was found. (The request-metadata addition `req.vhost` is deliberately not promoted to a finding; see supporting context.)

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:15` — `module.exports = vhost` | rejected as patch | Assignment to the module's own CommonJS exports object; library-owned, standard export idiom. No core object touched. |
| C-002 | `$PACKAGE_ROOT/index.js:61` — `req.vhost = vhostdata` on a core-backed `http.IncomingMessage` instance (or framework subclass) | rejected as patch | Instance metadata addition, not core member shadowing. Negative content search for `vhost` in `$NODEJS_SOURCE/lib/internal/http/incoming.js`, `$NODEJS_SOURCE/lib/_http_incoming.js`, and `$NODEJS_SOURCE/lib/http.js` confirms no core property, accessor, or method named `vhost` exists on `IncomingMessage` or the `http` module at the baseline ref; the write does not alter any core-defined behavior. Per the audit contract, adding request metadata does not establish a core patch. Prototype is never touched — the write is per-instance, applied only on hostname match. |
| C-003 | `$PACKAGE_ROOT/index.js:102` — `Object.prototype.toString.call(val)` | rejected as patch | Read-only invocation of the intrinsic via `.call`; no assignment, no `defineProperty`, no descriptor change on `Object.prototype`. |
| C-004 | `$PACKAGE_ROOT/index.js:77,140` — `req.headers.host` reads | rejected as patch | Pure reads through the documented lazy `headers` getter (`$NODEJS_SOURCE/lib/internal/http/incoming.js:125`, `ObjectDefineProperty(IncomingMessage.prototype, 'headers', ...)`); `host` is a core-parsed known header field (`incoming.js:356,411`). vhost never assigns to `req.headers` or any key within it. |
| C-005 | `$PACKAGE_ROOT/index.js:153-160` — writes `obj.host`, `obj.hostname`, `obj.length`, `obj[i-1]` | rejected as patch | All writes land on a freshly created library-owned `Object.create(null)` object (`index.js:153`), later exposed as `req.vhost` (see C-002). No shared or core object involved. |
| C-006 | `$PACKAGE_ROOT/index.js:64` — `handle(req, res, next)` dispatch | rejected as patch | Plain call of the user-provided handler with unmodified `req`/`res`/`next`; no wrapping, saving of originals, or replacement of any core-backed method before or after dispatch. |

Unresolved: none.

## Supporting context

- `req.vhost` (C-002) is the package's documented public API (README: "The `req.vhost` property will be populated with an object"). It is an additive, per-request, library-owned property on the request instance, assigned only when the hostname regexp matches; it persists for downstream middleware but is never consumed by Node.js core. This is request-metadata decoration in the standard Connect/Express middleware style, not an override.
- `hostnameof()` (`$PACKAGE_ROOT/index.js:76-91`) parses the `Host` header value itself (bracketed IPv6 and port stripping) instead of using `node:url` or `net` — self-contained string handling, not a copy of core code and not a replacement of any core path.
- The middleware signature `(req, res, next)` is a supported composition pattern; vhost works purely as a pass-through router and keeps no shared state beyond the per-middleware compiled `RegExp` closure.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js` | `rg -n "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" index.js` | Negative — zero imports of any kind; no core module ever loaded. |
| `$PACKAGE_ROOT/index.js` | `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\("` | Negative — no globals, no inheritance from core classes. |
| `$PACKAGE_ROOT/index.js` | `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign"` | One hit: index.js:102 read-only `Object.prototype.toString.call` (C-003). |
| `$PACKAGE_ROOT/index.js` | `rg -n -i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b"` | Negative. |
| `$PACKAGE_ROOT/index.js` | `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks"` | Negative — no module loading interception. |
| `$PACKAGE_ROOT/index.js` | `rg -n "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"` | Negative — no bindings or internal module access. |
| `$PACKAGE_ROOT/index.js` | exhaustive assignment scan (`rg -n "delete |Object\.(freeze|seal|preventExtensions)|=\s"`) plus full manual read of all 164 lines | Complete write inventory: module.exports, local vars, `req.vhost` (C-002), null-prototype `obj` members (C-005). No deletes, freezes, or descriptor operations. |
| `$PACKAGE_ROOT/package.json` | `rg -n '"main"|"exports"|"bin"|"preinstall"|"postinstall"|"install"'` | Negative — no alternate entrypoints, binaries, or install scripts; no `dependencies` field. |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js`, `lib/_http_incoming.js`, `lib/http.js` | `rg -n -i "vhost" <file>` | Negative in all three — `vhost` is not a core member; confirms C-002 is additive metadata. |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js:125-160,356,405-411` | targeted read | `headers` is a lazy prototype accessor; `host` is a known first-wins parsed field. Confirms C-004 is a documented read-only path. |
| expressjs/vhost issues | `gh search issues --repo expressjs/vhost "monkeypatch OR monkey-patch OR patch prototype"` and `gh api search/issues?q=repo:expressjs/vhost+prototype+OR+monkeypatch` | No patch-related issues or PRs; only dev-dependency bumps and a wildcard-matching feature discussion. |

## Coverage and limitations

- Entry points: `index.js` is the only shipped runtime file (npm `files`: LICENSE, README.md, index.js; CommonJS default entrypoint). Entire file read and scanned with the full candidate pattern set; every write site accounted for in the ledger.
- Dependencies: zero runtime dependencies declared or installed (empty node_modules at `--omit=dev` install per provenance; no node_modules present in the checkout), so no transitive patch vector exists. devDependencies (eslint, mocha, nyc, supertest) are out of runtime scope.
- Node.js baseline: `$NODEJS_SOURCE` at commit d44625a4b80c672215b469906ce583ce7eeeebaf. At this ref the HTTP incoming-message implementation lives in `lib/internal/http/incoming.js` with `lib/_http_incoming.js` as a deprecated re-export shim (DEP0199); both were checked. Only targeted files were read; no recursive scan of the Node.js tree.
- Reproduction: not run. Static proof is sufficient — a 164-line file with zero imports cannot reach core APIs except through the `req`/`res` objects handed to it, and every such access was classified.
- Version note: the baseline is Node.js main (d44625a4b80); `vhost` supports Node `>= 0.8.0`. Because vhost imports nothing and only adds `req.vhost`, the classification is insensitive to the Node version. Verified only at the stated baseline ref; other refs not inspected (minor limitation, not verdict-affecting).
- What would change the verdict: discovery of additional shipped runtime files (none exist in the `files` whitelist) or a future version adding dependencies or writes to shared objects.

## Changes since the previous audit

First audit in this output location (independent pass; no prior report read or consulted, per double-blind protocol).
