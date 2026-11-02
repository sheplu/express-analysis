# Search log — compression@1.8.2 monkeypatch audit (pass-b)

All commands were run from `$PACKAGE_ROOT` unless noted. `rg` used `--no-ignore`
so the installed `node_modules` tree is scanned despite ignore rules. Markdown,
JSON data, `.d.ts`, and karma/component config files were excluded from code
pattern scans (docs/data, not runtime code). Node.js baseline commands were run
from `$NODEJS_SOURCE` (commit d44625a4b80) as targeted, file-scoped reads only.

## Scope establishment

1. `cat package.json` — version 1.8.2; `files` = LICENSE/README/index.js (single runtime file); 8 runtime deps declared.
2. `git log -1` — commit 0f9707417bd53d41a319fce8bdb80dfa08b435c8 ("1.8.2 (#287)"). Matches stated provenance.
3. `for d in node_modules/*/ ... require('./$d/package.json')` — resolved versions: bytes@3.1.2, compressible@2.0.18, debug@2.6.9, destroy@1.2.0, mime-db@1.54.0, ms@2.0.0, negotiator@0.6.4, on-headers@1.1.0, safe-buffer@5.2.1, vary@1.1.2. Flat tree (no nested node_modules).
4. `find node_modules -type f \( -name '*.js' -o -name '*.json' \)` — 22 files; all runtime .js files enumerated and subsequently read or pattern-scanned. `debug/src/inspector-log.js` confirmed unreachable (not required by `debug/src/index.js`, which selects only `browser.js` or `node.js`).
5. `head -30 HISTORY.md` — 1.8.2 (CVE-2026-87776, destroy@1.2.0 added), 1.8.1 (on-headers 1.1.0 / CVE-2025-7339), 1.8.0 ("Replace `_implicitHeader` with `writeHead` property").

## Skill candidate pattern set (over index.js + node_modules runtime files)

P1. `rg -n --no-ignore "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" index.js node_modules` (code files only)
    -> Core modules required: `zlib` (index.js:25); `http` (on-headers:16); `events`, `fs`, `stream`, `zlib` (destroy:15-18); `tty`, `util`, conditional `fs`/`net` (debug/src/node.js:5-6,186,193); `buffer` (safe-buffer:3); `stream` (debug/src/inspector-log.js — unreachable). No `node:` specifiers, no dynamic `import()`. All other requires are intra-package or dep-to-dep (`compressible` -> `mime-db`, `debug` -> `ms`).

P2. `rg -n --no-ignore "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(" ...`
    -> Buffer usage: index.js via safe-buffer (isBuffer/byteLength/from — static calls only); safe-buffer internals (C-020). process usage: debug env reads/writes (C-015), `process.binding` (C-016), `process.stdout/stderr` selection (debug/src/node.js:67-68). No `globalThis`/`global` assignment anywhere. No `extends`/`inherits` of core classes in any dep (negotiator is a plain constructor; SafeBuffer uses `Object.create(Buffer.prototype)` on its own constructor).

P3. `rg -n --no-ignore "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" ...`
    -> Hits: on-headers:19 (read-only feature detection, C-009); safe-buffer:24 (own subclass, C-020); negotiator:38-82 (own prototype methods); destroy:121 (read-only comparison against `Stream.Transform.prototype._destroy`); debug/src/browser.js:123 (`Function.prototype.apply.call` — invocation, not a write); index.js:63,69 (`Object.assign` on local options, C-007). NO assignment to any core prototype; no `__proto__`/`setPrototypeOf`/`defineProperty`/`Reflect` writes in runtime scope.

P4. `rg -n --no-ignore -i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b" ...` (code files)
    -> Only debug/src/node.js:56,64 — comment and deprecation message for DEBUG_FD ("Override debug.log..."). Negative for actual patch helpers (no shimmer, no require-in-the-middle).

P5. `rg -n --no-ignore "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks" ...`
    -> NO HITS. No module-loading interception anywhere in runtime scope.

P6. `rg -n --no-ignore "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" ...`
    -> Single hit: debug/src/node.js:169 `process.binding('tty_wrap')` (C-016, read-only, deprecated DEBUG_FD path). No `internalBinding`, no requires of `_http_*` or `internal/*`.

## Targeted follow-ups in package scope

6. Full reads: `index.js`, `node_modules/on-headers/index.js`, `node_modules/destroy/index.js`, `node_modules/debug/src/node.js`, `node_modules/safe-buffer/index.js`, `node_modules/debug/src/index.js`; partial read `node_modules/debug/src/debug.js:100-170` (enable/save chain).
7. `rg -n "getHeader|setHeader" node_modules/vary/index.js` -> :134,140,147 — documented header API only (C-021).
8. `rg -n "require\(" node_modules/bytes/index.js node_modules/ms/index.js node_modules/compressible/index.js node_modules/negotiator/lib/*.js` -> only `compressible` -> `mime-db`. Negative for core modules.
9. `rg -n "this\.request\s*=" node_modules/negotiator/index.js` -> :35 stores the req reference; header reads only at :44,:53,:62 (C-022b).
10. `rg -n "=\s|delete |defineProperty" node_modules/debug/src/debug.js` -> all writes target debug's own exports/instances (C-022a); `enable()` calls `exports.save` -> process.env (C-015).

## Node.js baseline verification (targeted, file-scoped)

11. `rg -n "ServerResponse|module.exports" lib/http.js` + `sed -n '1,60p'` -> HTTP internals live under `lib/internal/http/` on this baseline (imports at lib/http.js:29-57); `ls lib/internal/http/` -> agent/client/common/incoming/outgoing/server.
12. `rg -n "writeHead|_implicitHeader" lib/internal/http/server.js` -> `_implicitHeader` :419-421 (`this.writeHead(this.statusCode)` — instance-property dispatch), `ServerResponse.prototype.writeHead = writeHead` :423-424; core-internal `res.writeHead`/`res.end`/`res.on` call sites :754,1415,1426-1465.
13. `rg -n "OutgoingMessage.prototype.(write|end|flush|flushHeaders)\s*=|'headersSent'|'_header'" lib/internal/http/outgoing.js` -> `write` :1027, `end` :1289, `flushHeaders` :1461, `headersSent` defineProperty :1007. `rg -n "prototype\.flush\s*=|flush:" lib/internal/http/{outgoing,server}.js` -> NO HITS (no `flush` method on baseline — supports C-001 rejection). `rg -n "_header\b" lib/internal/http/outgoing.js` -> plain internal field (`this._header = null` :188, set :636) — supports C-005.
14. `rg -n "EventEmitter.prototype.on\b|EventEmitter.prototype.addListener" lib/events.js` -> :615 addListener, :619 `on = addListener` (F-003 baseline).
15. `rg -n "_destroy|prototype.close|class Gzip|BrotliCompress|createGzip|createBrotliCompress" lib/zlib.js` + `sed -n '520,545p'` -> `ZlibBase` own `close(callback)` :524 and `_destroy(err, callback)` :529; `Gzip` :906; `BrotliCompress` :1046; factory exports :1348,1351. Proves destroy@1.2.0 takes the documented `stream.destroy()` branch on the baseline (C-011/C-012 dead).
16. `rg -n "_destroy" lib/internal/streams/transform.js lib/internal/streams/destroy.js` -> dispatch via `self._destroy(...)` in destroy.js :78-122; no Transform-specific `_destroy` relevant to the comparison outcome.
17. `rg -n -i "monkey|compat|on-headers|express" lib/internal/http/server.js lib/internal/http/outgoing.js lib/events.js` -> NEGATIVE for any core accommodation of this library (only license boilerplate and unrelated backward-compat comments).
18. `rg -n "'destroyed'" lib/internal/streams/writable.js lib/internal/streams/readable.js` -> no hits in those files on this baseline (accessor defined elsewhere); not pursued further — the `destroyed = true` branch (C-011) is unreachable on the baseline regardless.

## Reproduction and upstream corroboration

19. `node repro.js "$PACKAGE_ROOT"` (Node v24.19.0) -> `repro-output.json`: all shared-prototype identity checks true before/after require and after a gzip request (`content-encoding: gzip`); instance own-property overrides `write`/`end`/`on`/`writeHead` true; new own `flush` true; `safeBuffer === require('buffer')` true; `OutgoingMessage.prototype.flush` absent.
20. `gh api repos/nodejs/node/pulls/23734` -> "zlib: do not leak on destroy", state closed, merged: false (referenced by destroy/index.js:99 — context only).
21. `gh api repos/expressjs/on-headers/security-advisories/GHSA-76c9-3jph-rj3q` -> CVE-2025-7339, vulnerable < 1.1.0 ("http response header manipulation" in the writeHead wrapper) — audited version contains the fix.
22. `gh api repos/expressjs/compression/security-advisories/GHSA-vc2v-76pw-4v95` -> CVE-2026-87776, vulnerable < 1.8.2 (DoS via zlib memory leak on premature close) — motivates index.js:169-172 close handler.

## Negative-result summary

- No writes to any core module object, global, or shared prototype in the entire runtime scope.
- No `require.cache`/`require.extensions`/`Module._*`/loader-hook usage (P5 empty).
- No `internalBinding`/`_http_*`/`internal/*` requires (P6: only the read-only `process.binding('tty_wrap')` in debug's deprecated path).
- No patching helpers (shimmer, require-in-the-middle, etc.).
- bytes, ms, mime-db, compressible, negotiator: no core-object interaction beyond reading `req.headers`.
- Node baseline HTTP/events/zlib files contain no compatibility accommodation referencing this library.
