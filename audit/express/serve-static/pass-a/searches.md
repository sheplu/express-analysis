# Search log — serve-static 2.2.1 pass A

All library searches run from `$PACKAGE_ROOT` (serve-static 2.2.1 @ 6e3606f); Node.js searches from `$NODEJS_SOURCE` (@ d44625a4b80c672215b469906ce583ce7eeeebaf). `--no-ignore` used because the dependency tree lives in node_modules. Test/doc paths excluded from runtime sweeps.

## Scope establishment

1. `ls -la && cat package.json && git log -1` — runtime surface = index.js only (`files: [LICENSE, index.js]`); deps: encodeurl, escape-html, parseurl, send; engines node >= 18; commit matches provenance.
2. `for d in node_modules/*/; do node -e "...print name@version, main, deps"` — 19 packages resolved; versions recorded in report. send@1.2.1 depends on mime-types@3 (no `mime` 1.x/2.x in tree).
3. `find node_modules -name "*.js" -not -path "*/node_modules/*" -not -path "*/test*"` — 25 runtime files (list in report coverage). No nested node_modules.
4. `rg '"(pre|post)?install"|"prepare"' node_modules/*/package.json package.json` — **no matches** (no install-time patch vector).
5. `node -e "require.resolve('supports-color',{paths:['./node_modules/debug']})"` — **not resolvable**; debug's optional color block never runs.

## Skill candidate sweeps (runtime scope: index.js + node_modules, tests excluded)

6. Imports: `rg -n --no-ignore -g '*.js' "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" index.js node_modules/` (non-relative shown) — core modules used: path, url (serve-static); crypto, fs (etag); fs, path, stream, util (send); tty, util (debug); util (inherits); async_hooks (on-finished, try/catch); url (parseurl); path (depd, mime-types). No `node:`-prefixed, no dynamic `import()`.
7. Prototype/descriptor writes: `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign"` — hits: setprototypeof (C-009), debug common.js:122 (C-012), depd:62,485,496-521 (C-010/C-011), inherits_browser (excluded, browser-only), on-finished:181 comment (C-002), send SendStream.prototype.* 19 defs (C-004), http-errors prototype/defineProperty/setPrototypeOf (C-008), etag:29 + statuses:96,109 (`Object.prototype.hasOwnProperty/toString` reads — no write). **No core prototype written anywhere.**
8. Globals/inheritance: `rg -n "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\("` — Buffer.byteLength/isBuffer calls (reads), process.env/stderr/cwd/noDeprecation reads (depd, debug), `process.env.DEBUG =` + `delete process.env.DEBUG` in debug/src/node.js:205,209 (C-003), util.inherits uses (send:155, http-errors:117,160,229 — C-004/C-008). No `class ... extends` of core classes; no globalThis writes.
9. Patch keywords: `rg -n -i "monkey.?patch|\bpatch|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride"` — on-finished:129-130,181,188-189 patchAssignSocket (C-002); on-finished:215-220 AsyncResource wrap (API call); depd wrap comments (C-011); fresh:96 comment ("guard against date.js Date.parse patching" — defensive read); inherits_browser "shim" (excluded). No other patch sites.
10. Module interception: `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks"` — **zero hits**.
11. Bindings/internals: `rg -n "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"` — **zero hits**.

## Targeted follow-up sweeps

12. Core-internal/underscore access: `rg -n "_implicitHeader|_headers\b|_header\b|_headerSent|_writableState|_readableState|outputData|\.connection\b|\bsocket\s*="` — only on-finished:67 (`var socket = msg.socket` — read) and :128 (`msg.socket === undefined` — read). **No send/serve-static hit; no `_implicitHeader` anywhere.**
13. Global/env writes: `rg -n "process\.env\.[A-Za-z_]+\s*=|delete process\.env|Error\.(prepareStackTrace|stackTraceLimit|captureStackTrace)\s*=|Error\.captureStackTrace\("` — debug node.js:205,209 (C-003); depd:386-387 writes + :395-396 restores + :390 capture (C-001); http-errors:89,136,205 captureStackTrace calls (API use, not assignment).
14. depd wrap callers: `rg -n "deprecate\.(function|property)|wrapfunction|wrapproperty"` — definitions in depd (+docs/history) only; **no caller in scope** (C-011 unreachable).
15. Full-file reads: index.js (208 lines), send/index.js (997), on-finished/index.js (246), depd/index.js (head + :120-260 + :380-530), http-errors/index.js (full), debug src/index.js+common.js+node.js (full relevant), parseurl, ee-first, setprototypeof, inherits, etag, fresh, encodeurl, escape-html, toidentifier, ms (head+parse/format), mime-db, mime-types (head+mimeScore), statuses (head), range-parser (head) — remainder of truncated reads swept by searches 6-14.
16. Line pinning: `grep -n "var stack = getStack()|function depd |function getStack|function log " depd/index.js` → 103/108/185/199/381/419/455; `grep -n "createDebug.enable(createDebug.load())" debug/src/common.js` → 287; `grep -n "require('depd')" http-errors/index.js` → 15.

## Node.js baseline verification (targeted, no tree-wide scans)

17. `ls lib/_http_* lib/internal/http*` + `head/tail lib/_http_outgoing.js` — baseline restructured HTTP into lib/internal/http/*; `_http_*` files are DEP0199 re-export shims. Citations use internal files.
18. `grep -n "function OutgoingMessage" lib/internal/http/outgoing.js` → 130; read :130-200 — `this[kSocket] = null` at :187.
19. `grep -n "'socket'" lib/internal/http/outgoing.js` → accessor `ObjectDefineProperty(OutgoingMessage.prototype, 'socket', ...)` at :304 (getter returns `this[kSocket]`) — `res.socket` never `undefined` (C-002 rejection basis).
20. `grep -n "assignSocket" lib/internal/http/server.js` → definition :312, invocations :1275, :1410; read :312-321 and :1395-1430 — socket assigned (or response queued with null slot) before handler runs.
21. `grep -n "legacy|module.exports" lib/stream.js` → :55 `module.exports = require('internal/streams/legacy').Stream`; read legacy.js:1-60 — `Stream.prototype.pipe` at :17 (C-004 baseline).
22. `grep -n "prepareStackTrace" lib/internal/errors.js` → :136-150 `prepareStackTraceCallback` delegates to `globalThis.Error.prepareStackTrace` when it is a function (F-001 core-consultation basis).

## Upstream corroboration (read-only)

23. `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` — found #32 "Why is this library overwriting Error type?" (closed), #36 "--enable-source-maps" (closed), #50, #28, #18.
24. `gh issue view 32 --repo dougwilson/nodejs-depd` — body quotes the audited `getStack()` verbatim; documents collision symptom `callSite.getFileName is not a function`. #36 title/state recorded.
25. `grep -i "assignsocket|0.8" node_modules/on-finished/HISTORY.md` — file not shipped in the installed package (negative); provenance taken from the code comments ("node.js 0.8 patch", "res.on('socket', callback) is broken in 0.8").

## Reproduction

26. `node repro-prepare-stack-trace.js "$PACKAGE_ROOT"` (script beside this report; Node v24.19.0) — output: `repro OK: write+restore at require time; no persistent core mutations; node v24.19.0`. Asserted: accessor-observed set(function)+restore(undefined) on `Error.prepareStackTrace` during require; identity of ServerResponse.prototype.setHeader/assignSocket, OutgoingMessage.prototype.end, Stream.prototype.pipe, EventEmitter.prototype.emit preserved; `process.env.DEBUG` and `Error.stackTraceLimit` unchanged; a served request added no own `setHeader`/`end`/`assignSocket` on `res` and triggered zero further prepareStackTrace writes.
