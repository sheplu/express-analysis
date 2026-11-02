# Node.js patch audit: vhost

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `vhost` (Node.js virtual-host routing middleware), local source at `$PACKAGE_ROOT`
- Library: version 3.0.2, git clone of https://github.com/expressjs/vhost, branch master, commit f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99, source checkout (no local changes); sha256 `index.js` = `1e9e6a3b35ea4eeb4c18f25d25219f3ad03f2d06b8b5da0f31f7a36cb6f8d843`, `package.json` = `d13daebbb3f9c64e7160020e955959fd4081f9831d66476a06313b90f98516c0`
- Node.js baseline: `$NODEJS_SOURCE` main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (no local changes)
- Reproduction runtime: Node.js v24.19.0
- Scope: production/runtime code only — single runtime entrypoint `$PACKAGE_ROOT/index.js` (164 lines; the only shipped runtime file per the `files` field in `$PACKAGE_ROOT/package.json`); zero runtime dependencies (no `dependencies`/`optionalDependencies`/`peerDependencies`; empty node_modules after `--omit=dev` install); no install/prepare scripts. Tests and docs out of scope.
- Coverage: source — complete (full assignment inventory of the single runtime file plus the skill's full candidate pattern set); upstream — issue search returned no patch-related discussion; runtime — no-mutation reproduction executed successfully.

## Patching verdict

No patching was demonstrated. vhost 3.0.2 performs **zero shared core mutations** and **zero core-backed instance overrides**, intercepts no module loading, and rewrites no core source, directly or transitively (it has no runtime dependencies through which a patch could arrive).

The complete inventory of every assignment in the runtime file shows exactly one write to a live core-backed object: `req.vhost = vhostdata` (`$PACKAGE_ROOT/index.js:61`). `vhost` is a library-owned metadata key that does not exist anywhere on core `http.IncomingMessage` (verified against `$NODEJS_SOURCE/lib/internal/http/incoming.js` and `$NODEJS_SOURCE/lib/http.js` at the baseline commit), so the write adds request metadata rather than overriding or shadowing any core member. Every other write in the file targets module-local variables, the library's own `module.exports`, or a freshly created `Object.create(null)` result object. All candidates were resolved; none remain unresolved.

## Confirmed Node.js patches

None. No reachable write or replacement of a core API, global, shared prototype, core-backed instance member, core module loading mechanism, or core source was found. (Private API usage was also absent; the only core surface touched is the documented `message.headers` property, read-only.)

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:61` — `req.vhost = vhostdata` on live `http.IncomingMessage` instance | rejected as patch | Adds a library-owned own-property; `vhost` is not a member of core `IncomingMessage` (`grep -n "vhost" $NODEJS_SOURCE/lib/internal/http/incoming.js $NODEJS_SOURCE/lib/http.js` → no hits). Instance metadata addition, not an override; per skill, adding request metadata does not establish a patch. Reproduction confirmed only own-key `vhost` is added and prototypes are untouched. |
| C-002 | `$PACKAGE_ROOT/index.js:102` — `Object.prototype.toString.call(val)` | rejected as patch | Read-only invocation of the ECMAScript builtin for RegExp detection; no write, no descriptor change. Sole hit from the prototype/descriptor pattern set. |
| C-003 | `$PACKAGE_ROOT/index.js:77,140` — `req.headers.host` | rejected as patch | Read-only access to the documented `message.headers` accessor (core baseline: `$NODEJS_SOURCE/lib/internal/http/incoming.js:125`, `ObjectDefineProperty(IncomingMessage.prototype, 'headers', ...)`). vhost never assigns `req.headers` nor mutates the headers object. |
| C-004 | `$PACKAGE_ROOT/index.js:153-161` — writes `obj.host`, `obj.hostname`, `obj.length`, `obj[i-1]` | rejected as patch | All writes target a fresh `Object.create(null)` object owned by the library (becomes `req.vhost`); no core object involved. |
| C-005 | `$PACKAGE_ROOT/index.js:15` — `module.exports = vhost` | rejected as patch | Export of the library's own module; not `require.cache`/`Module._*` interception. |
| C-006 | `$PACKAGE_ROOT/index.js:64` — `handle(req, res, next)` dispatch | rejected as patch | Calls the caller-supplied handler function with unmodified `res`; no core method is replaced or wrapped on `req`/`res`. |
| C-007 | `$PACKAGE_ROOT/index.js:114,127` (also 39,43,47) — `String()`, `new RegExp()`, `throw new TypeError()` | rejected as patch | Constructive, read-only use of ECMAScript builtins; no prototype or global mutation. |
| C-008 | `$PACKAGE_ROOT/package.json` — lifecycle scripts | rejected as patch | Scripts are `lint`/`test`/`test-ci`/`test-cov` only; no install/preinstall/postinstall/prepare hook, so no install-time core source rewrite vector. |

No unresolved candidates.

## Supporting context

- `req.vhost` (C-001) is the package's documented purpose (README: "Provide `req.vhost` object"); it is populated from a null-prototype object and only set when the hostname matches, so it cannot pollute `Object.prototype`.
- Historical (not in audited version): before 3.0.0, vhost accepted an `http.Server` as second argument and dispatched via `server.emit('request', req, res)` (removed in commit 711882a, release 3.0.0 / 2014-08-29). That was ordinary public EventEmitter API use on a caller-supplied server, not a patch; the audited 3.0.2 only accepts a plain handler function.
- The runtime file contains no `require`/`import` of any kind — it touches Node.js core only through the `req` object handed to the middleware by the host framework.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js` | `rg -n "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" index.js` | No hits — zero module imports in the runtime file. |
| `$PACKAGE_ROOT/index.js` | `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\("` | No hits — no core globals or inheritance of core classes. |
| `$PACKAGE_ROOT/index.js` | `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign"` | One hit: line 102, read-only `Object.prototype.toString.call` (C-002). |
| `$PACKAGE_ROOT/index.js` | `rg -n "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b"` | No hits. |
| `$PACKAGE_ROOT/index.js` | `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks"` | No hits — no module-loading interception. |
| `$PACKAGE_ROOT/index.js` | `rg -n "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"` | No hits — no internal bindings. |
| `$PACKAGE_ROOT/index.js` | `rg -n "=[^=]"` filtered of comparisons (full assignment inventory) | 23 assignments total; only line 61 writes a live core-backed object (C-001); rest are locals/own objects (C-004–C-005). |
| `$PACKAGE_ROOT/package.json` | `rg -n "install|prepare|preinstall|postinstall" package.json` | No hits — no lifecycle hooks (C-008). |
| `$NODEJS_SOURCE/lib/_http_incoming.js` | targeted read | 45-line deprecated re-export shim (DEP0199) → followed re-export to `lib/internal/http/incoming.js`. |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js`, `$NODEJS_SOURCE/lib/http.js` | `grep -n "vhost"` | No hits — `vhost` is not a core `IncomingMessage` member at commit d44625a4b80. |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` | `grep -n "IncomingMessage.prototype"` + read of lines 125–145 | Core member inventory; `headers` is a prototype accessor (line 125) that vhost only reads. |
| Upstream issues | `gh search issues --repo expressjs/vhost "patch"` / `"prototype"` | Both empty — no upstream discussion of patching behavior. |
| Library history | `git log --oneline -- index.js`; `git show 711882a` | Confirms 3.0.0 removed sub-http-server dispatch (`server.emit('request', ...)`); audited version dispatches to a plain function only. |
| Reproduction | `node repro-no-mutation.js "$PACKAGE_ROOT"` (script beside this report) | Output: own properties added to live req = `["vhost"]`; core `IncomingMessage.prototype` has no own `vhost`; `RESULT: no core prototype/global mutation detected` across `IncomingMessage`/`ServerResponse`/`Server` prototypes, `Object`/`Function`/`String`/`RegExp` prototypes, and the `headers` accessor descriptor. Node v24.19.0. |

## Coverage and limitations

- Entry points: `index.js` is the sole entrypoint (`main` default) and the sole shipped runtime file (`files: ["LICENSE", "README.md", "index.js"]`); the whole file was read and inventoried. Tests (`test/`), docs, and dev tooling were excluded as out of scope per instructions.
- Dependencies: none at runtime (package.json declares only devDependencies; verified empty node_modules after `--omit=dev` install per task provenance), so no transitive patch vector exists.
- Node.js baseline reads were targeted per the skill table: `lib/http.js` (grep only), `lib/_http_incoming.js` (re-export shim), `lib/internal/http/incoming.js` (member inventory and `headers` accessor). No recursive scan of the Node.js tree was performed.
- Reproduction exercised the string-pattern branch (`'*.example.com'`, matching host) on Node v24.19.0; the RegExp-pattern and non-matching branches differ only in whether `req.vhost` is assigned and were covered statically. A tested branch cannot prove universal absence, but the complete static assignment inventory of the 164-line file covers all branches.
- What would change the verdict: a different shipped artifact (e.g., a modified npm tarball differing from this git commit) or evaluation of pre-3.0 historical versions, which are outside this audit's scope.
- Companion artifacts: `candidates.md` (full ledger), `searches.md` (search log), `repro-no-mutation.js` (reproduction script), all beside this report.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at this path.
