# Search log — serve-index 1.9.2 patch audit (pass A)

All commands were run from `$PACKAGE_ROOT` unless marked `$NODEJS_SOURCE`. Common scope filters on package-wide `rg` sweeps: `--no-ignore -g '!node_modules/*/node_modules' -g '!*/test/**' -g '!*.md' -g '!*.d.ts'` (plus `-g '!*.json'` where noted) over `index.js` and `node_modules/`.

## Scope establishment

1. `cat package.json` / `ls -la` / `git log -1 --format='%H %s'` / `ls node_modules`
   - Result: serve-index 1.9.2 at fc0c0abd890e79c3f16b0ea9cf49551b3ee66ecb; runtime files `index.js` + `public/`; 15 resolved runtime deps (accepts, batch, debug, depd, escape-html, http-errors, inherits, mime-db, mime-types, ms, negotiator, parseurl, setprototypeof, statuses, toidentifier). No `main` override, no install scripts in serve-index.
2. `grep -E '"(main|version)"' node_modules/*/package.json`
   - Result: versions/entrypoints pinned — accepts@1.3.8, batch@0.6.1 (`main: index`), debug@2.6.9 (`main: ./src/index.js`), depd@1.1.2, escape-html@1.0.3, http-errors@1.8.1, inherits@2.0.4 (`./inherits.js`), mime-db@1.52.0, mime-types@2.1.35, ms@2.0.0, negotiator@0.6.3, parseurl@1.3.3, setprototypeof@1.2.0, statuses@1.5.0, toidentifier@1.0.1.
3. `grep -l -E '"(pre|post)?install"' node_modules/*/package.json`
   - Result: none (no install scripts anywhere in the tree).

## Candidate sweeps (skill patterns)

4. `rg -n "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" index.js node_modules/`
   - Hits: `batch/index.js:51` (`Batch.prototype.__proto__ = EventEmitter.prototype` -> C-004); `setprototypeof/index.js:3-17` (-> C-006); `http-errors/index.js:145,148,156,169-171,214,217,225,238-240,255` (-> C-007/C-008); `depd/index.js:64,469,480-505` + `depd/lib/compat/index.js:57,66` (-> C-012/C-013 and the lazyProperty helper); `negotiator/index.js:38-82`, `accepts/index.js:82-195` (own prototypes -> C-018); `inherits/inherits_browser.js` (browser-only); `debug/src/browser.js:123` (browser-only). No hits in serve-index `index.js` itself.
5. `rg -n "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks|process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" index.js node_modules/`
   - Single hit: `debug/src/node.js:169` `process.binding('tty_wrap')` (-> C-015/F-002). Negative: no module-loading interception, no internal module imports anywhere.
6. `rg -n "monkey.?patch|\bshim\b|\bpolyfill\b|\boverride\b|\bpatch\b" index.js node_modules/`
   - Hits: only comments/metadata (`inherits_browser.js:17` comment, `setprototypeof/package.json` description, `debug/src/node.js:56` comment) and `mime-db/db.json` media-type names containing "patch". Negative for actual patch code.
7. `rg -n "\bglobalThis\b|\bglobal\b\s*[.\[=]|process\.env\s*=|process\.(stdout|stderr)\s*=|Buffer\.(prototype|from\s*=|alloc\s*=)" index.js node_modules/` (code files only)
   - No hits: no global-object writes, no stdout/stderr replacement, no Buffer tampering.
8. `rg -n "(req|request|res|response)\.[A-Za-z_$]+\s*=[^=]" index.js node_modules/accepts/ node_modules/negotiator/ node_modules/parseurl/`
   - Hits: `index.js:103` (`res.statusCode =`, documented -> C-001); `parseurl/index.js:54,84` (`req._parsedUrl`/`req._parsedOriginalUrl` -> C-017). Negative: accepts/negotiator never write to req/res.
9. `rg -n "require\s*\(\s*['\"](fs|path|events|util|url|tty|net|http|stream|buffer|os|crypto|zlib|child_process|module|vm)['\"]\s*\)" index.js node_modules/`
   - Core-import inventory: serve-index (fs, path), batch (events), debug (tty, util; fs/net lazily inside the DEBUG_FD branch; stream only in never-required `inspector-log.js`), depd (path), depd/lib/compat (events), inherits (util), mime-types (path), parseurl (url). Negative: no `http`, `module`, `vm`, `child_process` anywhere.
10. `rg -n "\bBuffer\b" index.js node_modules/` (code files)
    - Single hit: `index.js:544` `Buffer.byteLength(body, 'utf8')` — read-only documented API.
11. `rg -n "process\.(emit|on|noDeprecation|traceDeprecation|cwd|nextTick|env\.DEBUG)" index.js node_modules/`
    - Hits: batch defer alias (C-005), debug env.DEBUG read/write (C-016), depd cwd/noDeprecation/traceDeprecation reads and `process.emit('deprecation')` (C-014). All triaged.
12. `rg -n "\binherits\s*\(|\bextends\b" index.js node_modules/` (code files)
    - Hits: http-errors inherits calls (C-007), inherits_browser (browser-only). No `class ... extends` of core classes.
13. `rg -n "inspector-log" node_modules/debug/src/`
    - Negative: `debug/src/inspector-log.js` is never required by any loaded file.

## Full/targeted reads of runtime code

14. Full reads: `index.js` (692 lines), `node_modules/batch/index.js` (full, per brief), `node_modules/http-errors/index.js` (full), `node_modules/depd/index.js` (full), `node_modules/depd/lib/compat/index.js` (full), `node_modules/setprototypeof/index.js` (full), `node_modules/parseurl/index.js` (full), `node_modules/debug/src/index.js` + `src/node.js` (full) + `src/debug.js` (head + targeted), `node_modules/inherits/inherits.js`, `node_modules/mime-db/index.js`, `node_modules/toidentifier/index.js` (full); heads of accepts, negotiator, mime-types, statuses, ms, escape-html (initialization + export surface).
15. Line verification: `grep -n` for every cited write in `debug/src/node.js` and `depd/index.js`/`lib/compat/index.js` — offsets in report/ledger match the installed artifacts (pinned by SHA-256 in report).

## Node.js baseline ($NODEJS_SOURCE at d44625a4b80, targeted only)

16. `rg -n "prepareStackTrace" lib/internal/errors.js` + read of `lib/internal/errors.js:136-200`
    - Node polyfills the V8 stack-trace API per realm; honors a user-assigned `Error.prepareStackTrace` (`:145-166`); default `ErrorPrepareStackTrace` at `:168` — baseline for F-001.
17. `ls lib/ | grep http; ls lib/internal/http` then `rg -n "statusCode" lib/internal/http/server.js`, `rg -n "prototype\.setHeader|prototype\.end" lib/internal/http/outgoing.js`
    - `_http_server.js` re-exports `lib/internal/http/server.js`; `ServerResponse.prototype.statusCode = 200` (`server.js:285`); `setHeader` (`outgoing.js:813`); `end` (`outgoing.js:1289`) — baseline for C-001. (Initial grep of `lib/_http_server.js` was negative because the implementation moved; re-export confirmed.)
18. `rg -n "_parsedUrl" lib/_http_incoming.js`
    - Negative — parseurl's keys are not core properties (C-017).
19. `rg -n "^function (stat|readdir|readFile)\b|readFileSync" lib/fs.js`; `rg -n "SyncWriteStream" lib/fs.js`
    - Public fs API present (`:2048,:1888,:422,:605`); `SyncWriteStream` absent (removed; F-002 FILE branch throws on current Node).
20. `rg -n "tty_wrap|process.binding" lib/internal/bootstrap/realm.js`
    - `tty_wrap` in the legacy `process.binding` allowlist (`:108`); runtime-deprecated loader (`:127-137`) — C-015 private-API read still functional but deprecated.
21. `rg -n "^Readable\.prototype\.read = " lib/internal/streams/readable.js`; `rg -n "function WriteStream|WriteStream.prototype" lib/tty.js`; `rg -n "^module.exports|EventEmitter.prototype.emit = " lib/events.js`
    - `Readable.prototype.read` (`readable.js:700`), `tty.WriteStream` extends `net.Socket` (`tty.js:111,144`), `EventEmitter` export/prototype (`events.js:212,489`) — baselines for F-002 and C-004.
22. `rg -n "stackTraceLimit" lib/internal/process/pre_execution.js`
    - Negative at this ref (limit handling lives elsewhere); not needed for the verdict — V8 owns the property; depd restores the prior value (verified dynamically).

## Reproduction

23. `node repro/check-core-globals.js "$PACKAGE_ROOT"` — Node v24.19.0 (user env) and v26.13.0 (`env -i` clean env)
    - Both: `prepareStackTraceWrites` = [prepareObjectStackTrace, ErrorPrepareStackTrace] x3 (three swap/restore pairs at bare require); `stackTraceLimit` 10 -> 10; `permanentCoreDiffsAfterRequire` = [] (EventEmitter/Error/ServerResponse/IncomingMessage prototype keys and fs/url/process function identities unchanged).
    - Instrumentation note: a first attempt converted `Error.stackTraceLimit` to an accessor; V8 then disabled stack collection (`obj.stack` undefined, crash inside depd compat). Final script instruments only `prepareStackTrace` and checks the limit by before/after value.
24. `echo $NODE_OPTIONS` — empty (rules out env-injected hooks; the pre-existing `ErrorPrepareStackTrace` value is Node's own default, confirmed at `$NODEJS_SOURCE/lib/internal/errors.js:168`).

## Upstream corroboration (read-only)

25. `gh search issues --repo dougwilson/nodejs-depd "prepareStackTrace"` and `"stackTraceLimit"`
    - #32 "Why is this library overwriting Error type?" (closed) — quotes the exact `getStack` code (F-001).
    - #36 "Incompatible with --enable-source-maps node 12 option" (closed) — crash when the swapped hook received source-map call sites (`callSite.getFileName is not a function`); demonstrates real-world observability of the swap.
    - #9 "Error is global Error.stackTraceLimit is too low" (closed bug) — global-limit interplay.
26. `gh issue view 36|32 --repo dougwilson/nodejs-depd --json ...` — bodies confirm applicability to depd 1.1.2 as installed.

## Negative-result summary

- No module-loading interception (`require.cache/extensions`, `Module._*`, ESM hooks): negative everywhere.
- No shared prototype mutation of any core class (searched + verified dynamically via before/after snapshots).
- No global-object (`global`/`globalThis`) or `Buffer`/`process.stdout`/`process.stderr` replacement.
- No writes to the `fs`, `url`, `path`, `events`, `util` module objects; all usage read-only.
- No install scripts; no native bindings beyond the deprecated `process.binding('tty_wrap')` read in debug's env-gated legacy path.
