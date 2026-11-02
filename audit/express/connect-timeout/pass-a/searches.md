# Search log — connect-timeout 1.9.1 patch audit (pass A)

All library searches ran from `$PACKAGE_ROOT`. Node.js searches were targeted single-file greps under `$NODEJS_SOURCE` (no recursive core-tree scans). Scope globs for library sweeps: `index.js` plus `node_modules` runtime files, `--no-ignore`, excluding `**/test/**` and `*.md`.

## Scope establishment

| # | Command | Result |
| --- | --- | --- |
| 1 | `ls -la $PACKAGE_ROOT; cat package.json; git log -1; ls node_modules` | 1.9.1 @ 7377defb; runtime deps installed: depd, ee-first, http-errors, ms, on-finished, on-headers, setprototypeof, statuses; `files` ships only index.js (+LICENSE/HISTORY); no install scripts |
| 2 | per-dep `package.json` version/main | depd@1.1.2, ee-first@1.1.1, http-errors@1.6.3, ms@2.0.0, on-finished@2.3.0, on-headers@1.1.0, setprototypeof@1.1.0, statuses@1.5.0 — all `main` = index.js |
| 3 | `find node_modules -mindepth 2 -name node_modules -type d`; `require.resolve('inherits', {paths:[.../http-errors]})` | one nested dep: http-errors/node_modules/inherits@2.0.3 (main inherits.js) |
| 4 | Full reads: `$PACKAGE_ROOT/index.js` (89 lines) and every dependency entrypoint (on-headers, on-finished, ee-first, http-errors, depd + lib/compat, setprototypeof, statuses, ms, nested inherits) | complete runtime-scope inventory; candidates C-001..C-021 |

## Candidate sweeps (skill patterns)

| # | Pattern (rg -n, runtime scope) | Hits / disposition |
| --- | --- | --- |
| S1 | `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:` | 19 hits — all static CommonJS requires of the deps above plus `http` (on-headers:16), `events` (depd compat:14), `path` (depd:13), `util` (inherits:2). No dynamic/computed loading, no `node:` specifiers |
| S2 | `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(` | 15 hits — `process` reads/`process.emit('deprecation')`/`process.stderr.write` in depd (C-018), `process.nextTick` fallback in on-finished:33 (C-021-adjacent, reference only), `inherits(...)` calls in http-errors (C-013). No Buffer/globalThis/global hits |
| S3 | `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign` | 30 hits — setprototypeof export (C-011), http-errors own-prototype/instance writes (C-012, C-014), inherits_browser (not loaded, C-020), depd own-object defineProperty (C-017, C-019), on-headers prototype READ at :19 (C-010), on-finished comment :179 (-> C-004). No write to any core prototype |
| S4 | `monkey.?patch|\bpatch|\bwrap|\bshim\b|\bpolyfill\b|\boverride` (case-insensitive) | 22 hits — depd wrapfunction/wrapproperty (C-015/C-016; browser variant not loaded), on-finished patchAssignSocket + "node.js 0.8 patch" comment (C-004), inherits_browser comment. Followed each to actual writes |
| S5 | `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` | **0 hits** (negative — no module interception) |
| S6 | `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/` | **0 hits** (negative — no internal/native access) |
| S7 | `\b(req|res|msg|socket)\.[A-Za-z_$][\w$]*\s*=[^=]` (writes to live req/res/msg/socket) | 7 hits — index.js:48,56,60 (C-005/C-006), on-finished:145,162 (C-008), on-finished:192 (C-004), on-headers:71 (C-001). Complete inventory of instance writes; notably **no** assignment to `destroy`, `emit`, `end`, `on`, or `setTimeout` on req/res |
| S8 | `Error\.(prepareStackTrace|stackTraceLimit|captureStackTrace)` | 17 hits — depd getStack set/restore (C-002), depd compat set/restore (C-003), http-errors captureStackTrace on own errors (reads/no mutation) |
| S9 | `set(Timeout|Immediate|Interval)|clear(Timeout|Immediate|Interval)|\.emit\s*\(` | timer usage in index.js (calls only, C-006/C-007), `req.emit('timeout')` index.js:49 (C-007), `process.emit('deprecation')` depd:235 (C-018), setImmediate reference on-finished:31-32. No timer global reassigned |
| S10 | `\beval\s*\(|new Function` | 1 hit — depd/index.js:410 (C-015) |

## Node.js baseline verification (targeted, `$NODEJS_SOURCE` @ d44625a4b80)

| # | Command | Result |
| --- | --- | --- |
| N1 | `grep -n 'writeHead\|assignSocket' lib/_http_server.js` | 0 hits — file is a re-export shim at this ref; implementation moved to lib/internal/http/ (confirmed by reading shim header + `ls lib/internal/http/`) |
| N2 | `grep -n 'writeHead\|assignSocket' lib/internal/http/server.js`; read lines 305-335, 400-515 | `ServerResponse.prototype.assignSocket` at :312; `ServerResponse.prototype.writeHead = writeHead` at :423-424 (plain data property) — baselines for F-001/C-004 |
| N3 | `grep -n 'function OutgoingMessage\|this\[kSocket\]' lib/internal/http/outgoing.js`; read lines 130-200, 285-310 | ctor sets `this[kSocket] = null` at :187; `socket` is a prototype accessor returning `this[kSocket]` (:304-310); `this.finished = false` at :180 — proves C-004 guard (`socket === undefined`) unreachable |
| N4 | `grep -n 'timedout\|clearTimeout\|setTimeout' lib/internal/http/incoming.js`; read lines 250-270 | no `timedout`/`clearTimeout` members; `IncomingMessage.prototype.setTimeout` at :257 registers callbacks on the `'timeout'` event — supports C-005/C-006/C-007 |
| N5 | `grep -n 'prepareStackTrace\|stackTraceLimit' lib/internal/errors.js` | :145-156 `prepareStackTraceCallback` invokes a user-assigned `Error.prepareStackTrace` — baseline for F-002 |
| N6 | `grep -n 'Error.prepareStackTrace\|userProvidedPrepareStackTrace\|maybeOverride' lib/internal/source_map/prepare_stack_trace.js` | 0 hits at this ref (handled via errors.js path above) — negative, recorded for completeness |

## Upstream / history corroboration (read-only)

| # | Command | Result |
| --- | --- | --- |
| U1 | `git log --oneline -S 'onHeaders' -- index.js` (in `$PACKAGE_ROOT`) | cb5c2ee "use on-headers instead of patching writeHead" — maintainers replaced in-package `res.writeHead` instance patch with on-headers (same mechanism, centralized) |
| U2 | `git log --oneline -S 'socket.destroy' -- index.js`; `git show a222687`; `git rev-parse 300ea5d` | a222687 added a `req.socket.destroy` instance wrap (2014); 300ea5dcac8b67a6c7c3a3dd937f705dd8bb6c4b "Use on-finished instead of override socket destroy" removed it — no destroy wrapping in 1.9.1 (C-022) |
| U3 | `gh api '/advisories?ecosystem=npm&affects=on-headers'` | GHSA-76c9-3jph-rj3q / CVE-2025-7339, "http response header manipulation", vulnerable <1.1.0, first patched 1.1.0 — installed version is the patched one; corroborates writeHead-wrapper mechanism |

## Reproduction

| # | Command | Result |
| --- | --- | --- |
| R1 | `node --version` | v24.19.0 |
| R2 | `node -p "typeof Error.prepareStackTrace"` | `function` — Node 24 ships a default; explains all-function write types in R3 |
| R3 | `node repro.js "$PACKAGE_ROOT"` (script + output beside report) | Require time: 6 writes to `Error.prepareStackTrace` (3 set/restore cycles), both globals restored to initial values; core prototypes unchanged. After one middleware run on live core req/res: own `writeHead` on res differing from prototype (F-001), prototype unchanged; no own `assignSocket` (C-004 dead); own `__onFinished` on res (C-008); own `timedout`(false)/`clearTimeout` on req, neither present on core IncomingMessage.prototype (C-005/C-006) |

## Negative results summary

- No module-loading interception of any kind (S5: 0 hits).
- No `process.binding`/`internalBinding`/internal-module access (S6: 0 hits).
- No writes to `globalThis`/`global`, `Buffer`, timer globals, `http`/`events`/`util` module objects, or any core `*.prototype` anywhere in the runtime scope (S2/S3/S9 dispositions).
- No reassignment of `req.emit`, `req.on`, `res.end`, `res.destroy`, `socket.destroy`, or `req/res.setTimeout` in 1.9.1 (S7 exhaustive instance-write list; destroy wrapping is historical only, U2).
- connect-timeout's own `createError(503, 'Response timeout', {...})` call uses a non-deprecated http-errors signature, so depd's runtime `log()` path (further transient global writes) is not activated by this package's own code path.
