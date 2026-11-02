# Search log: errorhandler 1.5.2 patch audit (pass A)

All library commands run from `$PACKAGE_ROOT`; Node core commands from
`$NODEJS_SOURCE` (d44625a4b80c672215b469906ce583ce7eeeebaf). Search scope for
S1-S6 (the skill's candidate patterns) was the exact runtime file set:
`index.js node_modules/accepts/index.js node_modules/escape-html/index.js
node_modules/negotiator/index.js node_modules/negotiator/lib
node_modules/mime-types/index.js node_modules/mime-db/index.js`
(with `--no-ignore` since the target sits under node_modules-adjacent paths).

## Scoping / provenance

1. `ls -la $PACKAGE_ROOT && cat package.json`
   -> files[] ships only `public/`, `LICENSE`, `index.js`; deps accepts ~1.3.8,
   escape-html ~1.0.3; no install scripts; engines node >= 0.8.
2. `git log -1 --format='%H %d %s'`
   -> 1922d04b78ed575ace5499b3d6f5591f2325f70b (HEAD -> master, origin/master).
3. `ls node_modules` + per-package `node -e "require('./.../package.json')"` dump
   -> accepts@1.3.8, escape-html@1.0.3, mime-db@1.52.0, mime-types@2.1.35,
   negotiator@0.6.3; every `main: index.js`; `exports: null` for all; no
   preinstall/install/postinstall scripts anywhere. Flat tree (no nested
   node_modules).
4. `ls node_modules/*/ public` -> runtime file inventory; negotiator has lib/
   with charset.js, encoding.js, language.js, mediaType.js; public/ holds
   error.html + style.css (data only).
5. `wc -l` over all runtime JS -> 1,622 lines total.

## Candidate pattern searches (skill S1-S6)

S1 imports: `rg -n --no-ignore -e 'require\s*\(|\bfrom\s*['\''"]|\bimport\s*\(|\bnode:' <scope>`
   -> 14 hits, all static requires: errorhandler -> accepts, escape-html, fs,
   path, util; accepts -> negotiator, mime-types; mime-types -> mime-db,
   path.extname; mime-db -> ./db.json; negotiator -> ./lib/*. No dynamic or
   computed requires, no `node:` specifiers, no ESM.

S2 globals: `rg -n --no-ignore -e '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' <scope>`
   -> 2 hits, both index.js: `process.nextTick(fn.bind.apply(...))` (38, call),
   `process.env.NODE_ENV` (67, read). NEGATIVE in all dependencies.

S3 prototype/descriptor: `rg -n --no-ignore -e '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' <scope>`
   -> accepts/index.js:82-195 (Accepts.prototype methods),
   negotiator/index.js:38-82 (Negotiator.prototype methods + aliases),
   index.js:33 (`Object.prototype.toString` read). All writes on library-owned
   prototypes; zero core-prototype writes. NEGATIVE for
   __proto__/setPrototypeOf/defineProperty/Reflect/Object.assign.

S4 patch keywords: `rg -n --no-ignore -i -e 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' <scope>`
   -> 1 hit: index.js:156 doc comment "framework authors may override this
   value" (exports.title). No code hits.

S5 module interception: `rg -n --no-ignore -e 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks' <scope>`
   -> NO MATCHES.

S6 bindings/internals: `rg -n --no-ignore -e 'process\.(binding|_linkedBinding)|internalBinding|["'\'']_http_|["'\'']internal/' <scope>`
   -> NO MATCHES.

Note: a first attempt at S2-S6 using an unquoted shell variable for the scope
failed with "No such file or directory" (zsh does not word-split); rerun with
explicit paths produced the results above.

## Dependency-specific follow-ups

6. Full reads: accepts/index.js (238 lines), negotiator/index.js (82),
   escape-html/index.js (78), mime-types/index.js (188), mime-db/index.js (12)
   -> see candidates C-011..C-018.
7. `rg -n --no-ignore -e 'request\.|req\.|this\.request\s*=' node_modules/negotiator/lib/ node_modules/negotiator/index.js`
   -> only negotiator/index.js:35 assignment to the library instance and
   header reads (44/53/62/71). NEGATIVE in lib/ (parsers never see req).
8. `rg -n --no-ignore -e '\bprototype\b|\bglobal|definePropert|__proto__|setPrototypeOf' node_modules/negotiator/lib/`
   -> NO MATCHES.
9. `cat node_modules/mime-db/index.js` -> pure `module.exports = require('./db.json')`.

## Node.js baseline verification (targeted reads only)

10. `git log -1` in $NODEJS_SOURCE -> d44625a4b80c672215b469906ce583ce7eeeebaf.
11. `rg -n 'statusCode' lib/_http_server.js` -> NO MATCHES (file is a
    re-export shim at this ref; confirmed via `head -30 lib/_http_server.js`
    importing from internal/http/server).
12. `ls lib | head`, `ls lib/internal/ | grep -i http` -> implementation lives
    in lib/internal/http/{server,outgoing,incoming,...}.js.
13. `rg -n 'statusCode' lib/internal/http/server.js | head -15`
    -> `ServerResponse.prototype.statusCode = 200` (285); `writeHead(this.statusCode)`
    (420); writeHead validation (424-439). Baseline for C-001.
14. `rg -n "_header'|\b_header\b|setHeader =|function setHeader" lib/internal/http/outgoing.js | head -30`
    -> `this._header = null` (188); flush write `this._header = header + '\r\n'`
    (636); `headersSent` getter `!!this._header` (1011); `setHeader` definition
    (813). Baseline for C-002/C-004.
    No wider scan of the Node tree was performed.

## Upstream / history corroboration (bounded)

15. `git log -n 10 --format='%h %ad %s' --date=short -S '_header' -- index.js`
    -> single commit 8c95711 2014-04-29 "Do not respond after headers sent".
16. `git log -n 5 -S 'res.statusCode' -- index.js`
    -> a300b6e 2015-04-09 "Support statusCode property on Error objects";
    81f30f0 2014-03-02 initial import.
    No external issue search performed: no patch candidate survived static
    analysis, so there was no patch target to corroborate upstream.

## Runtime reproduction

17. `node repro-check.js "$PACKAGE_ROOT"` (script beside this report, Node
    v24.19.0) — snapshots identities/descriptors of
    ServerResponse.prototype.{setHeader,end,writeHead}, the statusCode
    prototype descriptor, IncomingMessage/Object/Function/Error prototype key
    sets, fs.readFileSync, util.inspect, process.nextTick, setImmediate, and
    Object.prototype.toString before require, after require, and after
    invoking the middleware over the html/json/text branches and the
    headers-already-sent branch.
    -> 13/13 PASS; "RESULT: no core mutation observed (node v24.19.0)".

## Integrity hashes

18. `shasum -a 256` over all runtime files -> recorded in report.md
    (Sources and verification section).
