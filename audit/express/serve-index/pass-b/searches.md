# Search log — serve-index 1.9.2 patch audit (pass B)

All commands run from `$PACKAGE_ROOT` (or `$NODEJS_SOURCE` where noted). Paths
below are root-relative. Skill pattern set applied as separate bounded
searches; dependency searches excluded `test/`, nested `node_modules/`, docs,
and browser-only files where noted.

## Scope establishment

1. `cat package.json` — deps: accepts ~1.3.8, batch 0.6.1, debug 2.6.9, escape-html ~1.0.3, http-errors ~1.8.0, mime-types ~2.1.35, parseurl ~1.3.3; `files`: public/, LICENSE, README.md, index.js. No install scripts.
2. `ls` / `ls public/` / `ls node_modules/` — runtime tree: index.js + public data assets; 15 installed deps (incl. transitive depd, inherits, mime-db, ms, negotiator, setprototypeof, statuses, toidentifier).
3. `git log -1` — commit fc0c0abd890e79c3f16b0ea9cf49551b3ee66ecb ("docs: replace broken links with archived versions (#164)").
4. Per-dep `package.json` main/browser resolution + `find <dep> -name '*.js'` — entrypoints enumerated (debug -> ./src/index.js; depd -> index.js with lib/compat; inherits -> ./inherits.js; batch -> index.js; others -> index.js).

## Pattern set over $PACKAGE_ROOT/index.js

5. `rg -n "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" index.js` — 10 requires (accepts, http-errors, debug, escape-html, fs, path x2, batch, mime-types, parseurl). No node: imports, no dynamic import.
6. `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(" index.js` — one hit: :544 `Buffer.byteLength(body,'utf8')` (read-only call).
7. `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" index.js` — **no hits**.
8. `rg -n -i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b" index.js` — **no hits**.
9. `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks" index.js` — **no hits**.
10. `rg -n "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" index.js` — **no hits**.

## Pattern set over node_modules (runtime files, tests/browser excluded)

11. `rg -n --no-ignore -g '!**/test/**' -g '!**/node_modules/**' -g '!**/*.md' -g '!**/karma.conf.js' -g '!**/browser*.js' -g '!**/inherits_browser.js' -g '*.js' "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" node_modules/` — hits in accepts (own prototype methods), setprototypeof (export selection + fallbacks), http-errors (setPrototypeOf/defineProperty on own errors; own ctor prototypes), depd (defineProperty wrappers, DeprecationError, compat lazyProperty), batch (:51 `Batch.prototype.__proto__ = EventEmitter.prototype`; own methods), negotiator (own prototype methods/aliases), debug/src/browser.js (excluded path). All resolved in candidates.md C-003..C-010, C-018, C-020, C-022.
12. Same scope, module interception pattern (`require\.cache|require\.extensions|Module\._(...)|syncBuiltinESMExports|registerHooks`) — **no hits**.
13. Same scope, internals pattern (`process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/`) — one hit: debug/src/node.js:169 `process.binding('tty_wrap')` (C-014).
14. Same scope, core require inventory (`require\s*\(\s*['\"](node:)?[a-z_]+['\"]\s*\)`) — core modules touched: events (batch, depd/compat), path (mime-types, depd), url (parseurl), util (inherits, debug), tty/fs/net (debug), stream (debug/inspector-log, unreferenced by node entry). Note: relative requires (e.g. depd `./lib/compat`) not matched by this regex — covered by full reads.
15. Same scope, globals/inherits pattern (`\bglobalThis\b|\bglobal\b|\binherits\s*\(|\bextends\b`) — http-errors:123,166,235 `inherits(...)` only (C-004).
16. Same scope, patch-word pattern (case-insensitive `monkey.?patch|patch|shim|polyfill|override|wrap`) — depd wrapper comments (:420,:453,:461), debug DEBUG_FD override comment (:56,:64). No actual patch vocabulary beyond these; resolved via full reads.

## Full file reads (runtime scope)

17. $PACKAGE_ROOT/index.js (692 lines) — fs.stat/readdir/readFile/readFileSync calls only; res API calls; err.status metadata (:143); icon cache on own object (:500-503).
18. node_modules/batch/index.js (174) — C-003/C-023; no EventEmitter.prototype writes; EE ctor never called.
19. node_modules/depd/index.js (523) + lib/compat/{index,callsite-tostring,event-listener-count}.js — C-001/C-002/C-020; compat helpers are standalone copies (CallSite formatter; listeners().length) that mutate nothing.
20. node_modules/http-errors/index.js (300) — require-time chain :15 depd(), :31 populateConstructorExports, :286 deprecate.function; own-instance mutations only.
21. node_modules/parseurl/index.js (159) — C-011/C-012.
22. node_modules/debug/src/{index,node,debug}.js — C-013/C-014/C-015/C-022; `exports.enable(load())` at node.js:248 (require-time env write).
23. node_modules/accepts/index.js (238), negotiator/index.js (82) — C-018; negotiator/lib/*.js pattern-scanned (steps 11-16): zero core references (pure header parsers).
24. node_modules/{setprototypeof,inherits,statuses,mime-types,mime-db,ms,escape-html,toidentifier} — C-009/C-010/C-019/C-021; `rg -n "require|prototype|process|global|defineProp" escape-html/index.js ms/index.js` — **no hits** (pure functions).

## Targeted Node.js baseline reads ($NODEJS_SOURCE, commit d44625a4b80c672215b469906ce583ce7eeeebaf, v28.0.0-pre)

25. `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js` + read :136-170 — `prepareStackTraceCallback` consults `globalThis.Error.prepareStackTrace` when set (:149-156); `Error.stackTraceLimit` managed at :181-188,:248-254. Baseline for F-001.
26. `ls lib/internal/source_map/` + `rg -n "prepareStackTrace" lib/internal/source_map/prepare_stack_trace.js` — `prepareStackTraceWithSourceMaps` (:28,:202); interaction surface for F-001.
27. `rg -n "_parsedUrl|_parsedOriginalUrl" lib/_http_incoming.js` — **negative** (parseurl shadows no core member).
28. `rg -n "Url,|Url:|module.exports" lib/url.js` — `Url` exported at :1025-1027 (documented legacy class).
29. `rg -n "SyncWriteStream" lib/fs.js` — **negative** (removed; debug FILE path dead on modern Node).
30. `rg -n "EventEmitter.prototype.(emit|on|addListener|listeners) =|events === undefined" lib/events.js` + read :548-560 — lazy `_events` init in `_addListener` (:552-555); validates batch's constructor-less inheritance.
31. `rg -n "NODE_(MAJOR|MINOR|PATCH)_VERSION" src/node_version.h`; `git log -1` — v28.0.0-pre @ d44625a4b80c672215b469906ce583ce7eeeebaf.

## Reproduction

32. Wrote `pass-b/repro-error-swap.js`; first version also placed an accessor on `Error.stackTraceLimit` — **failed** (`obj.stack` undefined inside depd/lib/compat): V8 reads `stackTraceLimit` natively and an accessor disables frame capture. Kept as a negative result; final script intercepts only `prepareStackTrace` and compares `stackTraceLimit` by value.
33. `node pass-b/repro-error-swap.js "$PACKAGE_ROOT"` (Node v24.19.0) — output: `prepareStackTrace` writes `["set:prepareObjectStackTrace","set:undefined","set:prepareObjectStackTrace","set:undefined","set:prepareObjectStackTrace","set:undefined"]`; restored to undefined: true; stackTraceLimit 10 -> 10. Confirms 3 swaps at require time, full restoration.

## Upstream corroboration (read-only)

34. `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` — #32 (closed) "Why is this library overwriting Error type?"; #36 (closed) "Incompatible with --enable-source-maps node 12 option"; also #28, #50 (call-site breakage reports, same mechanism).
35. `gh issue view 32 --repo dougwilson/nodejs-depd` — maintainer confirms write pattern + restore intent, cites Node Error.captureStackTrace/stackTraceLimit docs.
36. `gh issue view 36 --repo dougwilson/nodejs-depd` — `node --enable-source-maps -e "require('depd')('x')()"` crash in callSiteLocation on Node 12: concrete core interaction of the swap.
37. `gh search issues --repo expressjs/serve-index "patch monkeypatch"` — **no results**.

## Hashes

38. `shasum -a 256` over index.js and key dependency files — recorded in report.md.
