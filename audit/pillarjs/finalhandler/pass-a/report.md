# Node.js patch audit: finalhandler

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#28 — `finalhandler` (Node.js final http responder, https://github.com/pillarjs/finalhandler); PASS A of a two-pass blind audit
- Library: finalhandler 2.1.1, `$PACKAGE_ROOT` cloned default branch `master` @ 1e0227c67128dfcd0a7725c81beb4af3405a3419, git checkout with runtime deps installed via `npm install --ignore-scripts --omit=dev`; no local modifications
- Node.js baseline: `$NODEJS_SOURCE` main @ d44625a4b80c672215b469906ce583ce7eeeebaf; supported-range spot checks via `git show v18.0.0:lib/_http_outgoing.js` and `git show v22.0.0:lib/_http_outgoing.js` (checkout unchanged)
- Reproduction runtime: Node.js v24.19.0 (`repro-patch-check.js`, output in `repro-output.txt`)
- Scope: runtime entrypoint `index.js` (the package's only shipped file per `files`) and all resolved runtime dependencies at their installed entrypoints: debug@4.4.3 (src/index.js -> src/node.js -> src/common.js; src/browser.js conditional), ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, ms@2.1.3, on-finished@2.4.2, parseurl@1.3.3, statuses@2.0.2. Tests, examples, docs, devDependencies out of scope.
- Coverage: source — complete (every scoped file read in full; six candidate search groups plus an assignment sweep, all hits resolved); upstream — targeted corroboration for the single material candidate (jshttp/on-finished commit/issue history); runtime — single reproduction on Node v24.19.0 covering import, a 404 and an error request cycle, and the patchAssignSocket dormancy check. Limitation: dynamic reproduction exercised one modern runtime only; EOL Node 0.8 behavior assessed statically.

## Patching verdict

No patching of Node.js was demonstrated anywhere in the inspected runtime scope.

- Shared core mutations (prototypes, module objects, globals, core loading, core source): **0**. Zero hits for prototype/descriptor mutation of core objects, `require.cache`/`Module._*`/loader hooks, `internalBinding`/`process.binding`, or internal-module access across the whole scope.
- Instance/application overrides of core-defined methods: **0 confirmed**. The single genuine override site in scope — on-finished's `patchAssignSocket` (C-001), which installs a wrapping own-property `assignSocket` on a ServerResponse instance — is statically unreachable both via finalhandler's usage and on every Node version the package supports (engines >= 18), and was dynamically confirmed dormant. It is a Node 0.8-only compatibility branch.
- Unresolved candidates: **0**. 16 candidates were traced to their exact writes and all were rejected as patches (ledger in `candidates.md`).
- Excluded branches limiting the verdict: debug's browser entrypoint (`src/browser.js`) is not loaded under plain Node (it was still read: it touches no Node core object); debug's optional `supports-color` require is inert because the module is absent from the resolved tree; the Node 0.8 activation of C-001 lies outside the supported engine range and outside finalhandler's call pattern.

## Confirmed Node.js patches

None. No reachable write or replacement of a core API, global, shared prototype, core-backed instance method, core module loading mechanism, or core source was found. The nearest candidate (dormant `patchAssignSocket`, C-001) is detailed in Supporting context; it is not promoted here because it is unreachable in the inspected scope.

## Candidate ledger and unresolved questions

Full reasoning per candidate in `candidates.md`; summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | on-finished/index.js:189-199 — instance wrapper over `ServerResponse.prototype.assignSocket` | rejected as patch (dormant; Node 0.8 only) | Guard `msg.socket === undefined` (on-finished/index.js:128) can never pass on Node >= 18: OutgoingMessage ctor sets socket to `null` ($NODEJS_SOURCE lib/internal/http/outgoing.js:187; v18.0.0 lib/_http_outgoing.js:134); finalhandler only passes IncomingMessage (index.js:293), which always has a ctor-assigned socket (lib/internal/http/incoming.js:77) and no `assignSocket` (type guard at on-finished/index.js:192 would bail). Dynamically confirmed dormant on v24.19.0 (repro [3]). |
| C-002 | parseurl/index.js:54,84 — `req._parsedUrl`/`req._parsedOriginalUrl` expandos | rejected as patch | Memoization metadata on the request instance; zero name collisions in core http sources; nothing replaced. |
| C-003 | on-finished/index.js:147,164 — `msg.__onFinished` expando | rejected as patch | Library-owned listener-queue metadata; no core collision; cleared after firing. |
| C-004 | finalhandler index.js:250,253 — `res.statusCode`/`res.statusMessage` assignment | rejected as patch | Documented writable API; core prototype defaults at lib/internal/http/server.js:285-286 exist to be shadowed per instance. |
| C-005 | debug/src/node.js:203-211 — `process.env.DEBUG` write/delete (import-time via common.js:287) | rejected as patch | Documented-mutable env map; import round-trips the existing value (repro [1]: env unchanged). Configuration state, no API replaced. |
| C-006 | finalhandler index.js:120-122 — `req.socket.destroy()` | rejected as patch | Public stream/net API call on one connection; read/call only. |
| C-007 | finalhandler index.js:290,294 — `req.unpipe()`/`req.resume()` | rejected as patch | Public Readable API; no mutation. |
| C-008 | debug/src/common.js:8-33,122-139 — writes incl. `defineProperty` on `debug` | rejected as patch | Targets are library-created function objects only. |
| C-009 | debug/src/node.js:18-21 — `util.deprecate` wrapper | rejected as patch | Wraps the library's own no-op; assigned to library exports. |
| C-010 | debug/src/index.js:6-10 + src/browser.js — conditional browser entrypoint | rejected as patch | Not loaded under plain Node; even if loaded, writes only to own exports/localStorage. |
| C-011 | on-finished/index.js:206-235 — async_hooks `AsyncResource` binding | rejected as patch | Documented API; binds the library's own callback; replaces nothing. |
| C-012 | parseurl/index.js:95-142 — fastparse (copied joyent/node#7878 logic), fresh `new Url()` population | rejected as patch | Standalone copy of proposed core logic on library-owned objects; `url` consumed read-only. |
| C-013 | finalhandler index.js:257-274 — `res.removeHeader`/`res.setHeader` | rejected as patch | Documented public methods (lib/internal/http/outgoing.js:813,973), called not replaced. v2.1.1 has no getHeaderNames iteration. |
| C-014 | ee-first/index.js:43,62 — `ee.on`/`ee.removeListener` on req/socket | rejected as patch | Public EventEmitter API with symmetric cleanup. |
| C-015 | statuses/index.js:24-55 — writes on exported `status` object | rejected as patch | Library-owned exports/data only. |
| C-016 | ms/encodeurl/escape-html entrypoints | rejected as patch | Pure computation; zero imports, zero external writes (read in full). |

Unresolved: none.

## Supporting context

- **Dormant Node 0.8 instance override (C-001).** on-finished@2.4.2 ships real monkeypatch code: `patchAssignSocket` (on-finished/index.js:189-199) saves `res.assignSocket` and replaces it with a wrapper **own property on the instance** (the shared `ServerResponse.prototype` is never touched; permanence would be per-response, wrapper calls through to the original). It exists because Node 0.8 did not emit `'socket'` on pipelined responses; modern `assignSocket` emits the event itself ($NODEJS_SOURCE lib/internal/http/server.js:312ff). Triple containment in this scope: finalhandler only hands on-finished the request, never the response (index.js:293); the activation guard `msg.socket === undefined` is unsatisfiable on Node >= 18 (socket initialized to `null`: lib/internal/http/outgoing.js:187, v18.0.0 lib/_http_outgoing.js:134); and `typeof assignSocket !== 'function'` bails for requests. Upstream provenance: jshttp/on-finished@2792e5da141371488dc13191782dfb4986c20b54 "Fix handling of pipelined requests" (fixes jshttp/on-finished#10, https://github.com/jshttp/on-finished/issues/10); the shipped source istanbul-ignores it as "node.js 0.8 patch" (index.js:129,188). Were on-finished used directly on a socketless ServerResponse under Node 0.8, this would be a transient, transitive instance override — it is not reachable from finalhandler on any supported runtime.
- **Instance expandos.** parseurl memoizes onto `req._parsedUrl`/`req._parsedOriginalUrl` (C-002); on-finished stores its queue on `msg.__onFinished` (C-003). Private-API-style metadata on core-backed instances, colliding with no core property at the audited ref; not patches.
- **Copied core-adjacent code.** parseurl's `fastparse` unrolls the regex from joyent/node PR #7878 (C-012) — a standalone copy, not a replacement of `url.parse`, which it still calls for non-fast-path inputs.
- **Aggressive but documented teardown.** On the "headers already sent" error path finalhandler destroys the request socket (index.js:120-122) and unpipes/resumes the request (index.js:290,294) — forceful connection handling via public APIs only.
- **Import-time side effects (debug).** At `require('debug')` time: read-only scan of `process.env` for `DEBUG_*` keys (node.js:124-149), `tty.isatty(process.stderr.fd)` per created namespace (node.js:158), and a value-preserving `process.env.DEBUG` round-trip via `enable(load())` (common.js:287 -> node.js:203-211) (C-005). Runtime logging writes to `process.stderr`. No core object modified; reproduction confirmed env identity after import.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime scope (9 files + codes.json) | Six `rg -n --no-ignore` pattern groups + assignment sweep (full log in `searches.md`) | All hits resolved into C-001..C-016; groups 5 (loader interception) and 6 (bindings/internals) zero-hit across the scope |
| `$PACKAGE_ROOT/index.js`, each dep entrypoint | Read in full | Only shipped file is index.js (`files` in package.json); dep entrypoints confirmed from each package.json `main` |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | `rg -n "assignSocket"` | Core baseline for C-001: definition at :312, emits `'socket'`; prototype defaults statusCode/statusMessage at :285-286 (C-004) |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | `rg -n "this\[kSocket\]|setHeader = |removeHeader = "` | Ctor socket init `null` at :187 (C-001 guard); public setHeader :813 / removeHeader :973 (C-013) |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` | `rg -n "this\.socket"` | IncomingMessage ctor assigns socket at :77 (C-001 reachability) |
| `$NODEJS_SOURCE` http files (internal + classic) | `rg -n "_parsedUrl|_parsedOriginalUrl|__onFinished"` | Zero hits — expando keys collide with nothing (C-002/C-003) |
| `$NODEJS_SOURCE/lib/net.js` | `rg -n "destroy"` | `_destroy` hook at :1168; public destroy() from streams (C-006) |
| Node v18.0.0 / v22.0.0 tags | `git show v18.0.0:lib/_http_outgoing.js`, `git show v22.0.0:lib/_http_outgoing.js` | `this.socket = null` (:134) / `this[kSocket] = null` (:150) — guard for C-001 unsatisfiable across supported range |
| jshttp/on-finished upstream | https://github.com/jshttp/on-finished/commit/2792e5da141371488dc13191782dfb4986c20b54 ; https://github.com/jshttp/on-finished/issues/10 | patchAssignSocket introduced for Node 0.8 pipelining; issue closed; v2.4.2 tag sha 9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a matches installed version |
| Reproduction | `PACKAGE_ROOT=<path> node repro-patch-check.js` (beside this report; output `repro-output.txt`) | Node v24.19.0: zero core prototype/descriptor diffs after import and after 404+error request cycles; env.DEBUG unchanged; fresh ServerResponse socket is `null`; `onFinished(res)` installs no own `assignSocket`; prototype identity preserved |

## Coverage and limitations

- Entry points: `index.js` is the sole shipped runtime file (`files: ["index.js"]`). All eight resolved runtime deps inspected at their installed entrypoints before exclusion; `statuses/codes.json` is data-only. debug's `src/browser.js` read despite being unreachable under plain Node (conditional entrypoint).
- Node.js files examined (read-only, targeted per skill table): lib/internal/http/{server,outgoing,incoming}.js at main @ d44625a4b80c672215b469906ce583ce7eeeebaf; classic lib/_http_server.js confirmed as deprecated re-export (DEP0199) at this ref; lib/net.js destroy check; v18.0.0/v22.0.0 `_http_outgoing.js` via `git show`. No recursive scans of the Node tree.
- Branches tested: import-time initialization (incl. debug's env/tty logic), finalhandler 404 path, error path (status/headers/send), and on-finished attach path on a socketless ServerResponse — all on Node v24.19.0. Not dynamically tested: Node 0.8 activation of C-001 (EOL, outside engines >= 18, and outside finalhandler's call pattern — assessed statically); headers-sent socket-destroy branch (static only: plain public API call); debug browser branch under Electron/nwjs (static only); `supports-color` branch (module absent from resolved tree, require throws and is swallowed).
- What would change the verdict: a different resolved dependency tree (e.g., a `debug` version with import-time core patching, or `supports-color` present and itself patching), use of on-finished on pre-socket ServerResponse objects under Node < 0.10, or future finalhandler code passing `res` to on-finished combined with a Node runtime where fresh responses have `socket === undefined`. None applies to the audited artifacts.
- Provenance (sha256, relative to `$PACKAGE_ROOT`):
  - index.js 99f433943f72fad0a509c9dda0568651376cba29446bdfd595add11aab5aaddc
  - node_modules/on-finished/index.js ecd342e4d92b4f4df3e1af6a1ee4028ced17421702e0ec93fe2dd5afff3a4807
  - node_modules/ee-first/index.js 29d3cccddc7148f48715bfc94eb6f7b9f9132a5ecb704b9d4b713de87e7603dd
  - node_modules/parseurl/index.js 811223d4a19492ccc642384dc84f0af4ad935557dfe8f63750d7ffd673e40f17
  - node_modules/debug/src/index.js aa127ff1752b7d9c7415c5c7bb6994d9aa722b81bcbcab4bd48316b013d23bf3
  - node_modules/debug/src/node.js d7b26d7c92f8ea7794b77ce11f3c11cd18c9084df7c357e3c7025344fa28aac6
  - node_modules/debug/src/common.js dbe83d2bb5837f3c4d7fe537b8004c585987270eceed5b06b8e078deb0ae214a
  - node_modules/debug/src/browser.js 19920671f5902f64ad8ea11767fa50ea9d7a71ae0b7dff7ba5693c0075afc763
  - node_modules/ms/index.js e5f0b6a946a9b2b356a28557728410717df54ea2f599edb619f9839df6b7b0e9
  - node_modules/encodeurl/index.js c5fcd7f1502b03c06d757971056a11e4c0183f59d0e46c17262d37711aa4af07
  - node_modules/escape-html/index.js 42a7f91883d0c5ce9292dda4e017e1f8664d34b09276d89fb6f3859c29d1ca9b
  - node_modules/statuses/index.js 96a0698e899f5889cf254d1f2e351f3253a37921c7f87269b0e87a497dec666a
  - node_modules/statuses/codes.json d2daa083f11600277bd2bf9823bb48ede916a5b0924d2991d6bc4ce331d5604b

## Changes since the previous audit

First audit (PASS A of the blind two-pass protocol); no prior report existed in this pass's folder.
