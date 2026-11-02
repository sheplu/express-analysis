# Search log: serve-static 2.2.1 audit (pass-b)

All commands run from `$PACKAGE_ROOT` unless noted; Node.js commands from
`$NODEJS_SOURCE`. Paths sanitized to those aliases. Dependency trees under
`node_modules` scanned with `--no-ignore`; tests, markdown, and `browser*.js`
variants excluded from candidate scans (out of runtime scope), except where
noted.

## Scope inventory

1. `ls -la && cat package.json && git log -1 --format='%H %s' && ls node_modules`
   -> package v2.2.1 at commit 6e3606f2892df213e8fa738b51a36ba711e86ce8; runtime deps: encodeurl, escape-html, parseurl, send (+ 15 transitive); npm scripts: lint/test/test-ci/test-cov/version only — no install hooks.
2. `for d in node_modules/*/; do ... require('./$d/package.json') ...` (version + main per package)
   -> 19 packages pinned: debug@4.4.3, depd@2.0.0, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, etag@1.8.1, fresh@2.0.0, http-errors@2.0.1, inherits@2.0.4, mime-db@1.54.0, mime-types@3.0.2, ms@2.1.3, on-finished@2.4.2, parseurl@1.3.3, range-parser@1.3.0, send@1.2.1, setprototypeof@1.2.0, statuses@2.0.2, toidentifier@1.0.1.
3. `find node_modules -name '*.js' -not -path '*/node_modules/*/node_modules/*' | sort`
   -> 25 JS files total; send@1.2.1 ships a single `index.js` (no lib/ dir in 1.x); no nested node_modules.
4. `grep -l '"preinstall"\|"postinstall"\|"install"' node_modules/*/package.json`
   -> NEGATIVE (exit 1): no install scripts anywhere in the tree.

## Skill candidate patterns (bounded rg over index.js + node_modules, -g '*.js', excluding tests/docs/browser files)

5. `rg -n --no-ignore "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" ...` (external/core imports; relative requires filtered)
   -> Core modules imported across the tree: path, url, crypto, fs (Stats), fs, stream, util, tty, async_hooks (guarded). All plain requires; no `node:` specifiers, no dynamic `import()`. debug optionally requires `supports-color` (not installed; failure swallowed).
6. `rg -n --no-ignore "\bglobalThis\b|\bglobal\b|\bprocess\.(env|stderr|noDeprecation|traceDeprecation|nextTick|emit|cwd)|\bBuffer\b|\bextends\b|\binherits\s*\(" ...`
   -> Hits: Buffer.byteLength/isBuffer reads (serve-static index.js:202, send index.js:186/388, etag); inherits calls (http-errors:117,160,229; send:155 — library ctors only); depd process.* reads + process.stderr.write + process.emit('deprecation'); debug process.env reads and DEBUG write (-> C-010/C-011). No `class ... extends` of core classes; no globalThis writes.
7. `rg -n --no-ignore "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" ...`
   -> Hits: setprototypeof polyfill (C-006); depd defineProperty sites (C-001/C-008/C-009); http-errors prototype/defineProperty sites (C-007); statuses/etag `Object.prototype.hasOwnProperty/toString` read-only references; send SendStream.prototype.* (C-012); debug defineProperty on own fn (C-011); inherits_browser (out of scope, unreachable). No `Object.assign`, no `Reflect.*` hits anywhere.
8. `rg -n --no-ignore -i "monkey.?patch|\bpatch|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride" ...`
   -> Hits: on-finished `patchAssignSocket` + "node.js 0.8 patch" comments (C-002), on-finished `wrap()` AsyncResource (C-020), fresh comment "guard against date.js Date.parse patching" (comment only — fresh calls Date.parse read-only), depd/debug "Wrap property/function" (C-008/C-011), inherits_browser "old school shim" (unreachable). No monkeypatch libraries (shimmer, require-in-the-middle, etc.) present.
9. `rg -n --no-ignore "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks" index.js node_modules -g '*.js'`
   -> NEGATIVE: zero hits (no module-loading interception).
10. `rg -n --no-ignore "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" index.js node_modules -g '*.js'`
    -> NEGATIVE: zero hits (no native bindings, no internal/core-module requires).

## Full file reads (runtime scope)

11. Read in full: `index.js` (208 lines); `node_modules/send/index.js` (998 lines); depd, on-finished, http-errors, parseurl, ee-first, setprototypeof, inherits(+node path), mime-db, mime-types + mimeScore, debug src/index.js + src/common.js + src/node.js, encodeurl, escape-html, etag, fresh, ms, range-parser, statuses, toidentifier.
    -> Confirms: send calls (never reassigns) res/stream methods; no `res._header`/`_implicitHeader`/`writeHead` usage anywhere in the tree (verified while reading; also no grep hits per #10 for `_http_`); all prototype/defineProperty writes target library-owned objects except C-001/C-002 as ledgered.
12. `grep -n -i "0.8\|assignSocket\|prepareStackTrace" node_modules/on-finished/HISTORY.md node_modules/depd/History.md`
    -> on-finished HISTORY references node.js 0.8-era support ("Remove `supports-color` dependency for node.js 0.8" in depd History); corroborates patchAssignSocket as 0.8 legacy.

## Node.js baseline (targeted reads only; no tree-wide scans)

13. `git log -1 --format='%H'` -> d44625a4b80c672215b469906ce583ce7eeeebaf.
14. `grep -n "this\.socket\|function OutgoingMessage\|kSocket" lib/_http_outgoing.js` -> no implementation hits; `cat lib/_http_outgoing.js lib/_http_server.js` -> both are DEP0199 deprecation shims re-exporting `lib/internal/http/outgoing.js` and `lib/internal/http/server.js`.
15. `grep -n "this\[kSocket\]|function OutgoingMessage" lib/internal/http/outgoing.js` -> `:130` ctor, `:187` `this[kSocket] = null`, `:295-:315` `socket` accessor pair. (C-002 reachability: socket is `null`, never `undefined`.)
16. `grep -n "get headersSent|writableEnded|setHeader|getHeaderNames|getHeader(|removeHeader|\.end =" lib/internal/http/outgoing.js` -> setHeader `:813`, getHeader `:914`, getHeaderNames `:927`, removeHeader `:973`, headersSent getter `:1007`, writableEnded getter `:1014`, end `:1289`. (All send/serve-static res calls are documented APIs.)
17. `grep -n "assignSocket|function ServerResponse|statusCode" lib/internal/http/server.js` + `sed -n '280,330p'` -> `ServerResponse.prototype.statusCode = 200` at `:285`; `assignSocket` at `:312` (sets `socket._httpMessage`, listens 'close', `this.socket = socket`, emits 'socket', `_flush()`).
18. `grep -n "_parsedUrl\|__onFinished" lib/internal/http/incoming.js lib/internal/http/outgoing.js lib/internal/http/server.js`
    -> NEGATIVE: core defines neither key (C-003/C-004 are library-owned).
19. `grep -n "prepareStackTrace" lib/internal/errors.js` -> `:91-:150`: Node's default implementation and `prepareStackTraceCallback` honoring a user-set `globalThis.Error.prepareStackTrace` (baseline for F-001).
20. `grep -n "function createReadStream" lib/fs.js` -> `:3943`; `grep -n "function ReadStream|ReadStream.prototype._destroy" lib/internal/fs/streams.js` -> `:189`, `:324`. (send uses only the public createReadStream/pipe/destroy surface.)

## Upstream corroboration (read-only)

21. `gh api repos/expressjs/serve-static/git/ref/tags/v2.2.1 --jq '.object.sha'` -> 76312e12c2754c226a685201ff43d785455d0590.
22. `gh api repos/pillarjs/send/git/ref/tags/1.2.1 --jq '.object.sha'` -> 096a6148bea0b82ca974fe0016e6eac280869249 (tag `v1.2.1` does not exist -> 404, expected).
23. `gh api repos/dougwilson/nodejs-depd/git/ref/tags/v2.0.0 --jq '.object.sha'` -> 6d59c85d093092e65ec77033576417d743079fa0 (tag `2.0.0` without v -> 404, expected).
24. `gh search issues --repo jshttp/on-finished "assignSocket"` -> 1 closed issue ("onFinished(res) may trigger early", issue 10); no open upstream issue contradicting the C-002 dormancy analysis.

## Reproduction

25. `node repro-check.js "$PACKAGE_ROOT"` (Node v24.19.0, script beside this report):
    - First attempt instrumented `Error.stackTraceLimit` with an accessor -> V8 disabled stack capture (`obj.stack` undefined inside depd getStack) — itself evidence that V8 requires a data property there; script adjusted to snapshot the limit by value.
    - Final run: `Error.prepareStackTrace` writes during require: 2 (`prepareObjectStackTrace`, then restore of the saved original `ErrorPrepareStackTrace`); prepareStackTrace restored: true; stackTraceLimit value restored: true; Error.captureStackTrace unchanged; ServerResponse.prototype setHeader/getHeader/removeHeader/writeHead/end/assignSocket/emit unchanged; fs.createReadStream, fs.stat, fs.ReadStream.prototype.pipe, Stream.prototype.pipe unchanged.

## Not searched / exclusions

- Other audit outputs under the audit root: deliberately not read (double-blind protocol).
- `$NODEJS_SOURCE` lib/src/test trees: no recursive scans; only the targeted files above.
- test/, scripts/, *.md, browser variants in the package tree: out of runtime scope (noted where patterns matched them).
