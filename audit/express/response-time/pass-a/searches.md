# Search log: response-time@2.3.4 pass A

All library searches run from `$PACKAGE_ROOT` over the scoped runtime files only
(`index.js`, `node_modules/depd/index.js`, `node_modules/depd/lib/browser/index.js`,
`node_modules/on-headers/index.js`), with `--no-ignore` since the dependencies live
under `node_modules`. Node.js core lookups were targeted file reads/greps only — no
recursive core scans.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 0a | `ls -la "$PACKAGE_ROOT" && cat package.json` | Runtime surface = `index.js` only (`files`: LICENSE, HISTORY.md, index.js); deps `depd ~2.0.0`, `on-headers ~1.1.0`; no install/prepare scripts; engines `>= 0.8.0`. |
| 0b | `git log -1 --format='%H %ci'` (in `$PACKAGE_ROOT`) | `3bd2651ea7fcf409ea780954e3113b3aaa0feb84` (2026-03-02) — matches assigned provenance. |
| 0c | `ls "$PACKAGE_ROOT/node_modules"` | `depd`, `on-headers` only. |
| 0d | `cat node_modules/{depd,on-headers}/package.json` | depd@2.0.0 (browser field -> `lib/browser/index.js`), on-headers@1.1.0; file listings: depd ships `index.js` + `lib/browser/index.js`; on-headers ships `index.js` only. |
| 0e | Full reads: `index.js` (98 lines), `node_modules/depd/index.js` (539 lines), `node_modules/on-headers/index.js` (181 lines), `node_modules/depd/lib/browser/index.js` (77 lines) | Complete runtime code reviewed line by line. |

## Candidate searches (skill patterns S1-S6, plus targeted S7-S8)

| # | Pattern (`rg -n --no-ignore` over the 4 scoped files) | Hits / disposition |
| --- | --- | --- |
| S1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | 4 hits: index.js:16 (`depd`), index.js:17 (`on-headers`), on-headers/index.js:16 (`http`), depd/index.js:11 (`path`). -> C-001, C-003 leads; `http`/`path` are plain builtin requires. |
| S2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | 11 hits, all `process.*`: index.js:53,56 (hrtime reads); depd:23 (cwd), :154/:170 (flag reads), :159/:175 (env reads), :186 (listenerCount), :251 (`process.emit('deprecation')`), :256/:260 (stderr). No Buffer/global/inheritance hits. -> C-004, C-012, C-013. |
| S3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | 8 hits: on-headers:19 (prototype read -> C-006); depd:62,:485 (defineProperty in wrapproperty helpers -> C-010); depd:496,:500,:507,:514,:521 (defineProperty on own DeprecationError -> C-011). No `__proto__`/`setPrototypeOf`/`Reflect`/`Object.assign`. |
| S4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | 4 hits, all comments about depd's own wrap helpers (depd:436,:469,:477; browser:57). No hidden patch vocabulary. |
| S5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | **0 hits** — no module-loading interception. |
| S6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | **0 hits** — no native/internal module access. |
| S7 | `Error\.(prepareStackTrace\|stackTraceLimit\|captureStackTrace)` (targeted; S2 pattern does not cover `Error`) | 7 hits, all depd getStack(): :382,:384 (saves), :386,:387 (writes), :390 (captureStackTrace), :395,:396 (restores). -> C-008 / F-002. |
| S8 | `writeHead\|res\.\w+\s*=\|this\.statusCode\s*=\|statusMessage` over index.js + on-headers | on-headers:23 (comment "Create a replacement writeHead method"), :34 (wrapper), :71 (`res.writeHead =` write -> C-005 / F-001), :129 (`this.statusCode =` -> C-007). No `statusMessage` manipulation. |
| S9 | Full read `node_modules/depd/lib/browser/index.js` | No-op implementations only; browser-only entry. -> C-014. |
| S10 | `rg -n '"node_modules/depd"\|"node_modules/on-headers"' -A 4 package-lock.json` | depd@2.0.0 (integrity sha512-g7nH6P...), on-headers@1.1.0 (integrity sha512-737ZY3...) — resolved versions match installed trees. |

## Node.js core verification (targeted, at `$NODEJS_SOURCE` commit d44625a4b80c672215b469906ce583ce7eeeebaf)

| # | Command | Result |
| --- | --- | --- |
| N1 | `ls lib/_http_server.js lib/internal/http/server.js` | Both exist at this commit. |
| N2 | `rg -n "function writeHead\|writeHead =" lib/internal/http/server.js lib/_http_server.js` | `lib/internal/http/server.js:423` `ServerResponse.prototype.writeHead = writeHead;`, `:424` implementation. No definition in `_http_server.js`. |
| N3 | `grep -n "require('internal/http/server')" lib/_http_server.js` | `:34` — public `_http_server` re-exports the internal implementation. |
| N4 | Read `lib/internal/http/server.js:330-520` | Core `writeHead` contract: ERR_HTTP_HEADERS_SENT guard, 100-999 validation, statusMessage/statusCode assignment, kOutHeaders merge (remove-then-append for arrays :455-468) vs fast path (`headers = obj` :483), status line build :486-497, `_storeHeader` :520. `_implicitHeader` at :419-421 calls `this.writeHead(...)` (instance dispatch — the on-headers wrapper intercepts implicit flush). |
| N5 | `grep -n "prepareStackTrace\|stackTraceLimit" lib/internal/errors.js` + read `:86-175` | `prepareStackTraceCallback` :136-163 honors userland `globalThis.Error?.prepareStackTrace` (:149-150) and main-context `Error.prepareStackTrace` (:155-156); `defaultPrepareStackTrace` :96-112; core's own transient stackTraceLimit save/restore :181-188, :416-419. Baseline for F-002. |

## Upstream corroboration (read-only)

| # | Query | Result |
| --- | --- | --- |
| U1 | `cat $PACKAGE_ROOT/HISTORY.md` | 2.3.4 (2025-07-17): deps on-headers@~1.1.0 to fix CVE-2025-7339 / GHSA-76c9-3jph-rj3q; 2.0.0 (2014): "use `on-headers` module". |
| U2 | `cat node_modules/on-headers/HISTORY.md` | 1.1.0: CVE-2025-7339 fix; 1.0.2 (2019): "Fix `res.writeHead` patch missing return value" — upstream names the wrapper a patch; 1.0.0: "Honor `res.statusCode` change in `listener`". |
| U3 | `gh api /repos/expressjs/on-headers/security-advisories/GHSA-76c9-3jph-rj3q` | CVE-2025-7339, "on-headers vulnerable to http response header manipulation", severity low, vulnerable `<1.1.0`, published 2025-07-17. Audited version contains the fix. |

## Reproductions (Node v24.19.0; scripts beside the report)

| # | Command | Result |
| --- | --- | --- |
| R1 | `node repro-onheaders.js "$PACKAGE_ROOT"` | own writeHead before middleware: false; after: true; `res.writeHead === ServerResponse.prototype.writeHead`: false; prototype unchanged: true; `x-response-time` set on implicit `res.end()` path: true. |
| R2 | `node repro-depd.js "$PACKAGE_ROOT"` | writes to `Error.prepareStackTrace` during `require('response-time')`: `["prepareObjectStackTrace","sentinelPrepare"]`; restored to sentinel: true; `Error.stackTraceLimit` restored: true. |

## Negative results summary

- No module interception, no `internalBinding`/`process.binding`, no `__proto__`/`setPrototypeOf`, no prototype writes (only one prototype *read*, on-headers:19), no `Object.assign` onto core objects, no install scripts, no bundled/dist entrypoints, no on-disk core modification.
