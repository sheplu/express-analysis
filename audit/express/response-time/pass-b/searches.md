# Search log: response-time@2.3.4 patch audit (pass-b)

All library commands run from `$PACKAGE_ROOT`; Node.js commands from `$NODEJS_SOURCE`
(commit d44625a4b80c672215b469906ce583ce7eeeebaf). Paths shown repo-relative.

## 1. Scope establishment

| # | Command | Result |
| --- | --- | --- |
| S-01 | `ls -la` ($PACKAGE_ROOT) | Runtime file: index.js only (plus test/, docs, configs). node_modules present. |
| S-02 | `cat package.json` | version 2.3.4; deps: depd ~2.0.0, on-headers ~1.1.0; `files: [LICENSE, HISTORY.md, index.js]`; no install scripts; main defaults to index.js; engines >= 0.8. |
| S-03 | `git log -1 --format='%H %s'` | 3bd2651ea7fcf409ea780954e3113b3aaa0feb84 — matches stated provenance. |
| S-04 | `ls node_modules node_modules/depd node_modules/on-headers` | depd (index.js + lib/browser/index.js), on-headers (index.js). No other runtime deps. |
| S-05 | `cat node_modules/.package-lock.json` | depd@2.0.0 (integrity sha512-g7nH6P…), on-headers@1.1.0 (integrity sha512-737ZY3…). Both leaf packages (no transitive deps). |
| S-06 | `cat node_modules/depd/package.json`, `node_modules/on-headers/package.json` | depd `browser: lib/browser/index.js` (bundler-only); on-headers no alternate entry. |
| S-07 | Full-file reads | $PACKAGE_ROOT/index.js (98 lines), node_modules/on-headers/index.js (180), node_modules/depd/index.js (538), node_modules/depd/lib/browser/index.js (~75). |

## 2. Candidate pattern sweeps (skill pattern set)

Each run: `rg -n --no-ignore '<pattern>' index.js node_modules/depd/index.js node_modules/depd/lib/browser/index.js node_modules/on-headers/index.js`

### P1 — `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`
- depd/index.js:11 `require('path').relative` (core read)
- index.js:16 `require('depd')('response-time')` — depd activation (-> C-005)
- index.js:17 `require('on-headers')`
- on-headers/index.js:16 `require('http')` (core read, feature detection)
- No `node:` imports, no dynamic import, no ESM.

### P2 — `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`
- depd/index.js:23,154,159,170,175,186,251,256,260 — process reads, `process.emit`, `process.stderr.write` (-> C-010, C-011)
- index.js:53,56 — `process.hrtime` (-> C-012)
- No Buffer, globalThis, global, extends, or inherits hits.

### P3 — `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`
- on-headers/index.js:19 — read of `http.ServerResponse.prototype.appendHeader` (-> C-002)
- depd/index.js:62,485 — defineProperty in convertDataDescriptorToAccessor/wrapproperty (-> C-007, C-008)
- depd/index.js:496,500,507,514,521 — defineProperty on own DeprecationError instance (-> C-009)
- No __proto__ / setPrototypeOf / Reflect.* / Object.assign hits.

### P4 — `-i 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'`
- depd/index.js:436,469,477 and depd/lib/browser/index.js:57 — comments only ("Wrap property…", "wrap getter/setter") (-> C-007, C-014). No code hits.

### P5 — `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`
- NO MATCHES (exit 1) (-> C-015). No module-loading interception.

### P6 — `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`
- NO MATCHES (exit 1) (-> C-016). No bindings/internal-module access.

### P7 (supplemental direct-write/codegen sweep) — `res\.[A-Za-z_]+\s*=[^=]|Error\.[A-Za-z]+\s*=[^=]|http\.[A-Za-z.]+\s*=[^=]|new Function|\beval\s*\(`
- depd/index.js:386,387,395,396 — Error.prepareStackTrace/stackTraceLimit writes + restores (-> C-005 / F-002)
- depd/index.js:425 — `new Function` in wrapfunction (-> C-006)
- on-headers/index.js:71 — `res.writeHead =` (-> C-001 / F-001)
- No `eval`, no writes to the `http` module object.

(Full-file reads additionally covered assignment forms the regexes could miss —
computed keys, deletions, descriptor edits: none found beyond the ledger.)

## 3. Node.js baseline verification (targeted only; no tree-wide scans)

| # | Command | Result |
| --- | --- | --- |
| N-01 | `rg -n "ServerResponse|_http_server|internal/http/server" lib/http.js` | ServerResponse re-exported from internal/http/server (lib/http.js:56-57, exported :271). |
| N-02 | `rg -n "writeHead|module.exports|internal/http/server" lib/_http_server.js` | Legacy file re-exports from internal/http/server (:34-37); no separate writeHead. |
| N-03 | `rg -n "writeHead|appendHeader" lib/internal/http/server.js` | `ServerResponse.prototype.writeHead = writeHead` at :423; `_implicitHeader` calls writeHead at :419-421; array-header appendHeader use at :468. |
| N-04 | `sed -n '405,495p' lib/internal/http/server.js` | Read full writeHead contract: status validation, header merge (object -> setHeader; 1D array -> removeHeader+appendHeader :459-468), `this.statusCode = statusCode` :446, status-line build. Baseline for F-001. |
| N-05 | `rg -n "appendHeader" lib/internal/http/outgoing.js` | `OutgoingMessage.prototype.appendHeader` at :877 (target of on-headers feature check C-002). |
| N-06 | `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js` | Userland hook consulted :149-156; default ErrorPrepareStackTrace :165-168; core's own save/zero/restore of stackTraceLimit :181-188, :416-419. |
| N-07 | `sed -n '85,170p' lib/internal/errors.js` | Read prepareStackTraceCallback contract. Baseline for F-002. |
| N-08 | `git log -1 --format='%H'`; `grep NODE_*_VERSION src/node_version.h` | d44625a4b80c672215b469906ce583ce7eeeebaf; v28.0.0-pre. |

## 4. Upstream corroboration (read-only)

| # | Command/source | Result |
| --- | --- | --- |
| U-01 | `gh api /advisories/GHSA-76c9-3jph-rj3q` | "on-headers is vulnerable to http response header manipulation"; severity low; published 2025-07-17; vulnerable < 1.1.0; first patched 1.1.0. Confirms the writeHead replacement path is real, production-reachable, and behavior-bearing. |
| U-02 | `head node_modules/on-headers/HISTORY.md` | 1.1.0 fixes CVE-2025-7339; 1.0.2 (2019): "Fix `res.writeHead` patch missing return value" — upstream's own description of the mechanism as a patch. |
| U-03 | `head $PACKAGE_ROOT/HISTORY.md` | 2.3.4 = deps bump on-headers ~1.1.0 (CVE fix); 2.3.3 = deps depd ~2.0.0 ("Remove use of eval"). |

## 5. Reproduction

| # | Command | Result |
| --- | --- | --- |
| R-01 | `node repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | Error.prepareStackTrace writes during require: ["prepareObjectStackTrace","ErrorPrepareStackTrace"]; restored to pre-require value: true; prototype writeHead identity unchanged (after require, after full request): true; res own-property writeHead before middleware: false, after: true; shadow !== prototype method: true; replacement named "writeHead"; x-response-time header present: true. Output: repro/repro-output.txt. |
| R-02 | `shasum -a 256 <runtime files>` | Hashes recorded in report.md Sources section. |

Note: a first repro revision compared the restored value against `undefined`;
corrected to compare against the captured pre-require value (modern Node installs
its default `ErrorPrepareStackTrace` on the Error constructor at bootstrap). The
corrected run confirms exact restoration.

## 6. Explicitly not searched

- No recursive scan of $NODEJS_SOURCE lib/src/test trees (targeted files per skill table only).
- No other audit output read (double-blind protocol): nothing under the audit/ root except this pass's own directory.
- $PACKAGE_ROOT/test/ and docs excluded from candidate sweeps (out of scope), except noting their existence.
