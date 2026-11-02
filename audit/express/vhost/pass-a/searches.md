# Search log: vhost 3.0.2 patch audit (pass A)

All library searches ran from `$PACKAGE_ROOT` (expressjs/vhost @ f41a9ec, v3.0.2). Node.js baseline reads ran from `$NODEJS_SOURCE` (main @ d44625a4b80). Runtime scope = `index.js` (sole shipped runtime file); tests/docs excluded per task scope.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 0a | `cat package.json` | v3.0.2; no `dependencies`/`optionalDependencies`/`peerDependencies` (devDependencies only); `files: [LICENSE, README.md, index.js]`; scripts = lint/test/test-ci/test-cov; engines `>= 0.8.0`. |
| 0b | `ls -la` / `ls node_modules` | Shipped tree: index.js + docs/tests/config. `node_modules` absent/empty → zero resolved runtime deps. |
| 0c | `git log -1 --format='%H %s'` | `f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99` — matches task provenance. |
| 0d | Read `index.js` in full (164 lines) | Single middleware factory; no imports of any kind. |
| 0e | `shasum -a 256 index.js package.json LICENSE` | index.js `1e9e6a3b...f8d843`; package.json `d13daebb...8516c0`; LICENSE `a5a40f01...7818a9`. |

## Skill candidate pattern set (P1-P6) over `index.js`

| # | Pattern (`rg -n` over index.js) | Result |
| --- | --- | --- |
| P1 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | NEGATIVE (exit 1) — zero module imports. |
| P2 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | NEGATIVE (exit 1). |
| P3 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | 1 hit: line 102 `Object.prototype.toString.call(val)` → C-002 (read-only). |
| P4 | `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b` | NEGATIVE (exit 1). |
| P5 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | NEGATIVE (exit 1). |
| P6 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | NEGATIVE (exit 1). |

## Supplementary write-detection sweeps (S1-S7) over `index.js`

| # | Pattern / command | Result |
| --- | --- | --- |
| S1 | `req\.[A-Za-z_$]+\s*=[^=]|res\.[A-Za-z_$]+\s*=[^=]` | 1 hit: line 61 `req.vhost = vhostdata` → C-001. No writes on `res` at all. |
| S2 | `\bdelete\b` | NEGATIVE. |
| S3 | `Object\.(create|freeze|seal|getOwnProperty|getPrototypeOf)` | 1 hit: line 153 `Object.create(null)` → C-004 (library-owned object). |
| S4 | `\.emit\s*\(|\.on\s*\(|removeListener|removeAllListeners|listeners\s*\(` | NEGATIVE — no event/emitter tampering. |
| S5 | `\[[^\]]*\]\s*=[^=]` (computed-member assignment) | 1 hit: line 160 `obj[i - 1] = match[i]` → C-004. |
| S6 | `rg -n "=[^=]" index.js` minus `===/!==/==/<=/>=` (full assignment inventory) | 23 assignments; all classified in candidates.md; only line 61 touches a live core-backed object. |
| S7 | `rg -n "install|prepare|preinstall|postinstall" package.json`; `cat .npmrc` | NEGATIVE for lifecycle hooks; .npmrc is install-policy only → C-008. |

## Node.js baseline verification (targeted reads only)

| # | Command | Result |
| --- | --- | --- |
| N1 | `git log -1 --format='%H'` in `$NODEJS_SOURCE` | `d44625a4b80c672215b469906ce583ce7eeeebaf`. |
| N2 | `grep -n "vhost" $NODEJS_SOURCE/lib/_http_incoming.js $NODEJS_SOURCE/lib/http.js` (via rg, then grep) | NEGATIVE — no core member named `vhost`. |
| N3 | Read `$NODEJS_SOURCE/lib/_http_incoming.js` (45 lines) | Deprecated re-export shim (DEP0199) → implementation at `lib/internal/http/incoming.js`. Note: initial `rg` over this file returned nothing due to local tool filtering; re-ran with `grep`/`sed` and confirmed content. |
| N4 | `grep -n "vhost" $NODEJS_SOURCE/lib/internal/http/incoming.js $NODEJS_SOURCE/lib/http.js` | NEGATIVE — confirms C-001 key is not core-owned. |
| N5 | `grep -n "IncomingMessage.prototype" $NODEJS_SOURCE/lib/internal/http/incoming.js` | Member inventory: `connection`, `headers` (line 125), `headersDistinct`, `trailers`, `trailersDistinct`, `signal`, `setTimeout`, `_read`, `_destroy`, `_addHeaderLine*`, `_dump*`. No `vhost`, no `host`/`hostname` prototype members overridable by C-001. |
| N6 | `sed -n '125,145p' $NODEJS_SOURCE/lib/internal/http/incoming.js` | `headers` is an `ObjectDefineProperty` get/set accessor backed by `kHeaders`; vhost only reads it (C-003). |

## Upstream corroboration (read-only)

| # | Command | Result |
| --- | --- | --- |
| U1 | `gh search issues --repo expressjs/vhost "patch"` | `[]` — no results. |
| U2 | `gh search issues --repo expressjs/vhost "prototype"` | `[]` — no results. |
| U3 | `git log --oneline -n 10 -- index.js`; `cat HISTORY.md` | Only perf/lint/doc changes since 3.0.0; 3.0.0 removed sub-http-server support. |
| U4 | `git show 711882a -- index.js` | Removed `createHandle` using `server.emit('request', req, res)` (public API, pre-3.0 only) → C-009 historical. |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R1 | `node repro-no-mutation.js "$PACKAGE_ROOT"` (Node v24.19.0) | `own properties added to live req: ["vhost"]`; `core IncomingMessage.prototype has own "vhost": false`; `RESULT: no core prototype/global mutation detected` (checked IncomingMessage/ServerResponse/Server prototypes, Object/Function/String/RegExp prototypes, and the `headers` accessor descriptor identity before/after load+dispatch). Exit 0. |
