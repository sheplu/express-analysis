# Search log: vhost 3.0.2 patch audit (pass-b, independent)

All library searches run from `$PACKAGE_ROOT` (git f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99); Node.js searches from `$NODEJS_SOURCE` (git d44625a4b80c672215b469906ce583ce7eeeebaf). `exit=1` from rg = no matches (negative result).

## Scope establishment
| # | Command | Result |
| --- | --- | --- |
| S-01 | `ls -la $PACKAGE_ROOT` | Shipped tree: index.js, package.json, package-lock.json, test/, docs, lint config. No node_modules, no dist/, no bundled output. |
| S-02 | `cat package.json` | v3.0.2; no `dependencies` field; `files`: [LICENSE, README.md, index.js]; no `main`/`exports`/`bin`; scripts are lint/test only (no install hooks). |
| S-03 | `git log -1 --format='%H %s'` | f41a9ec0be980f70f82a6ebc4854a2fa8eea3d99 — matches stated provenance. |
| S-04 | `ls node_modules` | "No such file or directory" — zero resolved runtime dependencies. |
| S-05 | `rg -n '"main"|"exports"|"bin"|"preinstall"|"postinstall"|"install"' package.json` | exit=1 — no alternate entrypoints or lifecycle scripts. |
| S-06 | `shasum -a 256 index.js package.json` | index.js 1e9e6a3b35ea4eeb4c18f25d25219f3ad03f2d06b8b5da0f31f7a36cb6f8d843; package.json d13daebbb3f9c64e7160020e955959fd4081f9831d66476a06313b90f98516c0 |
| S-07 | Full read of `index.js` (164 lines) | Complete manual review of the only runtime file. |

## Skill candidate pattern set over `$PACKAGE_ROOT/index.js`
| # | Pattern (`rg -n` unless noted) | Result |
| --- | --- | --- |
| S-10 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | exit=1 — NO imports at all; vhost loads no core modules. |
| S-11 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | exit=1 — no globals or core-class inheritance. |
| S-12 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | 1 hit: index.js:102 `Object.prototype.toString.call(val)` (read-only) -> C-003. |
| S-13 | `rg -n -i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b"` | exit=1 — negative. |
| S-14 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | exit=1 — no module-loading interception. |
| S-15 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | exit=1 — no bindings/internal access. |

## Exhaustive write inventory over `$PACKAGE_ROOT/index.js`
| # | Command | Result |
| --- | --- | --- |
| S-20 | `rg -n "delete |Object\.(freeze|seal|preventExtensions)|=\s" index.js` | 28 hits, all classified: module.exports (:15 -> C-001), module-level regex constants (:22-26), local vars/comparisons (:46,51,54,83,86,88,102,113,118,147), local string reassignment (:119,124), `req.vhost` (:61 -> C-002), `obj` writes (:153-160 -> C-005), header reads (:77,140 -> C-004). No deletes/freezes. |
| S-21 | `rg -n "req\.|res\." index.js` | 3 hits: :61 write `req.vhost`; :77,:140 reads `req.headers.host`. `res` is never touched (pass-through only, :64 dispatch -> C-006). |

## Node.js baseline verification (targeted reads only)
| # | Command | Result |
| --- | --- | --- |
| S-30 | `rg -n -i "vhost" $NODEJS_SOURCE/lib/_http_incoming.js` | exit=1 — negative. |
| S-31 | `rg -n -i "vhost" $NODEJS_SOURCE/lib/http.js` | exit=1 — negative. |
| S-32 | `ls $NODEJS_SOURCE/lib | grep -i http; ls lib/internal/http/` | At this ref HTTP implementation lives in `lib/internal/http/*.js`; `lib/_http_incoming.js` is a deprecated re-export shim (DEP0199). |
| S-33 | `cat $NODEJS_SOURCE/lib/_http_incoming.js` | Confirms re-export of `internal/http/incoming`; no `vhost` member in export list. |
| S-34 | `rg -n -i "vhost" $NODEJS_SOURCE/lib/internal/http/incoming.js` | exit=1 — `vhost` is not a core member of IncomingMessage. Confirms C-002 rejection. |
| S-35 | `rg -n "this\.[A-Za-z_]+ =" lib/internal/http/incoming.js` | IncomingMessage own properties: socket, httpVersion*, complete, rawHeaders, rawTrailers, joinDuplicateHeaders, aborted, upgrade, url, method, statusCode, statusMessage, client, _consuming, _dumped — no `vhost`. |
| S-36 | `rg -n "headers" lib/internal/http/incoming.js` + `sed -n 125,160p` | `headers` is a lazy accessor on IncomingMessage.prototype (ObjectDefineProperty at :125, getter/setter). Confirms C-004 read path. |
| S-37 | `rg -n "'host'|\"host\"|matchKnownFields" lib/internal/http/incoming.js` | `host` is a known first-wins parsed field (:356 `kHost = knownField('host', kFirstWins)`, :411 match). |

## Upstream corroboration (read-only)
| # | Query | Result |
| --- | --- | --- |
| S-40 | `gh search issues --repo expressjs/vhost "monkeypatch OR monkey-patch OR patch prototype"` | `[]` — no results. |
| S-41 | `gh api 'search/issues?q=repo:expressjs/vhost+prototype+OR+monkeypatch'` | 3 unrelated items: #63/#60 eslint-plugin-import dev-dep bumps (closed), #3 wildcard subdomain matching feature (closed). Nothing patch-related. |

## Not searched (deliberate, per skill)
- No recursive scan of `$NODEJS_SOURCE` lib/src/test trees; only the HTTP incoming-message contract files were read (chosen from the observed target API: req object + headers).
- No other-auditor output consulted (double-blind protocol).
- `test/`, README, lint configs: out of runtime scope (no runtime activation path).
