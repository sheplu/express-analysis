# Search log: cors 2.8.6 monkeypatch audit (pass B)

All searches run from `$PACKAGE_ROOT` over the three runtime files only
(`lib/index.js`, `node_modules/object-assign/index.js`, `node_modules/vary/index.js`),
with `--no-ignore` so installed node_modules content is scanned. Tests/docs excluded
per scope. Node.js baseline searches run from `$NODEJS_SOURCE` on targeted files only.

## Scope establishment
1. `cat package.json` — main `./lib/index.js`; files `["lib/index.js"]`; deps `object-assign@^4`,
   `vary@^1`; scripts: test/lint only (no install/postinstall); engines node >= 0.10.
2. `ls lib node_modules; find node_modules -type f` — lib/index.js only runtime file;
   node_modules contains exactly object-assign (index.js) and vary (index.js) plus metadata;
   `.package-lock.json` pins object-assign@4.1.1 and vary@1.1.2 with sha512 integrity.
3. `git log -1` in $PACKAGE_ROOT — 5317ebe670db2aaebc1d496eb5d33493deefb3ed (matches provenance).
4. Dependency package.json checks — no `browser`/`exports`/`bin` fields, default `main: index.js`,
   no install scripts in either dependency.
5. `shasum -a 256` of the three runtime files — recorded in report.md Sources table.

## Candidate pattern set (skill section "Find actual writes and replacements")
Files argument for every command:
`lib/index.js node_modules/object-assign/index.js node_modules/vary/index.js`

- P1 `rg -n --no-ignore "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:"`
  -> 2 hits: lib/index.js:5 (`require('object-assign')`), :6 (`require('vary')`). No core-module
  requires, no `node:` specifiers, no dynamic import. -> C-001.
- P2 `rg -n --no-ignore "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\("`
  -> 0 hits (negative). No global/core-object references, no inheritance from core classes.
- P3 `rg -n --no-ignore "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign"`
  -> 6 hits, all object-assign/index.js: :10-11 (prototype method reads -> C-007), :15 (error
  message string), :23,:53 (feature-test reads), :65 (ternary export -> C-008). No writes.
- P4 `rg -n --no-ignore -i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b"`
  -> 2 hits: lib/index.js:10 (`PATCH` inside the HTTP methods default string), :193 (comment
  "wrap in a function"). Neither is patching code (negative).
- P5 `rg -n --no-ignore "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks"`
  -> 0 hits (negative). No module-loading interception.
- P6 `rg -n --no-ignore "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/"`
  -> 0 hits (negative). No internal/binding access.

## Supplemental sweeps
- P7 `rg -n --no-ignore "\b(req|res|request|response|socket)\s*\.\s*\w+\s*="`
  -> 1 hit: lib/index.js:178 `res.statusCode = ...` -> C-003. Only write to a core-backed object
  in the entire scope.
- P8 `rg -n --no-ignore "\bdelete\s|Object\.freeze|Object\.seal"`
  -> 0 hits (negative). No deletions or descriptor locking.
- P9 `rg -n --no-ignore "^\s*[A-Za-z_$][\w$.\[\]'\"]*\s*=[^=]"` (exhaustive assignment sweep)
  -> 27 hits total; each line individually resolved. Core-relevant ones became C-002..C-012;
  the remainder are local-variable/library-object writes (list in candidates.md tail).

## Node.js baseline verification (targeted reads only; commit d44625a4b80c672215b469906ce583ce7eeeebaf)
- `ls lib/ | grep http; head -30 lib/_http_server.js` -> `_http_server.js`/`_http_outgoing.js` are
  ~50-line re-export shims of `lib/internal/http/server.js` / `outgoing.js` at this revision;
  followed the re-exports per the skill table.
- `rg -n "statusCode" lib/internal/http/server.js | head`
  -> :285 `ServerResponse.prototype.statusCode = 200;` (prototype default; per-instance assignment
  is the documented contract) — baseline for C-003.
- `rg -n "OutgoingMessage\.prototype\.(setHeader|getHeader|appendHeader)\s*=|prototype\.end" lib/internal/http/outgoing.js | head`
  -> :813 setHeader, :877 appendHeader, :914 getHeader, :1289 end — baselines for C-002/C-004/C-011
  (cors/vary only call these; never assign them).
- No recursive scan of the Node.js tree was performed.

## Reproduction (runtime corroboration)
- Script: `repro/check-patching.js` (reviewed before execution; sources fully read beforehand).
- Command: `node repro/check-patching.js "$PACKAGE_ROOT"` (Node v24.19.0).
- Snapshot set: http.ServerResponse.prototype.{setHeader,getHeader,end,writeHead,statusCode},
  http.OutgoingMessage.prototype.setHeader, http.createServer, Object.assign,
  Object.prototype.{hasOwnProperty,propertyIsEnumerable}, Object.prototype own-key list,
  String.prototype own-key count, Module._load, Module._resolveFilename, require.extensions['.js'],
  process.binding.
- Result (`repro/result.txt`): "after require(cors): no changes"; "after middleware calls:
  no changes"; on a real `http.ServerResponse` run through the OPTIONS path, instance
  `setHeader`/`end` still identical to prototype functions; only new own props were
  `statusCode, statusMessage`. Exit code 0.

## Upstream corroboration (read-only)
- `gh search issues --repo expressjs/cors "monkeypatch OR monkey-patch OR patching prototype" --limit 10`
  -> `[]` (0 results).
- `gh api "search/issues?q=repo:expressjs/cors+prototype+override"` -> total_count 0.
- Negative: no upstream discussion suggesting cors patches Node.js core.
